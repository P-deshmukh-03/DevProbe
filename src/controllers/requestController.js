/**
 * DevProbe — Request Controller
 *
 * Handles HTTP requests for API request configuration and validation endpoints.
 */

const requestService = require('../services/requestService');

/**
 * Handle POST /api/requests/validate
 * Validates and prepares request configuration for Day 5 execution
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

module.exports = {
  validateRequest
};
