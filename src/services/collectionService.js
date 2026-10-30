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

/**
 * Updates an existing collection's name and optional description.
 *
 * @param {number|string} id - The collection ID
 * @param {object} payload - Updated collection data
 * @param {string} payload.name - Updated collection name (1-255 characters)
 * @param {string} [payload.description] - Updated description text
 * @returns {Promise<object>} Updated collection record
 */
async function updateCollection(id, { name, description } = {}) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('Collection ID must be a positive integer', 400, 'INVALID_COLLECTION_ID', null, 'id');
  }

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

  // Verify collection exists
  const existing = await getCollectionById(numericId);
  if (!existing) {
    throw new AppError(`Collection with ID ${numericId} not found`, 404, 'NOT_FOUND');
  }

  try {
    const updateSql = 'UPDATE collections SET name = ?, description = ? WHERE id = ?';
    await executeQuery(updateSql, [trimmedName, safeDescription, numericId]);

    const fetchSql = 'SELECT id, name, description, created_at, updated_at FROM collections WHERE id = ?';
    const [rows] = await executeQuery(fetchSql, [numericId]);

    return rows[0];
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Deletes a collection safely without removing associated saved requests.
 * Linked saved requests have their collection_id updated to NULL (unassigned).
 *
 * @param {number|string} id - The collection ID to delete
 * @returns {Promise<{ id: number, deleted: boolean }>} Deletion result
 */
async function deleteCollection(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('Collection ID must be a positive integer', 400, 'INVALID_COLLECTION_ID', null, 'id');
  }

  // Verify collection exists
  const existing = await getCollectionById(numericId);
  if (!existing) {
    throw new AppError(`Collection with ID ${numericId} not found`, 404, 'NOT_FOUND');
  }

  try {
    // Explicitly unassign saved requests so they remain available as unassigned requests
    await executeQuery('UPDATE saved_requests SET collection_id = NULL WHERE collection_id = ?', [numericId]);

    // Delete the collection record
    await executeQuery('DELETE FROM collections WHERE id = ?', [numericId]);

    return { id: numericId, deleted: true };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

module.exports = {
  getAllCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection
};

