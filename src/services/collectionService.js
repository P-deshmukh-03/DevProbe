/**
 * DevProbe — Collection Service
 * Day 10: Collections and Saved Requests Persistence
 *
 * Provides business logic and parameterized database operations for collections.
 */

const { executeQuery, sanitizeDatabaseError } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

/**
 * Retrieves all collections ordered alphabetically by name.
 *
 * @returns {Promise<Array<object>>} List of collections
 */
async function getAllCollections() {
  try {
    const sql = 'SELECT id, name, description, created_at, updated_at FROM collections ORDER BY name ASC';
    const [rows] = await executeQuery(sql, []);
    return rows;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Retrieves a single collection by its primary key ID.
 *
 * @param {number|string} id - The collection ID
 * @returns {Promise<object|null>} The collection record or null if not found
 */
async function getCollectionById(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('Collection ID must be a positive integer', 400, 'INVALID_COLLECTION_ID', null, 'id');
  }

  try {
    const sql = 'SELECT id, name, description, created_at, updated_at FROM collections WHERE id = ?';
    const [rows] = await executeQuery(sql, [numericId]);

    if (!rows || rows.length === 0) {
      return null;
    }

    return rows[0];
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Creates a new collection with validated name and optional description.
 *
 * @param {object} payload - Collection data
 * @param {string} payload.name - Name of collection (1-255 characters)
 * @param {string} [payload.description] - Optional description text
 * @returns {Promise<object>} Created collection record
 */
async function createCollection({ name, description } = {}) {
  // Validate collection name
  if (name === undefined || name === null || typeof name !== 'string') {
    throw new AppError('Collection name is required and must be a string', 400, 'VALIDATION_ERROR', null, 'name');
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new AppError('Collection name cannot be empty', 400, 'VALIDATION_ERROR', null, 'name');
  }

  if (trimmedName.length > 255) {
    throw new AppError('Collection name cannot exceed 255 characters', 400, 'VALIDATION_ERROR', null, 'name');
  }

  // Handle optional description
  let safeDescription = null;
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      throw new AppError('Collection description must be a string if provided', 400, 'VALIDATION_ERROR', null, 'description');
    }
    const trimmedDesc = description.trim();
    safeDescription = trimmedDesc.length > 0 ? trimmedDesc : null;
  }

  try {
    const insertSql = 'INSERT INTO collections (name, description) VALUES (?, ?)';
    const [result] = await executeQuery(insertSql, [trimmedName, safeDescription]);

    const createdId = result.insertId;
    const fetchSql = 'SELECT id, name, description, created_at, updated_at FROM collections WHERE id = ?';
    const [rows] = await executeQuery(fetchSql, [createdId]);

    return rows[0];
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

module.exports = {
  getAllCollections,
  getCollectionById,
  createCollection
};

