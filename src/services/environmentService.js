/**
 * DevProbe — Environment Service
 * Day 12: Environment Management
 *
 * Provides business logic, encryption, and parameterized database operations for:
 * - Environments CRUD (Create, List, Read, Update, Delete)
 * - Atomic Environment Activation & Deactivation
 * - Key-Value Variables CRUD with Unique Key Constraints
 * - Secret Encryption & Decryption via AES-256-GCM (Zero plaintext at rest)
 * - Sensitive Value Masking and Preservation on Update
 */

const crypto = require('crypto');
const { getPool, executeQuery, sanitizeDatabaseError } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

// Variable key identifier regex pattern (letters, numbers, underscore, hyphen, period)
const VARIABLE_KEY_PATTERN = /^[a-zA-Z0-9_.-]+$/;

// Standard mask representation for secret values
const MASK_PLACEHOLDER = '••••••••';

/**
 * Validates and retrieves the 32-byte AES-256-GCM encryption key from environment.
 * Fails safely with an AppError if missing or invalid length.
 *
 * @returns {Buffer} 32-byte encryption key buffer
 */
function getEncryptionKey() {
  const rawKey = process.env.DEVPROBE_ENCRYPTION_KEY;

  if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
    throw new AppError(
      'Environment encryption key is not configured (DEVPROBE_ENCRYPTION_KEY missing).',
      500,
      'ENCRYPTION_CONFIG_ERROR'
    );
  }

  const trimmed = rawKey.trim();

  // If 64 hex characters, parse as 32-byte hex buffer
  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // If exactly 32 UTF-8 bytes
  const buf = Buffer.from(trimmed, 'utf8');
  if (buf.length === 32) {
    return buf;
  }

  throw new AppError(
    'Invalid encryption key length: DEVPROBE_ENCRYPTION_KEY must be exactly 32 bytes or 64 hex characters.',
    500,
    'INVALID_ENCRYPTION_KEY'
  );
}

/**
 * Encrypts a plaintext secret value using AES-256-GCM.
 * Output format: enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 *
 * @param {string} plaintext - Sensitive string to encrypt
 * @returns {string} Versioned ciphertext string
 */
function encryptSecret(plaintext) {
  if (plaintext === null || plaintext === undefined) {
    return null;
  }

  const str = String(plaintext);
  if (!str) return '';

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(str, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a ciphertext string encrypted with encryptSecret.
 *
 * @param {string} ciphertext - Encrypted string (enc:v1:...)
 * @returns {string} Decrypted plaintext string
 */
function decryptSecret(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') {
    return '';
  }

  // If not encrypted with our format, return as-is
  if (!ciphertext.startsWith('enc:v1:')) {
    return ciphertext;
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 5) {
    throw new AppError('Malformed encrypted secret format', 500, 'DECRYPTION_ERROR');
  }

  const [, , ivHex, authTagHex, encryptedHex] = parts;

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // Fail safely without exposing ciphertext, key, or internal stack trace
    throw new AppError('Failed to decrypt secret environment variable.', 500, 'DECRYPTION_ERROR');
  }
}

/**
 * Checks whether a given string is the standard mask placeholder.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isMaskedValue(value) {
  if (typeof value !== 'string') return false;
  return value.trim() === MASK_PLACEHOLDER || /^[•*]{4,}$/.test(value.trim());
}

/**
 * Masks a secret value for public or client consumption.
 *
 * @param {string} value
 * @returns {string} Masked string or empty string
 */
function maskSecretValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return MASK_PLACEHOLDER;
}

/**
 * Validates environment name string.
 *
 * @param {any} name
 * @returns {string} Sanitized name
 */
function validateEnvironmentName(name) {
  if (!name || typeof name !== 'string') {
    throw new AppError('Environment name is required and must be a string', 400, 'VALIDATION_ERROR', null, 'name');
  }

  const trimmed = name.trim();
  if (!trimmed) {
    throw new AppError('Environment name cannot be empty or whitespace only', 400, 'VALIDATION_ERROR', null, 'name');
  }

  if (trimmed.length > 255) {
    throw new AppError('Environment name cannot exceed 255 characters', 400, 'VALIDATION_ERROR', null, 'name');
  }

  return trimmed;
}

