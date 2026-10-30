/**
 * DevProbe — Saved Request Service
 * Day 10: Collections and Saved Requests Persistence
 *
 * Provides business logic, validation, credential sanitization, and
 * parameterized database operations for saved API requests.
 */

const { executeQuery, sanitizeDatabaseError } = require('../config/database');
const { ALLOWED_HTTP_METHODS, ALLOWED_PROTOCOLS, SENSITIVE_HEADERS } = require('../config/security');
const { AppError } = require('../middleware/errorHandler');

/**
 * Valid body types supported by DevProbe
 */
const VALID_BODY_TYPES = new Set(['none', 'json', 'text']);

/**
 * Valid auth types supported by DevProbe
 */
const VALID_AUTH_TYPES = new Set(['none', 'bearer', 'basic']);

/**
 * Strips sensitive authorization and credential headers from a headers data structure.
 * Never persists Authorization, Cookie, API keys, or session tokens.
 *
 * @param {Array|object|null} headers - Input headers from client
 * @returns {Array|object|null} Sanitized headers structure
 */
function sanitizeSavedHeaders(headers) {
  if (!headers) return null;

  if (Array.isArray(headers)) {
    return headers
      .filter((h) => {
        if (!h || typeof h !== 'object') return false;
        const key = String(h.key || '').trim().toLowerCase();
        return key.length > 0 && !SENSITIVE_HEADERS.has(key);
      })
      .map((h) => ({
        id: h.id || undefined,
        key: String(h.key || '').trim(),
        value: typeof h.value === 'string' ? h.value : String(h.value ?? ''),
        description: h.description ? String(h.description) : '',
        enabled: h.enabled !== false
      }));
  }

  if (typeof headers === 'object') {
    const cleanObj = {};
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.trim().toLowerCase();
      if (lowerKey.length > 0 && !SENSITIVE_HEADERS.has(lowerKey)) {
        cleanObj[key.trim()] = typeof value === 'string' ? value : String(value ?? '');
      }
    }
    return cleanObj;
  }

  return null;
}

/**
 * Safely parses a JSON database column that may be returned as a string or an object/array.
 *
 * @param {string|object|Array|null} value - Raw database column value
 * @returns {object|Array|null} Parsed structure or null
 */
