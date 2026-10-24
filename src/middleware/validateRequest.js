/**
 * DevProbe — Request Configuration Validation Middleware
 *
 * Validates request configuration inputs before service normalization:
 * - Checks HTTP method validity (GET, POST, PUT, PATCH, DELETE)
 * - Validates target URL syntax, protocols (http/https only), credentials, and SSRF restrictions
 * - Validates headers per RFC 7230 specification and string values
 * - Enforces body size limits and data type constraints
 * - Rejects malformed structures without executing unsafe code or eval()
 */

const {
  ALLOWED_HTTP_METHODS,
  EXECUTION_LIMITS,
  validateTargetUrl
} = require('../config/security');
const { AppError } = require('./errorHandler');

// RFC 7230 valid token character pattern for header field names
const HEADER_NAME_PATTERN = /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/;

/**
 * Express middleware to validate POST /api/requests/validate payload
 */
function validateRequestPayload(req, res, next) {
  const payload = req.body;

  // 1. Check payload object integrity
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return next(new AppError('Request payload must be a non-null JSON object', 400, 'INVALID_PAYLOAD'));
  }

  // 2. Validate HTTP Method
  if (!payload.method || typeof payload.method !== 'string') {
    return next(new AppError('Field \'method\' is required and must be a string', 400, 'MISSING_METHOD'));
  }

  const normalizedMethod = payload.method.trim().toUpperCase();
  if (!ALLOWED_HTTP_METHODS.includes(normalizedMethod)) {
    return next(new AppError(
      `Unsupported HTTP method '${payload.method}'. Supported methods: ${ALLOWED_HTTP_METHODS.join(', ')}`,
      400,
      'UNSUPPORTED_METHOD'
    ));
  }

  // 3. Validate Target URL
  if (!payload.url || typeof payload.url !== 'string' || !payload.url.trim()) {
    return next(new AppError('Field \'url\' is required and must be a non-empty string', 400, 'MISSING_URL'));
  }

  const urlValidation = validateTargetUrl(payload.url);
  if (!urlValidation.isValid) {
    return next(new AppError(urlValidation.error, 400, 'INVALID_URL'));
  }

  // 4. Validate Headers (if provided)
  let validatedHeaders = {};
  if (payload.headers !== undefined && payload.headers !== null) {
    if (typeof payload.headers !== 'object' || Array.isArray(payload.headers)) {
      return next(new AppError('Field \'headers\' must be a key-value object', 400, 'INVALID_HEADERS'));
    }

    for (const [headerName, headerVal] of Object.entries(payload.headers)) {
      // Validate header name according to RFC 7230 token specification
      if (typeof headerName !== 'string' || !HEADER_NAME_PATTERN.test(headerName)) {
        return next(new AppError(
          `Invalid HTTP header name '${headerName}'. Header names must follow RFC 7230 token specifications.`,
          400,
          'INVALID_HEADER_NAME'
        ));
      }

      // Reject non-string header values
      if (typeof headerVal !== 'string') {
        return next(new AppError(
          `Invalid value for header '${headerName}'. Header values must be strings.`,
          400,
          'INVALID_HEADER_VALUE'
        ));
      }

      validatedHeaders[headerName] = headerVal;
    }
  }

  // 5. Validate Body & Size
  let bodySizeBytes = 0;
  let bodyPresent = false;
  let mediaType = null;

  if (payload.body !== undefined && payload.body !== null && payload.body !== '') {
    bodyPresent = true;
    if (typeof payload.body === 'string') {
      bodySizeBytes = Buffer.byteLength(payload.body, 'utf8');
    } else if (typeof payload.body === 'object') {
      try {
        const serialized = JSON.stringify(payload.body);
        bodySizeBytes = Buffer.byteLength(serialized, 'utf8');
      } catch (err) {
        return next(new AppError('Failed to serialize request body: circular or invalid structure', 400, 'INVALID_BODY'));
      }
    } else {
      return next(new AppError('Request body must be a string, JSON object, or null', 400, 'INVALID_BODY'));
    }

    if (bodySizeBytes > EXECUTION_LIMITS.MAX_REQUEST_BODY_SIZE_BYTES) {
      return next(new AppError(
        `Request body size (${bodySizeBytes} bytes) exceeds maximum permitted limit of ${EXECUTION_LIMITS.MAX_REQUEST_BODY_SIZE_BYTES} bytes (1 MB)`,
        413,
        'PAYLOAD_TOO_LARGE'
      ));
    }

    // Determine content type from headers if present
    const ctHeader = Object.keys(validatedHeaders).find(k => k.toLowerCase() === 'content-type');
    if (ctHeader) {
      mediaType = validatedHeaders[ctHeader];
    }
  }

  // 6. Validate Auth (if provided)
  if (payload.auth !== undefined && payload.auth !== null) {
    if (typeof payload.auth !== 'object' || Array.isArray(payload.auth)) {
      return next(new AppError('Field \'auth\' must be a configuration object', 400, 'INVALID_AUTH'));
    }
  }

  // Attach normalized validated data to request object
  req.validatedRequest = {
    method: normalizedMethod,
    url: urlValidation.parsedUrl.href,
    parsedUrl: urlValidation.parsedUrl,
    headers: validatedHeaders,
    body: payload.body ?? null,
    bodyMetadata: {
      present: bodyPresent,
      sizeBytes: bodySizeBytes,
      mediaType
    },
    auth: payload.auth ?? null
  };

  next();
}

module.exports = {
  validateRequestPayload
};
