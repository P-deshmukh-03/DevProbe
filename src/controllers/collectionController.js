/**
 * DevProbe — Collection Controller
 * Day 10: Collections and Saved Requests Persistence
 *
 * Handles HTTP requests for collections listing and creation.
 */

const collectionService = require('../services/collectionService');
const { AppError } = require('../middleware/errorHandler');

/**
 * Handle GET /api/collections
 * Retrieves all saved collections.
 */
async function getCollections(req, res, next) {
  try {
    const collections = await collectionService.getAllCollections();
    return res.status(200).json({
      success: true,
      data: collections
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle GET /api/collections/:id
 * Retrieves a single collection by ID.
 */
async function getCollectionById(req, res, next) {
  try {
    const { id } = req.params;
    const collection = await collectionService.getCollectionById(id);

    if (!collection) {
      throw new AppError(`Collection with ID ${id} not found`, 404, 'NOT_FOUND');
    }

    return res.status(200).json({
      success: true,
      data: collection
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle POST /api/collections
 * Creates a new collection.
 */
async function createCollection(req, res, next) {
  try {
    const { name, description } = req.body || {};
    const newCollection = await collectionService.createCollection({ name, description });

    return res.status(201).json({
      success: true,
      message: 'Collection created successfully',
      data: newCollection
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getCollections,
  getCollectionById,
  createCollection
};

