/**
 * DevProbe — Saved Request Controller
 * Day 10: Collections and Saved Requests Persistence
 *
 * Handles HTTP requests for saved requests listing, retrieval, and creation.
 */

const savedRequestService = require('../services/savedRequestService');

/**
 * Handle GET /api/requests/saved
 * Retrieves saved requests, optionally filtered by ?collectionId=
 */
async function getSavedRequests(req, res, next) {
  try {
    const { collectionId } = req.query;
    const requests = await savedRequestService.getSavedRequests({ collectionId });

    return res.status(200).json({
      success: true,
      data: requests
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle GET /api/requests/saved/:id
 * Retrieves a specific saved request by ID.
 */
async function getSavedRequestById(req, res, next) {
  try {
    const { id } = req.params;
    const request = await savedRequestService.getSavedRequestById(id);

    return res.status(200).json({
      success: true,
      data: request
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle POST /api/requests/saved
 * Creates a new saved request record.
 */
async function createSavedRequest(req, res, next) {
  try {
    const savedRequest = await savedRequestService.createSavedRequest(req.body);

    return res.status(201).json({
      success: true,
      message: 'Request saved successfully',
      data: savedRequest
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle PUT /api/requests/saved/:id
 * Updates an existing saved request.
 */
async function updateSavedRequest(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await savedRequestService.updateSavedRequest(id, req.body);

    return res.status(200).json({
      success: true,
      message: 'Saved request updated successfully',
      data: updated
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle DELETE /api/requests/saved/:id
 * Deletes a saved request.
 */
async function deleteSavedRequest(req, res, next) {
  try {
    const { id } = req.params;
    const result = await savedRequestService.deleteSavedRequest(id);

    return res.status(200).json({
      success: true,
      message: 'Saved request deleted successfully',
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSavedRequests,
  getSavedRequestById,
  createSavedRequest,
  updateSavedRequest,
  deleteSavedRequest
};

