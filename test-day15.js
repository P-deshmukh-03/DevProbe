/**
 * DevProbe Day 15 Verification Test Suite
 * Step 1: Database Migration & Request Description Support
 *
 * Covers:
 * - Database schema declaration in `database/schema.sql`
 * - Database migration in `database/init.js` and column verification
 * - Migration idempotency across multiple runs
 * - Backend service (`savedRequestService.js`) description persistence and retrieval
 * - Validation of description types (strings allowed, non-strings rejected with 400)
 * - Empty and whitespace descriptions trimmed to null
 * - Updating and clearing descriptions (null, empty string, omission preservation)
 * - HTTP API endpoints (`POST /api/requests/saved`, `GET /api/requests/saved/:id`, `PUT /api/requests/saved/:id`)
 * - Backward compatibility with saved requests lacking descriptions
 * - Frontend template conversion and state management (`convertSavedRequestToTemplate`, `loadRequestIntoState`)
 * - Frontend HTML modal inputs for description (`#input-save-desc`, `#input-edit-req-desc`)
 * - Graceful teardown, test data deletion, and connection pool cleanup
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const mysql = require('mysql2/promise');
const app = require('./src/app');
const { getDatabaseConfig, executeQuery, closePool, testConnection } = require('./src/config/database');
const { initializeDatabase, applyMigrations } = require('./database/init');
const savedRequestService = require('./src/services/savedRequestService');
const collectionService = require('./src/services/collectionService');
const collectionTransferService = require('./src/services/collectionTransferService');
const {
  SCHEMA_IDENTIFIER,
  SPEC_VERSION,
  SEMVER_1X_PATTERN,
  MAX_IMPORT_REQUESTS,
  exportCollection,
  validateImportPayload,
  importCollection
} = collectionTransferService;
const documentationService = require('./src/services/documentationService');
const {
  escapeHtml,
  slugify,
  shellEscape,
  buildEffectiveUrl,
  generateCurlSnippet,
  getLatestSampleResponse,
  getSampleResponsesForRequests,
  generateCollectionMarkdown,
  generateCollectionHtml
} = documentationService;
const {
  activeRequest,
  loadRequestIntoState,
  convertSavedRequestToTemplate
} = require('./public/js/app');
const { AppError } = require('./src/middleware/errorHandler');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${details ? ` - ${details}` : ''}`);
    process.exitCode = 1;
  }
}

/**
 * Reusable HTTP request helper for testing Express API endpoints.
 */
