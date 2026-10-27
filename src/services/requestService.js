/**
 * DevProbe — Request Preparation & Execution Service
 *
 * Day 5: Real HTTP Request Execution Engine
 *
 * Implements secure outbound HTTP request dispatching with:
 * - Pre-connection DNS resolution and SSRF address validation.
 * - Connection pinning via custom lookup to prevent DNS rebinding TOCTOU.
 * - SNI and TLS certificate verification preservation.
 * - Manual redirect loop with destination re-validation and credential stripping.
 * - Streaming response size limit enforcement (5 MB limit).
 * - Overall and connection timeouts using monotonic timers.
 * - Redaction of sensitive headers (Set-Cookie, etc.) from response metadata.
 * - Safe handling of JSON, plain text, empty, and binary responses.
 */

const http = require('http');
const https = require('https');
const {
  EXECUTION_LIMITS,
  HOP_BY_HOP_HEADERS,
  SENSITIVE_RESPONSE_HEADERS,
  validateTargetUrl,
  resolveAndValidateDestination,
  sanitizeHeaders
} = require('../config/security');
const { AppError } = require('../middleware/errorHandler');

/**
 * Checks case-insensitively if a header exists in a headers dictionary.
 * @param {Record<string, string>} headers
 * @param {string} name
 * @returns {string|null} The original key name if found, or null
 */
function findHeaderKey(headers, name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

/**
 * Helper to delete a header case-insensitively.
 * @param {Record<string, string>} headers
 * @param {string} name
 */
function removeHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      delete headers[key];
    }
  }
}

/**
 * Safely parses response buffer into JSON, text, or a binary descriptor.
 * Does not corrupt binary content by attempting to force-decode as UTF-8.
 *
 * @param {Buffer} buffer - Raw response payload
 * @param {string} [contentType=''] - Content-Type header from upstream response
 * @returns {any} Parsed JSON, string text, empty string, or binary representation
 */
function parseResponseBody(buffer, contentType = '') {
  if (!buffer || buffer.length === 0) {
    return '';
  }

  const ct = (contentType || '').toLowerCase();

  // Explicit binary media types
  const isBinaryType = ct.startsWith('image/') ||
                       ct.startsWith('audio/') ||
                       ct.startsWith('video/') ||
                       ct.startsWith('font/') ||
                       ct.startsWith('model/') ||
                       ct.includes('application/octet-stream') ||
                       ct.includes('application/pdf') ||
                       ct.includes('application/zip') ||
                       ct.includes('application/gzip') ||
                       ct.includes('application/wasm') ||
                       ct.includes('application/x-protobuf');

  // Binary detection heuristic: check first 512 bytes for null byte (0x00)
  const sampleLength = Math.min(buffer.length, 512);
  let hasNullByte = false;
  for (let i = 0; i < sampleLength; i++) {
    if (buffer[i] === 0) {
      hasNullByte = true;
      break;
    }
  }

  if (isBinaryType || hasNullByte) {
    return {
      isBinary: true,
      contentType: contentType || 'application/octet-stream',
      sizeBytes: buffer.length,
      preview: `[Binary content: ${buffer.length} bytes, Content-Type: ${contentType || 'application/octet-stream'}]`
    };
  }

  const text = buffer.toString('utf8');

  // Attempt JSON parsing if content-type or structure suggests JSON
  if (ct.includes('application/json') || ct.includes('+json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      // Fallback to text if parsing fails
      return text;
    }
  }

  return text;
}

/**
 * Dispatches a single HTTP/HTTPS request with DNS pinning, timeout, and streaming size limits.
 *
 * @param {object} options
 * @param {URL} options.parsedUrl
 * @param {string} options.method
 * @param {Record<string, string>} options.headers
 * @param {string|null} options.body
 * @param {string} options.pinnedIp
 * @param {number} options.pinnedFamily
 * @param {number} options.timeoutMs
 * @param {number} options.maxResponseSizeBytes
 * @returns {Promise<{ status: number, statusText: string, timeMs: number, sizeBytes: number, headers: Record<string, any>, body: any }>}
 */
