/**
 * DevProbe — Collection Transfer Service (Import/Export)
 * Day 15: API Documentation Generator & Collection Import/Export
 *
 * Provides functions for exporting collections into standardized JSON (devprobe/v1),
 * strictly validating import payloads against schema constraints, security policies,
 * RFC 7230 header token specs, SemVer 1.x version format, and request limits,
 * and executing atomic database import transactions with automatic rollback.
 *
 * CREDENTIAL HANDLING POLICY & TAXONOMY:
 * 1. Reliably Identifiable Credentials:
 *    - URL Authority Credentials: Embedded user:pass@ in URLs (RFC 3986) are stripped.
 *    - Standard Sensitive Headers: Authorization, Cookie, Set-Cookie, X-Api-Key, etc.
 *      (defined in SENSITIVE_HEADERS) are stripped completely during export and import.
 *    - Host-Encrypted Ciphertexts: AES-256-GCM tokens with 'enc:v1:' signatures are
 *      host-specific secrets tied to local DEVPROBE_ENCRYPTION_KEY. They are redacted
 *      to '[REDACTED_SECRET]' in request bodies during export.
 *
 * 2. Arbitrary Application Data (Preserved Without Overly Broad Redaction):
 *    - Request Bodies: Legitimate API payloads often include field names like "password",
 *      "token", or "secret" (e.g. login schemas, OAuth grant requests) and template
 *      variables like "{{password}}" or "{{api_key}}". These are arbitrary application
 *      data, NOT leaked credentials. DevProbe preserves legitimate bodies without
 *      heuristic keyword redaction that would corrupt valid API request structures.
 *    - Assertion Expected Values: Assertions checking status codes, error messages
 *      (e.g. "Invalid password"), or JSON paths must not be corrupted by keyword redaction.
 *    - Collection Metadata: Human-readable documentation in collection names/descriptions
 *      is preserved intact. Internal database IDs (id, timestamps) are omitted.
 */

const { getPool, sanitizeDatabaseError } = require('../config/database');
const { ALLOWED_HTTP_METHODS, ALLOWED_PROTOCOLS, SENSITIVE_HEADERS, EXECUTION_LIMITS } = require('../config/security');
const { AppError } = require('../middleware/errorHandler');
const collectionService = require('./collectionService');
const savedRequestService = require('./savedRequestService');
const assertionService = require('./assertionService');

/**
 * Standard specification constants
 */
const SCHEMA_IDENTIFIER = 'devprobe/v1';
const SPEC_VERSION = '1.0.0';
const MAX_IMPORT_REQUESTS = 100;
const MAX_COLLECTION_NAME_LENGTH = 255;
const MAX_REQUEST_NAME_LENGTH = 255;
const MAX_URL_LENGTH = 2048;
const MAX_DESCRIPTION_LENGTH = 50000;
const MAX_HEADER_KEY_LENGTH = 255;
const MAX_HEADER_VALUE_LENGTH = 16384;
const MAX_PARAM_KEY_LENGTH = 255;
const MAX_PARAM_VALUE_LENGTH = 16384;

const VALID_BODY_TYPES = Object.freeze(new Set(['none', 'json', 'text']));
const VALID_AUTH_TYPES = Object.freeze(new Set(['none', 'bearer', 'basic']));

/**
 * SemVer 1.x format pattern per SemVer 2.0.0 specification:
 * - Major version MUST be 1
 * - Minor and Patch versions MUST be non-negative integers without leading zeros
 * - Optional pre-release identifiers (e.g. -alpha.1) and build metadata (e.g. +20261112)
 *
 * Rejects incomplete versions ('1', '1.2'), incompatible majors ('2.0.0'),
 * leading zeros in numeric components ('1.01.0'), and malformed strings.
 */
const SEMVER_1X_PATTERN = /^1\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * RFC 7230 valid token character pattern for HTTP header field names
 */
const RFC_7230_HEADER_PATTERN = /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/;

/**
 * Disallowed property names to prevent prototype pollution attacks
 */