/**
 * Validates a variable key string.
 *
 * @param {any} key
 * @returns {string} Sanitized variable key
 */
function validateVariableKey(key) {
  if (!key || typeof key !== 'string') {
    throw new AppError('Variable key is required and must be a string', 400, 'VALIDATION_ERROR', null, 'key');
  }

  const trimmed = key.trim();
  if (!trimmed) {
    throw new AppError('Variable key cannot be empty or whitespace only', 400, 'VALIDATION_ERROR', null, 'key');
  }

  if (trimmed.length > 255) {
    throw new AppError('Variable key cannot exceed 255 characters', 400, 'VALIDATION_ERROR', null, 'key');
  }

  if (!VARIABLE_KEY_PATTERN.test(trimmed)) {
    throw new AppError(
      `Invalid variable key '${trimmed}'. Variable keys may only contain letters, numbers, underscores, hyphens, and periods.`,
      400,
      'INVALID_VARIABLE_KEY',
      null,
      'key'
    );
  }

  return trimmed;
}

/**
 * Retrieves all environments with variable counts and active indicator.
 *
 * @returns {Promise<Array<object>>} List of environments
 */
async function getAllEnvironments() {
  try {
    const sql = `
      SELECT 
        e.id, 
        e.name, 
        e.description, 
        e.is_active, 
        e.created_at, 
        e.updated_at,
        COUNT(v.id) AS variable_count
      FROM environments e
      LEFT JOIN environment_variables v ON e.id = v.environment_id
      GROUP BY e.id
      ORDER BY e.name ASC
    `;
    const [rows] = await executeQuery(sql, []);
    return rows.map(r => ({
      ...r,
      is_active: Boolean(r.is_active),
      variable_count: parseInt(r.variable_count, 10) || 0
    }));
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Retrieves a single environment by ID with all its variables.
 * Secrets are masked by default unless includeDecrypted is explicitly true (for internal execution).
 *
 * @param {number|string} id - Environment ID
 * @param {object} [options]
 * @param {boolean} [options.includeDecrypted=false] - Whether to decrypt secrets (internal use only)
 * @returns {Promise<object|null>} Environment with variables or null
 */
async function getEnvironmentById(id, { includeDecrypted = false } = {}) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('Environment ID must be a positive integer', 400, 'INVALID_ENVIRONMENT_ID', null, 'id');
  }

  try {
    const envSql = `
      SELECT id, name, description, is_active, created_at, updated_at 
      FROM environments 
      WHERE id = ?
    `;
    const [envRows] = await executeQuery(envSql, [numericId]);

    if (!envRows || envRows.length === 0) {
      return null;
    }

    const env = {
      ...envRows[0],
      is_active: Boolean(envRows[0].is_active)
    };

    const varSql = `
      SELECT 
        id, 
        environment_id, 
        var_key, 
        var_value, 
        is_secret, 
        is_enabled, 
        created_at, 
        updated_at
      FROM environment_variables
      WHERE environment_id = ?
      ORDER BY id ASC
    `;
    const [varRows] = await executeQuery(varSql, [numericId]);

    env.variables = varRows.map(v => {
      const isSecret = Boolean(v.is_secret);
      const isEnabled = Boolean(v.is_enabled);
      const rawVal = v.var_value !== null && v.var_value !== undefined ? String(v.var_value) : '';
      const hasValue = rawVal.length > 0;

      let value = rawVal;
      if (isSecret) {
        if (includeDecrypted) {
          value = decryptSecret(rawVal);
        } else {
          value = maskSecretValue(rawVal);
        }
      }

      return {
        id: v.id,
        environment_id: v.environment_id,
        key: v.var_key,
        value,
        is_secret: isSecret,
        is_enabled: isEnabled,
        has_value: hasValue,
        created_at: v.created_at,
        updated_at: v.updated_at
      };
    });

    return env;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Creates a new environment with optional initial variables.
 *
 * @param {object} payload
 * @param {string} payload.name
 * @param {string} [payload.description]
 * @param {Array<object>} [payload.variables]
 * @returns {Promise<object>} Created environment record
 */
async function createEnvironment(payload = {}) {
  const name = validateEnvironmentName(payload.name);
  const description = typeof payload.description === 'string' && payload.description.trim()
    ? payload.description.trim()
    : null;

  // Validate variables and check duplicate keys
  const rawVariables = Array.isArray(payload.variables) ? payload.variables : [];
  const validatedVars = [];
  const seenKeys = new Set();

  for (const v of rawVariables) {
    if (!v || typeof v !== 'object') continue;
    const key = validateVariableKey(v.key || v.var_key);
    const lowerKey = key.toLowerCase();
    if (seenKeys.has(lowerKey)) {
      throw new AppError(`Duplicate variable key '${key}' detected in environment.`, 400, 'DUPLICATE_VARIABLE_KEY', null, 'variables');
    }
    seenKeys.add(lowerKey);

    const isSecret = Boolean(v.is_secret);
    const isEnabled = v.is_enabled !== undefined ? Boolean(v.is_enabled) : true;
    const rawVal = v.value !== undefined && v.value !== null ? String(v.value) : '';

    let storedValue = rawVal;
    if (isSecret && rawVal) {
      storedValue = encryptSecret(rawVal);
    }

    validatedVars.push({
      key,
      value: storedValue,
      isSecret,
      isEnabled
    });
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const insertEnvSql = 'INSERT INTO environments (name, description, is_active) VALUES (?, ?, FALSE)';
    const [result] = await connection.execute(insertEnvSql, [name, description]);
    const environmentId = result.insertId;

    if (validatedVars.length > 0) {
      for (const item of validatedVars) {
        const insertVarSql = `
          INSERT INTO environment_variables (environment_id, var_key, var_value, is_secret, is_enabled)
          VALUES (?, ?, ?, ?, ?)
        `;
        await connection.execute(insertVarSql, [
          environmentId,
          item.key,
          item.value,
          item.isSecret ? 1 : 0,
          item.isEnabled ? 1 : 0
        ]);
      }
    }

    await connection.commit();

    // Return the newly created environment with masked secrets
    return await getEnvironmentById(environmentId);
  } catch (err) {
    await connection.rollback();
    if (err instanceof AppError) throw err;
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError('A variable with this key already exists in the environment.', 400, 'DUPLICATE_VARIABLE_KEY');
    }
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  } finally {
    connection.release();
  }
}

/**
 * Updates an environment's metadata and optionally synchronizes its variables.
 * Secret values that are submitted with mask characters are safely preserved.
 *
 * @param {number|string} id - Environment ID
 * @param {object} payload
 * @param {string} payload.name
 * @param {string} [payload.description]
 * @param {Array<object>} [payload.variables]
 * @returns {Promise<object>} Updated environment record
 */
async function updateEnvironment(id, payload = {}) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('Environment ID must be a positive integer', 400, 'INVALID_ENVIRONMENT_ID', null, 'id');
  }

  const name = validateEnvironmentName(payload.name);
  const description = typeof payload.description === 'string' && payload.description.trim()
    ? payload.description.trim()
    : null;

  // Verify existence
  const existing = await getEnvironmentById(numericId, { includeDecrypted: false });
  if (!existing) {
    throw new AppError(`Environment with ID ${numericId} not found`, 404, 'NOT_FOUND', null, 'id');
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updateEnvSql = 'UPDATE environments SET name = ?, description = ? WHERE id = ?';
    await connection.execute(updateEnvSql, [name, description, numericId]);

    // If variables array is provided, synchronize full variable list
    if (payload.variables !== undefined && Array.isArray(payload.variables)) {
      // Fetch current raw encrypted variables to preserve existing secrets if unchanged
      const [existingRawVars] = await connection.execute(
        'SELECT id, var_key, var_value, is_secret FROM environment_variables WHERE environment_id = ?',
        [numericId]
      );
      const existingMap = new Map();
      existingRawVars.forEach(v => {
        existingMap.set(v.var_key.toLowerCase(), v);
      });

      const seenKeys = new Set();
      const varsToInsert = [];

      for (const v of payload.variables) {
        if (!v || typeof v !== 'object') continue;
        const key = validateVariableKey(v.key || v.var_key);
        const lowerKey = key.toLowerCase();
        if (seenKeys.has(lowerKey)) {
          throw new AppError(`Duplicate variable key '${key}' detected in environment.`, 400, 'DUPLICATE_VARIABLE_KEY', null, 'variables');
        }
        seenKeys.add(lowerKey);

        const isSecret = Boolean(v.is_secret);
        const isEnabled = v.is_enabled !== undefined ? Boolean(v.is_enabled) : true;
        const inputVal = v.value !== undefined && v.value !== null ? String(v.value) : '';

        let storedValue = inputVal;

        if (isSecret) {
          // If submitted value is masked and variable existed previously with a value, preserve existing ciphertext
          if (isMaskedValue(inputVal) && existingMap.has(lowerKey)) {
            storedValue = existingMap.get(lowerKey).var_value;
          } else if (inputVal) {
            // New or changed secret: encrypt it
            storedValue = encryptSecret(inputVal);
          } else {
            storedValue = '';
          }
        }

        varsToInsert.push({
          key,
          value: storedValue,
          isSecret,
          isEnabled
        });
      }

      // Replace variables
      await connection.execute('DELETE FROM environment_variables WHERE environment_id = ?', [numericId]);

      for (const item of varsToInsert) {
        const insertSql = `
          INSERT INTO environment_variables (environment_id, var_key, var_value, is_secret, is_enabled)
          VALUES (?, ?, ?, ?, ?)
        `;
        await connection.execute(insertSql, [
          numericId,
          item.key,
          item.value,
          item.isSecret ? 1 : 0,
          item.isEnabled ? 1 : 0
        ]);
      }
    }

    await connection.commit();
    return await getEnvironmentById(numericId);
  } catch (err) {
    await connection.rollback();
    if (err instanceof AppError) throw err;
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError('A variable with this key already exists in the environment.', 400, 'DUPLICATE_VARIABLE_KEY');
    }
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  } finally {
    connection.release();
  }
}