function dispatchSingleRequest({
  parsedUrl,
  method,
  headers,
  body,
  pinnedIp,
  pinnedFamily,
  timeoutMs,
  maxResponseSizeBytes
}) {
  return new Promise((resolve, reject) => {
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const startTime = process.hrtime.bigint();

    let timeoutTimer = null;
    let finished = false;
    let responseAborted = false;
    let req = null;
    let activeRes = null;

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (req) {
        try {
          req.setTimeout(0);
        } catch (_) {
          // Socket might already be closed
        }
      }
    };

    const destroyResources = () => {
      if (activeRes && !activeRes.destroyed) {
        try {
          activeRes.destroy();
        } catch (_) {}
      }
      if (req && !req.destroyed) {
        try {
          req.destroy();
        } catch (_) {}
      }
    };

    const requestOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers,
      // Preserve SNI and TLS hostname verification
      servername: parsedUrl.hostname,
      // DNS Pinning: enforce connection to the validated destination IP only
      lookup: (hostname, opts, cb) => {
        if (typeof opts === 'function') {
          cb = opts;
          opts = {};
        }
        if (opts && opts.all) {
          return cb(null, [{ address: pinnedIp, family: pinnedFamily }]);
        }
        return cb(null, pinnedIp, pinnedFamily);
      }
    };

    try {
      req = client.request(requestOptions, (res) => {
        activeRes = res;
        let receivedBytes = 0;
        const chunks = [];

        // Check upfront Content-Length header if provided
        const contentLengthHeader = res.headers['content-length'];
        if (contentLengthHeader) {
          const declaredLength = parseInt(contentLengthHeader, 10);
          if (!isNaN(declaredLength) && declaredLength > maxResponseSizeBytes) {
            responseAborted = true;
            finished = true;
            cleanup();
            destroyResources();
            return reject(new AppError(
              `Response size (${declaredLength} bytes) exceeds maximum permitted limit of ${maxResponseSizeBytes} bytes (5 MB).`,
              413,
              'RESPONSE_TOO_LARGE'
            ));
          }
        }

        // Stream response chunks and enforce hard size limit
        res.on('data', (chunk) => {
          if (responseAborted || finished) return;
          receivedBytes += chunk.length;

          if (receivedBytes > maxResponseSizeBytes) {
            responseAborted = true;
            finished = true;
            cleanup();
            destroyResources();
            return reject(new AppError(
              `Response stream exceeded maximum allowed limit of ${maxResponseSizeBytes} bytes (5 MB).`,
              413,
              'RESPONSE_TOO_LARGE'
            ));
          }

          chunks.push(chunk);
        });

        res.on('end', () => {
          if (responseAborted || finished) return;

          // Guard against incomplete/truncated responses
          if (!res.complete) {
            finished = true;
            cleanup();
            destroyResources();
            return reject(new AppError('Incomplete HTTP response received from server', 502, 'CONNECTION_ERROR'));
          }

          finished = true;
          cleanup();

          const endTime = process.hrtime.bigint();
          const timeMs = Math.max(1, Math.round(Number(endTime - startTime) / 1e6));

          const rawBuffer = Buffer.concat(chunks);
          const sizeBytes = rawBuffer.length;

          // Filter sensitive response headers before returning metadata to frontend
          const safeHeaders = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (!SENSITIVE_RESPONSE_HEADERS.has(k.toLowerCase())) {
              safeHeaders[k] = v;
            }
          }

          const parsedBody = parseResponseBody(rawBuffer, res.headers['content-type']);
          const isBinary = typeof parsedBody === 'object' && parsedBody !== null && parsedBody.isBinary;
          const rawText = isBinary
            ? (parsedBody.preview || '[Binary Content]')
            : rawBuffer.toString('utf8');

          resolve({
            status: res.statusCode || 200,
            statusText: res.statusMessage || http.STATUS_CODES[res.statusCode] || '',
            timeMs,
            sizeBytes,
            headers: safeHeaders,
            body: parsedBody,
            rawText
          });
        });

        // Aborted / prematurely closed response stream
        res.on('close', () => {
          if (!finished && !responseAborted && !res.complete) {
            finished = true;
            cleanup();
            destroyResources();
            return reject(new AppError('Response connection was closed before payload completed', 502, 'CONNECTION_ERROR'));
          }
        });

        res.on('error', (streamErr) => {
          if (responseAborted || finished) return;
          finished = true;
          cleanup();
          destroyResources();
          reject(new AppError(`Response stream error: ${streamErr.message}`, 502, 'CONNECTION_ERROR'));
        });
      });
    } catch (initErr) {
      cleanup();
      return reject(new AppError(`Failed to initialize request: ${initErr.message}`, 400, 'INVALID_REQUEST'));
    }

    // Enforce overall request timeout
    timeoutTimer = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      destroyResources();
      reject(new AppError(`Request timed out after ${timeoutMs}ms`, 504, 'REQUEST_TIMEOUT'));
    }, timeoutMs);

    // Socket-level timeout as backup
    req.setTimeout(timeoutMs, () => {
      if (finished) return;
      finished = true;
      cleanup();
      destroyResources();
      reject(new AppError(`Connection socket timed out after ${timeoutMs}ms`, 504, 'REQUEST_TIMEOUT'));
    });

    req.on('error', (err) => {
      if (finished || responseAborted) return;
      finished = true;
      cleanup();
      destroyResources();

      if (err instanceof AppError) {
        return reject(err);
      }

      if (err.code === 'ECONNREFUSED') {
        return reject(new AppError(`Connection refused by ${parsedUrl.hostname}`, 502, 'CONNECTION_ERROR'));
      }
      if (err.code === 'ECONNRESET') {
        return reject(new AppError(`Connection reset by peer (${parsedUrl.hostname})`, 502, 'CONNECTION_ERROR'));
      }
      if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        return reject(new AppError(`Connection timed out: ${err.message}`, 504, 'REQUEST_TIMEOUT'));
      }
      if (err.code === 'CERT_HAS_EXPIRED' || err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || err.code?.startsWith('ERR_TLS_')) {
        return reject(new AppError(`TLS verification failed: ${err.message}`, 502, 'TLS_ERROR'));
      }
      if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
        return reject(new AppError(`DNS lookup failed for ${parsedUrl.hostname}`, 502, 'DNS_RESOLUTION_FAILED'));
      }
      if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') {
        return reject(new AppError(`Host unreachable (${parsedUrl.hostname})`, 502, 'CONNECTION_ERROR'));
      }

      return reject(new AppError(`Outbound request failed: ${err.message}`, 502, 'CONNECTION_ERROR'));
    });

    // Write request body if present
    if (body !== null && body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Prepares and normalizes a validated request configuration for Day 5 execution (Day 4 preparation endpoint)
 * @param {object} validatedRequest - Normalized request data from validateRequest middleware
 * @returns {object} Safe request preparation summary
 */
function prepareRequestConfiguration(validatedRequest) {
  const {
    method,
    url,
    headers = {},
    bodyMetadata = { present: false, sizeBytes: 0, mediaType: null },
    auth = null
  } = validatedRequest;

  // 1. Sanitize headers to ensure zero secrets are returned
  const sanitizedHeaders = sanitizeHeaders(headers);

  // 2. Prepare auth metadata without leaking tokens or passwords
  let authSummary = undefined;
  if (auth && typeof auth === 'object') {
    authSummary = {
      type: typeof auth.type === 'string' ? auth.type : 'none',
      configured: Boolean(
        (auth.bearerToken && String(auth.bearerToken).trim()) ||
        (auth.basicUsername && String(auth.basicUsername).trim()) ||
        (auth.basicPassword && String(auth.basicPassword).trim())
      ),
      credentialsExposed: false
    };
  }

  // 3. Return execution preparation descriptor
  return {
    method,
    url,
    readyForExecution: true,
    headers: sanitizedHeaders,
    body: {
      present: bodyMetadata.present,
      sizeBytes: bodyMetadata.sizeBytes,
      mediaType: bodyMetadata.mediaType
    },
    settings: {
      timeoutMs: EXECUTION_LIMITS.DEFAULT_TIMEOUT_MS,
      maxRedirects: EXECUTION_LIMITS.MAX_REDIRECTS,
      maxResponseSizeBytes: EXECUTION_LIMITS.MAX_RESPONSE_SIZE_BYTES
    },
    ...(authSummary ? { auth: authSummary } : {}),
    executionStatus: 'NOT_EXECUTED',
    message: 'Configuration validated and prepared for Day 5 execution engine. No outbound HTTP requests were dispatched.'
  };
}

/**
 * Executes a real outbound HTTP request with SSRF protections, DNS pinning, redirect management,
 * and response limits.
 *
 * @param {object} validatedRequest - Normalized request data from validateRequest middleware
 * @param {object} [executionOptions] - Execution tuning options or test overrides
 * @returns {Promise<{ status: number, statusText: string, timeMs: number, sizeBytes: number, headers: Record<string, any>, body: any }>}
 */
async function executeRequest(validatedRequest, executionOptions = {}) {
  const {
    method,
    url,
    headers = {},
    body = null,
    auth = null,
    settings = {}
  } = validatedRequest;

  // 1. Enforce Hop-by-Hop Header restrictions
  for (const headerName of Object.keys(headers)) {
    if (HOP_BY_HOP_HEADERS.has(headerName.toLowerCase())) {
      throw new AppError(
        `Hop-by-hop header '${headerName}' is prohibited in outbound requests.`,
        400,
        'INVALID_HEADER'
      );
    }
  }

  // 2. Assemble outbound headers copy
  const preparedHeaders = { ...headers };

  // Set standard User-Agent if not explicitly supplied
  if (!findHeaderKey(preparedHeaders, 'user-agent')) {
    preparedHeaders['User-Agent'] = 'DevProbe/1.0';
  }

  // 3. Apply Authentication Headers
  if (auth && typeof auth === 'object') {
    if (auth.type === 'bearer' && auth.bearerToken && typeof auth.bearerToken === 'string') {
      const token = auth.bearerToken.trim();
      if (token) {
        removeHeader(preparedHeaders, 'authorization');
        preparedHeaders['Authorization'] = `Bearer ${token}`;
      }
    } else if (auth.type === 'basic') {
      const u = typeof auth.basicUsername === 'string' ? auth.basicUsername : '';
      const p = typeof auth.basicPassword === 'string' ? auth.basicPassword : '';
      if (u || p) {
        const credentials = Buffer.from(`${u}:${p}`).toString('base64');
        removeHeader(preparedHeaders, 'authorization');
        preparedHeaders['Authorization'] = `Basic ${credentials}`;
      }
    }
  }

  // 4. Prepare Body Payload
  // Documented GET / DELETE Policy:
  // DevProbe transmits user-supplied payloads on GET and DELETE requests, computing Content-Length
  // and writing the payload without silent discarding, supporting non-standard APIs that require it.
  let preparedBody = null;
  if (body !== undefined && body !== null && body !== '') {
    if (typeof body === 'string') {
      preparedBody = body;
    } else if (typeof body === 'object' || typeof body === 'number' || typeof body === 'boolean') {
      try {
        preparedBody = JSON.stringify(body);
        if (!findHeaderKey(preparedHeaders, 'content-type')) {
          preparedHeaders['Content-Type'] = 'application/json';
        }
      } catch {
        throw new AppError('Failed to serialize request body payload', 400, 'INVALID_BODY');
      }
    }

    if (preparedBody !== null) {
      removeHeader(preparedHeaders, 'content-length');
      preparedHeaders['Content-Length'] = Buffer.byteLength(preparedBody, 'utf8');
    }
  }

  // Execution Limits
  const timeoutMs = typeof settings.timeoutMs === 'number' && settings.timeoutMs > 0
    ? Math.min(settings.timeoutMs, EXECUTION_LIMITS.MAX_TIMEOUT_MS)
    : (executionOptions.timeoutMs || EXECUTION_LIMITS.DEFAULT_TIMEOUT_MS);

  const maxRedirects = typeof settings.maxRedirects === 'number' && settings.maxRedirects >= 0
    ? settings.maxRedirects
    : (executionOptions.maxRedirects ?? EXECUTION_LIMITS.MAX_REDIRECTS);

  const maxResponseSizeBytes = typeof settings.maxResponseSizeBytes === 'number' && settings.maxResponseSizeBytes > 0
    ? settings.maxResponseSizeBytes
    : (executionOptions.maxResponseSizeBytes || EXECUTION_LIMITS.MAX_RESPONSE_SIZE_BYTES);

  const allowLocal = executionOptions.allowLocal ?? (process.env.DEVPROBE_ALLOW_LOCAL_TARGETS === 'true');
  const dnsResolver = executionOptions.dnsResolver;

  // 5. Execution Loop (handles manual redirect validation)
  let currentUrl = url;
  let currentMethod = method;
  let currentHeaders = { ...preparedHeaders };
  let currentBody = preparedBody;
  let redirectCount = 0;

  while (true) {
    // 5a. Validate Target URL syntax, protocol, and credentials
    const urlValidation = validateTargetUrl(currentUrl, { allowLocal });
    if (!urlValidation.isValid) {
      throw new AppError(urlValidation.error, 400, 'BLOCKED_DESTINATION');
    }
    const parsed = urlValidation.parsedUrl;

    // 5b. Resolve DNS and validate ALL destination IPs against SSRF policy
    const dnsValidation = await resolveAndValidateDestination(parsed.hostname, {
      allowLocal,
      dnsResolver
    });

    if (!dnsValidation.isValid) {
      const statusCode = dnsValidation.code === 'DNS_RESOLUTION_FAILED' ? 502 : 400;
      throw new AppError(dnsValidation.error, statusCode, dnsValidation.code || 'BLOCKED_DESTINATION');
    }

    const pinnedIp = dnsValidation.pinnedIp;
    const pinnedFamily = dnsValidation.pinnedFamily;

    // 5c. Dispatch request to pinned destination IP
    const result = await dispatchSingleRequest({
      parsedUrl: parsed,
      method: currentMethod,
      headers: currentHeaders,
      body: currentBody,
      pinnedIp,
      pinnedFamily,
      timeoutMs,
      maxResponseSizeBytes
    });

    // 5d. Check for HTTP Redirect
    const isRedirect = [301, 302, 303, 307, 308].includes(result.status);
    const locationHeader = result.headers['location'];

    if (isRedirect && locationHeader && typeof locationHeader === 'string' && locationHeader.trim()) {
      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new AppError(
          `Exceeded maximum allowed redirect limit of ${maxRedirects}.`,
          502,
          'TOO_MANY_REDIRECTS'
        );
      }

      let redirectUrl;
      try {
        redirectUrl = new URL(locationHeader.trim(), currentUrl).href;
      } catch (err) {
        throw new AppError(`Malformed redirect Location URL: '${locationHeader}'`, 502, 'INVALID_REDIRECT');
      }

      const nextParsed = new URL(redirectUrl);

      // Security: Strip sensitive authentication and cookie headers across cross-origin redirects
      if (nextParsed.origin !== parsed.origin) {
        removeHeader(currentHeaders, 'authorization');
        removeHeader(currentHeaders, 'cookie');
        removeHeader(currentHeaders, 'proxy-authorization');
        removeHeader(currentHeaders, 'x-api-key');
        removeHeader(currentHeaders, 'api-key');
        removeHeader(currentHeaders, 'x-auth-token');
        removeHeader(currentHeaders, 'auth-token');
        removeHeader(currentHeaders, 'access-token');
        removeHeader(currentHeaders, 'x-access-token');
        removeHeader(currentHeaders, 'session-token');
        removeHeader(currentHeaders, 'x-session-token');
        removeHeader(currentHeaders, 'apikey');
        removeHeader(currentHeaders, 'secret');
        removeHeader(currentHeaders, 'token');
      }

      // Method and body transitions per RFC 7231
      if (result.status === 303) {
        currentMethod = 'GET';
        currentBody = null;
        removeHeader(currentHeaders, 'content-length');
        removeHeader(currentHeaders, 'content-type');
      } else if (result.status === 301 || result.status === 302) {
        if (currentMethod === 'POST') {
          currentMethod = 'GET';
          currentBody = null;
          removeHeader(currentHeaders, 'content-length');
          removeHeader(currentHeaders, 'content-type');
        }
      }

      currentUrl = redirectUrl;
      continue;
    }

    // Final response received
    return result;
  }
}

module.exports = {
  prepareRequestConfiguration,
  executeRequest
};
