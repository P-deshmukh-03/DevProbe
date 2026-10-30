/**
 * DevProbe — Saved Request Routes
 * Day 10: Collections and Saved Requests Persistence
 *
 * Defines REST endpoints for saved requests persistence.
 */

const express = require('express');
const router = express.Router();
const savedRequestController = require('../controllers/savedRequestController');

/**
 * GET /api/requests/saved
 * List saved requests (optional query param: ?collectionId=)
 */
router.get('/', savedRequestController.getSavedRequests);

/**
 * GET /api/requests/saved/:id
 * Retrieve a specific saved request by ID
 */
router.get('/:id', savedRequestController.getSavedRequestById);

/**
 * POST /api/requests/saved
 * Save a new request configuration
 */
router.post('/', savedRequestController.createSavedRequest);

/**
 * PUT /api/requests/saved/:id
 * Update an existing saved request
 */
router.put('/:id', savedRequestController.updateSavedRequest);

/**
 * DELETE /api/requests/saved/:id
 * Delete a saved request
 */
router.delete('/:id', savedRequestController.deleteSavedRequest);

module.exports = router;

