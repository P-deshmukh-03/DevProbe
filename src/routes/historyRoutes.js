/**
 * DevProbe — Request History Routes
 * Day 13: Request History & Execution Management
 *
 * Mounts REST API endpoints for viewing, retrieving,
 * and deleting execution history.
 */

const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');

/**
 * GET /api/history
 * Get paginated execution history summary list
 */
router.get('/', historyController.getHistory);

/**
 * DELETE /api/history
 * Clear all execution history records
 */
router.delete('/', historyController.clearHistory);

/**
 * GET /api/history/:id
 * Retrieve a specific execution history record with complete details
 */
router.get('/:id', historyController.getHistoryById);

/**
 * DELETE /api/history/:id
 * Delete a specific execution history record
 */
router.delete('/:id', historyController.deleteHistoryById);

module.exports = router;

