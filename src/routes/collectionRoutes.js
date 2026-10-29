/**
 * DevProbe — Collection Routes
 * Day 10: Collections and Saved Requests Persistence
 *
 * Defines REST endpoints for collections management.
 */

const express = require('express');
const router = express.Router();
const collectionController = require('../controllers/collectionController');

/**
 * GET /api/collections
 * List all saved collections
 */
router.get('/', collectionController.getCollections);

/**
 * GET /api/collections/:id
 * Retrieve a specific collection
 */
router.get('/:id', collectionController.getCollectionById);

/**
 * POST /api/collections
 * Create a new collection
 */
router.post('/', collectionController.createCollection);

module.exports = router;

