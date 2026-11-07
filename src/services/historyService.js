/**
 * DevProbe — Request History Service
 * Day 13: Request History & Execution Management
 *
 * Provides business logic, credential redaction, response truncation,
 * and database operations for persistent API request execution history.
 */

const { executeQuery, sanitizeDatabaseError } = require('../config/database');
const { SENSITIVE_HEADERS, SENSITIVE_RESPONSE_HEADERS } = require('../config/security');
const { AppError } = require('../middleware/errorHandler');
const assertionService = require('./assertionService');

/**
 * Maximum response body size stored in request_history (64 KB)
 */
const MAX_HISTORY_BODY_BYTES = 64 * 1024; // 65,536 bytes

/**
 * Regular expression matching sensitive keys that represent secret credentials.
 */
const PURE_SECRET_KEY_PATTERN = /^(authorization|bearer|token|access_token|refresh_token|api_key|apikey|key|secret|client_secret|password|passwd|pwd|private_key|session_token|sessionid|cookie|set-cookie)$/i;

/**
 * Regular expression matching structural containers that may contain sensitive nested objects.
 */
const STRUCTURAL_AUTH_KEY_PATTERN = /^(auth|credentials|session)$/i;

/**
 * Standard redaction mask
 */
const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Recursively redacts sensitive keys from parsed JSON objects or arrays.
 * Never leaks passwords, bearer tokens, or client secrets in persisted history.
 *
 * @param {any} data - Input parsed JSON data
 * @returns {any} Redacted data structure
 */
function redactSensitiveJson(data) {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveJson(item));
  }

  if (typeof data === 'object') {
    const redacted = {};
    for (const [key, value] of Object.entries(data)) {
      if (STRUCTURAL_AUTH_KEY_PATTERN.test(key)) {
        if (typeof value === 'object' && value !== null) {
          redacted[key] = redactSensitiveJson(value);
        } else {
          redacted[key] = REDACTED_PLACEHOLDER;
        }
      } else if (PURE_SECRET_KEY_PATTERN.test(key)) {
        redacted[key] = REDACTED_PLACEHOLDER;
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = redactSensitiveJson(value);
      } else if (typeof value === 'string') {
        // Redact values matching Bearer tokens or encrypted AES tokens
        if (/^Bearer\s+/i.test(value) || value.startsWith('enc:v1:') || value === '••••••••') {
          redacted[key] = REDACTED_PLACEHOLDER;
        } else {
          redacted[key] = value;
        }
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  return data;
}

/**
 * Redacts sensitive fields from a request or response body string or object.
 *
 * @param {string|object|null} body - Input payload
 * @returns {string|null} Redacted payload string
 */
function redactBody(body) {
  if (body === null || body === undefined) return null;

  if (typeof body === 'object') {
    try {
      const cleanObj = redactSensitiveJson(body);
      return JSON.stringify(cleanObj, null, 2);
    } catch {
      return String(body);
    }
  }

  if (typeof body === 'string') {
    const trimmed = body.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        const cleanObj = redactSensitiveJson(parsed);
        return JSON.stringify(cleanObj, null, 2);
      } catch {
        // Fall through to regex redaction if JSON parsing fails
      }
    }

    // Regex-based redaction for query strings, form-urlencoded bodies, and auth tokens
    let sanitized = body
      .replace(/((?:password|passwd|token|api_key|apikey|secret|client_secret|access_token)=)([^&\s]+)/gi, `$1${REDACTED_PLACEHOLDER}`)
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, `$1${REDACTED_PLACEHOLDER}`)
      .replace(/enc:v1:[0-9a-fA-F:]+/g, REDACTED_PLACEHOLDER);

    return sanitized;
  }

  return String(body);
}

/**
 * Sanitizes URLs by stripping embedded credentials and redacting sensitive query parameters.
 *
 * @param {string} rawUrl - Target URL string
 * @returns {string} Sanitized URL
 */
function redactUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  // 1. Redact embedded basic auth credentials
  let sanitized = rawUrl.replace(/(https?:\/\/)([^:@\s]+):([^@\s]+)@/i, `$1${REDACTED_PLACEHOLDER}:${REDACTED_PLACEHOLDER}@`);

  try {
    const urlObj = new URL(sanitized);

    // 2. Redact sensitive query parameters
    let modified = false;
    for (const key of Array.from(urlObj.searchParams.keys())) {
      if (PURE_SECRET_KEY_PATTERN.test(key) || STRUCTURAL_AUTH_KEY_PATTERN.test(key)) {
        urlObj.searchParams.set(key, REDACTED_PLACEHOLDER);
        modified = true;
      }
    }

    if (modified) {
      return urlObj.toString().replace(/%5BREDACTED%5D/g, REDACTED_PLACEHOLDER);
    }

    return sanitized;
  } catch {
    // Fallback for malformed or relative URLs
    return sanitized
      .replace(/:\/\/([^:]+):([^@]+)@/g, `://${REDACTED_PLACEHOLDER}:${REDACTED_PLACEHOLDER}@`)
      .replace(/([?&](?:token|access_token|refresh_token|api_key|apikey|key|secret|password|passwd|auth)=)([^&#\s]+)/gi, `$1${REDACTED_PLACEHOLDER}`);
  }
}

/**
 * Sanitizes headers by masking sensitive authorization, cookie, and secret header values.
 *
 * @param {Array|object|null} headers - Input headers
 * @returns {Record<string, string>|null} Redacted headers dictionary
 */
function redactHeaders(headers) {
  if (!headers) return null;

  const result = {};

  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (!h || typeof h !== 'object') continue;
      const key = String(h.key || '').trim();
      if (!key) continue;
      const lower = key.toLowerCase();
      if (SENSITIVE_HEADERS.has(lower) || SENSITIVE_RESPONSE_HEADERS.has(lower) || PURE_SECRET_KEY_PATTERN.test(lower)) {
        result[key] = REDACTED_PLACEHOLDER;
      } else {
        result[key] = h.value !== undefined && h.value !== null ? String(h.value) : '';
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof key !== 'string') continue;
      const trimmedKey = key.trim();
      if (!trimmedKey) continue;
      const lower = trimmedKey.toLowerCase();
      if (SENSITIVE_HEADERS.has(lower) || SENSITIVE_RESPONSE_HEADERS.has(lower) || PURE_SECRET_KEY_PATTERN.test(lower)) {
        result[trimmedKey] = REDACTED_PLACEHOLDER;
      } else {
        result[trimmedKey] = value !== undefined && value !== null ? String(value) : '';
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  return null;
}

/**
 * Processes a response body, enforcing sensitive redaction and 64 KB truncation limits.
 *
 * @param {string|object|null} body - Raw response body
 * @returns {{ responseBody: string|null, isTruncated: boolean }}
 */
function processResponseBody(body) {
  if (body === null || body === undefined) {
    return { responseBody: null, isTruncated: false };
  }

  let textBody = '';
  if (typeof body === 'string') {
    textBody = body;
  } else if (typeof body === 'object') {
    if (body.isBinary && body.preview) {
      textBody = body.preview;
    } else {
      try {
        const cleanObj = redactSensitiveJson(body);
        textBody = JSON.stringify(cleanObj, null, 2);
      } catch {
        textBody = String(body);
      }
    }
  } else {
    textBody = String(body);
  }

  // Redact body string for any remaining sensitive patterns
  textBody = redactBody(textBody);

  const byteLength = Buffer.byteLength(textBody, 'utf8');
  if (byteLength > MAX_HISTORY_BODY_BYTES) {
    // Truncate to MAX_HISTORY_BODY_BYTES safely without corrupting UTF-8 characters
    const truncatedText = Buffer.from(textBody, 'utf8')
      .subarray(0, MAX_HISTORY_BODY_BYTES)
      .toString('utf8');

    return {
      responseBody: truncatedText,
      isTruncated: true
    };
  }

  return {
    responseBody: textBody,
    isTruncated: false
  };
}

/**
 * Safely parses a JSON database column that may be returned as an object, array, or string.
 *
 * @param {any} value - Raw database column value
 * @returns {object|Array|null} Parsed structure or null
 */
function parseJsonSafely(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return null;
}

/**
 * Saves an API request execution record into MySQL request_history.
 * Handles both successful responses and upstream network or timeout failures.
 *
 * @param {object} requestData - Executed request details
 * @param {object|null} [responseData] - Upstream response details (if available)
 * @param {Error|object|string|null} [errorData] - Execution error (if failed)
 * @param {object|null} [testResults] - Optional assertion evaluation results
 * @returns {Promise<{ success: boolean, id: number, insertId: number }>}
 */
async function recordExecution(requestData = {}, responseData = null, errorData = null, testResults = null) {
  // 1. Extract and sanitize request metadata
  const rawName = requestData.name || requestData.request_name || null;
  const requestName = rawName && typeof rawName === 'string' ? rawName.trim().slice(0, 255) : null;
  const method = String(requestData.method || 'GET').trim().toUpperCase();
  const rawUrl = String(requestData.url || '').trim();
  const sanitizedUrl = redactUrl(rawUrl);

  // 2. Request headers and body
  const sanitizedReqHeaders = redactHeaders(requestData.headers);
  const jsonReqHeaders = sanitizedReqHeaders ? JSON.stringify(sanitizedReqHeaders) : null;

  let rawReqBody = requestData.body;
  if (rawReqBody && typeof rawReqBody === 'object' && rawReqBody.text !== undefined) {
    rawReqBody = rawReqBody.text;
  }
  const sanitizedReqBody = rawReqBody !== undefined && rawReqBody !== null ? redactBody(rawReqBody) : null;

  // 3. Response details
  let responseStatus = null;
  let responseHeadersJson = null;
  let responseTime = null;
  let responseBody = null;
  let responseBodyTruncated = 0;

  if (responseData && typeof responseData === 'object') {
    if (typeof responseData.status === 'number') {
      responseStatus = responseData.status;
    } else if (typeof responseData.statusCode === 'number') {
      responseStatus = responseData.statusCode;
    }

    const safeResHeaders = redactHeaders(responseData.headers || responseData.response_headers);
    responseHeadersJson = safeResHeaders ? JSON.stringify(safeResHeaders) : null;

    if (responseData.timeMs !== undefined && responseData.timeMs !== null) {
      responseTime = Math.max(0, parseInt(responseData.timeMs, 10) || 0);
    } else if (responseData.response_time !== undefined && responseData.response_time !== null) {
      responseTime = Math.max(0, parseInt(responseData.response_time, 10) || 0);
    }

    const rawResBody = responseData.rawText !== undefined
      ? responseData.rawText
      : (responseData.body !== undefined ? responseData.body : responseData.data);

    const processed = processResponseBody(rawResBody);
    responseBody = processed.responseBody;
    responseBodyTruncated = processed.isTruncated ? 1 : 0;
  }

  // 4. Error details
  let errorMessage = null;
  if (errorData) {
    if (typeof errorData === 'string') {
      errorMessage = errorData;
    } else if (errorData instanceof Error) {
      errorMessage = errorData.message || String(errorData);
    } else if (typeof errorData === 'object') {
      errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
    }
  }

  // 5. Test results details (validated and sanitized)
  const rawTestResults = testResults !== undefined && testResults !== null
    ? testResults
    : (requestData.test_results !== undefined ? requestData.test_results : requestData.testResults);

  const sanitizedTestResults = assertionService.validateAndSanitizeTestResults(rawTestResults);
  const jsonTestResults = sanitizedTestResults ? JSON.stringify(sanitizedTestResults) : null;

  // 6. Execute parameterized INSERT
  const insertSql = `
    INSERT INTO request_history (
      request_name, method, url, request_headers, request_body,
      response_status, response_headers, response_body, response_body_truncated,
      response_time, error_message, test_results
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    const [result] = await executeQuery(insertSql, [
      requestName,
      method,
      sanitizedUrl,
      jsonReqHeaders,
      sanitizedReqBody,
      responseStatus,
      responseHeadersJson,
      responseBody,
      responseBodyTruncated,
      responseTime,
      errorMessage,
      jsonTestResults
    ]);

    return {
      success: true,
      id: result.insertId,
      insertId: result.insertId
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Retrieves paginated request history records (summary list view).
 * Excludes large response and request bodies to optimize performance and bandwidth.
 *
 * @param {object} [options] - Pagination options
 * @param {number|string} [options.page=1] - 1-based page index
 * @param {number|string} [options.limit=20] - Number of items per page (max 100)
 * @returns {Promise<{ items: Array, pagination: { total: number, page: number, limit: number, totalPages: number } }>}
 */
async function getHistory({ page = 1, limit = 20 } = {}) {
  let numPage = parseInt(page, 10);
  let numLimit = parseInt(limit, 10);

  if (Number.isNaN(numPage) || numPage < 1) {
    throw new AppError('Page must be a positive integer', 400, 'INVALID_PAGINATION', null, 'page');
  }

  if (Number.isNaN(numLimit) || numLimit < 1) {
    throw new AppError('Limit must be a positive integer', 400, 'INVALID_PAGINATION', null, 'limit');
  }

  if (numLimit > 100) {
    numLimit = 100;
  }

  const offset = (numPage - 1) * numLimit;

  try {
    const [countRows] = await executeQuery('SELECT COUNT(*) AS total FROM request_history');
    const total = countRows && countRows[0] ? Number(countRows[0].total) : 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / numLimit);

    const selectSql = `
      SELECT
        id,
        request_name,
        method,
        url,
        response_status,
        response_time,
        response_body_truncated,
        error_message,
        created_at
      FROM request_history
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await executeQuery(selectSql, [numLimit, offset]);

    const items = rows.map((row) => ({
      id: row.id,
      request_name: row.request_name,
      method: row.method,
      url: row.url,
      response_status: row.response_status,
      response_time: row.response_time,
      response_body_truncated: Boolean(row.response_body_truncated),
      error_message: row.error_message,
      created_at: row.created_at
    }));

    return {
      items,
      pagination: {
        total,
        page: numPage,
        limit: numLimit,
        totalPages
      }
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Retrieves the complete details of a single request history record by ID.
 *
 * @param {number|string} id - History record ID
 * @returns {Promise<object|null>} Full history record details or null if not found
 */
async function getHistoryById(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('History ID must be a positive integer', 400, 'INVALID_HISTORY_ID', null, 'id');
  }

  const selectSql = `
    SELECT
      id,
      request_name,
      method,
      url,
      request_headers,
      request_body,
      response_status,
      response_headers,
      response_body,
      response_body_truncated,
      response_time,
      error_message,
      test_results,
      created_at
    FROM request_history
    WHERE id = ?
  `;

  try {
    const [rows] = await executeQuery(selectSql, [numericId]);
    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      request_name: row.request_name,
      method: row.method,
      url: row.url,
      request_headers: parseJsonSafely(row.request_headers),
      request_body: row.request_body,
      response_status: row.response_status,
      response_headers: parseJsonSafely(row.response_headers),
      response_body: row.response_body,
      response_body_truncated: Boolean(row.response_body_truncated),
      response_time: row.response_time,
      error_message: row.error_message,
      test_results: parseJsonSafely(row.test_results),
      created_at: row.created_at
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Deletes a single history record by ID.
 *
 * @param {number|string} id - History record ID to delete
 * @returns {Promise<{ success: boolean, deleted: boolean, id: number }>}
 */
async function deleteHistoryById(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('History ID must be a positive integer', 400, 'INVALID_HISTORY_ID', null, 'id');
  }

  try {
    const [result] = await executeQuery('DELETE FROM request_history WHERE id = ?', [numericId]);
    const deleted = result.affectedRows > 0;

    return {
      success: deleted,
      deleted,
      id: numericId
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Permanently deletes all history records from MySQL request_history.
 * Does not drop or alter the database table structure.
 *
 * @returns {Promise<{ success: boolean, deletedCount: number }>}
 */
async function clearAllHistory() {
  try {
    const [result] = await executeQuery('DELETE FROM request_history');
    return {
      success: true,
      deletedCount: result.affectedRows
    };
  } catch (err) {
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

module.exports = {
  MAX_HISTORY_BODY_BYTES,
  PURE_SECRET_KEY_PATTERN,
  STRUCTURAL_AUTH_KEY_PATTERN,
  SENSITIVE_KEY_PATTERN: PURE_SECRET_KEY_PATTERN,
  REDACTED_PLACEHOLDER,
  redactSensitiveJson,
  redactBody,
  redactUrl,
  redactHeaders,
  processResponseBody,
  parseJsonSafely,
  recordExecution,
  getHistory,
  getHistoryById,
  deleteHistoryById,
  clearAllHistory
};