function makeRequest(server, { method = 'GET', path: reqPath = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const serializedBody = body !== null && typeof body === 'object' ? JSON.stringify(body) : body;

    const reqHeaders = { ...headers };
    if (serializedBody && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (serializedBody && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
        headers: reqHeaders
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = rawData ? JSON.parse(rawData) : null;
          } catch {
            // Keep raw data if not JSON
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: json,
            rawText: rawData
          });
        });
      }
    );

    req.on('error', (err) => reject(err));

    if (serializedBody) {
      req.write(serializedBody);
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n============================================================');
  console.log('  DevProbe Day 15 — Step 1 Verification Test Suite');
  console.log('  Database Migration & Request Description Support');
  console.log('============================================================\n');

  let server = null;
  const createdSavedRequestIds = [];
  const createdCollectionIds = [];
  const createdHistoryIds = [];

  try {
    // -------------------------------------------------------------
    // Section 1: Schema File & Database Column Verification
    // -------------------------------------------------------------
    console.log('[SECTION 1] Schema File & Database Migration Verification');

    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    assert(fs.existsSync(schemaPath), 'database/schema.sql file exists');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    assert(
      schemaContent.includes('`description` TEXT NULL') || schemaContent.includes('description TEXT NULL'),
      'schema.sql declares `description` column in saved_requests table'
    );

    // Verify DB connectivity
    const dbHealth = await testConnection();
    assert(dbHealth.isConnected, 'Database connection is established and healthy');

    // Verify column exists in active MySQL table
    const dbConfig = getDatabaseConfig();
    const [colCheck] = await executeQuery(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'saved_requests' AND COLUMN_NAME = 'description'`,
      [dbConfig.database]
    );

    assert(
      colCheck.length === 1 && colCheck[0].COLUMN_NAME === 'description',
      'Column `saved_requests.description` physically exists in database'
    );
    assert(
      colCheck[0].IS_NULLABLE === 'YES',
      'Column `saved_requests.description` is nullable for backward compatibility'
    );

    // Verify migration idempotency
    const pool = require('./src/config/database').getPool();
    const conn = await pool.getConnection();
    try {
      await applyMigrations(conn, dbConfig.database);
      assert(true, 'applyMigrations runs idempotently without error when description column already exists');
    } finally {
      conn.release();
    }

    // -------------------------------------------------------------
    // Section 2: Backend Service (savedRequestService) Logic
    // -------------------------------------------------------------
    console.log('\n[SECTION 2] Backend Service Description Validation & Persistence');

    // 2.1 Create a test collection
    const testCol = await collectionService.createCollection({
      name: 'Day 15 Step 1 Test Collection',
      description: 'Collection created for testing request descriptions'
    });
    createdCollectionIds.push(testCol.id);
    assert(testCol && testCol.id, 'Test collection created successfully');

    // 2.2 Create request WITH description
    const reqWithDesc = await savedRequestService.createSavedRequest({
      name: 'Get User with Description',
      description: 'Fetches user details by primary ID from sample API',
      collection_id: testCol.id,
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/users/1'
    });
    createdSavedRequestIds.push(reqWithDesc.id);

    assert(
      reqWithDesc.description === 'Fetches user details by primary ID from sample API',
      'createSavedRequest persists non-empty description'
    );

    // 2.3 Create request WITHOUT description (omitted)
    const reqWithoutDesc = await savedRequestService.createSavedRequest({
      name: 'Get User without Description',
      collection_id: testCol.id,
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/users/2'
    });
    createdSavedRequestIds.push(reqWithoutDesc.id);

    assert(
      reqWithoutDesc.description === null,
      'createSavedRequest defaults omitted description to null'
    );

    // 2.4 Create request with empty/whitespace description
    const reqEmptyDesc = await savedRequestService.createSavedRequest({
      name: 'Get User with Empty Description',
      description: '   \n  \t  ',
      collection_id: testCol.id,
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/users/3'
    });
    createdSavedRequestIds.push(reqEmptyDesc.id);

    assert(
      reqEmptyDesc.description === null,
      'createSavedRequest trims whitespace-only description to null'
    );

    // 2.5 Rejection of non-string description on create
    let nonStringCreateError = null;
    try {
      await savedRequestService.createSavedRequest({
        name: 'Invalid Desc Request',
        description: 12345, // invalid type
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/users/4'
      });
    } catch (err) {
      nonStringCreateError = err;
    }
    assert(
      nonStringCreateError instanceof AppError && nonStringCreateError.statusCode === 400,
      'createSavedRequest rejects non-string description with 400 AppError'
    );

    // 2.6 Retrieval via getSavedRequestById
    const fetchedReq = await savedRequestService.getSavedRequestById(reqWithDesc.id);
    assert(
      fetchedReq.description === 'Fetches user details by primary ID from sample API',
      'getSavedRequestById accurately returns description'
    );

    // 2.7 Retrieval via getSavedRequests list
    const listReqs = await savedRequestService.getSavedRequests({ collectionId: testCol.id });
    const foundInList = listReqs.find((r) => r.id === reqWithDesc.id);
    assert(
      foundInList && foundInList.description === 'Fetches user details by primary ID from sample API',
      'getSavedRequests includes description in list output'
    );

    // 2.8 Update description to new text
    const updatedWithNewDesc = await savedRequestService.updateSavedRequest(reqWithDesc.id, {
      name: 'Get User with Description (Updated)',
      description: 'Updated API documentation description for this endpoint',
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/users/1'
    });
    assert(
      updatedWithNewDesc.description === 'Updated API documentation description for this endpoint',
      'updateSavedRequest updates description to new string'
    );

    // 2.9 Clear description by setting null
    const clearedDescNull = await savedRequestService.updateSavedRequest(reqWithDesc.id, {
      name: 'Get User with Description (Cleared)',
      description: null,
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/users/1'
    });
    assert(
      clearedDescNull.description === null,
      'updateSavedRequest clears description when set to null'
    );

    // 2.10 Clear description by setting empty string
    const reAddDesc = await savedRequestService.updateSavedRequest(reqWithDesc.id, {
      name: 'Get User re-add desc',
      description: 'Temporary description to be cleared by empty string',
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/users/1'
    });
    assert(reAddDesc.description !== null, 'Temporary description re-added successfully');

    const clearedDescEmpty = await savedRequestService.updateSavedRequest(reqWithDesc.id, {
      name: 'Get User with Description (Cleared Empty)',
      description: '   ',
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/users/1'
    });
    assert(
      clearedDescEmpty.description === null,
      'updateSavedRequest clears description when passed whitespace string'
    );

    // 2.11 Preserve existing description when description field is omitted (undefined)
    await savedRequestService.updateSavedRequest(reqWithDesc.id, {
      name: 'Get User with Restored Description',
      description: 'Description that must be preserved across partial updates',
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/users/1'
    });

    const preservedUpdate = await savedRequestService.updateSavedRequest(reqWithDesc.id, {
      name: 'Get User Name Changed Only',
      // description omitted
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/users/1'
    });
    assert(
      preservedUpdate.description === 'Description that must be preserved across partial updates',
      'updateSavedRequest preserves existing description when omitted in payload'
    );

    // 2.12 Rejection of non-string description on update
    let nonStringUpdateError = null;
    try {
      await savedRequestService.updateSavedRequest(reqWithDesc.id, {
        name: 'Get User Invalid Desc Update',
        description: { invalid: true },
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/users/1'
      });
    } catch (err) {
      nonStringUpdateError = err;
    }
    assert(
      nonStringUpdateError instanceof AppError && nonStringUpdateError.statusCode === 400,
      'updateSavedRequest rejects non-string description with 400 AppError'
    );

    // -------------------------------------------------------------
    // Section 3: HTTP API Endpoints Integration
    // -------------------------------------------------------------
    console.log('\n[SECTION 3] HTTP API Endpoints Integration');

    // Start ephemeral test server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const testPort = server.address().port;
    assert(testPort > 0, `Ephemeral HTTP test server listening on port ${testPort}`);

    // 3.1 POST /api/requests/saved with description
    const apiPostRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/saved',
      body: {
        name: 'API Test Request with Desc',
        description: 'Endpoint description provided via HTTP POST payload',
        collection_id: testCol.id,
        method: 'POST',
        url: 'https://jsonplaceholder.typicode.com/posts',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: '{"title":"foo","body":"bar","userId":1}',
        body_type: 'json'
      }
    });

    assert(apiPostRes.statusCode === 201, 'POST /api/requests/saved responds with 201 Created');
    assert(apiPostRes.body && apiPostRes.body.success === true, 'POST /api/requests/saved returns success: true');
    assert(
      apiPostRes.body.data && apiPostRes.body.data.description === 'Endpoint description provided via HTTP POST payload',
      'POST /api/requests/saved returns created request with description'
    );
    if (apiPostRes.body?.data?.id) {
      createdSavedRequestIds.push(apiPostRes.body.data.id);
    }

    const apiCreatedId = apiPostRes.body.data.id;

    // 3.2 GET /api/requests/saved/:id
    const apiGetRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/requests/saved/${apiCreatedId}`
    });
    assert(apiGetRes.statusCode === 200, 'GET /api/requests/saved/:id responds with 200 OK');
    assert(
      apiGetRes.body?.data?.description === 'Endpoint description provided via HTTP POST payload',
      'GET /api/requests/saved/:id returns request with accurate description'
    );

    // 3.3 PUT /api/requests/saved/:id with updated description
    const apiPutRes = await makeRequest(server, {
      method: 'PUT',
      path: `/api/requests/saved/${apiCreatedId}`,
      body: {
        name: 'API Test Request with Desc (Updated)',
        description: 'Updated endpoint description via HTTP PUT payload',
        collection_id: testCol.id,
        method: 'POST',
        url: 'https://jsonplaceholder.typicode.com/posts',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: '{"title":"foo","body":"bar","userId":1}',
        body_type: 'json'
      }
    });

    assert(apiPutRes.statusCode === 200, 'PUT /api/requests/saved/:id responds with 200 OK');
    assert(
      apiPutRes.body?.data?.description === 'Updated endpoint description via HTTP PUT payload',
      'PUT /api/requests/saved/:id updates and returns new description'
    );

    // 3.4 POST /api/requests/saved with invalid non-string description
    const apiInvalidPost = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/saved',
      body: {
        name: 'Invalid Desc Request',
        description: ['invalid array description'],
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/todos/1'
      }
    });
    assert(apiInvalidPost.statusCode === 400, 'POST /api/requests/saved with non-string description returns 400');
    assert(
      apiInvalidPost.body?.error?.code === 'VALIDATION_ERROR',
      'POST /api/requests/saved error code is VALIDATION_ERROR'
    );

    // -------------------------------------------------------------
    // Section 4: Frontend State & Template Conversion
    // -------------------------------------------------------------
    console.log('\n[SECTION 4] Frontend State & Template Conversion');

    // 4.1 convertSavedRequestToTemplate
    const mockSavedReq = {
      id: 999,
      name: 'Template Test Request',
      description: 'Doc description for template test',
      method: 'GET',
      url: 'https://api.example.com/test',
      headers: [{ key: 'Accept', value: 'application/json' }],
      params: [],
      body: '',
      body_type: 'none',
      auth_type: 'none',
      assertions: []
    };

    const templateResult = convertSavedRequestToTemplate(mockSavedReq);
    assert(
      templateResult.description === 'Doc description for template test',
      'convertSavedRequestToTemplate preserves request description'
    );

    // 4.2 convertSavedRequestToTemplate fallback when description is missing
    const templateWithoutDesc = convertSavedRequestToTemplate({
      id: 998,
      name: 'No Desc Request',
      method: 'GET',
      url: 'https://api.example.com/nodesc'
    });
    assert(
      templateWithoutDesc.description === '',
      'convertSavedRequestToTemplate defaults missing description to empty string'
    );

    // 4.3 loadRequestIntoState
    loadRequestIntoState(templateResult);
    assert(
      activeRequest.description === 'Doc description for template test',
      'loadRequestIntoState loads description into activeRequest'
    );

    // -------------------------------------------------------------
    // Section 5: Frontend HTML Markup Verification
    // -------------------------------------------------------------
    console.log('\n[SECTION 5] Frontend HTML Markup Verification');

    const htmlPath = path.join(__dirname, 'public', 'index.html');
    assert(fs.existsSync(htmlPath), 'public/index.html file exists');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    assert(
      htmlContent.includes('id="input-save-desc"'),
      'Save Request Modal contains `#input-save-desc` textarea'
    );
    assert(
      htmlContent.includes('id="input-edit-req-desc"'),
      'Edit Saved Request Modal contains `#input-edit-req-desc` textarea'
    );

    // -------------------------------------------------------------
    // Section 6: Collection Export Service (exportCollection)
    // -------------------------------------------------------------
    console.log('\n[SECTION 6] Collection Export Service (exportCollection)');

    // 6.1 Create a collection with multiple requests and assertions for export testing
    const exportTestCol = await collectionService.createCollection({
      name: 'E-Commerce API Collection',
      description: 'Collection created for export and documentation verification'
    });
    createdCollectionIds.push(exportTestCol.id);

    const exportReq1 = await savedRequestService.createSavedRequest({
      name: 'List Products Endpoint',
      description: 'Retrieves all available products with category filtering',
      collection_id: exportTestCol.id,
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/posts?category=electronics',
      headers: [
        { key: 'Accept', value: 'application/json', description: 'JSON responses only', enabled: true },
        // Add a sensitive header that must be stripped during export
        { key: 'Authorization', value: 'Bearer super-secret-token', description: 'Auth token', enabled: true }
      ],
      params: [{ key: 'category', value: 'electronics', description: 'Target category', enabled: true }],
      body: null,
      body_type: 'none',
      auth_type: 'bearer',
      assertions: [
        { id: 'exp-assert-1', type: 'status_code', operator: 'equals', expected: 200, enabled: true },
        { id: 'exp-assert-2', type: 'response_time', operator: 'less_than', expected: 1500, enabled: true }
      ]
    });
    createdSavedRequestIds.push(exportReq1.id);

    const exportReq2 = await savedRequestService.createSavedRequest({
      name: 'Create Order Endpoint',
      description: 'Submits a new order payload for checkout processing',
      collection_id: exportTestCol.id,
      method: 'POST',
      url: 'https://jsonplaceholder.typicode.com/posts',
      headers: [{ key: 'Content-Type', value: 'application/json', description: 'Body type', enabled: true }],
      params: [],
      body: JSON.stringify({ item: 'Widget', qty: 2 }),
      body_type: 'json',
      auth_type: 'none',
      assertions: [
        { id: 'exp-assert-3', type: 'status_code', operator: 'equals', expected: 201, enabled: true }
      ]
    });
    createdSavedRequestIds.push(exportReq2.id);

    // 6.2 Execute exportCollection
    const exportedData = await exportCollection(exportTestCol.id);

    assert(exportedData.version === SPEC_VERSION, `Export envelope version is '${SPEC_VERSION}'`);
    assert(exportedData.schema === SCHEMA_IDENTIFIER, `Export envelope schema is '${SCHEMA_IDENTIFIER}'`);
    assert(typeof exportedData.exported_at === 'string' && exportedData.exported_at.length > 0, 'Export includes ISO timestamp in exported_at');
    assert(exportedData.collection && exportedData.collection.name === 'E-Commerce API Collection', 'Exported collection name matches');
    assert(exportedData.collection.description === 'Collection created for export and documentation verification', 'Exported collection description matches');
    assert(Array.isArray(exportedData.collection.requests), 'Exported collection requests is an array');
    assert(exportedData.collection.requests.length === 2, 'Exported collection contains exactly 2 requests');

    // 6.3 Verify exported request fields and credential sanitization
    const exportedReq1 = exportedData.collection.requests.find((r) => r.name === 'List Products Endpoint');
    assert(exportedReq1 !== undefined, 'Exported request 1 found in collection');
    assert(exportedReq1.description === 'Retrieves all available products with category filtering', 'Exported request 1 preserves description');
    assert(exportedReq1.method === 'GET', 'Exported request 1 preserves method');
    assert(exportedReq1.url === 'https://jsonplaceholder.typicode.com/posts?category=electronics', 'Exported request 1 preserves URL');
    assert(Array.isArray(exportedReq1.assertions) && exportedReq1.assertions.length === 2, 'Exported request 1 preserves assertions');

    // Security check: Authorization header must NOT be exported
    const hasAuthHeader = exportedReq1.headers.some((h) => String(h.key).toLowerCase() === 'authorization');
    assert(!hasAuthHeader, 'Exported request 1 strictly sanitizes and excludes Authorization header');

    const exportedReq2 = exportedData.collection.requests.find((r) => r.name === 'Create Order Endpoint');
    assert(exportedReq2 !== undefined, 'Exported request 2 found in collection');
    assert(exportedReq2.method === 'POST', 'Exported request 2 preserves POST method');
    assert(exportedReq2.body_type === 'json', 'Exported request 2 preserves body_type');
    assert(exportedReq2.assertions.length === 1, 'Exported request 2 preserves assertions');

    // 6.4 Error cases for exportCollection
    let missingColExportErr = null;
    try {
      await exportCollection(9999999);
    } catch (err) {
      missingColExportErr = err;
    }
    assert(missingColExportErr instanceof AppError && missingColExportErr.statusCode === 404, 'exportCollection throws 404 for nonexistent collection');

    let invalidIdExportErr = null;
    try {
      await exportCollection('invalid-id');
    } catch (err) {
      invalidIdExportErr = err;
    }
    assert(invalidIdExportErr instanceof AppError && invalidIdExportErr.statusCode === 400, 'exportCollection throws 400 for non-numeric collection ID');

    // -------------------------------------------------------------
    // Section 7: Collection Import Payload Validation (validateImportPayload)
    // -------------------------------------------------------------
    console.log('\n[SECTION 7] Collection Import Payload Validation (validateImportPayload)');

    // 7.1 Rejection of non-object root payload
    [null, undefined, 'string', 12345, [1, 2, 3]].forEach((invalidPayload) => {
      let err = null;
      try {
        validateImportPayload(invalidPayload);
      } catch (e) {
        err = e;
      }
      assert(err instanceof AppError && err.statusCode === 400, `validateImportPayload rejects root type '${typeof invalidPayload}'`);
    });

    // 7.2 Schema compatibility checks
    let badSchemaErr = null;
    try {
      validateImportPayload({ schema: 'postman/v2.1', collection: { name: 'Test' } });
    } catch (e) {
      badSchemaErr = e;
    }
    assert(badSchemaErr instanceof AppError && badSchemaErr.code === 'UNSUPPORTED_SCHEMA', 'validateImportPayload rejects non-devprobe schema');

    // Valid devprobe schema accepted
    const validSchemaCheck = validateImportPayload({
      schema: 'devprobe/v1',
      collection: { name: 'Valid Schema Collection' }
    });
    assert(validSchemaCheck.collection.name === 'Valid Schema Collection', 'validateImportPayload accepts devprobe/v1 schema');

    // 7.3 Collection container validation
    let missingColContainerErr = null;
    try {
      validateImportPayload({ schema: 'devprobe/v1' });
    } catch (e) {
      missingColContainerErr = e;
    }
    assert(missingColContainerErr instanceof AppError && missingColContainerErr.statusCode === 400, 'validateImportPayload rejects missing collection container');

    // Missing collection name
    let missingNameErr = null;
    try {
      validateImportPayload({ collection: { description: 'No name' } });
    } catch (e) {
      missingNameErr = e;
    }
    assert(missingNameErr instanceof AppError && missingNameErr.statusCode === 400, 'validateImportPayload rejects missing collection name');

    // Empty/whitespace collection name
    let emptyNameErr = null;
    try {
      validateImportPayload({ collection: { name: '   ' } });
    } catch (e) {
      emptyNameErr = e;
    }
    assert(emptyNameErr instanceof AppError && emptyNameErr.statusCode === 400, 'validateImportPayload rejects whitespace-only collection name');

    // Collection name exceeding 255 characters
    let longNameErr = null;
    try {
      validateImportPayload({ collection: { name: 'X'.repeat(256) } });
    } catch (e) {
      longNameErr = e;
    }
    assert(longNameErr instanceof AppError && longNameErr.statusCode === 400, 'validateImportPayload rejects collection name exceeding 255 chars');

    // Invalid non-string collection description
    let badColDescErr = null;
    try {
      validateImportPayload({ collection: { name: 'Col', description: { note: 'invalid' } } });
    } catch (e) {
      badColDescErr = e;
    }
    assert(badColDescErr instanceof AppError && badColDescErr.statusCode === 400, 'validateImportPayload rejects non-string collection description');

    // 7.4 Request limits (100 requests limit)
    const overLimitRequests = [];
    for (let i = 0; i < 101; i++) {
      overLimitRequests.push({ name: `Req ${i}`, method: 'GET', url: 'https://api.example.com/item' });
    }

    let limitErr = null;
    try {
      validateImportPayload({
        collection: { name: 'Over Limit Collection', requests: overLimitRequests }
      });
    } catch (e) {
      limitErr = e;
    }
    assert(limitErr instanceof AppError && limitErr.code === 'LIMIT_EXCEEDED', 'validateImportPayload rejects batch exceeding 100 requests');

    // Exactly 100 requests passes validation
    const exact100Requests = overLimitRequests.slice(0, 100);
    const valid100Check = validateImportPayload({
      collection: { name: '100 Limit Collection', requests: exact100Requests }
    });
    assert(valid100Check.requests.length === 100, 'validateImportPayload permits exactly 100 requests');

    // 7.5 Request item validations
    // Missing request name
    let reqMissingNameErr = null;
    try {
      validateImportPayload({
        collection: { name: 'Col', requests: [{ method: 'GET', url: 'https://api.example.com' }] }
      });
    } catch (e) {
      reqMissingNameErr = e;
    }
    assert(reqMissingNameErr instanceof AppError && reqMissingNameErr.statusCode === 400, 'validateImportPayload rejects request missing name');

    // Unsupported HTTP method
    let badMethodErr = null;
    try {
      validateImportPayload({
        collection: { name: 'Col', requests: [{ name: 'Test', method: 'INVALIDMETHOD', url: 'https://api.example.com' }] }
      });
    } catch (e) {
      badMethodErr = e;
    }
    assert(badMethodErr instanceof AppError && badMethodErr.code === 'UNSUPPORTED_METHOD', 'validateImportPayload rejects unsupported HTTP method');

    // Invalid URL format
    let badUrlErr = null;
    try {
      validateImportPayload({
        collection: { name: 'Col', requests: [{ name: 'Test', method: 'GET', url: 'ht!tp://not a url' }] }
      });
    } catch (e) {
      badUrlErr = e;
    }
    assert(badUrlErr instanceof AppError && badUrlErr.code === 'INVALID_URL', 'validateImportPayload rejects malformed URL format');

    // Unsupported protocol (ftp://)
    let badProtoErr = null;
    try {
      validateImportPayload({
        collection: { name: 'Col', requests: [{ name: 'Test', method: 'GET', url: 'ftp://files.example.com' }] }
      });
    } catch (e) {
      badProtoErr = e;
    }
    assert(badProtoErr instanceof AppError && badProtoErr.code === 'INVALID_PROTOCOL', 'validateImportPayload rejects non-http/https protocol');

    // Embedded credentials in URL
    let credsUrlErr = null;
    try {
      validateImportPayload({
        collection: { name: 'Col', requests: [{ name: 'Test', method: 'GET', url: 'https://admin:password123@api.example.com' }] }
      });
    } catch (e) {
      credsUrlErr = e;
    }
    assert(credsUrlErr instanceof AppError && credsUrlErr.code === 'EMBEDDED_CREDENTIALS', 'validateImportPayload rejects embedded URL credentials');

    // Sanitization of imported sensitive headers
    const sanitizedImportCheck = validateImportPayload({
      collection: {
        name: 'Sanitized Col',
        requests: [
          {
            name: 'Req',
            method: 'GET',
            url: 'https://api.example.com',
            headers: [
              { key: 'Cookie', value: 'session_id=12345' },
              { key: 'Authorization', value: 'Bearer test' },
              { key: 'X-Safe-Header', value: 'allowed' }
            ]
          }
        ]
      }
    });

    const parsedImportHeaders = sanitizedImportCheck.requests[0].headers;
    const hasImportAuth = parsedImportHeaders.some((h) => ['authorization', 'cookie'].includes(h.key.toLowerCase()));
    assert(!hasImportAuth, 'validateImportPayload strips Authorization and Cookie from imported request headers');
    assert(parsedImportHeaders.some((h) => h.key === 'X-Safe-Header'), 'validateImportPayload preserves safe custom headers');

    // -------------------------------------------------------------
    // Section 8: Atomic Collection Import Execution (importCollection)
    // -------------------------------------------------------------
    console.log('\n[SECTION 8] Atomic Collection Import Execution (importCollection)');

    const importPayload = {
      version: '1.0.0',
      schema: 'devprobe/v1',
      collection: {
        name: 'Imported Payment Gateway API',
        description: 'End-to-end payment processing endpoints for billing integration',
        requests: [
          {
            name: 'Get Payment Status',
            description: 'Queries transaction status by charge ID',
            method: 'GET',
            url: 'https://jsonplaceholder.typicode.com/todos/1',
            headers: [{ key: 'Accept', value: 'application/json' }],
            params: [{ key: 'charge_id', value: 'ch_123', description: 'Charge ID', enabled: true }],
            body: null,
            body_type: 'none',
            auth_type: 'none',
            assertions: [
              { id: 'imp-assert-1', type: 'status_code', operator: 'equals', expected: 200, enabled: true }
            ]
          },
          {
            name: 'Process Refund',
            description: 'Dispatches refund request to payment processor',
            method: 'POST',
            url: 'https://jsonplaceholder.typicode.com/posts',
            headers: [{ key: 'Content-Type', value: 'application/json' }],
            params: [],
            body: JSON.stringify({ amount: 500, reason: 'requested_by_customer' }),
            body_type: 'json',
            auth_type: 'none',
            assertions: [
              { id: 'imp-assert-2', type: 'status_code', operator: 'equals', expected: 201, enabled: true },
              { id: 'imp-assert-3', type: 'response_time', operator: 'less_than', expected: 2000, enabled: true }
            ]
          },
          {
            name: 'Cancel Subscription',
            description: 'Terminates recurring billing schedule',
            method: 'DELETE',
            url: 'https://jsonplaceholder.typicode.com/posts/1',
            headers: [],
            params: [],
            body: null,
            body_type: 'none',
            auth_type: 'none',
            assertions: []
          }
        ]
      }
    };

    const importResult = await importCollection(importPayload);
    createdCollectionIds.push(importResult.id);
    for (const r of importResult.requests) {
      createdSavedRequestIds.push(r.id);
    }

    assert(importResult && importResult.id > 0, 'importCollection returns created collection with valid numeric ID');
    assert(importResult.name === 'Imported Payment Gateway API', 'importCollection returns matching collection name');
    assert(importResult.description === 'End-to-end payment processing endpoints for billing integration', 'importCollection returns matching description');
    assert(importResult.requests_count === 3, 'importCollection reports requests_count = 3');
    assert(importResult.requests.length === 3, 'importCollection returns 3 created request records');

    // Verify in database directly
    const [dbColRows] = await executeQuery('SELECT * FROM collections WHERE id = ?', [importResult.id]);
    assert(dbColRows.length === 1, 'Imported collection successfully committed to MySQL `collections` table');

    const [dbReqRows] = await executeQuery(
      'SELECT * FROM saved_requests WHERE collection_id = ? ORDER BY id ASC',
      [importResult.id]
    );
    assert(dbReqRows.length === 3, 'All 3 imported requests committed to MySQL `saved_requests` table');
    assert(dbReqRows[0].name === 'Get Payment Status', 'Request 1 name matches in database');
    assert(dbReqRows[0].description === 'Queries transaction status by charge ID', 'Request 1 description matches in database');
    assert(dbReqRows[1].method === 'POST', 'Request 2 method matches in database');
    assert(dbReqRows[1].body_type === 'json', 'Request 2 body_type matches in database');

    // Parse assertions from DB row
    let parsedDbAssertions = [];
    try {
      parsedDbAssertions = typeof dbReqRows[1].assertions === 'string'
        ? JSON.parse(dbReqRows[1].assertions)
        : (dbReqRows[1].assertions || []);
    } catch {
      parsedDbAssertions = [];
    }
    assert(parsedDbAssertions.length === 2, 'Request 2 assertions successfully persisted and retrieved from JSON column');

    // -------------------------------------------------------------
    // Section 9: Transaction Atomicity & Rollback Protection
    // -------------------------------------------------------------
    console.log('\n[SECTION 9] Transaction Atomicity & Rollback Protection');

    // 9.1 Native MySQL transaction rollback test
    const testRollbackConn = await pool.getConnection();
    let rolledBackColId = null;

    try {
      await testRollbackConn.beginTransaction();
      const [rbCol] = await testRollbackConn.execute(
        'INSERT INTO collections (name, description) VALUES (?, ?)',
        ['Rollback Test Collection', 'Should not exist after rollback']
      );
      rolledBackColId = rbCol.insertId;

      await testRollbackConn.execute(
        'INSERT INTO saved_requests (collection_id, name, method, url) VALUES (?, ?, ?, ?)',
        [rolledBackColId, 'Should Not Persist', 'GET', 'https://api.example.com']
      );

      // Explicit rollback
      await testRollbackConn.rollback();
    } finally {
      testRollbackConn.release();
    }

    const [checkRbCol] = await executeQuery('SELECT id FROM collections WHERE id = ?', [rolledBackColId]);
    assert(checkRbCol.length === 0, 'Database rollback guarantees collection is not committed on failure');

    const [checkRbReq] = await executeQuery('SELECT id FROM saved_requests WHERE collection_id = ?', [rolledBackColId]);
    assert(checkRbReq.length === 0, 'Database rollback guarantees child requests are not committed on failure');

    // 9.2 Test importCollection service atomic rollback when DB insertion fails
    const originalGetConnection = pool.getConnection.bind(pool);
    let rollbackMethodExecuted = false;

    // Temporarily wrap getConnection to simulate a DB failure on the 2nd request insertion
    pool.getConnection = async function () {
      const realConn = await originalGetConnection();
      const originalExecute = realConn.execute.bind(realConn);
      const originalRollback = realConn.rollback.bind(realConn);

      realConn.rollback = async function () {
        rollbackMethodExecuted = true;
        return originalRollback();
      };

      let requestInsertCount = 0;
      realConn.execute = async function (sql, params) {
        if (typeof sql === 'string' && sql.includes('INSERT INTO saved_requests')) {
          requestInsertCount++;
          if (requestInsertCount === 2) {
            throw new Error('Simulated database write error during multi-request batch import');
          }
        }
        return originalExecute(sql, params);
      };

      return realConn;
    };

    let importRollbackErr = null;
    try {
      await importCollection({
        collection: {
          name: 'Failing Batch Import Collection',
          requests: [
            { name: 'Req 1', method: 'GET', url: 'https://api.example.com/1' },
            { name: 'Req 2', method: 'GET', url: 'https://api.example.com/2' }
          ]
        }
      });
    } catch (e) {
      importRollbackErr = e;
    } finally {
      // Restore original connection pool function
      pool.getConnection = originalGetConnection;
    }

    assert(importRollbackErr instanceof AppError, 'importCollection throws AppError when a batch insert fails');
    assert(rollbackMethodExecuted === true, 'importCollection invokes conn.rollback() on database failure');

    // Verify neither collection nor request 1 exist in database
    const [orphanedCols] = await executeQuery(
      'SELECT id FROM collections WHERE name = ?',
      ['Failing Batch Import Collection']
    );
    assert(orphanedCols.length === 0, 'No orphan collection record left in database after import failure');

    // -------------------------------------------------------------
    // Section 10: Round-Trip Export and Import Integrity
    // -------------------------------------------------------------
    console.log('\n[SECTION 10] Round-Trip Export and Import Integrity');

    // Export the collection imported in Section 8
    const roundTripExport = await exportCollection(importResult.id);

    // Modify name to distinguish imported replica
    roundTripExport.collection.name = 'Round-Trip Cloned Collection';

    // Re-import exported JSON
    const roundTripImport = await importCollection(roundTripExport);
    createdCollectionIds.push(roundTripImport.id);
    for (const r of roundTripImport.requests) {
      createdSavedRequestIds.push(r.id);
    }

    assert(roundTripImport.id > 0, 'Re-imported collection created with new unique ID');
    assert(roundTripImport.name === 'Round-Trip Cloned Collection', 'Re-imported collection name preserved');
    assert(roundTripImport.description === importPayload.collection.description, 'Re-imported collection description preserved');
    assert(roundTripImport.requests_count === 3, 'Re-imported collection contains identical request count');

    // Verify request assertions and parameters survived export -> import intact
    const roundTripReq2 = roundTripImport.requests.find((r) => r.name === 'Process Refund');
    assert(roundTripReq2 !== undefined, 'Request 2 found in re-imported collection');
    assert(roundTripReq2.method === 'POST', 'Request 2 method preserved in re-imported collection');
    assert(roundTripReq2.body_type === 'json', 'Request 2 body_type preserved in re-imported collection');
    assert(Array.isArray(roundTripReq2.assertions) && roundTripReq2.assertions.length === 2, 'Request 2 assertions preserved through export/import cycle');
    assert(roundTripReq2.assertions[0].type === 'status_code' && roundTripReq2.assertions[0].expected === 201, 'Assertion properties exact match');

    // -------------------------------------------------------------
    // Section 11: Security & Validation Audit Verification
    // -------------------------------------------------------------
    console.log('\n[SECTION 11] Security & Validation Audit Verification');

    // Audit Check 1: Strict Schema and Version Enforcement
    console.log('  Audit Check 1: Strict schema & version validation');
    let badSchemaV2 = null;
    try {
      validateImportPayload({ schema: 'devprobe/v2', collection: { name: 'V2 Test' } });
    } catch (e) {
      badSchemaV2 = e;
    }
    assert(badSchemaV2 && badSchemaV2.code === 'UNSUPPORTED_SCHEMA', 'Rejects schema devprobe/v2 with UNSUPPORTED_SCHEMA');

    let badSchemaLoose = null;
    try {
      validateImportPayload({ schema: 'devprobe', collection: { name: 'Loose Test' } });
    } catch (e) {
      badSchemaLoose = e;
    }
    assert(badSchemaLoose && badSchemaLoose.code === 'UNSUPPORTED_SCHEMA', 'Rejects unversioned devprobe schema with UNSUPPORTED_SCHEMA');

    let badSchemaForeign = null;
    try {
      validateImportPayload({ schema: 'postman/v2.1', collection: { name: 'Postman Test' } });
    } catch (e) {
      badSchemaForeign = e;
    }
    assert(badSchemaForeign && badSchemaForeign.code === 'UNSUPPORTED_SCHEMA', 'Rejects non-devprobe schema postman/v2.1 with UNSUPPORTED_SCHEMA');

    // SemVer 1.x validation tests: '1', '1.2', '1.0.0', '2.0.0', and malformed versions
    let ver1Only = null;
    try {
      validateImportPayload({ schema: 'devprobe/v1', version: '1', collection: { name: 'Major Only' } });
    } catch (e) {
      ver1Only = e;
    }
    assert(ver1Only && ver1Only.code === 'UNSUPPORTED_VERSION', 'Rejects incomplete version "1" (missing minor.patch) with UNSUPPORTED_VERSION');

    let ver12Only = null;
    try {
      validateImportPayload({ schema: 'devprobe/v1', version: '1.2', collection: { name: 'Minor Only' } });
    } catch (e) {
      ver12Only = e;
    }
    assert(ver12Only && ver12Only.code === 'UNSUPPORTED_VERSION', 'Rejects incomplete version "1.2" (missing patch) with UNSUPPORTED_VERSION');

    let ver100Valid = false;
    try {
      const validPayload = validateImportPayload({
        schema: 'devprobe/v1',
        version: '1.0.0',
        collection: { name: 'Valid SemVer 1.0.0' }
      });
      ver100Valid = Boolean(validPayload && validPayload.collection);
    } catch (e) {
      ver100Valid = false;
    }
    assert(ver100Valid, 'Accepts valid SemVer 1.0.0 version');

    let ver123Valid = false;
    try {
      const validPayload = validateImportPayload({
        schema: 'devprobe/v1',
        version: '1.2.3',
        collection: { name: 'Valid SemVer 1.2.3' }
      });
      ver123Valid = Boolean(validPayload && validPayload.collection);
    } catch (e) {
      ver123Valid = false;
    }
    assert(ver123Valid, 'Accepts valid SemVer 1.2.3 version');

    let badVerMajor = null;
    try {
      validateImportPayload({ schema: 'devprobe/v1', version: '2.0.0', collection: { name: 'Major Bump' } });
    } catch (e) {
      badVerMajor = e;
    }
    assert(badVerMajor && badVerMajor.code === 'UNSUPPORTED_VERSION', 'Rejects incompatible version "2.0.0" with UNSUPPORTED_VERSION');

    let badVerQuad = null;
    try {
      validateImportPayload({ schema: 'devprobe/v1', version: '1.0.0.0', collection: { name: 'Quad Version' } });
    } catch (e) {
      badVerQuad = e;
    }
    assert(badVerQuad && badVerQuad.code === 'UNSUPPORTED_VERSION', 'Rejects malformed quad-part version "1.0.0.0" with UNSUPPORTED_VERSION');

    let badVerAlpha = null;
    try {
      validateImportPayload({ schema: 'devprobe/v1', version: '1.a.0', collection: { name: 'Alpha In Segment' } });
    } catch (e) {
      badVerAlpha = e;
    }
    assert(badVerAlpha && badVerAlpha.code === 'UNSUPPORTED_VERSION', 'Rejects malformed version "1.a.0" with UNSUPPORTED_VERSION');

    let badVerPrefixed = null;
    try {
      validateImportPayload({ schema: 'devprobe/v1', version: 'v1.0.0', collection: { name: 'Prefixed v' } });
    } catch (e) {
      badVerPrefixed = e;
    }
    assert(badVerPrefixed && badVerPrefixed.code === 'UNSUPPORTED_VERSION', 'Rejects malformed prefixed version "v1.0.0" with UNSUPPORTED_VERSION');

    let badVerLeadingZero = null;
    try {
      validateImportPayload({ schema: 'devprobe/v1', version: '1.01.0', collection: { name: 'Leading Zero' } });
    } catch (e) {
      badVerLeadingZero = e;
    }
    assert(badVerLeadingZero && badVerLeadingZero.code === 'UNSUPPORTED_VERSION', 'Rejects malformed version with leading zeros "1.01.0" with UNSUPPORTED_VERSION');

    // Audit Check 2: RFC 7230 Header Name, Duplicates, and Parameter Structure
    console.log('  Audit Check 2: RFC 7230 header validation, duplicates & param structures');
    let rfcSpaceErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'RFC Audit',
          requests: [{
            name: 'Req RFC 1',
            method: 'GET',
            url: 'https://example.com/api',
            headers: [{ key: 'Content Type', value: 'application/json' }]
          }]
        }
      });
    } catch (e) {
      rfcSpaceErr = e;
    }
    assert(rfcSpaceErr && rfcSpaceErr.code === 'INVALID_HEADER_NAME', 'Rejects header name containing spaces with INVALID_HEADER_NAME');

    let rfcCrlfErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'RFC Audit',
          requests: [{
            name: 'Req RFC 2',
            method: 'GET',
            url: 'https://example.com/api',
            headers: [{ key: 'Injected\r\nHeader', value: 'bad' }]
          }]
        }
      });
    } catch (e) {
      rfcCrlfErr = e;
    }
    assert(rfcCrlfErr && rfcCrlfErr.code === 'INVALID_HEADER_NAME', 'Rejects header name with CRLF characters with INVALID_HEADER_NAME');

    let dupHeaderErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Duplicate Header Audit',
          requests: [{
            name: 'Req Dup',
            method: 'GET',
            url: 'https://example.com/api',
            headers: [
              { key: 'X-Trace-ID', value: 'abc-1' },
              { key: 'x-trace-id', value: 'abc-2' }
            ]
          }]
        }
      });
    } catch (e) {
      dupHeaderErr = e;
    }
    assert(dupHeaderErr && dupHeaderErr.code === 'DUPLICATE_HEADER', 'Rejects duplicate case-insensitive headers in request with DUPLICATE_HEADER');

    let oversizedHdrValErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Oversized Header Val',
          requests: [{
            name: 'Req Big Hdr',
            method: 'GET',
            url: 'https://example.com/api',
            headers: [{ key: 'X-Huge', value: 'x'.repeat(16385) }]
          }]
        }
      });
    } catch (e) {
      oversizedHdrValErr = e;
    }
    assert(oversizedHdrValErr && oversizedHdrValErr.code === 'VALIDATION_ERROR', 'Rejects header value exceeding 16KB with VALIDATION_ERROR');

    let oversizedParamKeyErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Oversized Param Key',
          requests: [{
            name: 'Req Big Param Key',
            method: 'GET',
            url: 'https://example.com/api',
            params: [{ key: 'p'.repeat(256), value: 'val' }]
          }]
        }
      });
    } catch (e) {
      oversizedParamKeyErr = e;
    }
    assert(oversizedParamKeyErr && oversizedParamKeyErr.code === 'VALIDATION_ERROR', 'Rejects parameter key exceeding 255 chars with VALIDATION_ERROR');

    // Audit Check 3: Body Type, Auth Type, and Body Size Limits
    console.log('  Audit Check 3: Body type, auth type & body size limits');
    let badBodyTypeErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Bad Body Type',
          requests: [{
            name: 'Req Bad Body',
            method: 'POST',
            url: 'https://example.com/api',
            body_type: 'xml',
            body: '<data/>'
          }]
        }
      });
    } catch (e) {
      badBodyTypeErr = e;
    }
    assert(badBodyTypeErr && badBodyTypeErr.code === 'VALIDATION_ERROR', 'Rejects unsupported body_type "xml" with VALIDATION_ERROR');

    let badAuthTypeErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Bad Auth Type',
          requests: [{
            name: 'Req Bad Auth',
            method: 'GET',
            url: 'https://example.com/api',
            auth_type: 'oauth2'
          }]
        }
      });
    } catch (e) {
      badAuthTypeErr = e;
    }
    assert(badAuthTypeErr && badAuthTypeErr.code === 'VALIDATION_ERROR', 'Rejects unsupported auth_type "oauth2" with VALIDATION_ERROR');

    let payloadTooLargeErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Payload Too Large',
          requests: [{
            name: 'Req Giant Body',
            method: 'POST',
            url: 'https://example.com/api',
            body_type: 'text',
            body: 'a'.repeat(1024 * 1024 + 10)
          }]
        }
      });
    } catch (e) {
      payloadTooLargeErr = e;
    }
    assert(payloadTooLargeErr && payloadTooLargeErr.code === 'PAYLOAD_TOO_LARGE', 'Rejects request body exceeding 1MB with PAYLOAD_TOO_LARGE');

    // Audit Check 4: Assertion Validation & Malformed Assertions
    console.log('  Audit Check 4: Assertion validation & malformed assertions rejection');
    let badAssertionTypeErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Bad Assertion Type',
          requests: [{
            name: 'Req Bad Assertion',
            method: 'GET',
            url: 'https://example.com/api',
            assertions: [{ id: 'as-1', type: 'custom_script', operator: 'equals', expected: 'true' }]
          }]
        }
      });
    } catch (e) {
      badAssertionTypeErr = e;
    }
    assert(badAssertionTypeErr && badAssertionTypeErr.code === 'UNSUPPORTED_ASSERTION_TYPE', 'Rejects unsupported assertion type with UNSUPPORTED_ASSERTION_TYPE');

    let badAssertionOpErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Bad Assertion Operator',
          requests: [{
            name: 'Req Bad Op',
            method: 'GET',
            url: 'https://example.com/api',
            assertions: [{ id: 'as-2', type: 'status_code', operator: 'invalid_op', expected: 200 }]
          }]
        }
      });
    } catch (e) {
      badAssertionOpErr = e;
    }
    assert(badAssertionOpErr && badAssertionOpErr.code === 'UNSUPPORTED_OPERATOR', 'Rejects invalid assertion operator with UNSUPPORTED_OPERATOR');

    let badAssertionProtoErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Bad Assertion Proto',
          requests: [{
            name: 'Req Bad Proto',
            method: 'GET',
            url: 'https://example.com/api',
            assertions: [{ id: 'as-3', type: 'json_path', property: '__proto__.polluted', operator: 'equals', expected: 'test' }]
          }]
        }
      });
    } catch (e) {
      badAssertionProtoErr = e;
    }
    assert(badAssertionProtoErr && badAssertionProtoErr.code === 'FORBIDDEN_PROPERTY_PATH', 'Rejects prototype pollution in assertion JSON path with FORBIDDEN_PROPERTY_PATH');

    let codeInjectionErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Code Injection Assertion',
          requests: [{
            name: 'Req Code Injection',
            method: 'GET',
            url: 'https://example.com/api',
            assertions: [{ id: 'as-4', type: 'body_text', operator: 'contains', expected: 'eval(alert(1))' }]
          }]
        }
      });
    } catch (e) {
      codeInjectionErr = e;
    }
    assert(codeInjectionErr && codeInjectionErr.code === 'CODE_INJECTION_DETECTED', 'Rejects code injection in assertion expected value with CODE_INJECTION_DETECTED');

    // Audit Check 5: Credential Leakage in Export Fields
    console.log('  Audit Check 5: Credential sanitization across all export fields');
    const leakCol = await collectionService.createCollection({
      name: 'Credential Leak Audit Collection',
      description: 'Audit collection for export sanitization'
    });
    createdCollectionIds.push(leakCol.id);

    const [rawReqResult] = await executeQuery(
      `INSERT INTO saved_requests (
        collection_id, name, description, method, url, headers, params, body, body_type, auth_type, assertions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        leakCol.id,
        'Direct Unsanitized Request',
        'Direct DB row to test export defense-in-depth',
        'POST',
        'https://admin:supersecret@api.devprobe.com/v1/auth',
        JSON.stringify([
          { key: 'Authorization', value: 'Bearer leaked-jwt-token-12345' },
          { key: 'Cookie', value: 'session_id=confidential_session_token' },
          { key: 'X-Api-Key', value: 'secret-key-abcdef' },
          { key: 'Content-Type', value: 'application/json' }
        ]),
        JSON.stringify([
          { key: 'token', value: 'param-token-test' }
        ]),
        '{"encrypted_password": "enc:v1:0123456789abcdef:fedcba9876543210", "public_id": 42}',
        'json',
        'bearer',
        JSON.stringify([
          { type: 'status_code', operator: 'equals', expected: 200 }
        ])
      ]
    );
    createdSavedRequestIds.push(rawReqResult.insertId);

    const leakExport = await exportCollection(leakCol.id);
    const exportedReq = leakExport.collection.requests[0];

    assert(exportedReq.headers.find((h) => h.key.toLowerCase() === 'authorization') === undefined, 'Export strictly omits Authorization header');
    assert(exportedReq.headers.find((h) => h.key.toLowerCase() === 'cookie') === undefined, 'Export strictly omits Cookie header');
    assert(exportedReq.headers.find((h) => h.key.toLowerCase() === 'x-api-key') === undefined, 'Export strictly omits X-Api-Key header');
    assert(exportedReq.headers.find((h) => h.key.toLowerCase() === 'content-type') !== undefined, 'Export preserves non-sensitive Content-Type header');
    assert(!exportedReq.url.includes('supersecret') && !exportedReq.url.includes('admin:'), 'Export URL sanitizes embedded username and password');
    assert(exportedReq.url === 'https://api.devprobe.com/v1/auth', 'Export URL normalized to clean protocol and host');
    assert(!exportedReq.body.includes('enc:v1:'), 'Export body does not contain raw ciphertext tokens');
    assert(exportedReq.body.includes('[REDACTED_SECRET]'), 'Export body replaces enc:v1: token with [REDACTED_SECRET]');

    // Verify legitimate request body is NOT corrupted through overly broad redaction
    const legitimateLoginPayload = JSON.stringify({
      grant_type: 'password',
      username: 'admin',
      password: '{{user_password}}',
      client_secret: '{{client_secret}}',
      token_type: 'bearer',
      description: 'Requesting bearer token with user password'
    }, null, 2);

    const [legitReqResult] = await executeQuery(
      `INSERT INTO saved_requests (
        collection_id, name, description, method, url, headers, params, body, body_type, auth_type, assertions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        leakCol.id,
        'Legitimate Login Request',
        'Request with template variables and schema keywords',
        'POST',
        'https://api.example.com/oauth/token',
        JSON.stringify([{ key: 'Content-Type', value: 'application/json' }]),
        null,
        legitimateLoginPayload,
        'json',
        'none',
        JSON.stringify([
          { id: 'as-legit-1', type: 'status_code', operator: 'equals', expected: 200 },
          { id: 'as-legit-2', type: 'body_text', operator: 'contains', expected: 'Invalid password or expired token' }
        ])
      ]
    );
    createdSavedRequestIds.push(legitReqResult.insertId);

    const fullExport = await exportCollection(leakCol.id);
    const exportedLegitReq = fullExport.collection.requests.find((r) => r.name === 'Legitimate Login Request');

    assert(exportedLegitReq !== undefined, 'Legitimate request present in export bundle');
    const parsedExportedBody = JSON.parse(exportedLegitReq.body);
    assert(parsedExportedBody.grant_type === 'password', 'Legitimate body field "grant_type": "password" preserved intact');
    assert(parsedExportedBody.password === '{{user_password}}', 'Legitimate template placeholder "{{user_password}}" preserved intact without corruption');
    assert(parsedExportedBody.client_secret === '{{client_secret}}', 'Legitimate template placeholder "{{client_secret}}" preserved intact without corruption');
    assert(parsedExportedBody.token_type === 'bearer', 'Legitimate body field "token_type": "bearer" preserved intact');
    assert(parsedExportedBody.description.includes('password'), 'Legitimate body description text preserved intact');

    // Verify assertion expected values are NOT corrupted through overly broad redaction
    const exportedLegitAssertion = exportedLegitReq.assertions.find((a) => a.id === 'as-legit-2');
    assert(exportedLegitAssertion !== undefined, 'Legitimate error check assertion preserved');
    assert(exportedLegitAssertion.expected === 'Invalid password or expired token', 'Assertion expected value "Invalid password or expired token" preserved intact without corruption');

    // Verify collection metadata preserved intact without corruption
    assert(fullExport.collection.name === 'Credential Leak Audit Collection', 'Collection name preserved intact in export');
    assert(fullExport.collection.description === 'Audit collection for export sanitization', 'Collection description preserved intact in export');

    // Audit Check 6: Imported Credentials Cannot Bypass Sanitization
    console.log('  Audit Check 6: Imported credentials sanitization & URL credentials blocking');
    const bypassAttemptPayload = {
      collection: {
        name: 'Bypass Attempt Collection',
        requests: [{
          name: 'Sneaky Request',
          method: 'GET',
          url: 'https://example.com/api',
          headers: [
            { key: 'Authorization', value: 'Bearer sneaky-token' },
            { key: 'cookie', value: 'stolen=true' },
            { key: 'Proxy-Authorization', value: 'Basic secret' },
            { key: 'X-Safe-Header', value: 'ok' }
          ]
        }]
      }
    };
    const sanitizedImport = validateImportPayload(bypassAttemptPayload);
    const reqHeaders = sanitizedImport.requests[0].headers;
    assert(reqHeaders.length === 1 && reqHeaders[0].key === 'X-Safe-Header', 'validateImportPayload strips all sensitive credential headers from import');

    let embeddedUrlErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Embedded URL Credential Test',
          requests: [{
            name: 'Cred URL Req',
            method: 'GET',
            url: 'https://user:password123@example.com/api'
          }]
        }
      });
    } catch (e) {
      embeddedUrlErr = e;
    }
    assert(embeddedUrlErr && embeddedUrlErr.code === 'EMBEDDED_CREDENTIALS', 'validateImportPayload strictly blocks URLs with embedded credentials');

    // Audit Check 7: Prototype Pollution Rejection
    console.log('  Audit Check 7: Prototype pollution rejection');
    let protoHdrErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Proto Pollution Header',
          requests: [{
            name: 'Proto Req',
            method: 'GET',
            url: 'https://example.com/api',
            headers: [{ key: '__proto__', value: 'polluted' }]
          }]
        }
      });
    } catch (e) {
      protoHdrErr = e;
    }
    assert(protoHdrErr && protoHdrErr.code === 'FORBIDDEN_PROPERTY', 'Rejects __proto__ in header keys with FORBIDDEN_PROPERTY');

    let protoConstructorHdrErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Constructor Pollution Header',
          requests: [{
            name: 'Constructor Req',
            method: 'GET',
            url: 'https://example.com/api',
            headers: [{ key: 'constructor', value: 'polluted' }]
          }]
        }
      });
    } catch (e) {
      protoConstructorHdrErr = e;
    }
    assert(protoConstructorHdrErr && protoConstructorHdrErr.code === 'FORBIDDEN_PROPERTY', 'Rejects constructor in header keys with FORBIDDEN_PROPERTY');

    let protoParamErr = null;
    try {
      validateImportPayload({
        collection: {
          name: 'Proto Pollution Param',
          requests: [{
            name: 'Proto Param Req',
            method: 'GET',
            url: 'https://example.com/api',
            params: [{ key: 'prototype', value: 'polluted' }]
          }]
        }
      });
    } catch (e) {
      protoParamErr = e;
    }
    assert(protoParamErr && protoParamErr.code === 'FORBIDDEN_PROPERTY', 'Rejects prototype in parameter keys with FORBIDDEN_PROPERTY');

    // Audit Check 8: Database Connection Release & Transaction Safety
    console.log('  Audit Check 8: DB connection release and transaction rollback safety');
    // Ensure that after failed batch import from Section 9, database connection pool remains healthy
    const [poolRows] = await executeQuery('SELECT 1 as is_healthy');
    assert(poolRows.length === 1 && poolRows[0].is_healthy === 1, 'Database connection pool is fully healthy and operational after rollbacks');

    // Audit Check 9: Data Privacy in Export Bundle (No internal IDs exposed)
    console.log('  Audit Check 9: Internal database IDs and metadata omitted from export');
    assert(!('id' in leakExport), 'Export root does not expose database ID');
    assert(!('id' in leakExport.collection), 'Export collection object does not expose database ID');
    assert(!('created_at' in leakExport.collection), 'Export collection does not expose created_at');
    assert(!('updated_at' in leakExport.collection), 'Export collection does not expose updated_at');
    assert(!('id' in exportedReq), 'Export request does not expose internal request ID');
    assert(!('collection_id' in exportedReq), 'Export request does not expose internal collection_id');
    assert(!('created_at' in exportedReq), 'Export request does not expose internal created_at');
    assert(!('updated_at' in exportedReq), 'Export request does not expose internal updated_at');
    assert(Array.isArray(exportedReq.headers) && exportedReq.headers.every((h) => !('id' in h)), 'Export headers do not expose internal client row IDs');
    assert(Array.isArray(exportedReq.params) && exportedReq.params.every((p) => !('id' in p)), 'Export params do not expose internal client row IDs');

    // -------------------------------------------------------------
    // Section 12: API Documentation Generator (Day 15 Step 3)
    // -------------------------------------------------------------
    console.log('\n[SECTION 12] API Documentation Generator Verification');

    // 1. cURL Snippet Generation
    console.log('  Testing cURL snippet generation');
    const simpleGetCurl = generateCurlSnippet({
      method: 'GET',
      url: 'https://api.example.com/v1/users'
    });
    assert(simpleGetCurl.includes('curl -X GET \'https://api.example.com/v1/users\''), 'cURL generates simple GET command with escaped URL');

    const paramPostCurl = generateCurlSnippet({
      method: 'POST',
      url: 'https://admin:pass123@api.example.com/v1/items',
      headers: [
        { key: 'Accept', value: 'application/json', enabled: true },
        { key: 'Authorization', value: 'Bearer secret-jwt', enabled: true },
        { key: 'Cookie', value: 'session=abc', enabled: true }
      ],
      params: [
        { key: 'tag', value: 'dev', enabled: true },
        { key: 'filter', value: 'active items', enabled: true },
        { key: 'disabled_p', value: 'no', enabled: false }
      ],
      body: JSON.stringify({ name: "Alice's Item", secret: 'enc:v1:0123456789abcdef:fedcba9876543210' }),
      body_type: 'json'
    });
    assert(!paramPostCurl.includes('admin:pass123'), 'cURL command strips embedded authority credentials from URL');
    assert(paramPostCurl.includes('tag=dev') && paramPostCurl.includes('filter=active+items'), 'cURL appends enabled query parameters to URL');
    assert(!paramPostCurl.includes('disabled_p'), 'cURL excludes disabled query parameters');
    assert(!paramPostCurl.toLowerCase().includes('authorization'), 'cURL strictly omits Authorization header');
    assert(!paramPostCurl.toLowerCase().includes('cookie'), 'cURL strictly omits Cookie header');
    assert(paramPostCurl.includes("-H 'Accept: application/json'"), 'cURL includes safe Accept header');
    assert(paramPostCurl.includes("-H 'Content-Type: application/json'"), 'cURL automatically adds Content-Type for JSON body');
    assert(paramPostCurl.includes("Alice'\\''s Item"), 'cURL safely shell-escapes single quotes in body payload');
    assert(!paramPostCurl.includes('enc:v1:'), 'cURL redacts local ciphertext tokens');
    assert(paramPostCurl.includes('[REDACTED_SECRET]'), 'cURL replaces enc:v1: with [REDACTED_SECRET]');

    // 2. Sample Response Lookup from request_history
    console.log('  Testing sample response extraction from request_history');
    const [mockHistResult] = await executeQuery(
      `INSERT INTO request_history (
        request_name, method, url, response_status, response_headers, response_body, response_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'Mock Doc Request',
        'GET',
        'https://api.example.com/doc-test',
        200,
        JSON.stringify({
          'content-type': 'application/json; charset=utf-8',
          'set-cookie': 'secret_cookie=xyz; HttpOnly',
          'x-request-id': 'req-abc-123'
        }),
        JSON.stringify({ message: 'Success', items: [1, 2, 3] }),
        45
      ]
    );
    createdHistoryIds.push(mockHistResult.insertId);

    const sampleResp = await getLatestSampleResponse('GET', 'https://api.example.com/doc-test');
    assert(sampleResp !== null, 'getLatestSampleResponse finds matching execution history');
    assert(sampleResp.status === 200, 'Sample response status matches');
    assert(sampleResp.headers['x-request-id'] === 'req-abc-123', 'Sample response preserves non-sensitive headers');
    assert(!('set-cookie' in sampleResp.headers), 'Sample response strictly strips sensitive Set-Cookie header');
    assert(sampleResp.time_ms === 45, 'Sample response preserves latency');
    assert(JSON.parse(sampleResp.body).message === 'Success', 'Sample response body parsed correctly');

    const emptySample = await getLatestSampleResponse('DELETE', 'https://api.example.com/never-called');
    assert(emptySample === null, 'getLatestSampleResponse returns null for uncalled endpoints');

    // Audit A: Sample Response Matching with Query Parameters & Deterministic Selection
    console.log('  Audit A: Query parameter matching & deterministic latest response selection');
    const paramReqElectronics = {
      id: 501,
      method: 'GET',
      url: 'https://api.example.com/catalog',
      params: [{ key: 'category', value: 'electronics', enabled: true }]
    };
    const paramReqBooks = {
      id: 502,
      method: 'GET',
      url: 'https://api.example.com/catalog',
      params: [{ key: 'category', value: 'books', enabled: true }]
    };

    assert(
      buildEffectiveUrl(paramReqElectronics.url, paramReqElectronics.params) === 'https://api.example.com/catalog?category=electronics',
      'buildEffectiveUrl accurately appends enabled query parameters'
    );
    assert(
      buildEffectiveUrl(paramReqBooks.url, paramReqBooks.params) === 'https://api.example.com/catalog?category=books',
      'buildEffectiveUrl differentiates separate query parameter values'
    );

    // Insert history record for electronics
    const [histElectronics] = await executeQuery(
      `INSERT INTO request_history (
        request_name, method, url, response_status, response_headers, response_body, response_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'Electronics Catalog',
        'GET',
        'https://api.example.com/catalog?category=electronics',
        200,
        JSON.stringify({ 'content-type': 'application/json' }),
        JSON.stringify({ category: 'electronics', items: ['Smart TV', 'Laptop'] }),
        32
      ]
    );
    createdHistoryIds.push(histElectronics.insertId);

    // Insert history record for books
    const [histBooks] = await executeQuery(
      `INSERT INTO request_history (
        request_name, method, url, response_status, response_headers, response_body, response_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'Books Catalog',
        'GET',
        'https://api.example.com/catalog?category=books',
        200,
        JSON.stringify({ 'content-type': 'application/json' }),
        JSON.stringify({ category: 'books', items: ['Clean Code', 'Design Patterns'] }),
        28
      ]
    );
    createdHistoryIds.push(histBooks.insertId);

    // Verify correct disambiguation between the two requests sharing the same base URL
    const matchedElectronics = await getLatestSampleResponse(paramReqElectronics);
    assert(matchedElectronics !== null, 'Found sample response for electronics request');
    assert(matchedElectronics.body.includes('Smart TV'), 'Electronics request selects electronics sample response');
    assert(!matchedElectronics.body.includes('Clean Code'), 'Electronics request does NOT select books sample response');

    const matchedBooks = await getLatestSampleResponse(paramReqBooks);
    assert(matchedBooks !== null, 'Found sample response for books request');
    assert(matchedBooks.body.includes('Clean Code'), 'Books request selects books sample response');
    assert(!matchedBooks.body.includes('Smart TV'), 'Books request does NOT select electronics sample response');

    // Test deterministic latest-response selection when multiple runs exist
    // 1. Insert a failing run (500)
    const [histFailing] = await executeQuery(
      `INSERT INTO request_history (
        request_name, method, url, response_status, response_headers, response_body, response_time, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'Electronics Catalog Failed',
        'GET',
        'https://api.example.com/catalog?category=electronics',
        500,
        JSON.stringify({ 'content-type': 'application/json' }),
        JSON.stringify({ error: 'Internal Server Error' }),
        120,
        'Internal Server Error'
      ]
    );
    createdHistoryIds.push(histFailing.insertId);

    // 2. Insert a newer successful run with distinct latency
    const [histNewerSuccess] = await executeQuery(
      `INSERT INTO request_history (
        request_name, method, url, response_status, response_headers, response_body, response_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'Electronics Catalog Latest',
        'GET',
        'https://api.example.com/catalog?category=electronics',
        200,
        JSON.stringify({ 'content-type': 'application/json' }),
        JSON.stringify({ category: 'electronics', items: ['Smart TV', 'Laptop', 'Headphones'], isLatest: true }),
        19
      ]
    );
    createdHistoryIds.push(histNewerSuccess.insertId);

    const deterministicSample = await getLatestSampleResponse(paramReqElectronics);
    assert(deterministicSample.status === 200, 'Deterministic selection prioritizes successful response over failure');
    assert(deterministicSample.body.includes('Headphones'), 'Deterministic selection returns the latest successful run');
    assert(deterministicSample.time_ms === 19, 'Deterministic selection returns correct latency for latest record');

    // Audit B: Response Body Credential Safety & Non-Corruption
    console.log('  Audit B: Response body secret redaction & legitimate content preservation');
    const [histEncryptedSecret] = await executeQuery(
      `INSERT INTO request_history (
        request_name, method, url, response_status, response_headers, response_body, response_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'Vault Token Endpoint',
        'POST',
        'https://api.example.com/v1/vault',
        200,
        JSON.stringify({ 'content-type': 'application/json' }),
        '{"status": "active", "host_token": "enc:v1:0123456789abcdef:fedcba9876543210", "public_id": "vault-42"}',
        15
      ]
    );
    createdHistoryIds.push(histEncryptedSecret.insertId);

    const vaultSample = await getLatestSampleResponse('POST', 'https://api.example.com/v1/vault');
    assert(vaultSample !== null, 'Found sample response for vault endpoint');
    assert(!vaultSample.body.includes('enc:v1:'), 'Sample response body redacts host ciphertext enc:v1:');
    assert(vaultSample.body.includes('[REDACTED_SECRET]'), 'Sample response body replaces ciphertext with [REDACTED_SECRET]');
    assert(vaultSample.body.includes('vault-42'), 'Sample response body preserves surrounding non-secret public_id');

    // Verify legitimate response examples are preserved without keyword over-redaction
    const legitimateAuthResponse = {
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'read write admin',
      session_status: 'authenticated',
      message: 'User authenticated successfully'
    };
    const [histLegitAuth] = await executeQuery(
      `INSERT INTO request_history (
        request_name, method, url, response_status, response_headers, response_body, response_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'OAuth Token Endpoint',
        'POST',
        'https://api.example.com/oauth/token',
        200,
        JSON.stringify({ 'content-type': 'application/json' }),
        JSON.stringify(legitimateAuthResponse),
        25
      ]
    );
    createdHistoryIds.push(histLegitAuth.insertId);

    const authSample = await getLatestSampleResponse('POST', 'https://api.example.com/oauth/token');
    assert(authSample !== null, 'Found sample response for OAuth endpoint');
    assert(authSample.body.includes('token_type'), 'Legitimate response preserves field "token_type" without corruption');
    assert(authSample.body.includes('Bearer'), 'Legitimate response preserves field value "Bearer" without corruption');
    assert(authSample.body.includes('expires_in'), 'Legitimate response preserves field "expires_in" without corruption');
    assert(authSample.body.includes('User authenticated successfully'), 'Legitimate response preserves message without corruption');

    // 3. GitHub-Flavored Markdown Documentation Generation
    console.log('  Testing GitHub-Flavored Markdown documentation generation');
    const docTestCollection = {
      name: 'E-Commerce Platform API',
      description: 'Comprehensive API documentation for order and inventory management.'
    };
    const docTestRequests = [
      {
        id: 101,
        name: 'List Products',
        method: 'GET',
        url: 'https://api.example.com/v1/products',
        description: 'Retrieves a paginated list of catalog products.',
        params: [
          { key: 'category', value: 'electronics', description: 'Product category filter', enabled: true },
          { key: 'limit', value: '25', description: 'Maximum products per page', enabled: true }
        ],
        headers: [
          { key: 'Accept', value: 'application/json', description: 'Preferred response format', enabled: true },
          { key: 'Authorization', value: 'Bearer secret', enabled: true }
        ],
        assertions: [
          { id: 'as-1', type: 'status_code', operator: 'equals', expected: 200, enabled: true },
          { id: 'as-2', type: 'response_time', operator: 'less_than', expected: 500, enabled: true }
        ]
      },
      {
        id: 102,
        name: 'Create Order',
        method: 'POST',
        url: 'https://api.example.com/v1/orders',
        description: 'Submits a new customer order for fulfillment.',
        headers: [
          { key: 'Content-Type', value: 'application/json', enabled: true }
        ],
        body: JSON.stringify({ item_id: 'prod-42', quantity: 2, discount_code: 'WINTER10' }),
        body_type: 'json',
        assertions: [
          { id: 'as-3', type: 'status_code', operator: 'equals', expected: 201, enabled: true }
        ]
      }
    ];

    const sampleMap = {
      101: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ total: 1, items: [{ id: 'prod-42', name: 'Smart Watch' }] }),
        time_ms: 38
      }
    };

    const generatedMd = generateCollectionMarkdown(docTestCollection, docTestRequests, sampleMap);

    assert(generatedMd.includes('# E-Commerce Platform API'), 'Markdown contains collection header');
    assert(generatedMd.includes('Comprehensive API documentation for order and inventory management.'), 'Markdown contains collection description');
    assert(generatedMd.includes('## Table of Contents'), 'Markdown contains Table of Contents section');
    assert(generatedMd.includes('GET') && generatedMd.includes('List Products'), 'TOC links to GET List Products');
    assert(generatedMd.includes('POST') && generatedMd.includes('Create Order'), 'TOC links to POST Create Order');
    assert(generatedMd.includes('### Query Parameters'), 'Markdown renders query parameters table');
    assert(generatedMd.includes('`electronics`') && generatedMd.includes('Product category filter'), 'Markdown renders parameter keys and descriptions');
    assert(generatedMd.includes('### Request Headers'), 'Markdown renders headers table');
    assert(!generatedMd.includes('Bearer secret'), 'Markdown strictly omits Authorization token from headers table');
    assert(generatedMd.includes('### Contract Assertions'), 'Markdown renders contract assertions table');
    assert(generatedMd.includes('`status_code`') && generatedMd.includes('`equals`') && generatedMd.includes('`200`'), 'Markdown assertion row contains correct category, op, and expected');
    assert(generatedMd.includes('### cURL Example'), 'Markdown includes cURL example header');
    assert(generatedMd.includes('curl -X GET') && generatedMd.includes('curl -X POST'), 'Markdown includes generated cURL commands for both requests');
    assert(generatedMd.includes('**Status**: `200` (38 ms)'), 'Markdown includes sample response status and latency');
    assert(generatedMd.includes('Smart Watch'), 'Markdown includes sample response payload');
    assert(generatedMd.includes('No sample response recorded yet'), 'Markdown includes graceful placeholder for requests lacking sample response');

    // 4. Standalone HTML5 Documentation Generation & XSS Protection
    console.log('  Testing standalone HTML5 documentation generation & XSS sanitization');
    const xssAttackCollection = {
      name: '<script>alert("pwned-title")</script>',
      description: '<img src=x onerror=alert("pwned-desc")>'
    };
    const xssAttackRequests = [
      {
        id: 201,
        name: '"><script>alert("pwned-req-name")</script>',
        method: 'POST',
        url: 'https://example.com/api?user=<svg onload=alert(1)>',
        description: '<b>XSS Test</b> <iframe src="javascript:alert(1)"></iframe>',
        headers: [
          { key: 'X-Injected', value: '"><script>alert("pwned-hdr")</script>', enabled: true }
        ],
        body: JSON.stringify({ payload: '"><script>alert("pwned-body")</script>' }),
        body_type: 'json',
        assertions: [
          { id: 'as-xss', type: 'status_code', property: '<script>', operator: 'equals', expected: '<script>alert(1)</script>', enabled: true }
        ]
      }
    ];

    const generatedHtml = generateCollectionHtml(xssAttackCollection, xssAttackRequests);

    assert(generatedHtml.startsWith('<!DOCTYPE html>'), 'HTML output is valid HTML5 document');
    assert(generatedHtml.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0">'), 'HTML output includes responsive viewport meta');
    assert(generatedHtml.includes('@media (prefers-color-scheme: dark)'), 'HTML output embeds dark mode system theme CSS');
    assert(generatedHtml.includes('class="sidebar"') && generatedHtml.includes('class="main"'), 'HTML output includes responsive sidebar and main layout');
    assert(generatedHtml.includes('class="badge badge-post">POST</span>'), 'HTML output renders styled POST badge');
    assert(generatedHtml.includes('class="copy-btn"'), 'HTML output includes copy cURL and copy body buttons');
    assert(!generatedHtml.includes('onclick='), 'HTML output strictly prohibits inline unsafe onclick handlers');
    assert(!generatedHtml.includes('javascript:alert'), 'HTML output prohibits javascript: URIs');

    // Strict XSS Verification
    assert(!generatedHtml.includes('<script>alert("pwned-title")</script>'), 'Title script tag is sanitized and neutralized');
    assert(generatedHtml.includes('&lt;script&gt;alert(&quot;pwned-title&quot;)&lt;/script&gt;'), 'Title is safely HTML-escaped');
    assert(!generatedHtml.includes('onerror=alert("pwned-desc")'), 'Description image onerror is sanitized');
    assert(!generatedHtml.includes('<iframe'), 'Description iframe tag is neutralized');
    assert(!generatedHtml.includes('<script>alert("pwned-req-name")</script>'), 'Request name script tag is sanitized');
    assert(!generatedHtml.includes('<script>alert("pwned-hdr")</script>'), 'Header value script tag is sanitized');
    assert(!generatedHtml.includes('<svg onload=alert(1)>'), 'URL onload attack is neutralized');

    // -------------------------------------------------------------
    // Section 13: Backend HTTP API Integration (Step 4)
    // -------------------------------------------------------------
    console.log('\n[SECTION 13] Backend HTTP API Integration (Step 4)');

    // 13.1 Create a dedicated collection and requests for API endpoint testing
    const apiCol = await collectionService.createCollection({
      name: 'API Integration Test Collection',
      description: 'Collection designed for verifying Step 4 HTTP API endpoints'
    });
    createdCollectionIds.push(apiCol.id);

    const apiReq1 = await savedRequestService.createSavedRequest({
      name: 'List Resources API',
      description: 'Fetches list of available resources',
      collection_id: apiCol.id,
      method: 'GET',
      url: 'https://api.example.com/v1/resources',
      headers: [
        { key: 'Accept', value: 'application/json', enabled: true },
        { key: 'Authorization', value: 'Bearer secret_api_token', enabled: true } // sensitive header to be sanitized
      ],
      params: [{ key: 'limit', value: '25', enabled: true }],
      body: '',
      body_type: 'none',
      auth_type: 'none',
      assertions: [
        { id: 'ast_api_1', type: 'status_code', operator: 'equals', expected: 200, enabled: true }
      ]
    });
    createdSavedRequestIds.push(apiReq1.id);

    const apiReq2 = await savedRequestService.createSavedRequest({
      name: 'Create Resource API',
      description: 'Creates a new resource with payload',
      collection_id: apiCol.id,
      method: 'POST',
      url: 'https://api.example.com/v1/resources',
      headers: [
        { key: 'Content-Type', value: 'application/json', enabled: true },
        { key: 'Cookie', value: 'session=secret_cookie', enabled: true } // sensitive header to be sanitized
      ],
      params: [],
      body: '{"name":"Sample Item","token":"enc:v1:0123456789abcdef:fedcba9876543210:deadbeef"}',
      body_type: 'json',
      auth_type: 'none',
      assertions: [
        { id: 'ast_api_2', type: 'status_code', operator: 'equals', expected: 201, enabled: true }
      ]
    });
    createdSavedRequestIds.push(apiReq2.id);

    // Insert sample execution history for apiReq1
    const [apiHistRes] = await executeQuery(
      `INSERT INTO request_history (
        request_name, method, url, response_status, response_headers, response_body, response_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'List Resources API History',
        'GET',
        'https://api.example.com/v1/resources?limit=25',
        200,
        JSON.stringify({ 'content-type': 'application/json', 'set-cookie': 'secret_cookie=123' }),
        JSON.stringify({ data: [{ id: 1, name: 'First Resource' }], enc_vault: 'enc:v1:0123456789abcdef:fedcba9876543210:deadbeef' }),
        42
      ]
    );
    createdHistoryIds.push(apiHistRes.insertId);

    // --- Sub-section A: GET /api/collections/:id/export ---
    console.log('  Testing GET /api/collections/:id/export');

    // 13.2 Valid export
    const exportRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/collections/${apiCol.id}/export`
    });
    assert(exportRes.statusCode === 200, 'GET /api/collections/:id/export responds with 200 OK');
    assert(
      exportRes.headers['content-type']?.includes('application/json'),
      'Export Content-Type is application/json'
    );
    assert(
      exportRes.headers['content-disposition']?.includes('attachment') &&
      exportRes.headers['content-disposition']?.includes('filename="API_Integration_Test_Collection.json"'),
      'Export Content-Disposition has attachment with sanitized filename'
    );
    assert(exportRes.body && exportRes.body.schema === 'devprobe/v1', 'Exported schema is devprobe/v1');
    assert(exportRes.body.version === '1.0.0', 'Exported version is 1.0.0');
    assert(exportRes.body.collection.name === 'API Integration Test Collection', 'Exported collection name matches');
    assert(Array.isArray(exportRes.body.collection.requests), 'Exported requests is an array');
    assert(exportRes.body.collection.requests.length === 2, 'Exported collection contains 2 requests');

    // Verify credential stripping in export response
    const apiExportedReq1 = exportRes.body.collection.requests.find((r) => r.name === 'List Resources API');
    const authHdr = apiExportedReq1?.headers?.find((h) => h.key.toLowerCase() === 'authorization');
    assert(!authHdr, 'Export strictly strips sensitive Authorization header');

    const apiExportedReq2 = exportRes.body.collection.requests.find((r) => r.name === 'Create Resource API');
    const cookieHdr = apiExportedReq2?.headers?.find((h) => h.key.toLowerCase() === 'cookie');
    assert(!cookieHdr, 'Export strictly strips sensitive Cookie header');
    assert(
      apiExportedReq2?.body && !apiExportedReq2.body.includes('enc:v1:'),
      'Export redacts local encryption ciphertexts'
    );
    assert(
      apiExportedReq2?.body && apiExportedReq2.body.includes('[REDACTED_SECRET]'),
      'Export replaces ciphertexts with [REDACTED_SECRET]'
    );

    // 13.3 Nonexistent collection ID returns 404
    const export404Res = await makeRequest(server, {
      method: 'GET',
      path: '/api/collections/999999/export'
    });
    assert(export404Res.statusCode === 404, 'GET /api/collections/999999/export returns 404');
    assert(export404Res.body && export404Res.body.success === false, '404 export returns success: false');

    // 13.4 Invalid collection ID returns 400
    const export400Alpha = await makeRequest(server, {
      method: 'GET',
      path: '/api/collections/invalid-id/export'
    });
    assert(export400Alpha.statusCode === 400, 'GET /api/collections/invalid-id/export returns 400');
    assert(export400Alpha.body?.error?.code === 'INVALID_COLLECTION_ID', 'Invalid ID error code is INVALID_COLLECTION_ID');

    const export400Neg = await makeRequest(server, {
      method: 'GET',
      path: '/api/collections/-10/export'
    });
    assert(export400Neg.statusCode === 400, 'GET /api/collections/-10/export returns 400');

    // 13.5 Query param download=false sets inline disposition
    const exportInlineRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/collections/${apiCol.id}/export?download=false`
    });
    assert(exportInlineRes.statusCode === 200, 'GET export with download=false returns 200');
    assert(
      exportInlineRes.headers['content-disposition']?.startsWith('inline'),
      'Export with download=false sets inline Content-Disposition'
    );

    // --- Sub-section B: POST /api/collections/import ---
    console.log('  Testing POST /api/collections/import');

    // 13.6 Valid collection import
    const validImportPayload = {
      version: '1.0.0',
      schema: 'devprobe/v1',
      exported_at: new Date().toISOString(),
      collection: {
        name: 'HTTP Imported API Collection',
        description: 'Imported via POST /api/collections/import endpoint test',
        requests: [
          {
            name: 'Imported Endpoint 1',
            description: 'First imported endpoint',
            method: 'GET',
            url: 'https://api.example.com/items',
            headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
            params: [{ key: 'page', value: '1', enabled: true }],
            body: '',
            body_type: 'none',
            auth_type: 'none',
            assertions: [{ id: 'imp-assert-1', type: 'status_code', operator: 'equals', expected: 200, enabled: true }]
          },
          {
            name: 'Imported Endpoint 2',
            description: 'Second imported endpoint',
            method: 'POST',
            url: 'https://api.example.com/items',
            headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
            params: [],
            body: '{"item":"widget"}',
            body_type: 'json',
            auth_type: 'none',
            assertions: [{ id: 'imp-assert-2', type: 'status_code', operator: 'equals', expected: 201, enabled: true }]
          }
        ]
      }
    };

    const importRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/collections/import',
      body: validImportPayload
    });
    assert(importRes.statusCode === 201, 'POST /api/collections/import responds with 201 Created');
    assert(importRes.body && importRes.body.success === true, 'Import response indicates success');
    assert(importRes.body.message === 'Collection imported successfully', 'Import success message is accurate');
    assert(importRes.body.data && importRes.body.data.id > 0, 'Import returns created collection ID');
    assert(importRes.body.data.name === 'HTTP Imported API Collection', 'Imported collection name matches');
    assert(importRes.body.data.requests_count === 2, 'Imported requests count is 2');
    assert(Array.isArray(importRes.body.data.requests) && importRes.body.data.requests.length === 2, 'Import returns 2 inserted requests');

    if (importRes.body?.data?.id) {
      createdCollectionIds.push(importRes.body.data.id);
    }
    if (Array.isArray(importRes.body?.data?.requests)) {
      for (const r of importRes.body.data.requests) {
        if (r.id) createdSavedRequestIds.push(r.id);
      }
    }

    // 13.7 Verify imported collection physically exists in database
    const verifyImportedCol = await collectionService.getCollectionById(importRes.body.data.id);
    assert(verifyImportedCol !== null, 'Imported collection exists in database');
    assert(verifyImportedCol.name === 'HTTP Imported API Collection', 'Database collection name matches import');

    const verifyImportedReqs = await savedRequestService.getSavedRequests({ collectionId: importRes.body.data.id });
    assert(verifyImportedReqs.length === 2, 'Database contains exactly 2 imported requests');
    assert(verifyImportedReqs[0].assertions.length === 1, 'Imported request assertions persisted in database');

    // 13.8 Invalid import payload — unsupported schema
    const invalidSchemaRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/collections/import',
      body: {
        version: '1.0.0',
        schema: 'unsupported/schema',
        collection: { name: 'Bad Schema', requests: [] }
      }
    });
    assert(invalidSchemaRes.statusCode === 400, 'Import with unsupported schema returns 400');
    assert(invalidSchemaRes.body?.error?.code === 'UNSUPPORTED_SCHEMA', 'Error code is UNSUPPORTED_SCHEMA');

    // 13.9 Invalid import payload — unsupported version
    const invalidVerRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/collections/import',
      body: {
        version: '2.0.0',
        schema: 'devprobe/v1',
        collection: { name: 'Bad Version', requests: [] }
      }
    });
    assert(invalidVerRes.statusCode === 400, 'Import with SemVer 2.0.0 returns 400');

    // 13.10 Invalid import payload — empty collection name
    const emptyNameRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/collections/import',
      body: {
        version: '1.0.0',
        schema: 'devprobe/v1',
        collection: { name: '   ', requests: [] }
      }
    });
    assert(emptyNameRes.statusCode === 400, 'Import with empty collection name returns 400');

    // 13.11 Invalid import payload — embedded URL credentials
    const urlCredRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/collections/import',
      body: {
        version: '1.0.0',
        schema: 'devprobe/v1',
        collection: {
          name: 'Cred Leak Collection',
          requests: [
            {
              name: 'Leak Req',
              method: 'GET',
              url: 'https://admin:password@api.example.com/data'
            }
          ]
        }
      }
    });
    assert(urlCredRes.statusCode === 400, 'Import with embedded URL credentials returns 400');

    // 13.12 Invalid import payload — malformed JSON body in POST request
    const malformedJsonRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/collections/import',
      headers: { 'Content-Type': 'application/json' },
      body: '{"version": "1.0.0", "collection": { INVALID JSON SYNTAX'
    });
    assert(malformedJsonRes.statusCode === 400, 'Import with malformed raw JSON returns 400');
    assert(malformedJsonRes.body?.error?.code === 'INVALID_JSON', 'Malformed JSON error code is INVALID_JSON');

    // --- Sub-section C: GET /api/collections/:id/docs/markdown ---
    console.log('  Testing GET /api/collections/:id/docs/markdown');

    // 13.13 Valid Markdown documentation generation
    const mdRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/collections/${apiCol.id}/docs/markdown`
    });
    assert(mdRes.statusCode === 200, 'GET /api/collections/:id/docs/markdown responds with 200 OK');
    assert(
      mdRes.headers['content-type']?.includes('text/markdown'),
      'Markdown Content-Type is text/markdown'
    );
    assert(
      mdRes.headers['content-disposition']?.includes('attachment') &&
      mdRes.headers['content-disposition']?.includes('filename="API_Integration_Test_Collection.md"'),
      'Markdown Content-Disposition has attachment with sanitized .md filename'
    );
    assert(mdRes.rawText.includes('# API Integration Test Collection'), 'Markdown contains H1 collection title');
    assert(mdRes.rawText.includes('## Table of Contents'), 'Markdown contains Table of Contents section');
    assert(mdRes.rawText.includes('**Method**: `GET`') && mdRes.rawText.includes('https://api.example.com/v1/resources'), 'Markdown documents endpoint GET method and URL');
    assert(mdRes.rawText.includes('**Method**: `POST`') && mdRes.rawText.includes('https://api.example.com/v1/resources'), 'Markdown documents endpoint POST method and URL');
    assert(mdRes.rawText.includes('### cURL Example'), 'Markdown contains cURL snippets');
    assert(mdRes.rawText.includes('curl -X GET'), 'Markdown includes generated GET cURL');
    assert(mdRes.rawText.includes('### Sample Response') && mdRes.rawText.includes('**Status**: `200`'), 'Markdown includes sample response section from history');
    assert(mdRes.rawText.includes('First Resource'), 'Markdown displays sample response body');

    // 13.14 Nonexistent collection for Markdown returns 404
    const md404Res = await makeRequest(server, {
      method: 'GET',
      path: '/api/collections/999999/docs/markdown'
    });
    assert(md404Res.statusCode === 404, 'Markdown for nonexistent collection returns 404');

    // 13.15 Invalid ID for Markdown returns 400
    const md400Res = await makeRequest(server, {
      method: 'GET',
      path: '/api/collections/non-numeric/docs/markdown'
    });
    assert(md400Res.statusCode === 400, 'Markdown for non-numeric ID returns 400');
    assert(md400Res.body?.error?.code === 'INVALID_COLLECTION_ID', 'Invalid collection ID code is INVALID_COLLECTION_ID');

    // 13.16 Query download=false sets inline disposition for Markdown
    const mdInlineRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/collections/${apiCol.id}/docs/markdown?download=false`
    });
    assert(mdInlineRes.statusCode === 200, 'Markdown with download=false returns 200');
    assert(
      mdInlineRes.headers['content-disposition']?.startsWith('inline'),
      'Markdown with download=false sets inline disposition'
    );

    // --- Sub-section D: GET /api/collections/:id/docs/html ---
    console.log('  Testing GET /api/collections/:id/docs/html');

    // 13.17 Valid HTML documentation generation
    const htmlRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/collections/${apiCol.id}/docs/html`
    });
    assert(htmlRes.statusCode === 200, 'GET /api/collections/:id/docs/html responds with 200 OK');
    assert(
      htmlRes.headers['content-type']?.includes('text/html'),
      'HTML Content-Type is text/html'
    );
    assert(
      htmlRes.headers['content-disposition']?.includes('attachment') &&
      htmlRes.headers['content-disposition']?.includes('filename="API_Integration_Test_Collection.html"'),
      'HTML Content-Disposition has attachment with sanitized .html filename'
    );
    assert(htmlRes.rawText.includes('<!DOCTYPE html>'), 'HTML output is valid HTML5 document');
    assert(htmlRes.rawText.includes('<meta name="viewport"'), 'HTML contains viewport meta tag');
    assert(htmlRes.rawText.includes('@media (prefers-color-scheme: dark)'), 'HTML embeds system dark mode styles');
    assert(htmlRes.rawText.includes('API Integration Test Collection'), 'HTML contains collection title');
    assert(htmlRes.rawText.includes('badge-get'), 'HTML renders method badges');
    assert(htmlRes.rawText.includes('badge-post'), 'HTML renders POST badge');
    assert(htmlRes.rawText.includes('copy-btn'), 'HTML includes copy buttons');
    assert(!htmlRes.rawText.includes('onclick='), 'HTML prohibits inline unsafe onclick handlers');

    // 13.18 Nonexistent collection for HTML returns 404
    const html404Res = await makeRequest(server, {
      method: 'GET',
      path: '/api/collections/999999/docs/html'
    });
    assert(html404Res.statusCode === 404, 'HTML for nonexistent collection returns 404');

    // 13.19 Invalid ID for HTML returns 400
    const html400Res = await makeRequest(server, {
      method: 'GET',
      path: '/api/collections/invalid-id/docs/html'
    });
    assert(html400Res.statusCode === 400, 'HTML for invalid ID returns 400');

    // 13.20 Query download=false sets inline disposition for HTML
    const htmlInlineRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/collections/${apiCol.id}/docs/html?download=false`
    });
    assert(htmlInlineRes.statusCode === 200, 'HTML with download=false returns 200');
    assert(
      htmlInlineRes.headers['content-disposition']?.startsWith('inline'),
      'HTML with download=false sets inline disposition'
    );

    // --- Sub-section E: Security, Redaction & Filename Sanitization ---
    console.log('  Testing Security, Redaction & Filename Sanitization');

    // 13.21 Filename sanitization against CRLF injection and path traversal
    const evilCol = await collectionService.createCollection({
      name: 'Evil "Collection" \r\nInjected-Header: evil\t/../../etc/passwd',
      description: 'Collection with dangerous header characters'
    });
    createdCollectionIds.push(evilCol.id);

    const evilExportRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/collections/${evilCol.id}/export`
    });
    const evilDisp = evilExportRes.headers['content-disposition'] || '';
    assert(!evilDisp.includes('\r'), 'Content-Disposition strictly strips \\r to prevent CRLF injection');
    assert(!evilDisp.includes('\n'), 'Content-Disposition strictly strips \\n to prevent CRLF injection');
    assert(!evilDisp.includes('/'), 'Content-Disposition strips forward slashes to prevent directory traversal');
    assert(!evilDisp.includes('\\'), 'Content-Disposition strips backslashes');
    assert(evilDisp.includes('.json'), 'Content-Disposition maintains safe .json extension');

    // 13.22 XSS Sanitization in HTML documentation endpoint
    const xssCol = await collectionService.createCollection({
      name: 'XSS <script>alert("col-name")</script>',
      description: 'Desc with <img src=x onerror=alert("col-desc")> attack'
    });
    createdCollectionIds.push(xssCol.id);

    const xssReq = await savedRequestService.createSavedRequest({
      name: 'XSS Req <script>alert("req-name")</script>',
      description: 'Req desc <iframe src="javascript:alert(1)">',
      collection_id: xssCol.id,
      method: 'GET',
      url: 'https://api.example.com/xss?param=<script>alert(1)</script>',
      headers: [{ key: 'X-Attack', value: '<svg onload=alert(1)>', enabled: true }]
    });
    createdSavedRequestIds.push(xssReq.id);

    const xssHtmlRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/collections/${xssCol.id}/docs/html`
    });
    assert(!xssHtmlRes.rawText.includes('<script>alert("col-name")</script>'), 'HTML doc neutralizes collection name script tag');
    assert(xssHtmlRes.rawText.includes('&lt;script&gt;alert(&quot;col-name&quot;)&lt;/script&gt;'), 'HTML doc HTML-escapes collection name');
    assert(!xssHtmlRes.rawText.includes('onerror=alert("col-desc")'), 'HTML doc neutralizes image onerror payload');
    assert(!xssHtmlRes.rawText.includes('<script>alert("req-name")</script>'), 'HTML doc neutralizes request name script tag');
    assert(!xssHtmlRes.rawText.includes('<iframe'), 'HTML doc neutralizes iframe injection');
    assert(!xssHtmlRes.rawText.includes('<svg onload=alert(1)>'), 'HTML doc neutralizes SVG onload injection');

    // 13.23 Secret redaction verification across Markdown & HTML endpoints
    assert(!mdRes.rawText.includes('secret_api_token'), 'Markdown docs strictly omit sensitive Authorization token');
    assert(!mdRes.rawText.includes('secret_cookie'), 'Markdown docs strictly omit Set-Cookie / Cookie session tokens');
    assert(!mdRes.rawText.includes('enc:v1:'), 'Markdown docs strictly redact local host ciphertexts');
    assert(mdRes.rawText.includes('[REDACTED_SECRET]'), 'Markdown docs substitute ciphertext with [REDACTED_SECRET]');

    assert(!htmlRes.rawText.includes('secret_api_token'), 'HTML docs strictly omit sensitive Authorization token');
    assert(!htmlRes.rawText.includes('secret_cookie'), 'HTML docs strictly omit Set-Cookie / Cookie session tokens');
    assert(!htmlRes.rawText.includes('enc:v1:'), 'HTML docs strictly redact local host ciphertexts');
    assert(htmlRes.rawText.includes('[REDACTED_SECRET]'), 'HTML docs substitute ciphertext with [REDACTED_SECRET]');

    // --- Sub-section F: Regression of Existing Collection CRUD Routes ---
    console.log('  Testing Regression of Existing Collection CRUD Routes');

    // 13.24 GET /api/collections
    const crudListRes = await makeRequest(server, {
      method: 'GET',
      path: '/api/collections'
    });
    assert(crudListRes.statusCode === 200, 'GET /api/collections responds with 200 OK');
    assert(crudListRes.body && crudListRes.body.success === true, 'GET /api/collections returns success: true');
    assert(Array.isArray(crudListRes.body.data), 'GET /api/collections returns array of collections');

    // 13.25 POST /api/collections
    const crudCreateRes = await makeRequest(server, {
      method: 'POST',
      path: '/api/collections',
      body: {
        name: 'CRUD Regression Test Collection',
        description: 'Verifies existing collection creation remains intact'
      }
    });
    assert(crudCreateRes.statusCode === 201, 'POST /api/collections responds with 201 Created');
    assert(crudCreateRes.body && crudCreateRes.body.success === true, 'POST /api/collections returns success: true');
    assert(crudCreateRes.body.data.name === 'CRUD Regression Test Collection', 'Created collection name matches');
    const crudColId = crudCreateRes.body.data.id;
    if (crudColId) createdCollectionIds.push(crudColId);

    // 13.26 GET /api/collections/:id
    const crudGetRes = await makeRequest(server, {
      method: 'GET',
      path: `/api/collections/${crudColId}`
    });
    assert(crudGetRes.statusCode === 200, 'GET /api/collections/:id responds with 200 OK');
    assert(crudGetRes.body.data.id === crudColId, 'GET /api/collections/:id returns matching collection');

    // 13.27 PUT /api/collections/:id
    const crudPutRes = await makeRequest(server, {
      method: 'PUT',
      path: `/api/collections/${crudColId}`,
      body: {
        name: 'CRUD Regression Test Collection (Renamed)',
        description: 'Updated collection description'
      }
    });
    assert(crudPutRes.statusCode === 200, 'PUT /api/collections/:id responds with 200 OK');
    assert(crudPutRes.body.data.name === 'CRUD Regression Test Collection (Renamed)', 'PUT /api/collections/:id updates name');

    // 13.28 DELETE /api/collections/:id
    const crudDelRes = await makeRequest(server, {
      method: 'DELETE',
      path: `/api/collections/${crudColId}`
    });
    assert(crudDelRes.statusCode === 200, 'DELETE /api/collections/:id responds with 200 OK');
    assert(crudDelRes.body.data.deleted === true, 'DELETE /api/collections/:id indicates deleted');

    // Verify collection is now deleted
    const verifyDeleted = await collectionService.getCollectionById(crudColId);
    assert(verifyDeleted === null, 'Deleted collection no longer exists in database');


  } catch (err) {
    console.error('Fatal error during test suite execution:', err);
    process.exitCode = 1;
  } finally {
    // -------------------------------------------------------------
    // Cleanup & Teardown
    // -------------------------------------------------------------
    console.log('\n[CLEANUP] Cleaning up test records and connections...');

    // Close server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    // Delete created saved requests
    for (const reqId of createdSavedRequestIds) {
      try {
        await executeQuery('DELETE FROM saved_requests WHERE id = ?', [reqId]);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Delete created collections
    for (const colId of createdCollectionIds) {
      try {
        await executeQuery('DELETE FROM collections WHERE id = ?', [colId]);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Delete created history records
    for (const histId of createdHistoryIds) {
      try {
        await executeQuery('DELETE FROM request_history WHERE id = ?', [histId]);
      } catch {
        // Ignore cleanup errors
      }
    }

    await closePool();
    console.log('Teardown complete.');

    console.log('\n============================================================');
    console.log(`  Day 15 Steps 1, 2, 3 & 4 Tests Finished: ${passedTests}/${totalTests} Passed`);
    console.log('============================================================\n');
  }
}

runTests();

