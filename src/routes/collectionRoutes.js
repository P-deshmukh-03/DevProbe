/**
 * DevProbe — Collection Routes
 * Day 10: Collections and Saved Requests Persistence
 * Day 15: Collection Import/Export & API Documentation Endpoints
 *
 * Defines REST endpoints for collections management, import/export, and documentation generation.
 */

const express = require('express');
const router = express.Router();
const collectionController = require('../controllers/collectionController');

/**
 * Collection Import / Export & Documentation Endpoints (Day 15)
 * Note: Static path '/import' is defined before dynamic parameterized '/:id'
 */

// POST /api/collections/import - Import a collection bundle
router.post('/import', collectionController.importCollection);

// GET /api/collections/:id/export - Export a collection as devprobe/v1 JSON
router.get('/:id/export', collectionController.exportCollection);

// GET /api/collections/:id/docs/markdown - Generate collection documentation in Markdown
router.get('/:id/docs/markdown', collectionController.getCollectionMarkdownDoc);

// GET /api/collections/:id/docs/html - Generate collection documentation in HTML5
router.get('/:id/docs/html', collectionController.getCollectionHtmlDoc);

/**
 * Collections CRUD Endpoints (Day 10)
 */

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

/**
 * PUT /api/collections/:id
 * Update an existing collection
 */
router.put('/:id', collectionController.updateCollection);

/**
 * DELETE /api/collections/:id
 * Delete a collection safely
 */
router.delete('/:id', collectionController.deleteCollection);

module.exports = router;

