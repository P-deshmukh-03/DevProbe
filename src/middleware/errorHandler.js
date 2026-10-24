/**
 * DevProbe — Centralized Error Handling & Not Found Middleware
 *
 * Provides consistent, secure JSON error responses across all API endpoints:
 * - Traps JSON syntax errors from body-parsers
 * - Traps payload-too-large (413) errors
 * - Handles client validation failures (400)
 * - Returns structured 404 responses for undefined API routes
 * - Catches unexpected internal errors (500) without leaking stack traces or internal secrets
 */

/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found Middleware
 * Catch unmatched routes and return structured JSON for API endpoints
 */
function notFoundHandler(req, res, next) {
  // If requesting an API route or requesting JSON, return JSON 404
  if (req.path.startsWith('/api') || req.headers.accept?.includes('application/json')) {
    return res.status(404).json({
      success: false,
      message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
      error: {
        message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
        code: 'NOT_FOUND'
      }
    });
  }

  // Fallback for non-API routes
  return res.status(404).sendFile(require('path').join(__dirname, '../../public/index.html'));
}

/**
 * Centralized Error-Handling Middleware (Express 4-arg signature)
 */
function errorHandler(err, req, res, next) {
  // If response has already started sending, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = err.statusCode || err.status || 500;
  let errorCode = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected internal server error occurred';
  let details = err.details || null;

  // 1. JSON parse errors from body-parser
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Malformed JSON in request body. Please verify syntax.';
  }

  // 2. Payload too large (413)
  if (err.status === 413 || err.type === 'entity.too.large') {
    statusCode = 413;
    errorCode = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload exceeds maximum permitted size limit.';
  }

  // 3. Sanitized Server Diagnostics (Never log credentials or sensitive request payloads)
  if (statusCode >= 500) {
    console.error(`[Server Error] [${req.method} ${req.path}] ${err.name || 'Error'}: ${err.message}`);
    // Hide internal details from client on 500
    message = 'An unexpected internal server error occurred';
    errorCode = 'INTERNAL_ERROR';
  } else {
    // Info logging for client errors (4xx)
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[Client Warning] [${req.method} ${req.path}] ${statusCode} - ${message}`);
    }
  }

  // Send consistent, secure JSON response
  return res.status(statusCode).json({
    success: false,
    message,
    error: {
      message,
      code: errorCode,
      ...(details ? { details } : {})
    }
  });
}

module.exports = {
  AppError,
  notFoundHandler,
  errorHandler
};