/**
 * Deletes an environment by ID.
 * Cascades to environment_variables via foreign key ON DELETE CASCADE.
 *
 * @param {number|string} id - Environment ID
 * @returns {Promise<object>} Deletion confirmation
 */
async function deleteEnvironment(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('Environment ID must be a positive integer', 400, 'INVALID_ENVIRONMENT_ID', null, 'id');
  }

  const existing = await getEnvironmentById(numericId);
  if (!existing) {
    throw new AppError(`Environment with ID ${numericId} not found`, 404, 'NOT_FOUND', null, 'id');
  }

  try {
    const sql = 'DELETE FROM environments WHERE id = ?';
    await executeQuery(sql, [numericId]);
    return {
      id: numericId,
      name: existing.name,
      deleted: true
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Atomically activates a single environment, setting all others to inactive.
 *
 * @param {number|string} id - Environment ID to activate
 * @returns {Promise<object>} Activated environment record
 */
async function activateEnvironment(id) {
  const numericId = parseInt(id, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('Environment ID must be a positive integer', 400, 'INVALID_ENVIRONMENT_ID', null, 'id');
  }

  const existing = await getEnvironmentById(numericId);
  if (!existing) {
    throw new AppError(`Environment with ID ${numericId} not found`, 404, 'NOT_FOUND', null, 'id');
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Deactivate all environments
    await connection.execute('UPDATE environments SET is_active = FALSE');

    // Activate the targeted environment
    await connection.execute('UPDATE environments SET is_active = TRUE WHERE id = ?', [numericId]);

    await connection.commit();
    return await getEnvironmentById(numericId);
  } catch (err) {
    await connection.rollback();
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  } finally {
    connection.release();
  }
}

/**
 * Deactivates all environments ("No Environment" active).
 *
 * @returns {Promise<object>} Confirmation
 */
async function deactivateAllEnvironments() {
  try {
    const sql = 'UPDATE environments SET is_active = FALSE';
    await executeQuery(sql, []);
    return {
      success: true,
      activeEnvironmentId: null,
      message: 'All environments deactivated (No Environment selected)'
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Adds a single variable to an environment.
 *
 * @param {number|string} environmentId
 * @param {object} payload
 * @returns {Promise<object>} Created variable
 */
async function addVariable(environmentId, payload = {}) {
  const numericEnvId = parseInt(environmentId, 10);
  if (Number.isNaN(numericEnvId) || numericEnvId <= 0) {
    throw new AppError('Environment ID must be a positive integer', 400, 'INVALID_ENVIRONMENT_ID', null, 'environmentId');
  }

  const env = await getEnvironmentById(numericEnvId);
  if (!env) {
    throw new AppError(`Environment with ID ${numericEnvId} not found`, 404, 'NOT_FOUND', null, 'environmentId');
  }

  const key = validateVariableKey(payload.key || payload.var_key);
  const isSecret = Boolean(payload.is_secret);
  const isEnabled = payload.is_enabled !== undefined ? Boolean(payload.is_enabled) : true;
  const rawVal = payload.value !== undefined && payload.value !== null ? String(payload.value) : '';

  let storedValue = rawVal;
  if (isSecret && rawVal) {
    storedValue = encryptSecret(rawVal);
  }

  try {
    const sql = `
      INSERT INTO environment_variables (environment_id, var_key, var_value, is_secret, is_enabled)
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await executeQuery(sql, [
      numericEnvId,
      key,
      storedValue,
      isSecret ? 1 : 0,
      isEnabled ? 1 : 0
    ]);

    return {
      id: result.insertId,
      environment_id: numericEnvId,
      key,
      value: isSecret ? maskSecretValue(rawVal) : rawVal,
      is_secret: isSecret,
      is_enabled: isEnabled,
      has_value: Boolean(rawVal)
    };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(`Variable key '${key}' already exists in this environment.`, 400, 'DUPLICATE_VARIABLE_KEY', null, 'key');
    }
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Updates a single variable in an environment.
 *
 * @param {number|string} environmentId
 * @param {number|string} varId
 * @param {object} payload
 * @returns {Promise<object>} Updated variable
 */
async function updateVariable(environmentId, varId, payload = {}) {
  const numericEnvId = parseInt(environmentId, 10);
  const numericVarId = parseInt(varId, 10);

  if (Number.isNaN(numericEnvId) || numericEnvId <= 0) {
    throw new AppError('Environment ID must be a positive integer', 400, 'INVALID_ENVIRONMENT_ID', null, 'environmentId');
  }
  if (Number.isNaN(numericVarId) || numericVarId <= 0) {
    throw new AppError('Variable ID must be a positive integer', 400, 'INVALID_VARIABLE_ID', null, 'varId');
  }

  const [varRows] = await executeQuery(
    'SELECT id, environment_id, var_key, var_value, is_secret, is_enabled FROM environment_variables WHERE id = ? AND environment_id = ?',
    [numericVarId, numericEnvId]
  );

  if (!varRows || varRows.length === 0) {
    throw new AppError(`Variable with ID ${numericVarId} not found in environment ${numericEnvId}`, 404, 'NOT_FOUND', null, 'varId');
  }

  const existing = varRows[0];
  const key = payload.key !== undefined ? validateVariableKey(payload.key) : existing.var_key;
  const isSecret = payload.is_secret !== undefined ? Boolean(payload.is_secret) : Boolean(existing.is_secret);
  const isEnabled = payload.is_enabled !== undefined ? Boolean(payload.is_enabled) : Boolean(existing.is_enabled);

  let storedValue = existing.var_value;

  if (payload.value !== undefined) {
    const rawVal = payload.value !== null ? String(payload.value) : '';
    if (isSecret) {
      if (isMaskedValue(rawVal)) {
        // Retain existing encrypted value
        storedValue = existing.var_value;
      } else if (rawVal) {
        storedValue = encryptSecret(rawVal);
      } else {
        storedValue = '';
      }
    } else {
      storedValue = rawVal;
    }
  }

  try {
    const sql = `
      UPDATE environment_variables 
      SET var_key = ?, var_value = ?, is_secret = ?, is_enabled = ?
      WHERE id = ? AND environment_id = ?
    `;
    await executeQuery(sql, [
      key,
      storedValue,
      isSecret ? 1 : 0,
      isEnabled ? 1 : 0,
      numericVarId,
      numericEnvId
    ]);

    return {
      id: numericVarId,
      environment_id: numericEnvId,
      key,
      value: isSecret ? maskSecretValue(storedValue) : storedValue,
      is_secret: isSecret,
      is_enabled: isEnabled,
      has_value: Boolean(storedValue)
    };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(`Variable key '${key}' already exists in this environment.`, 400, 'DUPLICATE_VARIABLE_KEY', null, 'key');
    }
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Deletes a single variable from an environment.
 *
 * @param {number|string} environmentId
 * @param {number|string} varId
 * @returns {Promise<object>} Deletion confirmation
 */
async function deleteVariable(environmentId, varId) {
  const numericEnvId = parseInt(environmentId, 10);
  const numericVarId = parseInt(varId, 10);

  if (Number.isNaN(numericEnvId) || numericEnvId <= 0) {
    throw new AppError('Environment ID must be a positive integer', 400, 'INVALID_ENVIRONMENT_ID', null, 'environmentId');
  }
  if (Number.isNaN(numericVarId) || numericVarId <= 0) {
    throw new AppError('Variable ID must be a positive integer', 400, 'INVALID_VARIABLE_ID', null, 'varId');
  }

  const [varRows] = await executeQuery(
    'SELECT id, var_key FROM environment_variables WHERE id = ? AND environment_id = ?',
    [numericVarId, numericEnvId]
  );

  if (!varRows || varRows.length === 0) {
    throw new AppError(`Variable with ID ${numericVarId} not found in environment ${numericEnvId}`, 404, 'NOT_FOUND', null, 'varId');
  }

  try {
    await executeQuery('DELETE FROM environment_variables WHERE id = ? AND environment_id = ?', [numericVarId, numericEnvId]);
    return {
      id: numericVarId,
      environment_id: numericEnvId,
      deleted: true
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

/**
 * Retrieves the currently active environment along with its variables.
 * Used internally for request resolution (with secrets decrypted).
 *
 * @param {object} [options]
 * @param {boolean} [options.includeDecrypted=true]
 * @returns {Promise<object|null>} Active environment or null
 */
async function getActiveEnvironment({ includeDecrypted = true } = {}) {
  try {
    const [rows] = await executeQuery('SELECT id FROM environments WHERE is_active = TRUE LIMIT 1', []);
    if (!rows || rows.length === 0) {
      return null;
    }
    return await getEnvironmentById(rows[0].id, { includeDecrypted });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  }
}

module.exports = {
  getEncryptionKey,
  encryptSecret,
  decryptSecret,
  isMaskedValue,
  maskSecretValue,
  validateEnvironmentName,
  validateVariableKey,
  getAllEnvironments,
  getEnvironmentById,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  activateEnvironment,
  deactivateAllEnvironments,
  addVariable,
  updateVariable,
  deleteVariable,
  getActiveEnvironment
};
