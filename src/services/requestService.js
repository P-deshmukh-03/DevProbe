/**
 * DevProbe — Request Preparation & Normalization Service
 *
 * Day 4: Backend Architecture & Safe Request Validation
 *
 * Prepares and normalizes request configurations for Day 5 execution.
 * CRITICAL SAFETY RULES:
 * 1. Does NOT execute any outbound network requests or DNS queries.
 * 2. Never returns raw authentication credentials (tokens, passwords, secrets, cookies).
 * 3. Sanitizes headers before including them in metadata.
 */

const {
  EXECUTION_LIMITS,
  sanitizeHeaders
} = require('../config/security');

/**
 * Prepares and normalizes a validated request configuration for Day 5 execution
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
      // Strictly redact any credential values
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

module.exports = {
  prepareRequestConfiguration
};