function parseJsonColumn(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Normalizes a saved request record from the database for client response.
 * Guarantees that sensitive credentials are never present and JSON columns are parsed.
 *
 * @param {object} row - Raw database record
 * @returns {object} Formatted saved request
 */
function formatSavedRequest(row) {
  if (!row) return null;

  return {
    id: row.id,
    collection_id: row.collection_id !== null ? Number(row.collection_id) : null,
    name: row.name,
    method: row.method,
    url: row.url,
    headers: parseJsonColumn(row.headers),
    params: parseJsonColumn(row.params),
    body: row.body !== null ? String(row.body) : null,
    body_type: row.body_type || 'none',
    auth_type: row.auth_type || 'none',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Retrieves saved requests, optionally filtered by collection ID.
 *
 * @param {object} [filter] - Filter criteria
 * @param {number|string} [filter.collectionId] - Optional collection ID filter
 * @returns {Promise<Array<object>>} List of formatted saved requests
 */
async function getSavedRequests({ collectionId } = {}) {
  try {
    let sql = 'SELECT id, collection_id, name, method, url, headers, params, body, body_type, auth_type, created_at, updated_at FROM saved_requests';
    const params = [];

    if (collectionId !== undefined && collectionId !== null && collectionId !== '') {
      const numericColId = parseInt(collectionId, 10);
      if (Number.isNaN(numericColId) || numericColId <= 0) {
        throw new AppError('Collection ID filter must be a positive integer', 400, 'INVALID_COLLECTION_ID', null, 'collectionId');
      }
      sql += ' WHERE collection_id = ?';
      params.push(numericColId);
    }

    sql += ' ORDER BY id ASC';

    const [rows] = await executeQuery(sql, params);
    return rows.map(formatSavedRequest);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Retrieves a single saved request by its primary key ID.
 *
 * @param {number|string} id - Saved request ID
 * @returns {Promise<object>} The formatted saved request record
 */
async function getSavedRequestById(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('Saved request ID must be a positive integer', 400, 'INVALID_REQUEST_ID', null, 'id');
  }

  try {
    const sql = 'SELECT id, collection_id, name, method, url, headers, params, body, body_type, auth_type, created_at, updated_at FROM saved_requests WHERE id = ?';
    const [rows] = await executeQuery(sql, [numericId]);

    if (!rows || rows.length === 0) {
      throw new AppError(`Saved request with ID ${numericId} not found`, 404, 'NOT_FOUND');
    }

    return formatSavedRequest(rows[0]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Creates a new saved request record in MySQL.
 * Strictly validates fields, enforces method allowlist, and strips authentication credentials.
 *
 * @param {object} payload - Request configuration to save
 * @returns {Promise<object>} Created saved request record
 */
async function createSavedRequest(payload = {}) {
  const {
    name,
    method,
    url,
    collection_id,
    collectionId,
    headers,
    params,
    body,
    body_type,
    bodyType,
    auth_type,
    authType,
    auth
  } = payload;

  // 1. Validate request name
  if (name === undefined || name === null || typeof name !== 'string') {
    throw new AppError('Request name is required and must be a string', 400, 'VALIDATION_ERROR', null, 'name');
  }
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new AppError('Request name cannot be empty', 400, 'VALIDATION_ERROR', null, 'name');
  }
  if (trimmedName.length > 255) {
    throw new AppError('Request name cannot exceed 255 characters', 400, 'VALIDATION_ERROR', null, 'name');
  }

  // 2. Validate HTTP method
  if (!method || typeof method !== 'string') {
    throw new AppError('HTTP method is required', 400, 'VALIDATION_ERROR', null, 'method');
  }
  const normalizedMethod = method.trim().toUpperCase();
  if (!ALLOWED_HTTP_METHODS.includes(normalizedMethod)) {
    throw new AppError(
      `Unsupported HTTP method '${method}'. Permitted methods: ${ALLOWED_HTTP_METHODS.join(', ')}`,
      400,
      'UNSUPPORTED_METHOD',
      null,
      'method'
    );
  }

  // 3. Validate URL format and protocol
  if (!url || typeof url !== 'string') {
    throw new AppError('URL is required and must be a string', 400, 'VALIDATION_ERROR', null, 'url');
  }
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    throw new AppError('URL cannot be empty', 400, 'VALIDATION_ERROR', null, 'url');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    throw new AppError(`Invalid URL format: '${trimmedUrl}'`, 400, 'INVALID_URL', null, 'url');
  }

  if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
    throw new AppError(
      `Unsupported protocol '${parsedUrl.protocol}'. Only 'http:' and 'https:' are permitted.`,
      400,
      'INVALID_PROTOCOL',
      null,
      'url'
    );
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new AppError('URLs with embedded credentials (username:password@...) are prohibited', 400, 'EMBEDDED_CREDENTIALS', null, 'url');
  }

  // 4. Validate collection ID and existence if provided
  const targetColId = collection_id !== undefined ? collection_id : collectionId;
  let safeCollectionId = null;

  if (targetColId !== undefined && targetColId !== null && targetColId !== '') {
    const numericColId = parseInt(targetColId, 10);
    if (Number.isNaN(numericColId) || numericColId <= 0) {
      throw new AppError('Collection ID must be a positive integer if provided', 400, 'INVALID_COLLECTION_ID', null, 'collection_id');
    }

    try {
      const [colRows] = await executeQuery('SELECT id FROM collections WHERE id = ?', [numericColId]);
      if (!colRows || colRows.length === 0) {
        throw new AppError(`Collection with ID ${numericColId} not found`, 404, 'COLLECTION_NOT_FOUND', null, 'collection_id');
      }
      safeCollectionId = numericColId;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
    }
  }

  // 5. Sanitize headers (strictly purge sensitive auth/tokens/passwords)
  const sanitizedHeaders = sanitizeSavedHeaders(headers);
  const jsonHeaders = sanitizedHeaders ? JSON.stringify(sanitizedHeaders) : null;

  // 6. Handle parameters
  let jsonParams = null;
  if (params !== undefined && params !== null) {
    if (Array.isArray(params) || typeof params === 'object') {
      jsonParams = JSON.stringify(params);
    }
  }

  // 7. Validate body type and body
  const rawBodyType = body_type || bodyType || 'none';
  const safeBodyType = VALID_BODY_TYPES.has(rawBodyType.toLowerCase()) ? rawBodyType.toLowerCase() : 'none';
  const safeBody = (safeBodyType !== 'none' && body !== undefined && body !== null) ? String(body) : null;

  // 8. Authentication protection: store ONLY safe auth scheme metadata, NEVER tokens or passwords
  const rawAuthType = auth_type || authType || (auth && typeof auth === 'object' ? auth.type : null) || 'none';
  const safeAuthType = VALID_AUTH_TYPES.has(String(rawAuthType).toLowerCase()) ? String(rawAuthType).toLowerCase() : 'none';

  // 9. Execute parameterized INSERT
  try {
    const insertSql = `
      INSERT INTO saved_requests (
        collection_id, name, method, url, headers, params, body, body_type, auth_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await executeQuery(insertSql, [
      safeCollectionId,
      trimmedName,
      normalizedMethod,
      trimmedUrl,
      jsonHeaders,
      jsonParams,
      safeBody,
      safeBodyType,
      safeAuthType
    ]);

    const createdId = result.insertId;
    const fetchSql = 'SELECT id, collection_id, name, method, url, headers, params, body, body_type, auth_type, created_at, updated_at FROM saved_requests WHERE id = ?';
    const [rows] = await executeQuery(fetchSql, [createdId]);

    return formatSavedRequest(rows[0]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Updates an existing saved request in MySQL.
 * Strictly validates fields, enforces method allowlist, and strips authentication credentials.
 *
 * @param {number|string} id - Saved request ID to update
 * @param {object} payload - Updated request configuration
 * @returns {Promise<object>} Updated saved request record
 */
async function updateSavedRequest(id, payload = {}) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('Saved request ID must be a positive integer', 400, 'INVALID_REQUEST_ID', null, 'id');
  }

  const {
    name,
    method,
    url,
    collection_id,
    collectionId,
    headers,
    params,
    body,
    body_type,
    bodyType,
    auth_type,
    authType,
    auth
  } = payload;

  // 1. Validate request name
  if (name === undefined || name === null || typeof name !== 'string') {
    throw new AppError('Request name is required and must be a string', 400, 'VALIDATION_ERROR', null, 'name');
  }
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new AppError('Request name cannot be empty', 400, 'VALIDATION_ERROR', null, 'name');
  }
  if (trimmedName.length > 255) {
    throw new AppError('Request name cannot exceed 255 characters', 400, 'VALIDATION_ERROR', null, 'name');
  }

  // 2. Validate HTTP method
  if (!method || typeof method !== 'string') {
    throw new AppError('HTTP method is required', 400, 'VALIDATION_ERROR', null, 'method');
  }
  const normalizedMethod = method.trim().toUpperCase();
  if (!ALLOWED_HTTP_METHODS.includes(normalizedMethod)) {
    throw new AppError(
      `Unsupported HTTP method '${method}'. Permitted methods: ${ALLOWED_HTTP_METHODS.join(', ')}`,
      400,
      'UNSUPPORTED_METHOD',
      null,
      'method'
    );
  }

  // 3. Validate URL format and protocol
  if (!url || typeof url !== 'string') {
    throw new AppError('URL is required and must be a string', 400, 'VALIDATION_ERROR', null, 'url');
  }
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    throw new AppError('URL cannot be empty', 400, 'VALIDATION_ERROR', null, 'url');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    throw new AppError(`Invalid URL format: '${trimmedUrl}'`, 400, 'INVALID_URL', null, 'url');
  }

  if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
    throw new AppError(
      `Unsupported protocol '${parsedUrl.protocol}'. Only 'http:' and 'https:' are permitted.`,
      400,
      'INVALID_PROTOCOL',
      null,
      'url'
    );
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new AppError('URLs with embedded credentials (username:password@...) are prohibited', 400, 'EMBEDDED_CREDENTIALS', null, 'url');
  }

  // 4. Verify that the saved request exists (throws 404 if missing)
  await getSavedRequestById(numericId);

  // 5. Validate collection ID and existence if provided
  const targetColId = collection_id !== undefined ? collection_id : collectionId;
  let safeCollectionId = null;

  if (targetColId !== undefined && targetColId !== null && targetColId !== '') {
    const numericColId = parseInt(targetColId, 10);
    if (Number.isNaN(numericColId) || numericColId <= 0) {
      throw new AppError('Collection ID must be a positive integer if provided', 400, 'INVALID_COLLECTION_ID', null, 'collection_id');
    }

    try {
      const [colRows] = await executeQuery('SELECT id FROM collections WHERE id = ?', [numericColId]);
      if (!colRows || colRows.length === 0) {
        throw new AppError(`Collection with ID ${numericColId} not found`, 404, 'COLLECTION_NOT_FOUND', null, 'collection_id');
      }
      safeCollectionId = numericColId;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
    }
  }

  // 6. Sanitize headers (strictly purge sensitive auth/tokens/passwords)
  const sanitizedHeaders = sanitizeSavedHeaders(headers);
  const jsonHeaders = sanitizedHeaders ? JSON.stringify(sanitizedHeaders) : null;

  // 7. Handle parameters
  let jsonParams = null;
  if (params !== undefined && params !== null) {
    if (Array.isArray(params) || typeof params === 'object') {
      jsonParams = JSON.stringify(params);
    }
  }

  // 8. Validate body type and body
  const rawBodyType = body_type || bodyType || 'none';
  const safeBodyType = VALID_BODY_TYPES.has(rawBodyType.toLowerCase()) ? rawBodyType.toLowerCase() : 'none';
  const safeBody = (safeBodyType !== 'none' && body !== undefined && body !== null) ? String(body) : null;

  // 9. Authentication protection: store ONLY safe auth scheme metadata, NEVER tokens or passwords
  const rawAuthType = auth_type || authType || (auth && typeof auth === 'object' ? auth.type : null) || 'none';
  const safeAuthType = VALID_AUTH_TYPES.has(String(rawAuthType).toLowerCase()) ? String(rawAuthType).toLowerCase() : 'none';

  // 10. Execute parameterized UPDATE
  try {
    const updateSql = `
      UPDATE saved_requests SET
        collection_id = ?,
        name = ?,
        method = ?,
        url = ?,
        headers = ?,
        params = ?,
        body = ?,
        body_type = ?,
        auth_type = ?
      WHERE id = ?
    `;

    await executeQuery(updateSql, [
      safeCollectionId,
      trimmedName,
      normalizedMethod,
      trimmedUrl,
      jsonHeaders,
      jsonParams,
      safeBody,
      safeBodyType,
      safeAuthType,
      numericId
    ]);

    const fetchSql = 'SELECT id, collection_id, name, method, url, headers, params, body, body_type, auth_type, created_at, updated_at FROM saved_requests WHERE id = ?';
    const [rows] = await executeQuery(fetchSql, [numericId]);

    return formatSavedRequest(rows[0]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Deletes a saved request by ID.
 *
 * @param {number|string} id - Saved request ID to delete
 * @returns {Promise<{ id: number, deleted: boolean }>} Deletion result
 */
async function deleteSavedRequest(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('Saved request ID must be a positive integer', 400, 'INVALID_REQUEST_ID', null, 'id');
  }

  // Verify that the saved request exists (throws 404 if missing)
  await getSavedRequestById(numericId);

  try {
    await executeQuery('DELETE FROM saved_requests WHERE id = ?', [numericId]);
    return { id: numericId, deleted: true };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

module.exports = {
  getSavedRequests,
  getSavedRequestById,
  createSavedRequest,
  updateSavedRequest,
  deleteSavedRequest,
  sanitizeSavedHeaders,
  formatSavedRequest
};