const FORBIDDEN_PROPERTY_NAMES = Object.freeze(new Set([
  '__proto__',
  'constructor',
  'prototype'
]));

/**
 * Exports a collection and all its associated saved requests as a JSON bundle.
 * Strictly guarantees that sensitive credentials, authorization tokens, cookies,
 * and passwords are never exported, and internal database IDs are not exposed.
 *
 * @param {number|string} collectionId - ID of collection to export
 * @returns {Promise<object>} Standardized devprobe/v1 collection JSON bundle
 */
async function exportCollection(collectionId) {
  const numericId = parseInt(collectionId, 10);
  if (Number.isNaN(numericId) || numericId <= 0) {
    throw new AppError('Collection ID must be a positive integer', 400, 'INVALID_COLLECTION_ID', null, 'collectionId');
  }

  // 1. Fetch collection metadata
  const collection = await collectionService.getCollectionById(numericId);
  if (!collection) {
    throw new AppError(`Collection with ID ${numericId} not found`, 404, 'COLLECTION_NOT_FOUND', null, 'collectionId');
  }

  // 2. Fetch all child saved requests belonging to this collection
  const childRequests = await savedRequestService.getSavedRequests({ collectionId: numericId });

  // 3. Format and sanitize each request for export
  const exportedRequests = childRequests.map((req) => {
    // Sanitize headers strictly to guarantee no credential leakage in exported JSON
    const sanitizedHeaders = savedRequestService.sanitizeSavedHeaders(req.headers);

    // Strip client-internal row IDs from headers and format cleanly
    let cleanExportHeaders = [];
    if (Array.isArray(sanitizedHeaders)) {
      cleanExportHeaders = sanitizedHeaders.map((h) => ({
        key: String(h.key || '').trim(),
        value: typeof h.value === 'string' ? h.value : String(h.value ?? ''),
        description: h.description ? String(h.description) : '',
        enabled: h.enabled !== false
      }));
    } else if (sanitizedHeaders && typeof sanitizedHeaders === 'object') {
      cleanExportHeaders = Object.entries(sanitizedHeaders)
        .filter(([k]) => !FORBIDDEN_PROPERTY_NAMES.has(k.toLowerCase()))
        .map(([k, v]) => ({
          key: k,
          value: typeof v === 'string' ? v : String(v ?? ''),
          description: '',
          enabled: true
        }));
    }

    // Strip client-internal row IDs from parameters and format cleanly
    let cleanExportParams = [];
    if (Array.isArray(req.params)) {
      cleanExportParams = req.params
        .filter((p) => p && typeof p === 'object' && !FORBIDDEN_PROPERTY_NAMES.has(String(p.key || '').toLowerCase()))
        .map((p) => ({
          key: String(p.key || '').trim(),
          value: typeof p.value === 'string' ? p.value : String(p.value ?? ''),
          description: p.description ? String(p.description) : '',
          enabled: p.enabled !== false
        }));
    } else if (req.params && typeof req.params === 'object') {
      cleanExportParams = Object.entries(req.params)
        .filter(([k]) => !FORBIDDEN_PROPERTY_NAMES.has(k.toLowerCase()))
        .map(([k, v]) => ({
          key: k,
          value: typeof v === 'string' ? v : String(v ?? ''),
          description: '',
          enabled: true
        }));
    }

    // Sanitize body to avoid leaking local encrypted tokens (enc:v1:)
    let cleanExportBody = null;
    if (req.body !== null && req.body !== undefined) {
      let strBody = String(req.body);
      if (strBody.includes('enc:v1:')) {
        strBody = strBody.replace(/enc:v1:[a-f0-9:]+/gi, '[REDACTED_SECRET]');
      }
      cleanExportBody = strBody;
    }

    // Sanitize URL to ensure no embedded credentials ever leak
    let cleanExportUrl = req.url;
    try {
      const parsedUrl = new URL(req.url);
      if (parsedUrl.username || parsedUrl.password) {
        parsedUrl.username = '';
        parsedUrl.password = '';
        cleanExportUrl = parsedUrl.toString();
      }
    } catch {
      // Keep existing URL if parse fails
    }

    return {
      name: req.name,
      description: req.description || null,
      method: req.method,
      url: cleanExportUrl,
      headers: cleanExportHeaders,
      params: cleanExportParams,
      body: cleanExportBody,
      body_type: req.body_type || 'none',
      auth_type: req.auth_type || 'none',
      assertions: Array.isArray(req.assertions) ? req.assertions : []
    };
  });

  return {
    version: SPEC_VERSION,
    schema: SCHEMA_IDENTIFIER,
    exported_at: new Date().toISOString(),
    collection: {
      name: collection.name,
      description: collection.description || null,
      requests: exportedRequests
    }
  };
}

