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

  } finally {
    // -------------------------------------------------------------------------
    // Phase 8: Teardown & Resource Cleanup
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
  console.log(`Day 14 Step 2 Tests: ${passedTests}/${totalTests} Passed`);
  console.log('===========================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Day 14 test runner encountered unhandled error:', err);
  process.exit(1);
});
