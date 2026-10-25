/**
 * DevProbe — Request Controller
 *
 * Handles HTTP requests for API request configuration validation and execution endpoints.
 */

const requestService = require('../services/requestService');

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
 * Safely executes the prepared outbound HTTP request and returns upstream response details
 */
async function executeRequest(req, res, next) {
  try {
    const validatedRequest = req.validatedRequest;
    const executionResult = await requestService.executeRequest(validatedRequest);

    return res.status(200).json({
      success: true,
      data: executionResult
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  validateRequest,
  executeRequest
};