/**
 * Validates and normalizes an imported collection payload against structural,
 * schema, type, and security requirements.
 *
 * @param {object} payload - Incoming import payload
 * @returns {object} Normalized collection and validated requests structure
 */
function validateImportPayload(payload) {
  // 1. Verify root payload integrity
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('Import payload must be a non-null JSON object', 400, 'INVALID_PAYLOAD');
  }

  // 2. Schema check (strictly validate devprobe/v1)
  if (payload.schema !== undefined && payload.schema !== null) {
    if (typeof payload.schema !== 'string' || payload.schema.trim().toLowerCase() !== SCHEMA_IDENTIFIER) {
      throw new AppError(
        `Unsupported collection schema '${payload.schema}'. Expected '${SCHEMA_IDENTIFIER}'.`,
        400,
        'UNSUPPORTED_SCHEMA',
        null,
        'schema'
      );
    }
  }

  // 3. Version check (strictly validate SemVer 1.x format)
  if (payload.version !== undefined && payload.version !== null) {
    if (typeof payload.version !== 'string' || !SEMVER_1X_PATTERN.test(payload.version.trim())) {
      throw new AppError(
        `Unsupported collection version '${payload.version}'. Expected SemVer 1.x format (e.g. '${SPEC_VERSION}').`,
        400,
        'UNSUPPORTED_VERSION',
        null,
        'version'
      );
    }
  }

  // 4. Validate collection container
  const collectionData = payload.collection;
  if (!collectionData || typeof collectionData !== 'object' || Array.isArray(collectionData)) {
    throw new AppError(
      'Import payload must contain a valid \'collection\' object',
      400,
      'INVALID_COLLECTION_DATA',
      null,
      'collection'
    );
  }

  // 5. Validate collection name
  if (collectionData.name === undefined || collectionData.name === null || typeof collectionData.name !== 'string') {
    throw new AppError('Collection name is required and must be a string', 400, 'VALIDATION_ERROR', null, 'collection.name');
  }
  const trimmedColName = collectionData.name.trim();
  if (trimmedColName.length === 0) {
    throw new AppError('Collection name cannot be empty', 400, 'VALIDATION_ERROR', null, 'collection.name');
  }
  if (trimmedColName.length > MAX_COLLECTION_NAME_LENGTH) {
    throw new AppError(`Collection name cannot exceed ${MAX_COLLECTION_NAME_LENGTH} characters`, 400, 'VALIDATION_ERROR', null, 'collection.name');
  }

  // 6. Validate collection description
  let safeColDescription = null;
  if (collectionData.description !== undefined && collectionData.description !== null) {
    if (typeof collectionData.description !== 'string') {
      throw new AppError('Collection description must be a string if provided', 400, 'VALIDATION_ERROR', null, 'collection.description');
    }
    const trimmedColDesc = collectionData.description.trim();
    if (trimmedColDesc.length > MAX_DESCRIPTION_LENGTH) {
      throw new AppError(`Collection description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`, 400, 'VALIDATION_ERROR', null, 'collection.description');
    }
    safeColDescription = trimmedColDesc.length > 0 ? trimmedColDesc : null;
  }

  // 7. Validate requests array
  const rawRequests = collectionData.requests;
  if (rawRequests !== undefined && rawRequests !== null && !Array.isArray(rawRequests)) {
    throw new AppError('Field \'requests\' must be an array of request objects', 400, 'VALIDATION_ERROR', null, 'collection.requests');
  }

  const requestsList = Array.isArray(rawRequests) ? rawRequests : [];
  if (requestsList.length > MAX_IMPORT_REQUESTS) {
    throw new AppError(
      `Collection exceeds maximum limit of ${MAX_IMPORT_REQUESTS} requests (received ${requestsList.length})`,
      400,
      'LIMIT_EXCEEDED',
      null,
      'collection.requests'
    );
  }

  // 8. Validate and sanitize each request in the batch
  const validatedRequests = [];

  for (let i = 0; i < requestsList.length; i++) {
    const reqItem = requestsList[i];
    if (!reqItem || typeof reqItem !== 'object' || Array.isArray(reqItem)) {
      throw new AppError(`Request at index ${i} must be a valid JSON object`, 400, 'VALIDATION_ERROR', null, `requests[${i}]`);
    }

    // Name
    if (reqItem.name === undefined || reqItem.name === null || typeof reqItem.name !== 'string') {
      throw new AppError(`Request at index ${i} requires a valid 'name' string`, 400, 'VALIDATION_ERROR', null, `requests[${i}].name`);
    }
    const reqName = reqItem.name.trim();
    if (reqName.length === 0) {
      throw new AppError(`Request name at index ${i} cannot be empty`, 400, 'VALIDATION_ERROR', null, `requests[${i}].name`);
    }
    if (reqName.length > MAX_REQUEST_NAME_LENGTH) {
      throw new AppError(`Request name at index ${i} cannot exceed ${MAX_REQUEST_NAME_LENGTH} characters`, 400, 'VALIDATION_ERROR', null, `requests[${i}].name`);
    }

    // Description
    let reqDescription = null;
    if (reqItem.description !== undefined && reqItem.description !== null) {
      if (typeof reqItem.description !== 'string') {
        throw new AppError(`Request description at index ${i} must be a string if provided`, 400, 'VALIDATION_ERROR', null, `requests[${i}].description`);
      }
      const trimmedDesc = reqItem.description.trim();
      if (trimmedDesc.length > MAX_DESCRIPTION_LENGTH) {
        throw new AppError(`Request description at index ${i} cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`, 400, 'VALIDATION_ERROR', null, `requests[${i}].description`);
      }
      reqDescription = trimmedDesc.length > 0 ? trimmedDesc : null;
    }

    // Method
    if (!reqItem.method || typeof reqItem.method !== 'string') {
      throw new AppError(`Request at index ${i} requires an HTTP 'method'`, 400, 'VALIDATION_ERROR', null, `requests[${i}].method`);
    }
    const normMethod = reqItem.method.trim().toUpperCase();
    if (!ALLOWED_HTTP_METHODS.includes(normMethod)) {
      throw new AppError(
        `Unsupported HTTP method '${reqItem.method}' at request index ${i}. Permitted methods: ${ALLOWED_HTTP_METHODS.join(', ')}`,
        400,
        'UNSUPPORTED_METHOD',
        null,
        `requests[${i}].method`
      );
    }

    // URL & Protocol
    if (!reqItem.url || typeof reqItem.url !== 'string') {
      throw new AppError(`Request at index ${i} requires a 'url'`, 400, 'VALIDATION_ERROR', null, `requests[${i}].url`);
    }
    const trimmedUrl = reqItem.url.trim();
    if (trimmedUrl.length === 0) {
      throw new AppError(`URL at request index ${i} cannot be empty`, 400, 'VALIDATION_ERROR', null, `requests[${i}].url`);
    }
    if (trimmedUrl.length > MAX_URL_LENGTH) {
      throw new AppError(`URL at request index ${i} cannot exceed ${MAX_URL_LENGTH} characters`, 400, 'INVALID_URL', null, `requests[${i}].url`);
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      throw new AppError(`Invalid URL format '${trimmedUrl}' at request index ${i}`, 400, 'INVALID_URL', null, `requests[${i}].url`);
    }

    if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
      throw new AppError(
        `Unsupported protocol '${parsedUrl.protocol}' at request index ${i}. Only 'http:' and 'https:' are permitted.`,
        400,
        'INVALID_PROTOCOL',
        null,
        `requests[${i}].url`
      );
    }

    if (parsedUrl.username || parsedUrl.password) {
      throw new AppError(
        `URLs with embedded credentials (user:pass@...) are prohibited at request index ${i}`,
        400,
        'EMBEDDED_CREDENTIALS',
        null,
        `requests[${i}].url`
      );
    }

    // Headers Validation & Sanitization
    let validatedHeaders = [];
    if (reqItem.headers !== undefined && reqItem.headers !== null) {
      if (typeof reqItem.headers !== 'object') {
        throw new AppError(`Field 'headers' at request index ${i} must be an array or key-value object`, 400, 'VALIDATION_ERROR', null, `requests[${i}].headers`);
      }

      let rawHeadersList = [];
      if (Array.isArray(reqItem.headers)) {
        rawHeadersList = reqItem.headers;
      } else {
        // Convert object to array
        for (const [k, v] of Object.entries(reqItem.headers)) {
          if (!FORBIDDEN_PROPERTY_NAMES.has(k.toLowerCase())) {
            rawHeadersList.push({ key: k, value: v, description: '', enabled: true });
          }
        }
      }

      const seenHeaderNames = new Set();
      for (const h of rawHeadersList) {
        if (!h || typeof h !== 'object') continue;
        const rawKey = String(h.key || '').trim();
        if (!rawKey) continue;

        // Disallow prototype pollution keys
        if (FORBIDDEN_PROPERTY_NAMES.has(rawKey.toLowerCase())) {
          throw new AppError(
            `Forbidden prototype pollution key '${rawKey}' in headers at request index ${i}`,
            400,
            'FORBIDDEN_PROPERTY',
            null,
            `requests[${i}].headers`
          );
        }

        // Validate header name according to RFC 7230 token specification
        if (!RFC_7230_HEADER_PATTERN.test(rawKey)) {
          throw new AppError(
            `Invalid HTTP header name '${rawKey}' at request index ${i}. Header names must follow RFC 7230 token specifications.`,
            400,
            'INVALID_HEADER_NAME',
            null,
            `requests[${i}].headers`
          );
        }

        if (rawKey.length > MAX_HEADER_KEY_LENGTH) {
          throw new AppError(
            `Header name '${rawKey}' at request index ${i} exceeds limit of ${MAX_HEADER_KEY_LENGTH} characters`,
            400,
            'VALIDATION_ERROR',
            null,
            `requests[${i}].headers`
          );
        }

        const lowerKey = rawKey.toLowerCase();
        // Check for case-insensitive duplicate headers within the request
        if (seenHeaderNames.has(lowerKey)) {
          throw new AppError(
            `Duplicate header '${rawKey}' detected at request index ${i}. Header names must be unique.`,
            400,
            'DUPLICATE_HEADER',
            null,
            `requests[${i}].headers`
          );
        }
        seenHeaderNames.add(lowerKey);

        // Sanitize out sensitive authorization/cookie/token headers
        if (SENSITIVE_HEADERS.has(lowerKey)) {
          continue;
        }

        const strVal = typeof h.value === 'string' ? h.value : String(h.value ?? '');
        if (strVal.length > MAX_HEADER_VALUE_LENGTH) {
          throw new AppError(
            `Header value for '${rawKey}' at request index ${i} exceeds limit of ${MAX_HEADER_VALUE_LENGTH} characters`,
            400,
            'VALIDATION_ERROR',
            null,
            `requests[${i}].headers`
          );
        }

        validatedHeaders.push({
          key: rawKey,
          value: strVal,
          description: h.description ? String(h.description) : '',
          enabled: h.enabled !== false
        });
      }
    }

    // Parameters Validation & Sanitization
    let validatedParams = [];
    if (reqItem.params !== undefined && reqItem.params !== null) {
      if (typeof reqItem.params !== 'object') {
        throw new AppError(`Field 'params' at request index ${i} must be an array or key-value object`, 400, 'VALIDATION_ERROR', null, `requests[${i}].params`);
      }

      let rawParamsList = [];
      if (Array.isArray(reqItem.params)) {
        rawParamsList = reqItem.params;
      } else {
        for (const [k, v] of Object.entries(reqItem.params)) {
          if (!FORBIDDEN_PROPERTY_NAMES.has(k.toLowerCase())) {
            rawParamsList.push({ key: k, value: v, description: '', enabled: true });
          }
        }
      }

      for (const p of rawParamsList) {
        if (!p || typeof p !== 'object') continue;
        const rawKey = String(p.key || '').trim();
        if (rawKey && FORBIDDEN_PROPERTY_NAMES.has(rawKey.toLowerCase())) {
          throw new AppError(
            `Forbidden prototype pollution key '${rawKey}' in parameters at request index ${i}`,
            400,
            'FORBIDDEN_PROPERTY',
            null,
            `requests[${i}].params`
          );
        }

        if (rawKey.length > MAX_PARAM_KEY_LENGTH) {
          throw new AppError(
            `Parameter key at request index ${i} exceeds limit of ${MAX_PARAM_KEY_LENGTH} characters`,
            400,
            'VALIDATION_ERROR',
            null,
            `requests[${i}].params`
          );
        }

        const strVal = typeof p.value === 'string' ? p.value : String(p.value ?? '');
        if (strVal.length > MAX_PARAM_VALUE_LENGTH) {
          throw new AppError(
            `Parameter value at request index ${i} exceeds limit of ${MAX_PARAM_VALUE_LENGTH} characters`,
            400,
            'VALIDATION_ERROR',
            null,
            `requests[${i}].params`
          );
        }

        validatedParams.push({
          key: rawKey,
          value: strVal,
          description: p.description ? String(p.description) : '',
          enabled: p.enabled !== false
        });
      }
    }

    // Body Type Validation
    let safeBodyType = 'none';
    if (reqItem.body_type !== undefined && reqItem.body_type !== null) {
      if (typeof reqItem.body_type !== 'string') {
        throw new AppError(`Field 'body_type' at request index ${i} must be a string`, 400, 'VALIDATION_ERROR', null, `requests[${i}].body_type`);
      }
      const rawBodyType = reqItem.body_type.trim().toLowerCase();
      if (rawBodyType.length > 0) {
        if (!VALID_BODY_TYPES.has(rawBodyType)) {
          throw new AppError(
            `Unsupported body_type '${reqItem.body_type}' at request index ${i}. Permitted types: ${Array.from(VALID_BODY_TYPES).join(', ')}`,
            400,
            'VALIDATION_ERROR',
            null,
            `requests[${i}].body_type`
          );
        }
        safeBodyType = rawBodyType;
      }
    }

    // Body Payload Validation
    let safeBody = null;
    if (safeBodyType !== 'none' && reqItem.body !== undefined && reqItem.body !== null) {
      let bodyText;
      if (typeof reqItem.body === 'object') {
        try {
          bodyText = JSON.stringify(reqItem.body, null, 2);
        } catch {
          throw new AppError(`Malformed body payload at request index ${i}`, 400, 'VALIDATION_ERROR', null, `requests[${i}].body`);
        }
      } else {
        bodyText = String(reqItem.body);
      }

      if (Buffer.byteLength(bodyText, 'utf8') > EXECUTION_LIMITS.MAX_REQUEST_BODY_SIZE_BYTES) {
        throw new AppError(
          `Request body at request index ${i} exceeds maximum limit of 1 MB`,
          400,
          'PAYLOAD_TOO_LARGE',
          null,
          `requests[${i}].body`
        );
      }

      safeBody = bodyText;
    }

    // Auth Type Validation
    let safeAuthType = 'none';
    if (reqItem.auth_type !== undefined && reqItem.auth_type !== null) {
      if (typeof reqItem.auth_type !== 'string') {
        throw new AppError(`Field 'auth_type' at request index ${i} must be a string`, 400, 'VALIDATION_ERROR', null, `requests[${i}].auth_type`);
      }
      const rawAuthType = reqItem.auth_type.trim().toLowerCase();
      if (rawAuthType.length > 0) {
        if (!VALID_AUTH_TYPES.has(rawAuthType)) {
          throw new AppError(
            `Unsupported auth_type '${reqItem.auth_type}' at request index ${i}. Permitted types: ${Array.from(VALID_AUTH_TYPES).join(', ')}`,
            400,
            'VALIDATION_ERROR',
            null,
            `requests[${i}].auth_type`
          );
        }
        safeAuthType = rawAuthType;
      }
    }

    // Assertions validation (strictly validated by assertionService)
    const sanitizedAssertions = assertionService.validateAssertions(reqItem.assertions);

    validatedRequests.push({
      name: reqName,
      description: reqDescription,
      method: normMethod,
      url: trimmedUrl,
      headers: validatedHeaders,
      params: validatedParams,
      body: safeBody,
      body_type: safeBodyType,
      auth_type: safeAuthType,
      assertions: sanitizedAssertions
    });
  }

  return {
    collection: {
      name: trimmedColName,
      description: safeColDescription
    },
    requests: validatedRequests
  };
}

