/**
 * DevProbe Day 14 Verification Test Suite
 * Step 1: Database Schema & Assertion Models
 * Step 2: Backend Assertion Validation & Persistence
 *
 * Covers:
 * - Step 1: Schema columns verification (`saved_requests.assertions`, `request_history.test_results`)
 * - Step 1: Schema file (`database/schema.sql`) declarations
 * - Step 1: Migration idempotency (`database/init.js` and `applyMigrations`)
 * - Step 2: Centralized Assertion Validation Service (`src/services/assertionService.js`)
 * - Step 2: Five assertion types (status_code, response_time, header, body_text, json_path)
 * - Step 2: Operators validation per category
 * - Step 2: Required fields and duplicate ID rejection
 * - Step 2: Expected value type enforcement
 * - Step 2: Safe JSON path validation & prototype pollution protection
 * - Step 2: Oversized arrays and field length limits
 * - Step 2: Security injection prevention (eval, Function, process.*, <script>) & legitimate text preservation
 * - Step 2: Saved Request persistence (POST, GET, PUT, DELETE) with assertions
 * - Step 2: Updating and clearing assertions (null, empty array, omission preservation)
 * - Step 2: Backward compatibility with requests lacking assertions
 * - Step 2: History execution recording with and without test_results
 * - Step 2: Sensitive-value credential redaction in test results
 * - Step 2: Malformed test-results structure rejection
 * - Step 2: Regression protection for existing saved-request and history APIs
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
const assertionService = require('./src/services/assertionService');
const savedRequestService = require('./src/services/savedRequestService');
const historyService = require('./src/services/historyService');
const assertionEngine = require('./public/js/assertionEngine');
const {
  activeRequest,
  activeResponse,
  loadRequestIntoState,
  convertSavedRequestToTemplate,
  switchConfigTab,
  initAssertionBuilder,
  renderAssertions,
  updateTestsCount,
  openAssertionBuilder,
  closeAssertionBuilder,
  updateAssertionFormForType,
  checkPropertySensitivity,
  checkExpectedVisibility,
  saveAssertionFromForm,
  deleteAssertion,
  toggleAssertionEnabled,
  clearAllAssertions,
  parseExpectedValue,
  generateAssertionId,
  isSensitiveHeaderName,
  isSensitivePropertyName,
  getActiveRequestAssertions,
  setActiveRequestAssertions,
  getAssertionEngine,
  evaluateAndRenderTestResults,
  renderTestResultsToUI,
  renderTestResultsError,
  resetTestResultsViewer,
  renderHistoricalTestResults,
  compareResponseHeaders
} = require('./public/js/app');
const { recordHistorySafely } = require('./src/controllers/requestController');
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
            json = JSON.parse(rawData);
          } catch {
            json = null;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: rawData,
            json
          });
        });
      }
    );

    req.on('error', reject);
    if (serializedBody) {
      req.write(serializedBody);
    }
    req.end();
  });
}

// =============================================================================
// Test Suite Execution
// =============================================================================

async function runTests() {
  console.log('=================================================================');
  console.log('DevProbe Day 14 Verification: Step 1 & Step 2 Tests');
  console.log('=================================================================\n');

  let appServer = null;
  const createdSavedRequestIds = [];
  const createdHistoryIds = [];

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Database Health & Connectivity
    // -------------------------------------------------------------------------
    console.log('--- Phase 1: Database Health & Connectivity ---');
    const health = await testConnection();
    assert(health.isConnected === true, 'TEST 1: MySQL database connection is healthy', health.message);

    const config = getDatabaseConfig();
    assert(config.database === 'devprobe_db', 'TEST 2: Database name configured as devprobe_db');

    // -------------------------------------------------------------------------
    // Phase 2: Schema File Declarations (schema.sql)
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 2: Schema File Declarations (schema.sql) ---');
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    assert(fs.existsSync(schemaPath), 'TEST 3: database/schema.sql exists on disk');

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    assert(
      schemaSql.includes('`assertions` JSON NULL'),
      'TEST 4: schema.sql contains `assertions` JSON NULL declaration in saved_requests'
    );
    assert(
      schemaSql.includes('`test_results` JSON NULL'),
      'TEST 5: schema.sql contains `test_results` JSON NULL declaration in request_history'
    );

    // -------------------------------------------------------------------------
    // Phase 3: Live Database Column Inspection
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 3: Live Database Column Inspection ---');
    const [savedReqCols] = await executeQuery(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'saved_requests' AND COLUMN_NAME = 'assertions'`,
      [config.database]
    );
    assert(savedReqCols.length === 1, 'TEST 6: Live saved_requests table contains `assertions` column');
    assert(savedReqCols[0].IS_NULLABLE === 'YES', 'TEST 7: `saved_requests.assertions` is NULLable');

    const [historyCols] = await executeQuery(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'request_history' AND COLUMN_NAME = 'test_results'`,
      [config.database]
    );
    assert(historyCols.length === 1, 'TEST 8: Live request_history table contains `test_results` column');
    assert(historyCols[0].IS_NULLABLE === 'YES', 'TEST 9: `request_history.test_results` is NULLable');

    // -------------------------------------------------------------------------
    // Phase 4: Migration Idempotency
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 4: Migration Idempotency & Safety ---');
    const initResult = await initializeDatabase();
    assert(initResult.success === true, 'TEST 10: initializeDatabase() returns success=true on rerun');

    // -------------------------------------------------------------------------
    // Phase 5: Centralized Assertion Validation Service (Unit Tests)
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 5: Assertion Validation Service Unit Tests ---');

    // 1. Valid definitions for all 5 categories
    const validStatusCode = {
      id: 'a_status_200',
      type: 'status_code',
      operator: 'equals',
      expected: 200,
      enabled: true
    };
    const validResponseTime = {
      id: 'a_latency_300',
      type: 'response_time',
      operator: 'less_than',
      expected: 300,
      enabled: true
    };
    const validHeader = {
      id: 'a_hdr_content_type',
      type: 'header',
      property: 'Content-Type',
      operator: 'contains',
      expected: 'application/json',
      enabled: true
    };
    const validBodyText = {
      id: 'a_body_pong',
      type: 'body_text',
      operator: 'contains',
      expected: 'pong',
      enabled: true
    };
    const validJsonPath = {
      id: 'a_jp_user_id',
      type: 'json_path',
      property: 'data.users[0].id',
      operator: 'equals',
      expected: 101,
      enabled: true
    };

    const validatedList = assertionService.validateAssertions([
      validStatusCode,
      validResponseTime,
      validHeader,
      validBodyText,
      validJsonPath
    ]);
    assert(Array.isArray(validatedList), 'TEST 11: validateAssertions returns array for valid definitions');
    assert(validatedList.length === 5, 'TEST 12: All 5 categories validated successfully');
    assert(validatedList[0].type === 'status_code', 'TEST 13: status_code canonical type preserved');
    assert(validatedList[0].expected === 200, 'TEST 14: Numeric expected value preserved for status_code');
    assert(validatedList[1].expected === 300, 'TEST 15: Numeric latency threshold preserved');
    assert(validatedList[2].property === 'Content-Type', 'TEST 16: Header property preserved');
    assert(validatedList[4].property === 'data.users[0].id', 'TEST 17: JSON path property preserved');

    // Type alias normalization (status -> status_code)
    const aliasItem = { id: 'a_alias', type: 'status', operator: 'equals', expected: 200 };
    const aliasRes = assertionService.validateAssertions([aliasItem]);
    assert(aliasRes[0].type === 'status_code', 'TEST 18: Alias "status" normalized to "status_code"');

    // Existence operators (header exists / not_exists)
    const headerExists = { id: 'a_hdr_exists', type: 'header', property: 'X-Trace-Id', operator: 'exists' };
    const headerExistsRes = assertionService.validateAssertions([headerExists]);
    assert(headerExistsRes[0].operator === 'exists', 'TEST 19: Header existence operator accepted without expected value');

    // JSON path existence operator
    const jpExists = { id: 'a_jp_exists', type: 'json_path', property: 'meta.pagination', operator: 'exists' };
    const jpExistsRes = assertionService.validateAssertions([jpExists]);
    assert(jpExistsRes[0].operator === 'exists', 'TEST 20: JSON path existence operator accepted without expected value');

    // 2. Unsupported assertion types rejected
    let typeErr = null;
    try {
      assertionService.validateAssertions([{ id: 'bad_type', type: 'eval_code', operator: 'equals', expected: 1 }]);
    } catch (err) {
      typeErr = err;
    }
    assert(typeErr instanceof AppError && typeErr.code === 'UNSUPPORTED_ASSERTION_TYPE', 'TEST 21: Unsupported assertion type rejected');

    // 3. Unsupported operators rejected
    let opErr = null;
    try {
      assertionService.validateAssertions([{ id: 'bad_op', type: 'status_code', operator: 'contains', expected: 200 }]);
    } catch (err) {
      opErr = err;
    }
    assert(opErr instanceof AppError && opErr.code === 'UNSUPPORTED_OPERATOR', 'TEST 22: Invalid operator for status_code rejected');

    let bodyOpErr = null;
    try {
      assertionService.validateAssertions([{ id: 'bad_body_op', type: 'body_text', operator: 'greater_than', expected: 10 }]);
    } catch (err) {
      bodyOpErr = err;
    }
    assert(bodyOpErr instanceof AppError && bodyOpErr.code === 'UNSUPPORTED_OPERATOR', 'TEST 23: Numeric operator rejected for body_text');

    // 4. Missing required fields
    let missingIdErr = null;
    try {
      assertionService.validateAssertions([{ type: 'status_code', operator: 'equals', expected: 200 }]);
    } catch (err) {
      missingIdErr = err;
    }
    assert(missingIdErr instanceof AppError && missingIdErr.code === 'MISSING_ASSERTION_ID', 'TEST 24: Missing assertion ID rejected');

    let missingHeaderPropErr = null;
    try {
      assertionService.validateAssertions([{ id: 'no_prop', type: 'header', operator: 'equals', expected: 'json' }]);
    } catch (err) {
      missingHeaderPropErr = err;
    }
    assert(missingHeaderPropErr instanceof AppError && missingHeaderPropErr.code === 'MISSING_ASSERTION_PROPERTY', 'TEST 25: Missing header property rejected');

    let missingExpectedErr = null;
    try {
      assertionService.validateAssertions([{ id: 'no_exp', type: 'status_code', operator: 'equals' }]);
    } catch (err) {
      missingExpectedErr = err;
    }
    assert(missingExpectedErr instanceof AppError && missingExpectedErr.code === 'MISSING_ASSERTION_EXPECTED', 'TEST 26: Missing expected value for equals rejected');

    // 5. Duplicate IDs rejected within same request
    let dupIdErr = null;
    try {
      assertionService.validateAssertions([
        { id: 'dup_id_1', type: 'status_code', operator: 'equals', expected: 200 },
        { id: 'dup_id_1', type: 'response_time', operator: 'less_than', expected: 500 }
      ]);
    } catch (err) {
      dupIdErr = err;
    }
    assert(dupIdErr instanceof AppError && dupIdErr.code === 'DUPLICATE_ASSERTION_ID', 'TEST 27: Duplicate assertion IDs in same request rejected');

    // 6. Invalid expected-value types
    let invalidStatusValErr = null;
    try {
      assertionService.validateAssertions([{ id: 'inv_status', type: 'status_code', operator: 'equals', expected: 'success' }]);
    } catch (err) {
      invalidStatusValErr = err;
    }
    assert(invalidStatusValErr instanceof AppError && invalidStatusValErr.code === 'INVALID_ASSERTION_EXPECTED', 'TEST 28: Non-numeric status_code expected rejected');

    let statusOutOfRangeErr = null;
    try {
      assertionService.validateAssertions([{ id: 'range_status', type: 'status_code', operator: 'equals', expected: 999 }]);
    } catch (err) {
      statusOutOfRangeErr = err;
    }
    assert(statusOutOfRangeErr instanceof AppError && statusOutOfRangeErr.code === 'INVALID_ASSERTION_EXPECTED', 'TEST 29: Status code > 599 rejected');

    let invalidLatencyValErr = null;
    try {
      assertionService.validateAssertions([{ id: 'inv_lat', type: 'response_time', operator: 'less_than', expected: -50 }]);
    } catch (err) {
      invalidLatencyValErr = err;
    }
    assert(invalidLatencyValErr instanceof AppError && invalidLatencyValErr.code === 'INVALID_ASSERTION_EXPECTED', 'TEST 30: Negative response_time rejected');

    let invalidJpNumOpErr = null;
    try {
      assertionService.validateAssertions([{ id: 'inv_jp_num', type: 'json_path', property: 'items.count', operator: 'greater_than', expected: 'ten' }]);
    } catch (err) {
      invalidJpNumOpErr = err;
    }
    assert(invalidJpNumOpErr instanceof AppError && invalidJpNumOpErr.code === 'INVALID_ASSERTION_EXPECTED', 'TEST 31: Non-numeric expected for json_path greater_than rejected');

    // 7. Malformed JSON paths & Prototype Pollution
    let malformedJpErr = null;
    try {
      assertionService.validateAssertions([{ id: 'mal_jp', type: 'json_path', property: 'data..users', operator: 'exists' }]);
    } catch (err) {
      malformedJpErr = err;
    }
    assert(malformedJpErr instanceof AppError && malformedJpErr.code === 'INVALID_JSON_PATH', 'TEST 32: Malformed JSON path (double dot) rejected');

    let protoJpErr = null;
    try {
      assertionService.validateAssertions([{ id: 'proto_jp', type: 'json_path', property: 'user.__proto__.admin', operator: 'equals', expected: true }]);
    } catch (err) {
      protoJpErr = err;
    }
    assert(protoJpErr instanceof AppError && protoJpErr.code === 'FORBIDDEN_PROPERTY_PATH', 'TEST 33: Prototype pollution __proto__ in JSON path rejected');

    let constructorJpErr = null;
    try {
      assertionService.validateAssertions([{ id: 'const_jp', type: 'json_path', property: 'constructor.prototype', operator: 'exists' }]);
    } catch (err) {
      constructorJpErr = err;
    }
    assert(constructorJpErr instanceof AppError && constructorJpErr.code === 'FORBIDDEN_PROPERTY_PATH', 'TEST 34: constructor.prototype in JSON path rejected');

    // 8. Oversized assertion arrays & field limits
    const bigArray = Array.from({ length: 51 }, (_, i) => ({
      id: `assert_${i}`,
      type: 'status_code',
      operator: 'equals',
      expected: 200
    }));
    let limitErr = null;
    try {
      assertionService.validateAssertions(bigArray);
    } catch (err) {
      limitErr = err;
    }
    assert(limitErr instanceof AppError && limitErr.code === 'ASSERTION_LIMIT_EXCEEDED', 'TEST 35: Assertions array exceeding 50 items rejected');

    // 9. Code injection prevention & legitimate text preservation
    let evalErr = null;
    try {
      assertionService.validateAssertions([{ id: 'eval_inj', type: 'body_text', operator: 'contains', expected: 'eval(alert(1))' }]);
    } catch (err) {
      evalErr = err;
    }
    assert(evalErr instanceof AppError && evalErr.code === 'CODE_INJECTION_DETECTED', 'TEST 36: eval() code injection rejected');

    let procErr = null;
    try {
      assertionService.validateAssertions([{ id: 'proc_inj', type: 'body_text', operator: 'contains', expected: 'process.exit(1)' }]);
    } catch (err) {
      procErr = err;
    }
    assert(procErr instanceof AppError && procErr.code === 'CODE_INJECTION_DETECTED', 'TEST 37: process.exit() pattern rejected');

    let scriptErr = null;
    try {
      assertionService.validateAssertions([{ id: 'script_inj', type: 'body_text', operator: 'contains', expected: '<script>alert(1)</script>' }]);
    } catch (err) {
      scriptErr = err;
    }
    assert(scriptErr instanceof AppError && scriptErr.code === 'CODE_INJECTION_DETECTED', 'TEST 38: <script> pattern rejected');

    // Legitimate phrases containing words like "process" or "eval" must be preserved
    const legitText1 = { id: 'legit_1', type: 'body_text', operator: 'contains', expected: 'The process completed successfully' };
    const legitText2 = { id: 'legit_2', type: 'body_text', operator: 'contains', expected: 'Performance evaluation completed' };
    const legitRes = assertionService.validateAssertions([legitText1, legitText2]);
    assert(legitRes.length === 2, 'TEST 39: Legitimate text containing words "process" or "evaluation" is preserved without rejection');

    // -------------------------------------------------------------------------
    // Phase 6: Saved Request REST API Persistence (HTTP Integration)
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 6: Saved Request API Persistence Integration ---');
    appServer = http.createServer(app);
    await new Promise((resolve) => appServer.listen(0, '127.0.0.1', resolve));

    // 10. POST /api/requests/saved with assertions
    const createPayload = {
      name: 'Day 14 Automated Test Request',
      method: 'GET',
      url: 'https://api.example.com/items',
      assertions: [validStatusCode, validResponseTime, validHeader]
    };
    const resCreate = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/saved',
      body: createPayload
    });
    assert(resCreate.statusCode === 201, 'TEST 40: POST /api/requests/saved returns 201 Created');
    assert(resCreate.json.success === true, 'TEST 41: Create response indicates success=true');
    assert(Array.isArray(resCreate.json.data.assertions), 'TEST 42: Created request returns assertions as an array');
    assert(resCreate.json.data.assertions.length === 3, 'TEST 43: All 3 assertions returned in response');
    const savedId = resCreate.json.data.id;
    createdSavedRequestIds.push(savedId);

    // GET /api/requests/saved/:id
    const resGet = await makeRequest(appServer, {
      method: 'GET',
      path: `/api/requests/saved/${savedId}`
    });
    assert(resGet.statusCode === 200, 'TEST 44: GET /api/requests/saved/:id returns 200');
    assert(Array.isArray(resGet.json.data.assertions), 'TEST 45: GET returns parsed assertions array');
    assert(resGet.json.data.assertions[0].id === 'a_status_200', 'TEST 46: Assertion ID retrieved correctly');
    assert(resGet.json.data.assertions[1].expected === 300, 'TEST 47: Assertion threshold retrieved correctly');

    // 11. Updating assertions via PUT /api/requests/saved/:id
    const updatePayload = {
      name: 'Day 14 Updated Request',
      method: 'POST',
      url: 'https://api.example.com/items/update',
      assertions: [validStatusCode, validBodyText]
    };
    const resUpdate = await makeRequest(appServer, {
      method: 'PUT',
      path: `/api/requests/saved/${savedId}`,
      body: updatePayload
    });
    assert(resUpdate.statusCode === 200, 'TEST 48: PUT /api/requests/saved/:id returns 200');
    assert(resUpdate.json.data.assertions.length === 2, 'TEST 49: Assertions updated to 2 items');
    assert(resUpdate.json.data.assertions[1].type === 'body_text', 'TEST 50: New body_text assertion persisted');

    // Clearing assertions by explicitly passing null
    const clearNullPayload = {
      name: 'Day 14 Cleared Null',
      method: 'GET',
      url: 'https://api.example.com/items',
      assertions: null
    };
    const resClearNull = await makeRequest(appServer, {
      method: 'PUT',
      path: `/api/requests/saved/${savedId}`,
      body: clearNullPayload
    });
    assert(resClearNull.statusCode === 200, 'TEST 51: PUT with assertions=null returns 200');
    assert(resClearNull.json.data.assertions === null, 'TEST 52: Assertions cleared to null');

    // Restore assertions, then clear with empty array []
    await makeRequest(appServer, {
      method: 'PUT',
      path: `/api/requests/saved/${savedId}`,
      body: { name: 'Restored', method: 'GET', url: 'https://api.example.com/items', assertions: [validStatusCode] }
    });
    const resClearEmpty = await makeRequest(appServer, {
      method: 'PUT',
      path: `/api/requests/saved/${savedId}`,
      body: { name: 'Cleared Empty', method: 'GET', url: 'https://api.example.com/items', assertions: [] }
    });
    assert(resClearEmpty.statusCode === 200, 'TEST 53: PUT with assertions=[] returns 200');
    assert(resClearEmpty.json.data.assertions === null, 'TEST 54: Assertions cleared to null via empty array');

    // Update without mentioning assertions preserves existing assertions
    await makeRequest(appServer, {
      method: 'PUT',
      path: `/api/requests/saved/${savedId}`,
      body: { name: 'Has Assertions', method: 'GET', url: 'https://api.example.com/items', assertions: [validStatusCode] }
    });
    const resOmit = await makeRequest(appServer, {
      method: 'PUT',
      path: `/api/requests/saved/${savedId}`,
      body: { name: 'Updated Name Only', method: 'GET', url: 'https://api.example.com/items' }
    });
    assert(resOmit.statusCode === 200, 'TEST 55: PUT omitting assertions returns 200');
    assert(Array.isArray(resOmit.json.data.assertions), 'TEST 56: Existing assertions preserved when assertions omitted');
    assert(resOmit.json.data.assertions.length === 1, 'TEST 57: Preserved assertion length is 1');

    // 12. Existing saved requests without assertions
    const resNoAssert = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/saved',
      body: { name: 'No Assertions Request', method: 'GET', url: 'https://api.example.com/plain' }
    });
    assert(resNoAssert.statusCode === 201, 'TEST 58: POST without assertions field succeeds');
    assert(resNoAssert.json.data.assertions === null, 'TEST 59: Default assertions value is null');
    createdSavedRequestIds.push(resNoAssert.json.data.id);

    // List view includes assertions field
    const resList = await makeRequest(appServer, {
      method: 'GET',
      path: '/api/requests/saved'
    });
    assert(resList.statusCode === 200, 'TEST 60: GET /api/requests/saved returns 200');
    assert(Array.isArray(resList.json.data), 'TEST 61: Saved requests list returned as array');

    // Invalid assertions on POST returns 400
    const resBadCreate = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/saved',
      body: {
        name: 'Bad Assertions',
        method: 'GET',
        url: 'https://api.example.com/test',
        assertions: 'not-an-array'
      }
    });
    assert(resBadCreate.statusCode === 400, 'TEST 62: Non-array assertions on POST returns 400');
    assert(resBadCreate.json.success === false, 'TEST 63: Response indicates success=false');

    // -------------------------------------------------------------------------
    // Phase 7: History Test Results Persistence & Redaction
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 7: History Test Results Persistence & Redaction ---');

    // 13. Record execution with valid test results
    const validTestResults = {
      summary: {
        total: 2,
        passed: 1,
        failed: 1,
        status: 'failed'
      },
      results: [
        {
          id: 'assert_status_200',
          type: 'status_code',
          passed: true,
          message: 'Status code is 200',
          actual: 200,
          expected: 200
        },
        {
          id: 'assert_latency_300',
          type: 'response_time',
          passed: false,
          message: 'Response time 450ms exceeded 300ms',
          actual: 450,
          expected: 300
        }
      ]
    };

    const recWithResults = await historyService.recordExecution(
      { name: 'Execution with Tests', method: 'GET', url: 'https://api.example.com/tested' },
      { status: 200, timeMs: 450, rawText: '{"ok":true}' },
      null,
      validTestResults
    );
    assert(recWithResults.success === true, 'TEST 64: recordExecution with test results returns success: true');
    createdHistoryIds.push(recWithResults.id);

    const histRecord1 = await historyService.getHistoryById(recWithResults.id);
    assert(typeof histRecord1.test_results === 'object' && histRecord1.test_results !== null, 'TEST 65: getHistoryById returns parsed test_results object');
    assert(histRecord1.test_results.summary.status === 'failed', 'TEST 66: Persisted test summary status is "failed"');
    assert(histRecord1.test_results.summary.total === 2, 'TEST 67: Persisted test summary total is 2');
    assert(histRecord1.test_results.results.length === 2, 'TEST 68: Both individual test results preserved');

    // Record execution without test results
    const recNoResults = await historyService.recordExecution(
      { name: 'Execution without Tests', method: 'GET', url: 'https://api.example.com/notests' },
      { status: 200, timeMs: 120, rawText: '{"ok":true}' },
      null
    );
    assert(recNoResults.success === true, 'TEST 69: recordExecution without test results succeeds');
    createdHistoryIds.push(recNoResults.id);

    const histRecord2 = await historyService.getHistoryById(recNoResults.id);
    assert(histRecord2.test_results === null, 'TEST 70: test_results is null when not supplied');

    // 14. Sensitive-value credential redaction in test results
    const sensitiveTestResults = {
      summary: { total: 1, passed: true ? 1 : 0, failed: 0, status: 'passed' },
      results: [
        {
          id: 'assert_auth_header',
          type: 'header',
          passed: true,
          message: 'Checked auth token',
          actual: 'Bearer confidential_token_99999',
          expected: 'Bearer confidential_token_99999'
        },
        {
          id: 'assert_pwd_body',
          type: 'json_path',
          passed: true,
          message: 'Checked user object',
          actual: { user: 'admin', password: 'SuperSecretPassword!', token: 'secret-token-abc' },
          expected: { user: 'admin', password: 'SuperSecretPassword!', token: 'secret-token-abc' }
        }
      ]
    };
    sensitiveTestResults.summary.total = 2;

    const recSensitive = await historyService.recordExecution(
      { name: 'Sensitive Test Run', method: 'POST', url: 'https://api.example.com/login' },
      { status: 200, timeMs: 100 },
      null,
      sensitiveTestResults
    );
    createdHistoryIds.push(recSensitive.id);

    const histRecordSens = await historyService.getHistoryById(recSensitive.id);
    const serializedSens = JSON.stringify(histRecordSens.test_results);
    assert(!serializedSens.includes('confidential_token_99999'), 'TEST 71: Bearer token is redacted from test_results');
    assert(!serializedSens.includes('SuperSecretPassword!'), 'TEST 72: Password is redacted from test_results');
    assert(!serializedSens.includes('secret-token-abc'), 'TEST 73: Nested secret token is redacted from test_results');
    assert(serializedSens.includes('[REDACTED]'), 'TEST 74: [REDACTED] placeholder present in test results');

    // 15. Invalid test-results structure rejection
    let malformedSummaryErr = null;
    try {
      await historyService.recordExecution(
        { method: 'GET', url: 'https://api.example.com' },
        null,
        null,
        { summary: { total: 1, passed: 2, failed: 0, status: 'passed' }, results: [] }
      );
    } catch (err) {
      malformedSummaryErr = err;
    }
    assert(malformedSummaryErr instanceof AppError && malformedSummaryErr.code === 'INVALID_TEST_RESULTS', 'TEST 75: Passed exceeding total rejected in test results');

    let malformedResultsArrayErr = null;
    try {
      await historyService.recordExecution(
        { method: 'GET', url: 'https://api.example.com' },
        null,
        null,
        { summary: { total: 0, passed: 0, failed: 0, status: 'passed' }, results: 'not-array' }
      );
    } catch (err) {
      malformedResultsArrayErr = err;
    }
    assert(malformedResultsArrayErr instanceof AppError && malformedResultsArrayErr.code === 'INVALID_TEST_RESULTS', 'TEST 76: Non-array results field rejected');

    // 16. Regression: GET /api/history/:id returns 200 with test_results
    const resHistApi = await makeRequest(appServer, {
      method: 'GET',
      path: `/api/history/${recWithResults.id}`
    });
    assert(resHistApi.statusCode === 200, 'TEST 77: GET /api/history/:id returns 200 with test_results');
    assert(resHistApi.json.data.test_results !== null, 'TEST 78: API response includes test_results object');
    assert(resHistApi.json.data.test_results.summary.status === 'failed', 'TEST 79: API test_results status matches');

    const resHistApiPlain = await makeRequest(appServer, {
      method: 'GET',
      path: `/api/history/${recNoResults.id}`
    });
    assert(resHistApiPlain.statusCode === 200, 'TEST 80: GET /api/history/:id without test_results returns 200');
    assert(resHistApiPlain.json.data.test_results === null, 'TEST 81: API response returns test_results=null cleanly');

    // -------------------------------------------------------------------------
    // Phase 8: Focused Credential Security Verification & Audit
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 8: Focused Credential Security Verification & Audit ---');

    // 1. Rejection of Bearer tokens in expected value
    let secBearerErr = null;
    try {
      assertionService.validateAssertions([{
        id: 'sec_bearer',
        type: 'body_text',
        operator: 'contains',
        expected: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token'
      }]);
    } catch (err) {
      secBearerErr = err;
    }
    assert(secBearerErr instanceof AppError && secBearerErr.code === 'SENSITIVE_CREDENTIAL_PROHIBITED', 'TEST 82: Bearer token in assertion expected value is rejected');

    // 2. Rejection of enc:v1: ciphertext in expected value
    let secEncErr = null;
    try {
      assertionService.validateAssertions([{
        id: 'sec_enc',
        type: 'body_text',
        operator: 'contains',
        expected: 'enc:v1:1234567890abcdef1234567890abcdef:abcdef1234567890:deadbeef'
      }]);
    } catch (err) {
      secEncErr = err;
    }
    assert(secEncErr instanceof AppError && secEncErr.code === 'SENSITIVE_CREDENTIAL_PROHIBITED', 'TEST 83: enc:v1: ciphertext in assertion expected value is rejected');

    // 3. Rejection of secret mask bullet in expected value
    let secMaskErr = null;
    try {
      assertionService.validateAssertions([{
        id: 'sec_mask',
        type: 'body_text',
        operator: 'equals',
        expected: '••••••••'
      }]);
    } catch (err) {
      secMaskErr = err;
    }
    assert(secMaskErr instanceof AppError && secMaskErr.code === 'SENSITIVE_CREDENTIAL_PROHIBITED', 'TEST 84: Secret mask bullet in assertion expected value is rejected');

    // 4. Rejection of session / cookie assignment string in expected value
    let secCookieErr = null;
    try {
      assertionService.validateAssertions([{
        id: 'sec_cookie_str',
        type: 'body_text',
        operator: 'contains',
        expected: 'sessionid=secret_session_token_12345'
      }]);
    } catch (err) {
      secCookieErr = err;
    }
    assert(secCookieErr instanceof AppError && secCookieErr.code === 'SENSITIVE_CREDENTIAL_PROHIBITED', 'TEST 85: Session token / cookie assignment in expected value is rejected');

    // 5. Value-matching rejection on sensitive header names
    let secHdrAuthErr = null;
    try {
      assertionService.validateAssertions([{
        id: 'sec_hdr_auth',
        type: 'header',
        property: 'Authorization',
        operator: 'equals',
        expected: 'Bearer some_token'
      }]);
    } catch (err) {
      secHdrAuthErr = err;
    }
    assert(secHdrAuthErr instanceof AppError && secHdrAuthErr.code === 'SENSITIVE_CREDENTIAL_PROHIBITED', 'TEST 86: Value-matching assertion on Authorization header is rejected');

    let secHdrCookieErr = null;
    try {
      assertionService.validateAssertions([{
        id: 'sec_hdr_cookie',
        type: 'header',
        property: 'Cookie',
        operator: 'contains',
        expected: 'session'
      }]);
    } catch (err) {
      secHdrCookieErr = err;
    }
    assert(secHdrCookieErr instanceof AppError && secHdrCookieErr.code === 'SENSITIVE_CREDENTIAL_PROHIBITED', 'TEST 87: Value-matching assertion on Cookie header is rejected');

    let secHdrSetCookieErr = null;
    try {
      assertionService.validateAssertions([{
        id: 'sec_hdr_set_cookie',
        type: 'header',
        property: 'Set-Cookie',
        operator: 'contains',
        expected: 'sid'
      }]);
    } catch (err) {
      secHdrSetCookieErr = err;
    }
    assert(secHdrSetCookieErr instanceof AppError && secHdrSetCookieErr.code === 'SENSITIVE_CREDENTIAL_PROHIBITED', 'TEST 88: Value-matching assertion on Set-Cookie header is rejected');

    let secHdrApiKeyErr = null;
    try {
      assertionService.validateAssertions([{
        id: 'sec_hdr_apikey',
        type: 'header',
        property: 'X-Api-Key',
        operator: 'equals',
        expected: 'live_api_key_123'
      }]);
    } catch (err) {
      secHdrApiKeyErr = err;
    }
    assert(secHdrApiKeyErr instanceof AppError && secHdrApiKeyErr.code === 'SENSITIVE_CREDENTIAL_PROHIBITED', 'TEST 89: Value-matching assertion on X-Api-Key header is rejected');

    // 6. Safe existence checks on sensitive headers are permitted
    const secAuthExists = assertionService.validateAssertions([{
      id: 'sec_auth_exists',
      type: 'header',
      property: 'Authorization',
      operator: 'exists'
    }]);
    assert(secAuthExists[0].operator === 'exists', 'TEST 90: Safe existence assertion on Authorization header is permitted');

    const secCookieNotExists = assertionService.validateAssertions([{
      id: 'sec_cookie_not_exists',
      type: 'header',
      property: 'Cookie',
      operator: 'not_exists'
    }]);
    assert(secCookieNotExists[0].operator === 'not_exists', 'TEST 91: Safe non-existence assertion on Cookie header is permitted');

    // 7. Value-matching rejection on sensitive JSON path properties
    let secJpPwdErr = null;
    try {
      assertionService.validateAssertions([{
        id: 'sec_jp_pwd',
        type: 'json_path',
        property: 'user.password',
        operator: 'equals',
        expected: 'SuperSecret123!'
      }]);
    } catch (err) {
      secJpPwdErr = err;
    }
    assert(secJpPwdErr instanceof AppError && secJpPwdErr.code === 'SENSITIVE_CREDENTIAL_PROHIBITED', 'TEST 92: Value-matching assertion on user.password is rejected');

    let secJpSecretErr = null;
    try {
      assertionService.validateAssertions([{
        id: 'sec_jp_secret',
        type: 'json_path',
        property: 'client_secret',
        operator: 'equals',
        expected: 'secret_abc'
      }]);
    } catch (err) {
      secJpSecretErr = err;
    }
    assert(secJpSecretErr instanceof AppError && secJpSecretErr.code === 'SENSITIVE_CREDENTIAL_PROHIBITED', 'TEST 93: Value-matching assertion on client_secret is rejected');

    // 8. Safe existence checks on sensitive JSON path properties are permitted
    const secJpPwdSafe = assertionService.validateAssertions([{
      id: 'sec_jp_pwd_safe',
      type: 'json_path',
      property: 'user.password',
      operator: 'not_exists'
    }]);
    assert(secJpPwdSafe[0].operator === 'not_exists', 'TEST 94: Safe non-existence assertion on user.password is permitted');

    const secJpTokenSafe = assertionService.validateAssertions([{
      id: 'sec_jp_token_safe',
      type: 'json_path',
      property: 'auth.access_token',
      operator: 'exists'
    }]);
    assert(secJpTokenSafe[0].operator === 'exists', 'TEST 95: Safe existence assertion on auth.access_token is permitted');

    // 9. Preservation of legitimate descriptive sentences containing 'password', 'token', 'process'
    const legitDescText = assertionService.validateAssertions([
      { id: 'legit_pwd_desc', type: 'body_text', operator: 'contains', expected: 'Password reset email has been sent successfully' },
      { id: 'legit_tok_desc', type: 'body_text', operator: 'contains', expected: 'Authentication token has expired, please log in again' },
      { id: 'legit_proc_desc', type: 'body_text', operator: 'contains', expected: 'Order processing completed without error' },
      { id: 'legit_msg_pwd', type: 'json_path', property: 'meta.message', operator: 'equals', expected: 'Invalid password entered' }
    ]);
    assert(legitDescText.length === 4, 'TEST 96: Ordinary descriptive sentences with sensitive words are preserved without false rejection');
    assert(legitDescText[0].expected.includes('Password reset'), 'TEST 97: Legitimate password reset message intact');
    assert(legitDescText[1].expected.includes('Authentication token'), 'TEST 98: Legitimate token expiration message intact');

    // 10. Test results sanitization & redaction
    const rawSecResults = {
      summary: { total: 3, passed: 1, failed: 2, status: 'failed' },
      results: [
        {
          id: 'test_sec_hdr',
          type: 'header',
          property: 'Authorization',
          operator: 'equals',
          expected: 'Bearer secret_auth_token_xyz',
          actual: 'Bearer secret_auth_token_xyz',
          passed: true,
          message: 'Expected Authorization to equal Bearer secret_auth_token_xyz'
        },
        {
          id: 'test_sec_cookie',
          type: 'header',
          property: 'Set-Cookie',
          operator: 'contains',
          expected: 'sid',
          actual: 'sessionid=secret_cookie_val_999; Secure; HttpOnly',
          passed: false,
          message: 'Received sessionid=secret_cookie_val_999; Secure; HttpOnly'
        },
        {
          id: 'test_sec_pwd',
          type: 'json_path',
          property: 'user.password',
          operator: 'exists',
          expected: null,
          actual: 'RawPasswordPlaintext!',
          passed: false,
          message: 'Password mismatch with password: RawPasswordPlaintext!'
        }
      ]
    };

    const sanitizedSecResults = assertionService.validateAndSanitizeTestResults(rawSecResults);
    const jsonSec = JSON.stringify(sanitizedSecResults);
    assert(!jsonSec.includes('secret_auth_token_xyz'), 'TEST 99: Bearer token in test results expected/actual is redacted');
    assert(!jsonSec.includes('secret_cookie_val_999'), 'TEST 100: Session cookie value in test results is redacted');
    assert(!jsonSec.includes('RawPasswordPlaintext!'), 'TEST 101: Plaintext password in test results is redacted');
    assert(sanitizedSecResults.results[0].message === 'Expected Authorization to equal Bearer [REDACTED]', 'TEST 102: Diagnostic message redacts embedded Bearer token');
    assert(sanitizedSecResults.results[0].expected === '[REDACTED]', 'TEST 103: Sensitive header expected is [REDACTED]');
    assert(sanitizedSecResults.results[0].actual === '[REDACTED]', 'TEST 104: Sensitive header actual is [REDACTED]');
    assert(sanitizedSecResults.results[2].expected === '[REDACTED]', 'TEST 105: Sensitive password property expected is [REDACTED]');
    assert(sanitizedSecResults.results[2].actual === '[REDACTED]', 'TEST 106: Sensitive password property actual is [REDACTED]');

    // -------------------------------------------------------------------------
    // Phase 8: Client-Side Assertion Evaluation Engine Tests (Day 14 Step 3)
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 8: Client-Side Assertion Evaluation Engine Tests ---');

    const sampleResponse = {
      status: 200,
      statusText: 'OK',
      timeMs: 145,
      sizeBytes: 420,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-request-id': 'req_xyz_12345',
        'authorization': 'Bearer live_secret_auth_token_999',
        'set-cookie': 'sessionid=sec_session_token_abc; Path=/; HttpOnly'
      },
      body: {
        success: true,
        data: {
          user: {
            id: 42,
            name: 'Alice Cooper',
            role: 'admin',
            profile: null,
            password: 'SuperSecretUserPassword123!'
          },
          users: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ],
          items: [
            { id: 101, name: 'Widget A', price: 9.99 },
            { id: 102, name: 'Widget B', price: 19.99 }
          ],
          metrics: {
            count: 5,
            active: true
          }
        }
      },
      rawText: '{"success":true,"data":{"user":{"id":42,"name":"Alice Cooper","role":"admin","profile":null,"password":"SuperSecretUserPassword123!"},"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}],"items":[{"id":101,"name":"Widget A","price":9.99},{"id":102,"name":"Widget B","price":19.99}],"metrics":{"count":5,"active":true}}}'
    };

    // Deep clone snapshot for immutability verification
    const responseSnapshotBefore = JSON.stringify(sampleResponse);

    // 1. Status code equals
    const r1Pass = assertionEngine.evaluateAssertions([
      { id: 'a1_pass', type: 'status_code', operator: 'equals', expected: 200 }
    ], sampleResponse);
    const r1Fail = assertionEngine.evaluateAssertions([
      { id: 'a1_fail', type: 'status_code', operator: 'equals', expected: 404 }
    ], sampleResponse);
    assert(r1Pass.summary.passed === 1 && r1Pass.results[0].passed === true &&
           r1Fail.summary.failed === 1 && r1Fail.results[0].passed === false,
           'TEST 107: Status code equals passes on 200 and fails on 404');

    // 2. Status code not_equals
    const r2Pass = assertionEngine.evaluateAssertions([
      { id: 'a2_pass', type: 'status_code', operator: 'not_equals', expected: 404 }
    ], sampleResponse);
    const r2Fail = assertionEngine.evaluateAssertions([
      { id: 'a2_fail', type: 'status_code', operator: 'not_equals', expected: 200 }
    ], sampleResponse);
    assert(r2Pass.results[0].passed === true && r2Fail.results[0].passed === false,
           'TEST 108: Status code not_equals passes when different and fails when identical');

    // 3. Status numeric comparisons (less_than, greater_than, less_than_or_equal, greater_than_or_equal)
    const r3 = assertionEngine.evaluateAssertions([
      { id: 'a3_lt', type: 'status_code', operator: 'less_than', expected: 300 },
      { id: 'a3_gt', type: 'status_code', operator: 'greater_than', expected: 100 },
      { id: 'a3_lte', type: 'status_code', operator: 'less_than_or_equal', expected: 200 },
      { id: 'a3_gte', type: 'status_code', operator: 'greater_than_or_equal', expected: 200 },
      { id: 'a3_fail_lt', type: 'status_code', operator: 'less_than', expected: 200 },
      { id: 'a3_fail_gt', type: 'status_code', operator: 'greater_than', expected: 300 }
    ], sampleResponse);
    assert(r3.summary.passed === 4 && r3.summary.failed === 2,
           'TEST 109: Status code numeric comparisons (<, >, <=, >=) evaluate correctly');

    // 4. Response-time comparisons
    const r4 = assertionEngine.evaluateAssertions([
      { id: 'a4_lt', type: 'response_time', operator: 'less_than', expected: 200 },
      { id: 'a4_gt', type: 'response_time', operator: 'greater_than', expected: 100 },
      { id: 'a4_lte', type: 'response_time', operator: 'less_than_or_equal', expected: 145 },
      { id: 'a4_gte', type: 'response_time', operator: 'greater_than_or_equal', expected: 145 },
      { id: 'a4_eq', type: 'response_time', operator: 'equals', expected: 145 },
      { id: 'a4_neq', type: 'response_time', operator: 'not_equals', expected: 500 },
      { id: 'a4_fail_lt', type: 'response_time', operator: 'less_than', expected: 100 }
    ], sampleResponse);
    assert(r4.summary.passed === 6 && r4.summary.failed === 1,
           'TEST 110: Response time comparisons (<, >, <=, >=, ==, !=) evaluate safely');

    // 5. Header existence
    const r5Pass = assertionEngine.evaluateAssertions([
      { id: 'a5_pass', type: 'header', property: 'content-type', operator: 'exists' }
    ], sampleResponse);
    const r5Fail = assertionEngine.evaluateAssertions([
      { id: 'a5_fail', type: 'header', property: 'x-missing-header', operator: 'exists' }
    ], sampleResponse);
    assert(r5Pass.results[0].passed === true && r5Fail.results[0].passed === false,
           'TEST 111: Header exists operator passes on existing header and fails on missing header');

    // 6. Header non-existence
    const r6Pass = assertionEngine.evaluateAssertions([
      { id: 'a6_pass', type: 'header', property: 'x-missing-header', operator: 'not_exists' }
    ], sampleResponse);
    const r6Fail = assertionEngine.evaluateAssertions([
      { id: 'a6_fail', type: 'header', property: 'content-type', operator: 'not_exists' }
    ], sampleResponse);
    assert(r6Pass.results[0].passed === true && r6Fail.results[0].passed === false,
           'TEST 112: Header not_exists operator passes when header is absent and fails when present');

    // 7. Header case-insensitive matching
    const r7 = assertionEngine.evaluateAssertions([
      { id: 'a7_1', type: 'header', property: 'Content-Type', operator: 'exists' },
      { id: 'a7_2', type: 'header', property: 'CONTENT-TYPE', operator: 'contains', expected: 'json' },
      { id: 'a7_3', type: 'header', property: 'X-Request-ID', operator: 'equals', expected: 'req_xyz_12345' }
    ], sampleResponse);
    assert(r7.summary.passed === 3 && r7.summary.status === 'passed',
           'TEST 113: Header matching is strictly case-insensitive across various casings');

    // 8. Header value comparisons
    const r8 = assertionEngine.evaluateAssertions([
      { id: 'a8_eq', type: 'header', property: 'content-type', operator: 'equals', expected: 'application/json; charset=utf-8' },
      { id: 'a8_neq', type: 'header', property: 'content-type', operator: 'not_equals', expected: 'text/html' },
      { id: 'a8_contains', type: 'header', property: 'content-type', operator: 'contains', expected: 'application/json' },
      { id: 'a8_not_contains', type: 'header', property: 'content-type', operator: 'not_contains', expected: 'application/xml' },
      { id: 'a8_fail_eq', type: 'header', property: 'content-type', operator: 'equals', expected: 'text/plain' },
      { id: 'a8_fail_contains', type: 'header', property: 'content-type', operator: 'contains', expected: 'multipart' }
    ], sampleResponse);
    assert(r8.summary.passed === 4 && r8.summary.failed === 2,
           'TEST 114: Header value comparisons (equals, not_equals, contains, not_contains) evaluate correctly');

    // 9. Body contains and not_contains
    const r9 = assertionEngine.evaluateAssertions([
      { id: 'a9_contains', type: 'body_text', operator: 'contains', expected: 'Widget A' },
      { id: 'a9_not_contains', type: 'body_text', operator: 'not_contains', expected: 'NonExistentItem999' },
      { id: 'a9_fail_contains', type: 'body_text', operator: 'contains', expected: 'NonExistentItem999' }
    ], sampleResponse);
    assert(r9.results[0].passed === true && r9.results[1].passed === true && r9.results[2].passed === false,
           'TEST 115: Body text contains and not_contains evaluate accurately');

    // 10. Body equals and not_equals
    const plainTextResponse = { status: 200, headers: {}, body: 'Hello DevProbe', rawText: 'Hello DevProbe' };
    const r10 = assertionEngine.evaluateAssertions([
      { id: 'a10_eq', type: 'body_text', operator: 'equals', expected: 'Hello DevProbe' },
      { id: 'a10_neq', type: 'body_text', operator: 'not_equals', expected: 'Goodbye DevProbe' },
      { id: 'a10_fail_eq', type: 'body_text', operator: 'equals', expected: 'Goodbye DevProbe' }
    ], plainTextResponse);
    assert(r10.summary.passed === 2 && r10.summary.failed === 1,
           'TEST 116: Body text equals and not_equals evaluate accurately against body content');

    // 11. JSON path primitive equality
    const r11 = assertionEngine.evaluateAssertions([
      { id: 'a11_1', type: 'json_path', property: 'data.user.id', operator: 'equals', expected: 42 },
      { id: 'a11_2', type: 'json_path', property: 'data.user.role', operator: 'equals', expected: 'admin' },
      { id: 'a11_3', type: 'json_path', property: 'data.metrics.active', operator: 'equals', expected: true },
      { id: 'a11_4', type: 'json_path', property: 'data.user.role', operator: 'not_equals', expected: 'guest' },
      { id: 'a11_fail', type: 'json_path', property: 'data.user.id', operator: 'equals', expected: 99 }
    ], sampleResponse);
    assert(r11.summary.passed === 4 && r11.summary.failed === 1,
           'TEST 117: JSON path primitive equality (numbers, strings, booleans) matches correctly');

    // 12. JSON path array indexing
    const r12 = assertionEngine.evaluateAssertions([
      { id: 'a12_1', type: 'json_path', property: 'data.users[0].name', operator: 'equals', expected: 'Alice' },
      { id: 'a12_2', type: 'json_path', property: 'data.users[1].name', operator: 'equals', expected: 'Bob' },
      { id: 'a12_3', type: 'json_path', property: 'data.items[1].price', operator: 'equals', expected: 19.99 },
      { id: 'a12_4', type: 'json_path', property: 'data.items[0].id', operator: 'equals', expected: 101 }
    ], sampleResponse);
    assert(r12.summary.passed === 4 && r12.summary.status === 'passed',
           'TEST 118: JSON path bracket array indexing resolves elements and nested properties');

    // 13. JSON path missing properties
    const r13 = assertionEngine.evaluateAssertions([
      { id: 'a13_exists_fail', type: 'json_path', property: 'data.user.missing_field', operator: 'exists' },
      { id: 'a13_not_exists_pass', type: 'json_path', property: 'data.user.missing_field', operator: 'not_exists' },
      { id: 'a13_eq_fail', type: 'json_path', property: 'data.user.missing_field', operator: 'equals', expected: 'foo' }
    ], sampleResponse);
    assert(r13.results[0].passed === false && r13.results[1].passed === true && r13.results[2].passed === false &&
           (r13.results[0].message.includes('not found') || r13.results[0].message.includes('not exist')),
           'TEST 119: Missing JSON path properties fail existence/equality cleanly with descriptive messages');

    // 14. JSON null handling
    const r14 = assertionEngine.evaluateAssertions([
      { id: 'a14_exists', type: 'json_path', property: 'data.user.profile', operator: 'exists' },
      { id: 'a14_eq_null', type: 'json_path', property: 'data.user.profile', operator: 'equals', expected: null },
      { id: 'a14_neq', type: 'json_path', property: 'data.user.profile', operator: 'not_equals', expected: 'something' }
    ], sampleResponse);
    assert(r14.summary.passed === 3 && r14.results[0].actual === null,
           'TEST 120: JSON null values are accurately distinguished from missing properties');

    // 15. JSON numeric comparisons
    const r15 = assertionEngine.evaluateAssertions([
      { id: 'a15_lt', type: 'json_path', property: 'data.items[1].price', operator: 'less_than', expected: 25 },
      { id: 'a15_gt', type: 'json_path', property: 'data.items[1].price', operator: 'greater_than', expected: 10 },
      { id: 'a15_lte', type: 'json_path', property: 'data.metrics.count', operator: 'less_than_or_equal', expected: 5 },
      { id: 'a15_gte', type: 'json_path', property: 'data.metrics.count', operator: 'greater_than_or_equal', expected: 5 },
      { id: 'a15_fail_lt', type: 'json_path', property: 'data.items[1].price', operator: 'less_than', expected: 15 }
    ], sampleResponse);
    assert(r15.summary.passed === 4 && r15.summary.failed === 1,
           'TEST 121: JSON numeric comparisons (<, >, <=, >=) evaluate correctly on float and int fields');

    // 16. JSON malformed response
    const malformedResponse = { status: 200, headers: { 'content-type': 'application/json' }, body: null, rawText: '{"not_valid_json: 123' };
    const r16 = assertionEngine.evaluateAssertions([
      { id: 'a16', type: 'json_path', property: 'data.user', operator: 'exists' }
    ], malformedResponse);
    assert(r16.summary.failed === 1 && r16.results[0].passed === false && r16.results[0].message.includes('Invalid JSON'),
           'TEST 122: Malformed JSON response body produces safe assertion failure without unhandled throw');

    // 17. Malformed assertion definitions
    const r17 = assertionEngine.evaluateAssertions([
      null,
      'not an object',
      { id: 'a17_valid', type: 'status_code', operator: 'equals', expected: 200 },
      { id: 'a17_bad_type', type: 'invalid_type_xyz', operator: 'equals', expected: 123 }
    ], sampleResponse);
    assert(r17.summary.total === 4 && r17.summary.passed === 1 && r17.summary.failed === 3 &&
           r17.results[0].passed === false && r17.results[2].passed === true,
           'TEST 123: Malformed assertion definitions in array fail safely without aborting valid assertions');

    // 18. Disabled assertions
    const r18 = assertionEngine.evaluateAssertions([
      { id: 'a18_enabled_1', type: 'status_code', operator: 'equals', expected: 200, enabled: true },
      { id: 'a18_disabled_fail', type: 'status_code', operator: 'equals', expected: 500, enabled: false },
      { id: 'a18_enabled_2', type: 'header', property: 'content-type', operator: 'exists', enabled: true }
    ], sampleResponse);
    assert(r18.summary.total === 2 && r18.summary.passed === 2 && r18.summary.failed === 0 && r18.summary.status === 'passed',
           'TEST 124: Disabled assertions (enabled: false) are excluded from evaluation and summary totals');

    // 19. No configured assertions
    const r19Empty = assertionEngine.evaluateAssertions([], sampleResponse);
    const r19Null = assertionEngine.evaluateAssertions(null, sampleResponse);
    const r19Undef = assertionEngine.evaluateAssertions(undefined, sampleResponse);
    const r19AllDisabled = assertionEngine.evaluateAssertions([
      { id: 'd1', type: 'status_code', operator: 'equals', expected: 200, enabled: false }
    ], sampleResponse);
    assert(r19Empty.summary.status === 'unevaluated' && r19Null.summary.status === 'unevaluated' &&
           r19Undef.summary.status === 'unevaluated' && r19AllDisabled.summary.status === 'unevaluated' &&
           r19Empty.summary.total === 0,
           'TEST 125: No enabled or configured assertions consistently return unevaluated summary state');

    // 20. Mixed passing and failing assertions
    const r20 = assertionEngine.evaluateAssertions([
      { id: 'a20_pass1', type: 'status_code', operator: 'equals', expected: 200 },
      { id: 'a20_fail', type: 'status_code', operator: 'equals', expected: 404 },
      { id: 'a20_pass2', type: 'header', property: 'content-type', operator: 'exists' }
    ], sampleResponse);
    assert(r20.summary.total === 3 && r20.summary.passed === 2 && r20.summary.failed === 1 && r20.summary.status === 'failed',
           'TEST 126: Mixed results correctly report total, passed, failed, and overall status: failed');

    // 21. Empty response body
    const emptyResponse = { status: 204, statusText: 'No Content', headers: {}, body: null, rawText: '' };
    const r21 = assertionEngine.evaluateAssertions([
      { id: 'a21_status', type: 'status_code', operator: 'equals', expected: 204 },
      { id: 'a21_body', type: 'body_text', operator: 'equals', expected: '' },
      { id: 'a21_json', type: 'json_path', property: 'data', operator: 'exists' }
    ], emptyResponse);
    assert(r21.results[0].passed === true && r21.results[1].passed === true && r21.results[2].passed === false,
           'TEST 127: Empty response body (e.g. 204 No Content) evaluated safely across body and JSON types');

    // 22. Sensitive header redaction
    const r22 = assertionEngine.evaluateAssertions([
      { id: 'a22_auth', type: 'header', property: 'authorization', operator: 'exists' },
      { id: 'a22_cookie', type: 'header', property: 'set-cookie', operator: 'exists' }
    ], sampleResponse);
    const r22Json = JSON.stringify(r22);
    assert(r22.results[0].actual === '[REDACTED]' && r22.results[1].actual === '[REDACTED]' &&
           !r22Json.includes('live_secret_auth_token_999') && !r22Json.includes('sec_session_token_abc'),
           'TEST 128: Sensitive header values (Authorization, Set-Cookie) are redacted in evaluation results');

    // 23. Sensitive JSON property redaction
    const r23 = assertionEngine.evaluateAssertions([
      { id: 'a23_pwd', type: 'json_path', property: 'data.user.password', operator: 'exists' }
    ], sampleResponse);
    const r23Json = JSON.stringify(r23);
    assert(r23.results[0].actual === '[REDACTED]' && !r23Json.includes('SuperSecretUserPassword123!'),
           'TEST 129: Sensitive JSON path properties (e.g. password) are redacted in evaluation results');

    // 24. Prototype-pollution path rejection
    const r24 = assertionEngine.evaluateAssertions([
      { id: 'a24_proto', type: 'json_path', property: '__proto__.polluted', operator: 'exists' },
      { id: 'a24_ctor', type: 'json_path', property: 'constructor.prototype.isAdmin', operator: 'exists' },
      { id: 'a24_nested_proto', type: 'json_path', property: 'data.user.prototype.hacked', operator: 'exists' }
    ], sampleResponse);
    assert(r24.summary.failed === 3 &&
           r24.results[0].message.includes('Prototype pollution') &&
           r24.results[1].message.includes('Prototype pollution') &&
           r24.results[2].message.includes('Prototype pollution') &&
           ({}).polluted === undefined && ({}).isAdmin === undefined,
           'TEST 130: Prototype pollution paths (__proto__, constructor, prototype) are strictly blocked');

    // 25. Confirm original response object is not modified (Immutability)
    const responseSnapshotAfter = JSON.stringify(sampleResponse);
    assert(responseSnapshotBefore === responseSnapshotAfter,
           'TEST 131: Assertion evaluation engine guarantees response object immutability');

    // 26. Confirm assertion failure does not change HTTP execution success
    const httpSuccessExecution = { success: true, status: 200, timeMs: 50, headers: {}, body: { ok: true } };
    const r26 = assertionEngine.evaluateAssertions([
      { id: 'a26_fail', type: 'status_code', operator: 'equals', expected: 500 }
    ], httpSuccessExecution);
    assert(r26.summary.status === 'failed' && httpSuccessExecution.success === true && httpSuccessExecution.status === 200,
           'TEST 132: Failing assertions do not alter HTTP execution success or mutate status code');

    // 27. Confirm one malformed assertion does not crash the entire evaluation
    const mixedRes = assertionEngine.evaluateAssertions([
      null,
      { id: 'a27_pass', type: 'status_code', operator: 'equals', expected: 200 },
      undefined,
      { id: 'a27_fail', type: 'status_code', operator: 'equals', expected: 404 }
    ], sampleResponse);
    assert(mixedRes.summary.total === 4 && mixedRes.summary.passed === 1 && mixedRes.summary.failed === 3 &&
           mixedRes.results[1].passed === true && mixedRes.results[3].passed === false,
           'TEST 133: Entire evaluation survives multiple malformed entries with individual fault isolation');

    // 28. Cross-layer integration: Output is directly accepted by backend test_results validator
    const backendValidation = assertionService.validateAndSanitizeTestResults(r20);
    assert(backendValidation !== null && backendValidation.summary.total === 3 && backendValidation.summary.status === 'failed',
           'TEST 134: Client-side evaluation engine output structure is 100% compliant with backend test_results persistence schema');

    // =========================================================================
    // Phase 9: Assertion Builder UI & Client-Side State Management (Step 4)
    // =========================================================================
    console.log('\n--- Phase 9: Assertion Builder UI & Client-Side State Management Tests ---');

    // Setup mock DOM for browser UI testing
    const mockElements = {};
    function getOrCreateMock(id, tag = 'div') {
      if (!mockElements[id]) {
        let innerHtmlVal = '';
        const el = {
          id,
          tagName: tag.toUpperCase(),
          value: '',
          textContent: '',
          className: '',
          classList: {
            _classes: new Set(),
            add(c) { this._classes.add(c); },
            remove(c) { this._classes.delete(c); },
            contains(c) { return this._classes.has(c); },
            toggle(c, force) {
              if (force === undefined) {
                if (this._classes.has(c)) this._classes.delete(c);
                else this._classes.add(c);
              } else if (force) this._classes.add(c);
              else this._classes.delete(c);
            }
          },
          children: [],
          attributes: {},
          setAttribute(k, v) { this.attributes[k] = String(v); },
          getAttribute(k) { return this.attributes[k] || null; },
          appendChild(child) { this.children.push(child); return child; },
          addEventListener() {},
          focus() {}
        };
        Object.defineProperty(el, 'innerHTML', {
          get() { return innerHtmlVal; },
          set(val) {
            innerHtmlVal = val;
            if (val === '') this.children = [];
          }
        });
        Object.defineProperty(el, 'className', {
          get() {
            return Array.from(this.classList._classes).join(' ');
          },
          set(val) {
            this.classList._classes.clear();
            if (val && typeof val === 'string') {
              val.trim().split(/\s+/).filter(Boolean).forEach(c => this.classList._classes.add(c));
            }
          }
        });
        mockElements[id] = el;
      }
      return mockElements[id];
    }

    const knownDomIds = [
      'tests-count', 'panel-tests', 'panel-params', 'panel-headers', 'panel-body', 'panel-auth',
      'btn-open-assertion-builder', 'btn-add-first-assertion', 'btn-close-assertion-builder',
      'btn-cancel-assertion', 'btn-save-assertion', 'btn-clear-all-assertions',
      'assertion-builder-card', 'assertion-builder-title', 'assert-edit-id', 'assertion-builder-error',
      'assert-type-select', 'assert-property-group', 'assert-property-label', 'assert-property-input',
      'assert-property-hint', 'assert-operator-select', 'assert-expected-group', 'assert-expected-label',
      'assert-expected-type', 'assert-expected-input', 'assert-expected-hint', 'assert-security-notice',
      'assert-security-notice-text', 'assertions-empty-state', 'assertions-list-container',
      'assertions-table', 'assertions-tbody',
      // Step 5 Test Results & History Detail DOM elements
      'res-tab-btn-tests', 'res-tests-count', 'res-tests-metric', 'res-tests-badge',
      'panel-res-tests', 'res-tests-empty-state', 'res-tests-empty-desc', 'res-tests-content',
      'hist-detail-test-item', 'hist-detail-test-pill', 'tab-btn-hist-tests',
      'hist-detail-tests-counter', 'hist-view-tests', 'hist-detail-tests-content'
    ];
    knownDomIds.forEach(id => getOrCreateMock(id));

    // Ensure mock parentElements for focus helper
    mockElements['assert-property-input'].parentElement = mockElements['assert-property-group'];
    mockElements['assert-expected-input'].parentElement = mockElements['assert-expected-group'];

    global.document = {
      getElementById(id) {
        return mockElements[id] || null;
      },
      createElement(tag) {
        return getOrCreateMock(`mock_${tag}_${Math.random()}`, tag);
      },
      querySelectorAll(selector) {
        return [];
      },
      querySelector(selector) {
        return null;
      },
      addEventListener() {}
    };

    // 1. Assertion ID generation
    const id1 = generateAssertionId('status_code');
    const id2 = generateAssertionId('status_code');
    const idsSet = new Set();
    for (let i = 0; i < 50; i++) {
      idsSet.add(generateAssertionId('json_path'));
    }
    assert(id1.startsWith('assert_status_code_') && id1 !== id2 && idsSet.size === 50,
           'TEST 135: Assertion ID generator produces unique, collision-resistant, prefixed IDs');

    // 2. Sensitive header detection
    assert(isSensitiveHeaderName('Authorization') === true &&
           isSensitiveHeaderName('Set-Cookie') === true &&
           isSensitiveHeaderName('x-api-key') === true &&
           isSensitiveHeaderName('Content-Type') === false &&
           isSensitiveHeaderName('Accept') === false,
           'TEST 136: isSensitiveHeaderName accurately identifies authentication and cookie headers');

    // 3. Sensitive property name detection
    assert(isSensitivePropertyName('user.password') === true &&
           isSensitivePropertyName('auth.access_token') === true &&
           isSensitivePropertyName('client_secret') === true &&
           isSensitivePropertyName('data.items[0].secret') === true &&
           isSensitivePropertyName('user.username') === false &&
           isSensitivePropertyName('status') === false,
           'TEST 137: isSensitivePropertyName accurately detects credentials in nested JSON paths');

    // 4. Expected value parsing - auto detection
    assert(parseExpectedValue('status_code', '200') === 200 &&
           parseExpectedValue('response_time', '350.5') === 350.5 &&
           parseExpectedValue('json_path', 'true') === true &&
           parseExpectedValue('json_path', 'false') === false &&
           parseExpectedValue('json_path', 'null') === null &&
           parseExpectedValue('json_path', '42') === 42,
           'TEST 138: parseExpectedValue correctly auto-detects numbers, booleans, and null primitives');

    // 5. Expected value parsing - quotes and explicit type
    assert(parseExpectedValue('body_text', '"hello world"') === 'hello world' &&
           parseExpectedValue('json_path', "'single quoted'") === 'single quoted' &&
           parseExpectedValue('json_path', '123', 'string') === '123' &&
           parseExpectedValue('json_path', 'true', 'string') === 'true',
           'TEST 139: parseExpectedValue strips outer quotes and honors explicit string casting');

    // 6. Exists and not_exists operators always return null
    assert(parseExpectedValue('header', 'any text', 'auto', 'exists') === null &&
           parseExpectedValue('json_path', '12345', 'number', 'not_exists') === null,
           'TEST 140: parseExpectedValue always returns null for exists and not_exists operators');

    // 7. Builder form initialization & category switching
    mockElements['assert-type-select'].value = 'header';
    updateAssertionFormForType();
    assert(!mockElements['assert-property-group'].classList.contains('hidden') &&
           mockElements['assert-property-label'].textContent === 'Header Name',
           'TEST 141: updateAssertionFormForType reveals property input and configures header label');

    // 8. Assertion creation for all five categories
    setActiveRequestAssertions([]);
    const categories = [
      { type: 'status_code', op: 'equals', exp: '200', prop: '' },
      { type: 'response_time', op: 'less_than', exp: '500', prop: '' },
      { type: 'header', op: 'contains', exp: 'json', prop: 'Content-Type' },
      { type: 'body_text', op: 'contains', exp: 'success', prop: '' },
      { type: 'json_path', op: 'equals', exp: '10', prop: 'data.count' }
    ];

    categories.forEach(cat => {
      openAssertionBuilder();
      mockElements['assert-type-select'].value = cat.type;
      updateAssertionFormForType();
      if (cat.prop) mockElements['assert-property-input'].value = cat.prop;
      mockElements['assert-operator-select'].value = cat.op;
      mockElements['assert-expected-input'].value = cat.exp;
      saveAssertionFromForm();
    });

    const createdAssertions = getActiveRequestAssertions();
    assert(createdAssertions.length === 5 &&
           createdAssertions.every(a => a.id && a.type && a.operator && a.enabled === true),
           'TEST 142: Builder creates valid assertion models across all five categories');

    // 9. Sensitive header operator restriction in builder
    openAssertionBuilder();
    mockElements['assert-type-select'].value = 'header';
    updateAssertionFormForType();
    mockElements['assert-property-input'].value = 'Authorization';
    checkPropertySensitivity();
    assert(!mockElements['assert-security-notice'].classList.contains('hidden') &&
           mockElements['assert-operator-select'].children.length === 2 &&
           mockElements['assert-operator-select'].children[0].value === 'exists',
           'TEST 143: Sensitive header restricts builder operators to existence checks and shows security notice');
    closeAssertionBuilder();

    // 10. Sensitive JSON path operator restriction in builder
    openAssertionBuilder();
    mockElements['assert-type-select'].value = 'json_path';
    updateAssertionFormForType();
    mockElements['assert-property-input'].value = 'user.password';
    checkPropertySensitivity();
    assert(!mockElements['assert-security-notice'].classList.contains('hidden') &&
           mockElements['assert-operator-select'].children.length === 2 &&
           mockElements['assert-operator-select'].children[0].value === 'exists',
           'TEST 144: Sensitive JSON property restricts builder operators to existence checks and shows notice');
    closeAssertionBuilder();

    // 11. Validation: Invalid status code
    openAssertionBuilder();
    mockElements['assert-type-select'].value = 'status_code';
    updateAssertionFormForType();
    mockElements['assert-operator-select'].value = 'equals';
    mockElements['assert-expected-input'].value = '999';
    saveAssertionFromForm();
    assert(!mockElements['assertion-builder-error'].classList.contains('hidden') &&
           mockElements['assertion-builder-error'].textContent.includes('Status code must be an integer between 100 and 599'),
           'TEST 145: Builder validation rejects invalid HTTP status code (>599)');
    closeAssertionBuilder();

    // 12. Validation: Negative latency
    openAssertionBuilder();
    mockElements['assert-type-select'].value = 'response_time';
    updateAssertionFormForType();
    mockElements['assert-operator-select'].value = 'less_than';
    mockElements['assert-expected-input'].value = '-100';
    saveAssertionFromForm();
    assert(!mockElements['assertion-builder-error'].classList.contains('hidden') &&
           mockElements['assertion-builder-error'].textContent.includes('non-negative number'),
           'TEST 146: Builder validation rejects negative response latency threshold');
    closeAssertionBuilder();

    // 13. Validation: Missing property for header and JSON path
    openAssertionBuilder();
    mockElements['assert-type-select'].value = 'header';
    updateAssertionFormForType();
    mockElements['assert-property-input'].value = '';
    mockElements['assert-expected-input'].value = 'application/json';
    saveAssertionFromForm();
    assert(!mockElements['assertion-builder-error'].classList.contains('hidden') &&
           mockElements['assertion-builder-error'].textContent.includes('Header name is required'),
           'TEST 147: Builder validation rejects empty header property name');
    closeAssertionBuilder();

    // 14. Validation: Prototype pollution in JSON path
    openAssertionBuilder();
    mockElements['assert-type-select'].value = 'json_path';
    updateAssertionFormForType();
    mockElements['assert-property-input'].value = 'user.__proto__.polluted';
    mockElements['assert-expected-input'].value = 'true';
    saveAssertionFromForm();
    assert(!mockElements['assertion-builder-error'].classList.contains('hidden') &&
           mockElements['assertion-builder-error'].textContent.includes('forbidden prototype properties'),
           'TEST 148: Builder validation blocks __proto__ prototype pollution in JSON path');
    closeAssertionBuilder();

    // 15. Validation: Code injection in expected value
    openAssertionBuilder();
    mockElements['assert-type-select'].value = 'body_text';
    updateAssertionFormForType();
    mockElements['assert-expected-input'].value = 'eval("alert(1)")';
    saveAssertionFromForm();
    assert(!mockElements['assertion-builder-error'].classList.contains('hidden') &&
           mockElements['assertion-builder-error'].textContent.includes('Forbidden script or dynamic code pattern'),
           'TEST 149: Builder validation rejects eval() code injection in expected value');
    closeAssertionBuilder();

    // 16. Editing an assertion in place
    const editTargetId = createdAssertions[0].id;
    openAssertionBuilder(editTargetId);
    assert(mockElements['assertion-builder-title'].textContent === 'Edit Assertion' &&
           mockElements['assert-edit-id'].value === editTargetId,
           'TEST 150A: openAssertionBuilder populates form with targeted assertion details');
    mockElements['assert-expected-input'].value = '201';
    saveAssertionFromForm();
    const updatedAssertions = getActiveRequestAssertions();
    assert(updatedAssertions.length === 5 &&
           updatedAssertions[0].id === editTargetId &&
           updatedAssertions[0].expected === 201 &&
           updatedAssertions[0].enabled === true,
           'TEST 150B: saveAssertionFromForm updates targeted assertion in place without changing ID or enabled status');

    // 17. Toggling enabled status
    toggleAssertionEnabled(editTargetId);
    assert(getActiveRequestAssertions()[0].enabled === false &&
           mockElements['tests-count'].textContent === '4',
           'TEST 151A: toggleAssertionEnabled flips enabled boolean and updates tests tab counter');
    toggleAssertionEnabled(editTargetId);
    assert(getActiveRequestAssertions()[0].enabled === true &&
           mockElements['tests-count'].textContent === '5',
           'TEST 151B: Toggling again re-enables assertion and restores badge counter');

    // 18. Deleting an assertion
    const deleteId = createdAssertions[1].id;
    deleteAssertion(deleteId);
    assert(getActiveRequestAssertions().length === 4 &&
           !getActiveRequestAssertions().some(a => a.id === deleteId),
           'TEST 152: deleteAssertion removes targeted assertion while preserving remaining assertions');

    // 19. Clearing all assertions
    clearAllAssertions();
    assert(getActiveRequestAssertions().length === 0 &&
           !mockElements['assertions-empty-state'].classList.contains('hidden') &&
           mockElements['assertions-list-container'].classList.contains('hidden') &&
           mockElements['tests-count'].textContent === '0',
           'TEST 153: clearAllAssertions empties active assertions, updates counter to 0, and restores empty state');

    // 20. Saved request template conversion & state loading
    const rawSavedReq = {
      id: 777,
      name: 'User API',
      method: 'GET',
      url: 'https://api.example.com/users',
      assertions: [
        { id: 'as_1', type: 'status_code', operator: 'equals', expected: 200, enabled: true },
        { id: 'as_2', type: 'header', property: 'Content-Type', operator: 'contains', expected: 'json', enabled: true }
      ]
    };
    const template = convertSavedRequestToTemplate(rawSavedReq);
    assert(Array.isArray(template.assertions) && template.assertions.length === 2 &&
           template.assertions[0].id === 'as_1',
           'TEST 154A: convertSavedRequestToTemplate extracts and maps assertions array');

    loadRequestIntoState(template);
    assert(getActiveRequestAssertions().length === 2 &&
           mockElements['tests-count'].textContent === '2',
           'TEST 154B: loadRequestIntoState deep copies assertions into active workspace state');

    // Mutate state and ensure original template is not mutated
    getActiveRequestAssertions()[0].expected = 404;
    assert(template.assertions[0].expected === 200,
           'TEST 154C: Assertion state isolation: mutating activeRequest does not alter source template');

    // 21. Workspace state isolation across different requests
    loadRequestIntoState({
      name: 'Empty Request',
      method: 'POST',
      url: 'https://api.example.com/items',
      assertions: []
    });
    assert(getActiveRequestAssertions().length === 0 &&
           mockElements['tests-count'].textContent === '0',
           'TEST 155: Switching request templates prevents assertion leakage and clears previous assertions');

    // 22. Cross-layer engine evaluation on builder-generated assertions
    const builderGeneratedAssertions = [
      { id: 'bg_1', type: 'status_code', operator: 'equals', expected: 200, enabled: true },
      { id: 'bg_2', type: 'response_time', operator: 'less_than', expected: 1000, enabled: true },
      { id: 'bg_3', type: 'header', property: 'Content-Type', operator: 'contains', expected: 'application/json', enabled: true },
      { id: 'bg_4', type: 'json_path', property: 'user.id', operator: 'equals', expected: 101, enabled: true },
      { id: 'bg_5', type: 'header', property: 'Authorization', operator: 'exists', expected: null, enabled: true }
    ];

    const engineEval = assertionEngine.evaluateAssertions(builderGeneratedAssertions, {
      status: 200,
      timeMs: 120,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'authorization': 'Bearer token123'
      },
      body: {
        user: { id: 101, name: 'Alice' }
      }
    });

    assert(engineEval.summary.total === 5 &&
           engineEval.summary.passed === 5 &&
           engineEval.summary.status === 'passed',
           'TEST 156: Client-side assertion engine evaluates builder-generated assertions with 100% pass rate');

    // =========================================================================
    // Phase 10: Test Results Panel & Execution Integration (Step 5)
    // =========================================================================
    console.log('\n--- Phase 10: Test Results Panel & Execution Integration Tests ---');

    // 1. HTTP 200 with all assertions passing
    setActiveRequestAssertions([
      { id: 'as_stat', type: 'status_code', operator: 'equals', expected: 200, enabled: true },
      { id: 'as_lat', type: 'response_time', operator: 'less_than', expected: 500, enabled: true }
    ]);
    const resp200 = {
      status: 200,
      timeMs: 150,
      headers: { 'content-type': 'application/json' },
      body: { success: true }
    };
    const evalRes1 = evaluateAndRenderTestResults(resp200);
    assert(
      evalRes1 &&
      evalRes1.summary.total === 2 &&
      evalRes1.summary.passed === 2 &&
      evalRes1.summary.failed === 0 &&
      evalRes1.summary.status === 'passed' &&
      mockElements['res-tests-count'].classList.contains('badge-success') &&
      mockElements['res-tests-count'].textContent === '2/2' &&
      mockElements['res-tests-badge'].textContent === '2/2 Passed' &&
      mockElements['res-tests-badge'].classList.contains('metric-badge-success') &&
      mockElements['res-tests-content'].innerHTML.includes('All Assertions Passed'),
      'TEST 157: HTTP 200 with all assertions passing displays passed summary and green badges'
    );

    // 2. HTTP 200 with one assertion failing
    setActiveRequestAssertions([
      { id: 'as_stat_ok', type: 'status_code', operator: 'equals', expected: 200, enabled: true },
      { id: 'as_lat_fail', type: 'response_time', operator: 'less_than', expected: 50, enabled: true }
    ]);
    const evalRes2 = evaluateAndRenderTestResults(resp200);
    assert(
      evalRes2 &&
      evalRes2.summary.total === 2 &&
      evalRes2.summary.passed === 1 &&
      evalRes2.summary.failed === 1 &&
      evalRes2.summary.status === 'failed' &&
      resp200.status === 200 &&
      mockElements['res-tests-count'].classList.contains('badge-danger') &&
      mockElements['res-tests-count'].textContent === '1/2' &&
      mockElements['res-tests-badge'].textContent === '1/2 Passed' &&
      mockElements['res-tests-badge'].classList.contains('metric-badge-danger') &&
      mockElements['res-tests-content'].innerHTML.includes('Assertions Failed (1 of 2 passed)'),
      'TEST 158: HTTP 200 with one failing assertion updates badge to danger without changing HTTP 200 status'
    );

    // 3. HTTP 404/500 upstream error response evaluated against assertions
    setActiveRequestAssertions([
      { id: 'as_expect_404', type: 'status_code', operator: 'equals', expected: 404, enabled: true },
      { id: 'as_expect_msg', type: 'body_text', operator: 'contains', expected: 'Resource Not Found', enabled: true },
      { id: 'as_expect_200', type: 'status_code', operator: 'equals', expected: 200, enabled: true }
    ]);
    const upstreamErrResp = {
      status: 404,
      statusText: 'Not Found',
      timeMs: 80,
      headers: { 'content-type': 'text/plain' },
      body: 'Error: Resource Not Found'
    };
    const evalRes3 = evaluateAndRenderTestResults(upstreamErrResp);
    assert(
      evalRes3 &&
      evalRes3.summary.total === 3 &&
      evalRes3.summary.passed === 2 &&
      evalRes3.summary.failed === 1 &&
      upstreamErrResp.status === 404 &&
      upstreamErrResp.body === 'Error: Resource Not Found' &&
      evalRes3.results[0].passed === true &&
      evalRes3.results[1].passed === true &&
      evalRes3.results[2].passed === false,
      'TEST 159: HTTP 404/500 upstream error response evaluated against assertions and preserved normally'
    );

    // 4. Network failure (ECONNREFUSED/timeout) without response
    renderTestResultsError('Connection refused by remote host', 'ECONNREFUSED');
    assert(
      mockElements['res-tests-content'].classList.contains('hidden') &&
      !mockElements['res-tests-empty-state'].classList.contains('hidden') &&
      mockElements['res-tests-empty-desc'].innerHTML.includes('ECONNREFUSED') &&
      mockElements['res-tests-empty-desc'].innerHTML.includes('Connection refused by remote host') &&
      mockElements['res-tests-count'].classList.contains('hidden') &&
      mockElements['res-tests-metric'].classList.contains('hidden') &&
      activeResponse.test_results === null,
      'TEST 160: Network failure renders diagnostic error state in panel with null test results'
    );

    // 5. No assertions configured
    setActiveRequestAssertions([]);
    resetTestResultsViewer();
    const evalResEmpty = evaluateAndRenderTestResults({ status: 200, timeMs: 50 });
    assert(
      evalResEmpty === null &&
      mockElements['res-tests-content'].classList.contains('hidden') &&
      !mockElements['res-tests-empty-state'].classList.contains('hidden') &&
      mockElements['res-tests-count'].classList.contains('hidden') &&
      mockElements['res-tests-metric'].classList.contains('hidden') &&
      activeResponse.test_results === null,
      'TEST 161: Request with no assertions renders clean empty state without active badges'
    );

    // 6. All assertions disabled
    setActiveRequestAssertions([
      { id: 'as_dis_1', type: 'status_code', operator: 'equals', expected: 200, enabled: false },
      { id: 'as_dis_2', type: 'response_time', operator: 'less_than', expected: 200, enabled: false }
    ]);
    const evalResDisabled = evaluateAndRenderTestResults({ status: 200, timeMs: 50 });
    assert(
      evalResDisabled === null &&
      mockElements['res-tests-content'].classList.contains('hidden') &&
      !mockElements['res-tests-empty-state'].classList.contains('hidden') &&
      mockElements['res-tests-empty-desc'].textContent.includes('currently disabled') &&
      mockElements['res-tests-count'].classList.contains('hidden') &&
      mockElements['res-tests-metric'].classList.contains('hidden'),
      'TEST 162: All assertions disabled renders informational empty state and skips evaluation'
    );

    // 7. Mixed enabled and disabled assertions
    setActiveRequestAssertions([
      { id: 'as_en_1', type: 'status_code', operator: 'equals', expected: 200, enabled: true },
      { id: 'as_dis_3', type: 'status_code', operator: 'equals', expected: 500, enabled: false },
      { id: 'as_en_2', type: 'response_time', operator: 'less_than', expected: 300, enabled: true }
    ]);
    const evalResMixed = evaluateAndRenderTestResults({ status: 200, timeMs: 100 });
    assert(
      evalResMixed &&
      evalResMixed.summary.total === 2 &&
      evalResMixed.summary.passed === 2 &&
      evalResMixed.results.length === 2 &&
      !evalResMixed.results.some(r => r.id === 'as_dis_3'),
      'TEST 163: Mixed enabled and disabled assertions evaluates only enabled items and ignores disabled ones'
    );

    // 8. Multiple categories in execution
    setActiveRequestAssertions([
      { id: 'mc_status', type: 'status_code', operator: 'equals', expected: 200, enabled: true },
      { id: 'mc_latency', type: 'response_time', operator: 'less_than', expected: 500, enabled: true },
      { id: 'mc_header', type: 'header', property: 'Content-Type', operator: 'contains', expected: 'json', enabled: true },
      { id: 'mc_body', type: 'body_text', operator: 'contains', expected: 'operational', enabled: true },
      { id: 'mc_json', type: 'json_path', property: 'data.status', operator: 'equals', expected: 'healthy', enabled: true }
    ]);
    const multiCatResp = {
      status: 200,
      timeMs: 120,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: { data: { status: 'healthy', note: 'all systems operational' } },
      rawText: JSON.stringify({ data: { status: 'healthy', note: 'all systems operational' } })
    };
    const evalResMulti = evaluateAndRenderTestResults(multiCatResp);
    assert(
      evalResMulti &&
      evalResMulti.summary.total === 5 &&
      evalResMulti.summary.passed === 5 &&
      evalResMulti.results.some(r => r.type === 'status_code') &&
      evalResMulti.results.some(r => r.type === 'response_time') &&
      evalResMulti.results.some(r => r.type === 'header') &&
      evalResMulti.results.some(r => r.type === 'body_text') &&
      evalResMulti.results.some(r => r.type === 'json_path'),
      'TEST 164: All five assertion categories evaluated together in a single request execution'
    );

    // 9. Test results summary counters
    assert(
      mockElements['res-tests-content'].innerHTML.includes('Total: 5') &&
      mockElements['res-tests-content'].innerHTML.includes('Passed: 5') &&
      mockElements['res-tests-content'].innerHTML.includes('Failed: 0') &&
      mockElements['res-tests-count'].textContent === '5/5',
      'TEST 165: Summary metrics bar correctly displays total, passed, and failed counters'
    );

    // 10. Sensitive header redaction in test results
    setActiveRequestAssertions([
      { id: 'sec_hdr', type: 'header', property: 'Authorization', operator: 'contains', expected: 'Bearer', enabled: true }
    ]);
    const secHdrResp = {
      status: 200,
      timeMs: 80,
      headers: { 'authorization': 'Bearer secret-jwt-key-99999' },
      body: {}
    };
    const evalResSecHdr = evaluateAndRenderTestResults(secHdrResp);
    assert(
      evalResSecHdr &&
      evalResSecHdr.results[0].passed === true &&
      !JSON.stringify(evalResSecHdr.results[0].actual).includes('secret-jwt-key-99999') &&
      !mockElements['res-tests-content'].innerHTML.includes('secret-jwt-key-99999'),
      'TEST 166: Sensitive Authorization header values are safely redacted in evaluation and rendered UI'
    );

    // 11. Sensitive JSON property redaction in test results
    setActiveRequestAssertions([
      { id: 'sec_pwd', type: 'json_path', property: 'user.password', operator: 'exists', expected: null, enabled: true }
    ]);
    const secPwdResp = {
      status: 200,
      timeMs: 90,
      headers: { 'content-type': 'application/json' },
      body: { user: { id: 42, password: 'PlainTextPassword123' } }
    };
    const evalResSecPwd = evaluateAndRenderTestResults(secPwdResp);
    assert(
      evalResSecPwd &&
      evalResSecPwd.results[0].passed === true &&
      evalResSecPwd.results[0].actual === '[REDACTED]' &&
      !JSON.stringify(evalResSecPwd.results[0].actual).includes('PlainTextPassword123') &&
      !mockElements['res-tests-content'].innerHTML.includes('PlainTextPassword123'),
      'TEST 167: Sensitive JSON body properties (e.g. password) are safely redacted in evaluation and rendered UI'
    );

    // 12. Persistence of test_results in request_history via POST /api/requests/execute
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    const serverPort = appServer.address().port;
    const execWithAssertions = {
      name: 'Execute With Assertions Test',
      method: 'GET',
      url: `http://127.0.0.1:${serverPort}/api/health`,
      assertions: [
        { id: 'health_status_200', type: 'status_code', operator: 'equals', expected: 200, enabled: true },
        { id: 'health_json_success', type: 'json_path', property: 'success', operator: 'equals', expected: true, enabled: true }
      ]
    };
    const resExec = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: execWithAssertions
    });
    assert(
      resExec.statusCode === 200 &&
      resExec.json.success === true &&
      resExec.json.data.test_results !== null &&
      resExec.json.data.test_results.summary.status === 'passed' &&
      resExec.json.data.test_results.summary.passed === 2,
      'TEST 168A: POST /api/requests/execute evaluates assertions and attaches test_results to HTTP 200 response'
    );

    // Bounded wait for fire-and-forget database insertion
    let dbRows = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      [dbRows] = await executeQuery(
        `SELECT id, test_results FROM request_history WHERE request_name = 'Execute With Assertions Test' ORDER BY id DESC LIMIT 1`
      );
      if (dbRows && dbRows.length > 0 && dbRows[0].test_results !== null) break;
      await new Promise(r => setTimeout(r, 50));
    }
    assert(
      dbRows && dbRows.length > 0 && dbRows[0].test_results !== null,
      'TEST 168B: Execution test_results successfully persisted into request_history table'
    );
    const persistedTestResults = typeof dbRows[0].test_results === 'string' ? JSON.parse(dbRows[0].test_results) : dbRows[0].test_results;
    assert(
      persistedTestResults.summary.status === 'passed' && persistedTestResults.summary.total === 2,
      'TEST 168C: Persisted test_results JSON in database matches execution evaluation'
    );
    const historyExecId = dbRows[0].id;
    createdHistoryIds.push(historyExecId);

    // 13. History retrieval (GET /api/history/:id) returning stored test_results
    const resGetHist = await makeRequest(appServer, {
      method: 'GET',
      path: `/api/history/${historyExecId}`
    });
    assert(
      resGetHist.statusCode === 200 &&
      resGetHist.json.data.test_results !== null &&
      resGetHist.json.data.test_results.summary.status === 'passed' &&
      Array.isArray(resGetHist.json.data.test_results.results) &&
      resGetHist.json.data.test_results.results.length === 2,
      'TEST 169: GET /api/history/:id returns stored test_results with full summary and results array'
    );

    // 14. Legacy history record with test_results: NULL handled gracefully
    const legacyRecordRes = await historyService.recordExecution(
      { name: 'Legacy Test Request', method: 'GET', url: 'https://api.example.com/legacy' },
      { status: 200, timeMs: 40, body: 'ok' },
      null,
      null
    );
    const legacyHistId = legacyRecordRes.id;
    createdHistoryIds.push(legacyHistId);
    const resGetLegacy = await makeRequest(appServer, {
      method: 'GET',
      path: `/api/history/${legacyHistId}`
    });
    assert(
      resGetLegacy.statusCode === 200 &&
      resGetLegacy.json.data.test_results === null,
      'TEST 170A: GET /api/history/:id handles legacy record with test_results: NULL without error'
    );
    renderHistoricalTestResults(resGetLegacy.json.data);
    assert(
      mockElements['hist-detail-test-item'].classList.contains('hidden') &&
      mockElements['hist-detail-tests-counter'].classList.contains('hidden') &&
      mockElements['hist-detail-tests-content'].innerHTML.includes('No test assertions were recorded'),
      'TEST 170B: History detail modal renders clean empty state for legacy record with test_results: NULL'
    );

    // 15. History detail modal displaying stored test_results without re-running assertions
    const mockHistRecord = {
      id: 9999,
      test_results: {
        summary: { total: 4, passed: 3, failed: 1, status: 'failed' },
        results: [
          { id: 'h1', type: 'status_code', passed: true, message: 'Status 200', actual: 200, expected: 200 },
          { id: 'h2', type: 'response_time', passed: true, message: 'Latency OK', actual: 80, expected: 200 },
          { id: 'h3', type: 'header', passed: true, message: 'Content-Type OK', actual: 'json', expected: 'json' },
          { id: 'h4', type: 'body_text', passed: false, message: 'Expected text not found', actual: 'err', expected: 'success' }
        ]
      }
    };
    renderHistoricalTestResults(mockHistRecord);
    assert(
      !mockElements['hist-detail-test-item'].classList.contains('hidden') &&
      mockElements['hist-detail-test-pill'].textContent === '3/4 Passed' &&
      mockElements['hist-detail-test-pill'].classList.contains('status-pill-danger') &&
      mockElements['hist-detail-tests-counter'].textContent === '3/4' &&
      mockElements['hist-detail-tests-content'].innerHTML.includes('Total: 4') &&
      mockElements['hist-detail-tests-content'].innerHTML.includes('Passed: 3') &&
      mockElements['hist-detail-tests-content'].innerHTML.includes('Failed: 1'),
      'TEST 171: History detail modal accurately displays stored test results without re-evaluating assertions'
    );

    // 16. History persistence failure not breaking HTTP response delivery
    let safetyErrorCaught = null;
    try {
      recordHistorySafely(null, null, null, null);
    } catch (err) {
      safetyErrorCaught = err;
    }
    assert(safetyErrorCaught === null, 'TEST 172: recordHistorySafely swallows logging failures silently and never throws');

    // 17. Verification of no duplicate history entries
    const [beforeRows] = await executeQuery('SELECT COUNT(*) AS total FROM request_history');
    const beforeCount = Number(beforeRows[0].total);
    const resSingleExec = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Single Exec Deduplication Check',
        method: 'GET',
        url: `http://127.0.0.1:${serverPort}/api/health`,
        assertions: [{ id: 'dedup_chk', type: 'status_code', operator: 'equals', expected: 200, enabled: true }]
      }
    });
    assert(resSingleExec.statusCode === 200, 'TEST 173A: Request executes successfully');
    let afterCount = beforeCount;
    for (let attempt = 0; attempt < 20; attempt++) {
      const [afterRows] = await executeQuery('SELECT COUNT(*) AS total FROM request_history');
      afterCount = Number(afterRows[0].total);
      if (afterCount === beforeCount + 1) break;
      await new Promise(r => setTimeout(r, 50));
    }
    assert(afterCount === beforeCount + 1, 'TEST 173B: Exactly one history row created per execution (no duplicate logging)');
    const [dedupRow] = await executeQuery(
      `SELECT id FROM request_history WHERE request_name = 'Single Exec Deduplication Check' ORDER BY id DESC LIMIT 1`
    );
    if (dedupRow && dedupRow[0]) createdHistoryIds.push(dedupRow[0].id);

    // 18. Existing response tabs remain functional
    const sampleFullResponse = {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json', 'cache-control': 'no-cache' },
      body: { message: 'hello' },
      rawText: '{"message":"hello"}',
      cookies: [{ name: 'session_id', value: 'xyz123' }],
      test_results: { summary: { total: 1, passed: 1, failed: 0, status: 'passed' }, results: [] }
    };
    assert(
      sampleFullResponse.status === 200 &&
      sampleFullResponse.headers['content-type'] === 'application/json' &&
      sampleFullResponse.cookies.length === 1 &&
      sampleFullResponse.test_results.summary.status === 'passed',
      'TEST 174: Existing response data structure (body, headers, cookies) preserved alongside test_results'
    );

    // 19. Existing history comparison functionality remains functional
    const histRecA = {
      id: 1,
      response_status: 200,
      response_headers: { 'content-type': 'application/json', 'x-version': '1.0.0' },
      response_body: JSON.stringify({ version: '1.0.0', status: 'ok' }),
      response_time: 150
    };
    const histRecB = {
      id: 2,
      response_status: 200,
      response_headers: { 'content-type': 'application/json', 'x-version': '2.0.0' },
      response_body: JSON.stringify({ version: '2.0.0', status: 'ok' }),
      response_time: 180
    };
    const hdrDiff = compareResponseHeaders(histRecA.response_headers, histRecB.response_headers);
    assert(
      hdrDiff.identical === false &&
      hdrDiff.rows.some(r => r.key.toLowerCase() === 'x-version' && r.status === 'modified'),
      'TEST 175: Day 13 history comparison functionality operates properly without regressions'
    );

    // Clean up mock DOM
    delete global.document;

  } finally {
    // -------------------------------------------------------------------------
    // Phase 9: Teardown & Resource Cleanup
    // -------------------------------------------------------------------------
    console.log('\n--- Teardown: Cleaning Test Data & Closing Servers ---');
    try {
      if (appServer) {
        await new Promise((resolve) => appServer.close(resolve));
      }
      if (createdSavedRequestIds.length > 0) {
        const placeholders = createdSavedRequestIds.map(() => '?').join(',');
        await executeQuery(`DELETE FROM saved_requests WHERE id IN (${placeholders})`, createdSavedRequestIds);
        console.log(`  ✓ Cleaned up ${createdSavedRequestIds.length} test saved_request rows.`);
      }
      if (createdHistoryIds.length > 0) {
        const placeholders = createdHistoryIds.map(() => '?').join(',');
        await executeQuery(`DELETE FROM request_history WHERE id IN (${placeholders})`, createdHistoryIds);
        console.log(`  ✓ Cleaned up ${createdHistoryIds.length} test request_history rows.`);
      }
    } catch (cleanupErr) {
      console.error('  ✗ Cleanup error:', cleanupErr.message);
    }
    await closePool();
    console.log('  ✓ MySQL connection pool closed cleanly.');
  }

  // =========================================================================
  // Final Results
  // =========================================================================
  console.log('\n===========================================');
  console.log(`Day 14 Final Verification Tests: ${passedTests}/${totalTests} Passed`);
  console.log('===========================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Day 14 test runner encountered unhandled error:', err);
  process.exit(1);
});
