/**
 * DevProbe — Request Controller
 *
 * Handles HTTP requests for API request configuration validation and execution endpoints.
 */

const requestService = require('../services/requestService');
const historyService = require('../services/historyService');

/**
 * Safely triggers asynchronous execution history persistence in a fire-and-forget manner.
 * Ensures that neither synchronous errors nor asynchronous promise rejections will block
 * the client HTTP response or propagate as unhandled promise rejections.
 *
 * @param {object} requestData - Executed request metadata
 * @param {object|null} responseData - Upstream response data (if successful)
 * @param {Error|object|string|null} errorData - Upstream execution error (if failed)
 * @returns {Promise<any>|null} The underlying record execution promise (for tests tracking completion)
 */
function recordHistorySafely(requestData, responseData, errorData) {
  try {
    const recordPromise = historyService.recordExecution(requestData, responseData, errorData);
    if (recordPromise && typeof recordPromise.catch === 'function') {
      recordPromise.catch((err) => {
        // Safe, sanitized warning without leaking database credentials or unhandled rejections
        const safeMsg = err && typeof err.message === 'string' ? err.message : 'Unknown history recording error';
        console.warn(`[History Warning] Failed to record execution to history: ${safeMsg}`);
      });
    }
    return recordPromise;
  } catch (syncErr) {
    // Handle synchronous initiation error safely
    const safeMsg = syncErr && typeof syncErr.message === 'string' ? syncErr.message : 'Sync history recording failure';
    console.warn(`[History Warning] Synchronous error initiating history record: ${safeMsg}`);
    return null;
  }
}

/**
 * Handle POST /api/requests/validate
 * Validates and prepares request configuration without executing outbound HTTP requests
 */
function validateRequest(req, res, next) {
  try {
    const validatedRequest = req.validatedRequest;
    const preparedData = requestService.prepareRequestConfiguration(validatedRequest);

    return res.status(200).json({
      success: true,
      message: 'Request configuration validated successfully',
      data: preparedData
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle POST /api/requests/execute
 * Safely executes the prepared outbound HTTP request and returns upstream response details.
 * Automatically initiates fire-and-forget persistence into request_history without blocking
 * or failing the client response.
 */
async function executeRequest(req, res, next) {
  const validatedRequest = req.validatedRequest;
  const requestData = {
    name: validatedRequest?.name || req.body?.name || req.body?.request_name || null,
    method: validatedRequest.method,
    url: validatedRequest.url,
    headers: validatedRequest.headers,
    body: validatedRequest.body,
    auth: validatedRequest.auth
  };

  let executionResult;
  try {
    executionResult = await requestService.executeRequest(validatedRequest);
  } catch (err) {
    // Fire-and-forget: record execution failure without awaiting or altering upstream error
    recordHistorySafely(requestData, null, err);
    return next(err);
  }

  // Fire-and-forget: record successful execution without awaiting or altering 200 response
  recordHistorySafely(requestData, executionResult, null);

  return res.status(200).json({
    success: true,
    data: executionResult
  });
}

module.exports = {
  recordHistorySafely,
  validateRequest,
  executeRequest
};