/**
 * Imports a collection and all contained requests in a single, atomic MySQL transaction.
 * If any request fails insertion, the entire transaction is rolled back, preventing
 * orphan collections or partial imports.
 *
 * @param {object} payload - Collection import payload
 * @returns {Promise<object>} Created collection record with child requests count
 */
async function importCollection(payload) {
  // 1. Validate payload structure and security constraints
  const validated = validateImportPayload(payload);

  // 2. Acquire a dedicated MySQL connection from the pool
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    // 3. Begin atomic transaction
    await conn.beginTransaction();

    // 4. Insert collection row
    const insertColSql = 'INSERT INTO collections (name, description) VALUES (?, ?)';
    const [colResult] = await conn.execute(insertColSql, [
      validated.collection.name,
      validated.collection.description
    ]);
    const collectionId = colResult.insertId;

    // 5. Insert each validated request linked to the new collection
    const insertedRequests = [];
    const insertReqSql = `
      INSERT INTO saved_requests (
        collection_id, name, description, method, url, headers, params, body, body_type, auth_type, assertions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const req of validated.requests) {
      const jsonHeaders = req.headers && req.headers.length > 0 ? JSON.stringify(req.headers) : null;
      const jsonParams = req.params && req.params.length > 0 ? JSON.stringify(req.params) : null;
      const jsonAssertions = req.assertions && req.assertions.length > 0
        ? JSON.stringify(req.assertions)
        : null;

      const [reqResult] = await conn.execute(insertReqSql, [
        collectionId,
        req.name,
        req.description,
        req.method,
        req.url,
        jsonHeaders,
        jsonParams,
        req.body,
        req.body_type,
        req.auth_type,
        jsonAssertions
      ]);

      insertedRequests.push({
        id: reqResult.insertId,
        collection_id: collectionId,
        name: req.name,
        description: req.description,
        method: req.method,
        url: req.url,
        headers: req.headers,
        params: req.params,
        body: req.body,
        body_type: req.body_type,
        auth_type: req.auth_type,
        assertions: req.assertions
      });
    }

    // 6. Commit transaction if all operations succeed
    await conn.commit();

    return {
      id: collectionId,
      name: validated.collection.name,
      description: validated.collection.description,
      requests_count: insertedRequests.length,
      requests: insertedRequests
    };
  } catch (err) {
    // Roll back all changes on any error to ensure all-or-nothing atomicity
    try {
      await conn.rollback();
    } catch {
      // Ignore rollback errors during failure handling
    }

    if (err instanceof AppError) throw err;
    throw new AppError(sanitizeDatabaseError(err), 500, 'DATABASE_ERROR');
  } finally {
    conn.release();
  }
}

module.exports = {
  SCHEMA_IDENTIFIER,
  SPEC_VERSION,
  SEMVER_1X_PATTERN,
  MAX_IMPORT_REQUESTS,
  exportCollection,
  validateImportPayload,
  importCollection
};
