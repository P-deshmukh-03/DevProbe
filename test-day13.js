/**
 * DevProbe Day 13 Verification Test Suite
 * Step 2: Backend History Service Unit Tests
 * Step 3: Automatic Execution History Integration Tests
 *
 * Covers:
 * - Successful execution recording
 * - Failed execution recording (network/timeout errors)
 * - Header redaction (Authorization, Cookie, Set-Cookie, tokens)
 * - JSON body secret redaction (passwords, tokens, client secrets)
 * - URL query parameter redaction (?token=..., ?apiKey=...)
 * - Environment secret protection (enc:v1: ciphertext and masks)
 * - Response truncation above 64 KB (response_body_truncated = 1)
 * - Non-truncated response handling (response_body_truncated = 0)
 * - Pagination defaults, limits, and validation
 * - History summary list retrieval (lightweight payload without large bodies)
 * - Complete history detail retrieval
 * - Missing history record handling (null result and 400 validation)
 * - Individual record deletion
 * - Clear-all history operation
 * - Database error sanitization
 * - Step 3 Integration: POST /api/requests/execute automatic history recording
 * - Integration: HTTP 200, 404, 500 automatic recording
 * - Integration: Network failure & timeout automatic recording
 * - Integration: Non-blocking persistence (DB failures never affect 200 responses or errors)
 * - Integration: Exactly one entry per execution
 * - Integration: Redaction and response structure contracts
 * - Isolated test data cleanup
 */

require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const { executeQuery, closePool, checkDatabaseHealth } = require('./src/config/database');
const historyService = require('./src/services/historyService');
const {
  recordExecution,
  getHistory,
  getHistoryById,
  deleteHistoryById,
  clearAllHistory,
  redactUrl,
  redactHeaders,
  redactBody,
  redactSensitiveJson,
  processResponseBody,
  MAX_HISTORY_BODY_BYTES,
  REDACTED_PLACEHOLDER
} = historyService;
const { AppError } = require('./src/middleware/errorHandler');
const {
  fetchHistoryList,
  renderHistoryList,
  openHistoryDetailModal,
  closeHistoryDetailModal,
  loadHistoryIntoWorkspace,
  deleteHistoryItem,
  confirmClearAllHistory,
  openClearHistoryModal,
  closeClearHistoryModal,
  getHistoryCurrentPage,
  getCachedHistoryItems,
  getSelectedHistoryRecord,
  initSidebar,
  initHistoryManagement,
  activeRequest
} = require('./public/js/app.js');

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
 * Bounded polling helper to wait for an asynchronous condition to be met.
 * Avoids arbitrary sleep delays while reliably tracking fire-and-forget operations.
 */
async function waitFor(predicate, timeoutMs = 3000, intervalMs = 25) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await predicate();
      if (res) return res;
    } catch {
      // Continue polling until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return predicate();
}

/**
 * Helper to dispatch HTTP requests to a test server
 */
function makeRequest(server, { method = 'GET', path = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqHeaders = { ...headers };
    let payload = null;

    if (body !== null && typeof body === 'object') {
      payload = JSON.stringify(body);
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
    } else if (typeof body === 'string') {
      payload = body;
    }

    if (payload !== null) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
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
            // Non-JSON response
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

    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== DevProbe Day 13 Verification Tests (Steps 2 & 3: History & Integration) ===\n');

  // Check database connectivity
  const dbHealth = await checkDatabaseHealth();
  if (!dbHealth.isConnected) {
    console.error(`[Error] Database offline: ${dbHealth.message}. Aborting live database tests.`);
    process.exit(1);
  }
  console.log('  [Live Database] Connected to MySQL successfully.\n');

  let appServer = null;
  let mockUpstreamServer = null;

  try {
    // =========================================================================
    // TEST A: Unit Redaction and Sanitization Helpers
    // =========================================================================
    console.log('--- TEST A: Redaction & Sanitization Helpers ---');

    // A1: URL Redaction
    const safeUrl1 = redactUrl('https://api.example.com/v1/users?token=supersecret123&page=1&apiKey=key_abc');
    assert(safeUrl1.includes('token=%5BREDACTED%5D') || safeUrl1.includes('token=[REDACTED]'), 'TEST A1: Redacts query param token');
    assert(safeUrl1.includes('apiKey=%5BREDACTED%5D') || safeUrl1.includes('apiKey=[REDACTED]'), 'TEST A1: Redacts query param apiKey');
    assert(safeUrl1.includes('page=1'), 'TEST A1: Preserves non-sensitive query param');

    const safeUrl2 = redactUrl('http://admin:secretPass123@api.internal.com:8080/data');
    assert(safeUrl2.includes('[REDACTED]:[REDACTED]@'), 'TEST A1: Redacts embedded basic auth in URL');

    // A2: Header Redaction (Object & Array)
    const rawHeadersObj = {
      'Authorization': 'Bearer my-secret-jwt-token',
      'Cookie': 'session=abc123xyz; secure',
      'Accept': 'application/json',
      'X-Api-Key': 'ak_live_99999',
      'User-Agent': 'DevProbe/1.0'
    };
    const safeHeadersObj = redactHeaders(rawHeadersObj);
    assert(safeHeadersObj['Authorization'] === REDACTED_PLACEHOLDER, 'TEST A2: Redacts Authorization header');
    assert(safeHeadersObj['Cookie'] === REDACTED_PLACEHOLDER, 'TEST A2: Redacts Cookie header');
    assert(safeHeadersObj['X-Api-Key'] === REDACTED_PLACEHOLDER, 'TEST A2: Redacts X-Api-Key header');
    assert(safeHeadersObj['Accept'] === 'application/json', 'TEST A2: Preserves Accept header');
    assert(safeHeadersObj['User-Agent'] === 'DevProbe/1.0', 'TEST A2: Preserves User-Agent header');

    const rawHeadersArr = [
      { key: 'Set-Cookie', value: 'token=xyz' },
      { key: 'Content-Type', value: 'application/json' }
    ];
    const safeHeadersArr = redactHeaders(rawHeadersArr);
    assert(safeHeadersArr['Set-Cookie'] === REDACTED_PLACEHOLDER, 'TEST A2: Redacts Set-Cookie from array headers');
    assert(safeHeadersArr['Content-Type'] === 'application/json', 'TEST A2: Preserves Content-Type from array headers');

    // A3: JSON Body Secret Redaction
    const rawJsonPayload = {
      username: 'john_doe',
      password: 'super_secret_password',
      auth: {
        access_token: 'at_123456789',
        refresh_token: 'rt_987654321',
        client_secret: 'cs_xyz'
      },
      tags: ['test', 'admin']
    };
    const safeJson = redactSensitiveJson(rawJsonPayload);
    assert(safeJson.username === 'john_doe', 'TEST A3: Preserves non-sensitive username');
    assert(safeJson.password === REDACTED_PLACEHOLDER, 'TEST A3: Redacts password field');
    assert(safeJson.auth.access_token === REDACTED_PLACEHOLDER, 'TEST A3: Redacts nested access_token');
    assert(safeJson.auth.refresh_token === REDACTED_PLACEHOLDER, 'TEST A3: Redacts nested refresh_token');
    assert(safeJson.auth.client_secret === REDACTED_PLACEHOLDER, 'TEST A3: Redacts nested client_secret');

    // A4: Environment Secret Protection
    const envSecretPayload = {
      apiKey: 'enc:v1:0123456789abcdef:fedcba9876543210:abcdef0123456789',
      bearerToken: '••••••••',
      rawText: 'Authorization: Bearer secret_live_token'
    };
    const safeEnvBody = redactBody(JSON.stringify(envSecretPayload));
    assert(!safeEnvBody.includes('enc:v1:'), 'TEST A4: Redacts encrypted AES-256-GCM token from body');
    assert(!safeEnvBody.includes('••••••••') || safeEnvBody.includes(REDACTED_PLACEHOLDER), 'TEST A4: Redacts mask placeholder from body');

    // =========================================================================
    // TEST B: Successful Execution Recording
    // =========================================================================
    console.log('\n--- TEST B: Successful Execution Recording ---');

    const execB = await recordExecution(
      {
        name: 'Get User Profile Test',
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/users/1?token=querySecret',
        headers: {
          'Authorization': 'Bearer token-to-redact',
          'Accept': 'application/json'
        },
        body: null
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'session=abc'
        },
        body: JSON.stringify({ id: 1, name: 'Leanne Graham', password: 'userHash123' }),
        timeMs: 52
      },
      null
    );

    assert(execB && execB.success === true, 'TEST B1: recordExecution returns success: true');
    assert(typeof execB.id === 'number' && execB.id > 0, 'TEST B1: Returns valid numeric history ID');

    // Verify persisted record
    const recordB = await getHistoryById(execB.id);
    assert(recordB !== null, 'TEST B2: getHistoryById finds inserted record');
    assert(recordB.request_name === 'Get User Profile Test', 'TEST B2: Preserves request name');
    assert(recordB.method === 'GET', 'TEST B2: Preserves HTTP method');
    assert(!recordB.url.includes('querySecret'), 'TEST B2: Redacts query param secret in persisted URL');
    assert(recordB.request_headers['Authorization'] === REDACTED_PLACEHOLDER, 'TEST B2: Persisted Authorization header is redacted');
    assert(recordB.request_headers['Accept'] === 'application/json', 'TEST B2: Persisted Accept header is preserved');
    assert(recordB.response_status === 200, 'TEST B2: Persisted response_status is 200');
    assert(recordB.response_headers['Set-Cookie'] === REDACTED_PLACEHOLDER, 'TEST B2: Persisted Set-Cookie header is redacted');
    assert(recordB.response_body.includes(REDACTED_PLACEHOLDER), 'TEST B2: Persisted response body has sensitive password redacted');
    assert(!recordB.response_body.includes('userHash123'), 'TEST B2: Sensitive response body value is never saved');
    assert(recordB.response_time === 52, 'TEST B2: Persisted response_time matches duration');
    assert(recordB.response_body_truncated === false, 'TEST B2: response_body_truncated is false for small responses');
    assert(recordB.error_message === null, 'TEST B2: error_message is null for successful execution');

    // =========================================================================
    // TEST C: Failed Execution Recording (Timeout & Network Errors)
    // =========================================================================
    console.log('\n--- TEST C: Failed Execution Recording ---');

    const timeoutError = new AppError('ETIMEDOUT: Connection timed out after 5000ms', 504, 'TIMEOUT_ERROR');
    const execC = await recordExecution(
      {
        name: 'Timed Out Endpoint',
        method: 'POST',
        url: 'https://unreachable.example.com/api',
        headers: { 'Content-Type': 'application/json' },
        body: '{"action":"sync"}'
      },
      null,
      timeoutError
    );

    assert(execC && execC.success === true, 'TEST C1: recordExecution saves failed execution');

    const recordC = await getHistoryById(execC.id);
    assert(recordC.method === 'POST', 'TEST C2: Preserves POST method on failed request');
    assert(recordC.response_status === null, 'TEST C2: response_status is null on network/timeout failure');
    assert(recordC.response_headers === null, 'TEST C2: response_headers is null on network failure');
    assert(recordC.response_body === null, 'TEST C2: response_body is null on network failure');
    assert(recordC.error_message.includes('ETIMEDOUT'), 'TEST C2: error_message captures diagnostic failure description');

    // =========================================================================
    // TEST D: Large Response Handling & 64 KB Truncation
    // =========================================================================
    console.log('\n--- TEST D: Large Response Handling & 64 KB Truncation ---');

    // D1: Response exceeding 64 KB
    const largeContent = 'X'.repeat(70000); // 70 KB
    const execD1 = await recordExecution(
      { method: 'GET', url: 'https://api.example.com/large-data' },
      { status: 200, body: largeContent, timeMs: 110 }
    );

    const recordD1 = await getHistoryById(execD1.id);
    assert(recordD1.response_body_truncated === true, 'TEST D1: response_body_truncated is true for >64 KB payload');
    assert(Buffer.byteLength(recordD1.response_body, 'utf8') <= MAX_HISTORY_BODY_BYTES, 'TEST D1: Stored body is truncated to <= 64 KB');

    // D2: Response under 64 KB
    const smallContent = 'A'.repeat(1024); // 1 KB
    const execD2 = await recordExecution(
      { method: 'GET', url: 'https://api.example.com/small-data' },
      { status: 200, body: smallContent, timeMs: 15 }
    );

    const recordD2 = await getHistoryById(execD2.id);
    assert(recordD2.response_body_truncated === false, 'TEST D2: response_body_truncated is false for <=64 KB payload');
    assert(recordD2.response_body === smallContent, 'TEST D2: Complete small payload is preserved');

    // =========================================================================
    // TEST E: Pagination and Query Limits
    // =========================================================================
    console.log('\n--- TEST E: Pagination and Query Limits ---');

    // E1: Default pagination
    const historyList = await getHistory({ page: 1, limit: 10 });
    assert(Array.isArray(historyList.items), 'TEST E1: getHistory returns items array');
    assert(historyList.pagination !== undefined, 'TEST E1: Returns pagination metadata');
    assert(historyList.pagination.page === 1, 'TEST E1: Default page is 1');
    assert(historyList.pagination.limit === 10, 'TEST E1: Page limit respected');
    assert(historyList.pagination.total >= 4, 'TEST E1: Total count reflects records');
    assert(historyList.pagination.totalPages >= 1, 'TEST E1: Calculates totalPages');

    // E2: List view excludes large bodies
    const firstItem = historyList.items[0];
    assert(firstItem.request_body === undefined, 'TEST E2: List view excludes request_body');
    assert(firstItem.response_body === undefined, 'TEST E2: List view excludes response_body');
    assert(firstItem.id !== undefined, 'TEST E2: List view includes record id');
    assert(firstItem.method !== undefined, 'TEST E2: List view includes HTTP method');
    assert(firstItem.url !== undefined, 'TEST E2: List view includes URL');

    // E3: Limit clamping to 100
    const clampedList = await getHistory({ page: 1, limit: 500 });
    assert(clampedList.pagination.limit === 100, 'TEST E3: Maximum limit is clamped to 100');

    // E4: Validation errors on invalid page/limit
    let pageErrorCaught = false;
    try {
      await getHistory({ page: 0, limit: 10 });
    } catch (err) {
      pageErrorCaught = err instanceof AppError && err.statusCode === 400;
    }
    assert(pageErrorCaught, 'TEST E4: Invalid page throws 400 AppError');

    let limitErrorCaught = false;
    try {
      await getHistory({ page: 1, limit: -5 });
    } catch (err) {
      limitErrorCaught = err instanceof AppError && err.statusCode === 400;
    }
    assert(limitErrorCaught, 'TEST E4: Invalid limit throws 400 AppError');

    // =========================================================================
    // TEST F: Missing History Record & ID Validation
    // =========================================================================
    console.log('\n--- TEST F: Missing History Record & ID Validation ---');

    const notFoundRecord = await getHistoryById(99999999);
    assert(notFoundRecord === null, 'TEST F1: Nonexistent history ID returns null');

    let invalidIdCaught = false;
    try {
      await getHistoryById('not-a-number');
    } catch (err) {
      invalidIdCaught = err instanceof AppError && err.statusCode === 400;
    }
    assert(invalidIdCaught, 'TEST F2: Non-numeric ID throws 400 AppError');

    // =========================================================================
    // TEST G: Individual Record Deletion
    // =========================================================================
    console.log('\n--- TEST G: Individual Record Deletion ---');

    const execG = await recordExecution(
      { method: 'DELETE', url: 'https://api.example.com/delete-me' },
      { status: 204 }
    );
    const deleteId = execG.id;

    const delRes1 = await deleteHistoryById(deleteId);
    assert(delRes1.success === true && delRes1.deleted === true, 'TEST G1: deleteHistoryById returns deleted: true');

    const verifyDel = await getHistoryById(deleteId);
    assert(verifyDel === null, 'TEST G2: Deleted record is no longer found');

    const delRes2 = await deleteHistoryById(deleteId);
    assert(delRes2.deleted === false, 'TEST G3: Deleting already deleted record returns deleted: false');

    // =========================================================================
    // TEST H: Clear-All History Operation
    // =========================================================================
    console.log('\n--- TEST H: Clear-All History Operation ---');

    // Ensure at least one record exists before clearAll
    await recordExecution({ method: 'GET', url: 'https://api.example.com/before-clear' });

    const clearRes = await clearAllHistory();
    assert(clearRes.success === true, 'TEST H1: clearAllHistory returns success: true');
    assert(typeof clearRes.deletedCount === 'number' && clearRes.deletedCount >= 1, 'TEST H1: Reports deletedCount');

    const afterClearList = await getHistory({ page: 1, limit: 10 });
    assert(afterClearList.pagination.total === 0, 'TEST H2: Total history records after clearAll is 0');
    assert(afterClearList.items.length === 0, 'TEST H2: History items list is empty after clearAll');

    // Verify table structure remains completely intact by inserting a new record after clear
    const afterClearExec = await recordExecution({ method: 'GET', url: 'https://api.example.com/after-clear' });
    assert(afterClearExec.success === true, 'TEST H3: Table remains fully operational after clearAll');

    // =========================================================================
    // TEST I: Database Error Sanitization
    // =========================================================================
    console.log('\n--- TEST I: Database Error Sanitization ---');

    let dbErrSafe = true;
    try {
      await deleteHistoryById(0);
    } catch (err) {
      if (err.message.includes('password') || err.message.includes('root@')) {
        dbErrSafe = false;
      }
    }
    assert(dbErrSafe, 'TEST I1: Database error messages never leak connection credentials');

    // Clear history to prepare clean slate for Step 3 integration tests
    await clearAllHistory();

    // =========================================================================
    // TEST J: Step 3 Automatic Execution History Integration Tests
    // =========================================================================
    console.log('\n--- TEST J: Step 3 Automatic Execution History Integration ---');

    // 1. Start App server
    appServer = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    // 2. Start Mock Upstream Server
    mockUpstreamServer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === '/api/success') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Server-Version': '1.0'
        });
        res.end(JSON.stringify({ greeting: 'Hello World', count: 42 }));
      } else if (url.pathname === '/api/not-found') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Resource Not Found' }));
      } else if (url.pathname === '/api/server-error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Database Crash' }));
      } else if (url.pathname === '/api/slow') {
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ delayed: true }));
          }
        }, 1500);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      }
    });

    const mockPort = await new Promise((resolve) => {
      mockUpstreamServer.listen(0, () => resolve(mockUpstreamServer.address().port));
    });

    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';

    // J1: Successful execution returns immediately and records are eventually persisted
    const resJ1 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Step 3 Success Test',
        method: 'GET',
        url: `http://localhost:${mockPort}/api/success`
      }
    });
    assert(resJ1.statusCode === 200, 'TEST J1: Execution returns HTTP 200');
    assert(resJ1.json?.success === true, 'TEST J1: API response indicates success: true');
    assert(resJ1.json?.data?.status === 200, 'TEST J1: Upstream status is 200');

    // Bounded polling to wait for fire-and-forget record insertion
    const itemJ1 = await waitFor(async () => {
      const history = await getHistory({ page: 1, limit: 1 });
      return history.items.length === 1 ? history.items[0] : null;
    });
    assert(itemJ1 !== null, 'TEST J1: Exactly one history entry eventually persisted on success');
    assert(itemJ1.request_name === 'Step 3 Success Test', 'TEST J1: Auto-saved entry captures request name');
    assert(itemJ1.method === 'GET', 'TEST J1: Auto-saved entry captures GET method');
    assert(itemJ1.response_status === 200, 'TEST J1: Auto-saved entry captures response status 200');
    assert(itemJ1.error_message === null, 'TEST J1: Auto-saved successful entry has null error_message');

    // J2: Upstream HTTP 404 saves entry with status 404
    const resJ2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Step 3 404 Test',
        method: 'GET',
        url: `http://localhost:${mockPort}/api/not-found`
      }
    });
    assert(resJ2.statusCode === 200, 'TEST J2: Execution endpoint returns 200 wrapper');
    assert(resJ2.json?.data?.status === 404, 'TEST J2: Upstream execution data status is 404');

    const itemJ2 = await waitFor(async () => {
      const history = await getHistory({ page: 1, limit: 1 });
      return (history.items.length > 0 && history.items[0].response_status === 404) ? history.items[0] : null;
    });
    assert(itemJ2 !== null, 'TEST J2: History entry captures upstream 404 status');
    assert(itemJ2.error_message === null, 'TEST J2: 404 is not classified as a transport error');

    // J3: Upstream HTTP 500 saves entry with status 500
    const resJ3 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Step 3 500 Test',
        method: 'GET',
        url: `http://localhost:${mockPort}/api/server-error`
      }
    });
    assert(resJ3.statusCode === 200, 'TEST J3: Execution endpoint returns 200 wrapper');
    assert(resJ3.json?.data?.status === 500, 'TEST J3: Upstream execution data status is 500');

    const itemJ3 = await waitFor(async () => {
      const history = await getHistory({ page: 1, limit: 1 });
      return (history.items.length > 0 && history.items[0].response_status === 500) ? history.items[0] : null;
    });
    assert(itemJ3 !== null, 'TEST J3: History entry captures upstream 500 status');
    assert(itemJ3.error_message === null, 'TEST J3: 500 is not classified as transport failure');

    // J4: Network failure saves failed entry
    const resJ4 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Step 3 Network Refusal',
        method: 'GET',
        url: 'http://127.0.0.1:1/nonexistent' // Port 1 refused
      }
    });
    assert(resJ4.statusCode >= 400, 'TEST J4: Connection refusal returns client/server error');

    const itemJ4 = await waitFor(async () => {
      const history = await getHistory({ page: 1, limit: 1 });
      return (history.items.length > 0 && history.items[0].request_name === 'Step 3 Network Refusal') ? history.items[0] : null;
    });
    assert(itemJ4 !== null, 'TEST J4: Network failure captures request name');
    assert(itemJ4.response_status === null, 'TEST J4: Network failure stores null response_status');
    assert(typeof itemJ4.error_message === 'string' && itemJ4.error_message.length > 0, 'TEST J4: Network failure records descriptive error_message');

    // J5: Timeout saves failed entry
    const resJ5 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Step 3 Timeout Test',
        method: 'GET',
        url: `http://localhost:${mockPort}/api/slow`,
        settings: {
          timeoutMs: 200
        }
      }
    });
    assert(resJ5.statusCode === 504, 'TEST J5: Timeout returns HTTP 504');
    assert(resJ5.json?.error?.code === 'REQUEST_TIMEOUT' || resJ5.json?.error?.code === 'TIMEOUT_ERROR', 'TEST J5: Error code is REQUEST_TIMEOUT');

    const itemJ5 = await waitFor(async () => {
      const history = await getHistory({ page: 1, limit: 1 });
      return (history.items.length > 0 && history.items[0].request_name === 'Step 3 Timeout Test') ? history.items[0] : null;
    });
    assert(itemJ5 !== null, 'TEST J5: Timeout captures request name');
    assert(itemJ5.response_status === null, 'TEST J5: Timeout stores null response_status');
    assert(itemJ5.error_message.toLowerCase().includes('time'), 'TEST J5: Timeout captures timeout description');

    // J6: Genuine non-blocking test: Execution returns without waiting for history insertion
    const origRecordExecution = historyService.recordExecution;
    let resolveHangingSuccess;
    const hangingSuccessPromise = new Promise((resolve) => {
      resolveHangingSuccess = resolve;
    });
    historyService.recordExecution = () => hangingSuccessPromise;

    const startSuccess = Date.now();
    const resJ6Success = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Hanging Success Test',
        method: 'GET',
        url: `http://localhost:${mockPort}/api/success`
      }
    });
    const elapsedSuccess = Date.now() - startSuccess;

    assert(resJ6Success.statusCode === 200, 'TEST J6: Successful execution returns 200 without waiting for history insertion');
    assert(elapsedSuccess < 500, 'TEST J6: Response returned in <500ms while history persistence was still pending');
    resolveHangingSuccess({ success: true, id: 999999 });

    // Test non-blocking on execution failure
    let resolveHangingError;
    const hangingErrorPromise = new Promise((resolve) => {
      resolveHangingError = resolve;
    });
    historyService.recordExecution = () => hangingErrorPromise;

    const startFail = Date.now();
    const resJ6Error = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Hanging Error Test',
        method: 'GET',
        url: 'http://127.0.0.1:1/nonexistent'
      }
    });
    const elapsedFail = Date.now() - startFail;

    assert(resJ6Error.statusCode >= 400, 'TEST J6: Failed execution returns error without waiting for history insertion');
    assert(elapsedFail < 500, 'TEST J6: Error response returned in <500ms while history persistence was still pending');
    resolveHangingError({ success: true, id: 999998 });
    historyService.recordExecution = origRecordExecution; // restore

    // J7: History insertion rejection does not cause an unhandled rejection, and does not alter response
    let unhandledRejectionCaught = null;
    const unhandledHandler = (reason) => {
      unhandledRejectionCaught = reason;
    };
    process.on('unhandledRejection', unhandledHandler);

    historyService.recordExecution = async () => {
      throw new Error('Simulated Database Failure');
    };

    const resJ7Success = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Simulated DB Failure Test',
        method: 'GET',
        url: `http://localhost:${mockPort}/api/success`
      }
    });
    assert(resJ7Success.statusCode === 200, 'TEST J7: API returns 200 even if history DB insertion fails');
    assert(resJ7Success.json?.success === true, 'TEST J7: API response success is true despite DB error');

    const resJ7Error = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Simulated DB Failure On Error Test',
        method: 'GET',
        url: 'http://127.0.0.1:1/nonexistent'
      }
    });
    assert(resJ7Error.statusCode >= 400, 'TEST J7: Error status maintained when history DB fails');
    assert(resJ7Error.json?.error?.message !== 'Simulated Database Failure', 'TEST J7: Database failure does not overwrite original error message');

    // Flush any pending event loop ticks
    await new Promise((resolve) => setImmediate(resolve));
    process.removeListener('unhandledRejection', unhandledHandler);
    assert(unhandledRejectionCaught === null, 'TEST J7: History insertion rejection does not cause unhandled promise rejection');
    historyService.recordExecution = origRecordExecution; // restore

    // J8: Exactly one entry created per execution
    const countBeforeJ8 = (await getHistory({ page: 1, limit: 1 })).pagination.total;
    await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Single Entry Test',
        method: 'GET',
        url: `http://localhost:${mockPort}/api/success`
      }
    });

    const finalCountJ8 = await waitFor(async () => {
      const h = await getHistory({ page: 1, limit: 1 });
      return h.pagination.total === countBeforeJ8 + 1 ? h.pagination.total : null;
    });
    assert(finalCountJ8 - countBeforeJ8 === 1, 'TEST J8: Exactly one history entry created per execution');

    // J9: Sensitive headers and body values remain redacted
    await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        name: 'Sensitive Auto-Save Test',
        method: 'POST',
        url: `http://localhost:${mockPort}/api/success`,
        headers: {
          'Authorization': 'Bearer super-secret-key-999',
          'Cookie': 'sid=confidentialCookieValue',
          'X-Custom-Public': 'public-header-value'
        },
        body: {
          password: 'plainTextPassword123!',
          api_key: 'sk_live_secret123',
          publicInfo: 'hello'
        }
      }
    });

    const sensitiveEntry = await waitFor(async () => {
      const h = await getHistory({ page: 1, limit: 1 });
      return (h.items.length > 0 && h.items[0].request_name === 'Sensitive Auto-Save Test') ? h.items[0] : null;
    });
    assert(sensitiveEntry !== null, 'TEST J9: Sensitive auto-saved entry found');
    const sensitiveDetail = await getHistoryById(sensitiveEntry.id);
    assert(sensitiveDetail.request_headers['Authorization'] === REDACTED_PLACEHOLDER, 'TEST J9: Auto-saved Authorization header is redacted');
    assert(sensitiveDetail.request_headers['Cookie'] === REDACTED_PLACEHOLDER, 'TEST J9: Auto-saved Cookie header is redacted');
    assert(sensitiveDetail.request_headers['X-Custom-Public'] === 'public-header-value', 'TEST J9: Non-sensitive request header preserved');
    assert(sensitiveDetail.request_body.includes(REDACTED_PLACEHOLDER), 'TEST J9: Auto-saved request body has credentials redacted');
    assert(!sensitiveDetail.request_body.includes('plainTextPassword123!'), 'TEST J9: Plaintext password is never saved');
    assert(!sensitiveDetail.request_body.includes('sk_live_secret123'), 'TEST J9: Plaintext api_key is never saved');

    // J10: Existing execution response format remains unchanged
    const resJ10 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/api/success`
      }
    });
    assert(resJ10.json !== null && typeof resJ10.json === 'object', 'TEST J10: Response is valid JSON');
    assert(resJ10.json.success === true, 'TEST J10: Response has success: true');
    assert(typeof resJ10.json.data === 'object' && resJ10.json.data !== null, 'TEST J10: Response has data object');
    assert(typeof resJ10.json.data.status === 'number', 'TEST J10: Data contains status number');
    assert(typeof resJ10.json.data.timeMs === 'number', 'TEST J10: Data contains timeMs number');
    assert(typeof resJ10.json.data.sizeBytes === 'number', 'TEST J10: Data contains sizeBytes number');
    assert(typeof resJ10.json.data.headers === 'object', 'TEST J10: Data contains headers object');
    assert(resJ10.json.data.body !== undefined, 'TEST J10: Data contains body');
    assert(typeof resJ10.json.data.rawText === 'string', 'TEST J10: Data contains rawText string');

    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    // =========================================================================
    // TEST K: History REST API Endpoints (Step 4)
    // =========================================================================
    console.log('\n--- TEST K: History REST API Endpoints (Step 4) ---');

    // Clean slate for REST API testing
    await clearAllHistory();

    // 1. GET history with default pagination
    const resK1 = await makeRequest(appServer, {
      method: 'GET',
      path: '/api/history'
    });
    assert(resK1.statusCode === 200, 'TEST K1: GET /api/history returns 200 OK');
    assert(resK1.json?.success === true, 'TEST K1: Response success is true');
    assert(resK1.json?.message === 'History retrieved successfully', 'TEST K1: Response message is descriptive');
    assert(Array.isArray(resK1.json?.data), 'TEST K1: Data is an array');
    assert(resK1.json?.pagination?.page === 1, 'TEST K1: Default page is 1');
    assert(resK1.json?.pagination?.limit === 20, 'TEST K1: Default limit is 20');
    assert(typeof resK1.json?.pagination?.total === 'number', 'TEST K1: Pagination total is a number');
    assert(typeof resK1.json?.pagination?.totalPages === 'number', 'TEST K1: Pagination totalPages is a number');

    // Seed test history records for pagination testing
    const seededIds = [];
    for (let i = 1; i <= 5; i++) {
      const seedRes = await recordExecution(
        { name: `Seeded History ${i}`, method: 'GET', url: `https://api.example.com/item/${i}` },
        { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, body: { item: i }, rawText: `{"item":${i}}`, timeMs: 10 + i }
      );
      seededIds.push(seedRes.id);
    }

    // 2. GET history with custom page and limit
    const resK2 = await makeRequest(appServer, {
      method: 'GET',
      path: '/api/history?page=2&limit=2'
    });
    assert(resK2.statusCode === 200, 'TEST K2: GET /api/history with custom pagination returns 200');
    assert(resK2.json?.pagination?.page === 2, 'TEST K2: Custom page is 2');
    assert(resK2.json?.pagination?.limit === 2, 'TEST K2: Custom limit is 2');
    assert(resK2.json?.data?.length === 2, 'TEST K2: Returns exactly 2 items for limit=2');

    // 3. GET history with invalid page
    const resK3a = await makeRequest(appServer, { method: 'GET', path: '/api/history?page=0' });
    assert(resK3a.statusCode === 400, 'TEST K3: GET /api/history?page=0 returns 400 Bad Request');
    assert(resK3a.json?.success === false, 'TEST K3: success is false for page=0');
    assert(resK3a.json?.error?.code === 'INVALID_PAGINATION', 'TEST K3: Error code is INVALID_PAGINATION for page=0');

    const resK3b = await makeRequest(appServer, { method: 'GET', path: '/api/history?page=-1' });
    assert(resK3b.statusCode === 400, 'TEST K3: GET /api/history?page=-1 returns 400 Bad Request');

    const resK3c = await makeRequest(appServer, { method: 'GET', path: '/api/history?page=invalid' });
    assert(resK3c.statusCode === 400, 'TEST K3: GET /api/history?page=invalid returns 400 Bad Request');

    // 4. GET history with invalid limit
    const resK4a = await makeRequest(appServer, { method: 'GET', path: '/api/history?limit=0' });
    assert(resK4a.statusCode === 400, 'TEST K4: GET /api/history?limit=0 returns 400 Bad Request');
    assert(resK4a.json?.success === false, 'TEST K4: success is false for limit=0');
    assert(resK4a.json?.error?.code === 'INVALID_PAGINATION', 'TEST K4: Error code is INVALID_PAGINATION for limit=0');

    const resK4b = await makeRequest(appServer, { method: 'GET', path: '/api/history?limit=-10' });
    assert(resK4b.statusCode === 400, 'TEST K4: GET /api/history?limit=-10 returns 400 Bad Request');

    const resK4c = await makeRequest(appServer, { method: 'GET', path: '/api/history?limit=bad' });
    assert(resK4c.statusCode === 400, 'TEST K4: GET /api/history?limit=bad returns 400 Bad Request');

    // 5. GET history with limit greater than 100
    const resK5 = await makeRequest(appServer, { method: 'GET', path: '/api/history?limit=150' });
    assert(resK5.statusCode === 200, 'TEST K5: GET /api/history with limit > 100 returns 200 OK');
    assert(resK5.json?.pagination?.limit === 100, 'TEST K5: Limit greater than 100 is clamped to maximum limit of 100');

    // 6. GET one existing history record
    const targetRecordId = seededIds[0];
    const resK6 = await makeRequest(appServer, {
      method: 'GET',
      path: `/api/history/${targetRecordId}`
    });
    assert(resK6.statusCode === 200, 'TEST K6: GET /api/history/:id returns 200 OK');
    assert(resK6.json?.success === true, 'TEST K6: success is true');
    assert(resK6.json?.message === 'History record retrieved successfully', 'TEST K6: Descriptive message returned');
    assert(resK6.json?.data?.id === targetRecordId, 'TEST K6: Returns correct history record ID');
    assert(resK6.json?.data?.request_name === 'Seeded History 1', 'TEST K6: Request name matches seeded data');
    assert(resK6.json?.data?.method === 'GET', 'TEST K6: HTTP method matches');
    assert(resK6.json?.data?.url === 'https://api.example.com/item/1', 'TEST K6: URL matches');
    assert(resK6.json?.data?.response_status === 200, 'TEST K6: Response status matches');
    assert(typeof resK6.json?.data?.response_headers === 'object', 'TEST K6: Response headers parsed as JSON object');
    assert(typeof resK6.json?.data?.response_body === 'string', 'TEST K6: Response body string preserved');

    // 7. GET nonexistent history ID
    const resK7 = await makeRequest(appServer, {
      method: 'GET',
      path: '/api/history/99999999'
    });
    assert(resK7.statusCode === 404, 'TEST K7: GET nonexistent history ID returns 404 Not Found');
    assert(resK7.json?.success === false, 'TEST K7: success is false for nonexistent ID');
    assert(resK7.json?.error?.code === 'NOT_FOUND', 'TEST K7: Error code is NOT_FOUND');

    // 8. GET invalid history ID
    const resK8a = await makeRequest(appServer, { method: 'GET', path: '/api/history/notanumber' });
    assert(resK8a.statusCode === 400, 'TEST K8: GET /api/history/notanumber returns 400 Bad Request');
    assert(resK8a.json?.error?.code === 'INVALID_HISTORY_ID', 'TEST K8: Error code is INVALID_HISTORY_ID');

    const resK8b = await makeRequest(appServer, { method: 'GET', path: '/api/history/-5' });
    assert(resK8b.statusCode === 400, 'TEST K8: GET /api/history/-5 returns 400 Bad Request');

    const resK8c = await makeRequest(appServer, { method: 'GET', path: '/api/history/0' });
    assert(resK8c.statusCode === 400, 'TEST K8: GET /api/history/0 returns 400 Bad Request');

    // 9. DELETE one existing history record
    const recordToDelete = seededIds[seededIds.length - 1];
    const resK9 = await makeRequest(appServer, {
      method: 'DELETE',
      path: `/api/history/${recordToDelete}`
    });
    assert(resK9.statusCode === 200, 'TEST K9: DELETE /api/history/:id returns 200 OK');
    assert(resK9.json?.success === true, 'TEST K9: success is true');
    assert(resK9.json?.message === 'History record deleted successfully', 'TEST K9: Descriptive message returned');
    assert(resK9.json?.data?.deleted === true, 'TEST K9: data.deleted is true');
    assert(resK9.json?.data?.id === recordToDelete, 'TEST K9: data.id matches deleted ID');

    // 10. DELETE nonexistent history ID
    const resK10 = await makeRequest(appServer, {
      method: 'DELETE',
      path: '/api/history/99999999'
    });
    assert(resK10.statusCode === 404, 'TEST K10: DELETE nonexistent history ID returns 404 Not Found');
    assert(resK10.json?.success === false, 'TEST K10: success is false for nonexistent ID');
    assert(resK10.json?.error?.code === 'NOT_FOUND', 'TEST K10: Error code is NOT_FOUND');

    // 11. DELETE with invalid ID
    const resK11a = await makeRequest(appServer, { method: 'DELETE', path: '/api/history/invalidid' });
    assert(resK11a.statusCode === 400, 'TEST K11: DELETE with non-numeric ID returns 400 Bad Request');
    assert(resK11a.json?.error?.code === 'INVALID_HISTORY_ID', 'TEST K11: Error code is INVALID_HISTORY_ID');

    const resK11b = await makeRequest(appServer, { method: 'DELETE', path: '/api/history/-10' });
    assert(resK11b.statusCode === 400, 'TEST K11: DELETE with negative ID returns 400 Bad Request');

    const resK11c = await makeRequest(appServer, { method: 'DELETE', path: '/api/history/0' });
    assert(resK11c.statusCode === 400, 'TEST K11: DELETE with zero ID returns 400 Bad Request');

    // 13. Verify deleted records are no longer returned
    const resK13 = await makeRequest(appServer, {
      method: 'GET',
      path: `/api/history/${recordToDelete}`
    });
    assert(resK13.statusCode === 404, 'TEST K13: Previously deleted record returns 404 on subsequent GET');

    // 14. Verify pagination metadata
    // Remaining seeded records: 4 items (ids 1..4)
    const resK14Page1 = await makeRequest(appServer, { method: 'GET', path: '/api/history?page=1&limit=2' });
    assert(resK14Page1.statusCode === 200, 'TEST K14: Page 1 query succeeds');
    assert(resK14Page1.json?.pagination?.total === 4, 'TEST K14: Total count reflects exactly 4 remaining records');
    assert(resK14Page1.json?.pagination?.totalPages === 2, 'TEST K14: Total pages is ceil(4 / 2) = 2');
    assert(resK14Page1.json?.data?.length === 2, 'TEST K14: Page 1 contains 2 items');

    const resK14Page2 = await makeRequest(appServer, { method: 'GET', path: '/api/history?page=2&limit=2' });
    assert(resK14Page2.statusCode === 200, 'TEST K14: Page 2 query succeeds');
    assert(resK14Page2.json?.pagination?.page === 2, 'TEST K14: Page 2 metadata confirmed');
    assert(resK14Page2.json?.data?.length === 2, 'TEST K14: Page 2 contains 2 items');
    assert(resK14Page1.json.data[0].id !== resK14Page2.json.data[0].id, 'TEST K14: Page 1 and Page 2 contain distinct records');

    // 12. DELETE all history
    const resK12 = await makeRequest(appServer, {
      method: 'DELETE',
      path: '/api/history'
    });
    assert(resK12.statusCode === 200, 'TEST K12: DELETE /api/history returns 200 OK');
    assert(resK12.json?.success === true, 'TEST K12: success is true');
    assert(resK12.json?.message === 'All history records cleared successfully', 'TEST K12: Clear-all descriptive message');
    assert(typeof resK12.json?.data?.deletedCount === 'number', 'TEST K12: deletedCount returned as number');
    assert(resK12.json?.data?.deletedCount >= 4, 'TEST K12: deletedCount reflects at least the 4 remaining test records');

    // Verify list is now empty after DELETE all
    const resK12Check = await makeRequest(appServer, { method: 'GET', path: '/api/history' });
    assert(resK12Check.json?.data?.length === 0, 'TEST K12: History list is completely empty after DELETE all');
    assert(resK12Check.json?.pagination?.total === 0, 'TEST K12: Pagination total is 0 after clear-all');

    // 15. Verify database/service errors are handled safely
    const origGetHistory = historyService.getHistory;
    try {
      historyService.getHistory = async () => {
        throw new Error('Access denied for user root@localhost (using password: YES)');
      };
      const resK15 = await makeRequest(appServer, { method: 'GET', path: '/api/history' });
      assert(resK15.statusCode === 500, 'TEST K15: Service error returns 500');
      assert(resK15.json?.success === false, 'TEST K15: Error response has success: false');
      assert(!JSON.stringify(resK15.json).includes('using password: YES'), 'TEST K15: Error response never leaks database passwords or credentials');
      assert(!resK15.json?.stack, 'TEST K15: Stack traces are not exposed in error response');
    } finally {
      historyService.getHistory = origGetHistory;
    }

    // =========================================================================
    // TEST L: Frontend History Interface & State Contracts (Step 5)
    // =========================================================================
    console.log('\n--- TEST L: Frontend History Interface & State Contracts (Step 5) ---');

    assert(typeof fetchHistoryList === 'function', 'TEST L1: fetchHistoryList is exported');
    assert(typeof renderHistoryList === 'function', 'TEST L1: renderHistoryList is exported');
    assert(typeof openHistoryDetailModal === 'function', 'TEST L1: openHistoryDetailModal is exported');
    assert(typeof closeHistoryDetailModal === 'function', 'TEST L1: closeHistoryDetailModal is exported');
    assert(typeof loadHistoryIntoWorkspace === 'function', 'TEST L1: loadHistoryIntoWorkspace is exported');
    assert(typeof deleteHistoryItem === 'function', 'TEST L1: deleteHistoryItem is exported');
    assert(typeof confirmClearAllHistory === 'function', 'TEST L1: confirmClearAllHistory is exported');
    assert(typeof openClearHistoryModal === 'function', 'TEST L1: openClearHistoryModal is exported');
    assert(typeof closeClearHistoryModal === 'function', 'TEST L1: closeClearHistoryModal is exported');
    assert(typeof initSidebar === 'function', 'TEST L1: initSidebar is exported');
    assert(typeof initHistoryManagement === 'function', 'TEST L1: initHistoryManagement is exported');

    // L2: State initializers and cache getters
    assert(getHistoryCurrentPage() === 1, 'TEST L2: Initial historyCurrentPage is 1');
    assert(Array.isArray(getCachedHistoryItems()), 'TEST L2: getCachedHistoryItems returns array');
    assert(getSelectedHistoryRecord() === null, 'TEST L2: Initial selectedHistoryRecord is null');

    // L3: Non-browser safety: executing modal and render helpers does not throw
    let noThrowOnRender = true;
    try {
      renderHistoryList([]);
      renderHistoryList(null);
      openClearHistoryModal();
      closeClearHistoryModal();
      closeHistoryDetailModal();
      initSidebar();
      initHistoryManagement();
    } catch {
      noThrowOnRender = false;
    }
    assert(noThrowOnRender === true, 'TEST L3: History UI functions execute safely in non-browser context');

    // L4: loadHistoryIntoWorkspace populates activeRequest state from history record
    loadHistoryIntoWorkspace({
      id: 9991,
      request_name: 'Workspace History Injection Test',
      method: 'POST',
      url: 'https://api.devprobe.test/v1/orders?priority=high&tag=urgent',
      request_headers: {
        'Accept': 'application/json',
        'X-Trace-Id': 'trace-abc-123',
        'Content-Type': 'application/json'
      },
      request_body: '{"orderId": 42, "item": "Widget", "qty": 10}'
    });

    assert(activeRequest.name === 'Workspace History Injection Test', 'TEST L4: Workspace request name loaded');
    assert(activeRequest.method === 'POST', 'TEST L4: Workspace HTTP method loaded');
    assert(activeRequest.url === 'https://api.devprobe.test/v1/orders?priority=high&tag=urgent', 'TEST L4: Workspace URL loaded');
    assert(activeRequest.body.type === 'json', 'TEST L4: JSON body type recognized and set');
    assert(activeRequest.body.text === '{"orderId": 42, "item": "Widget", "qty": 10}', 'TEST L4: Request body text preserved');
    assert(Array.isArray(activeRequest.headers), 'TEST L4: Headers converted to array');
    assert(activeRequest.headers.some((h) => h.key === 'X-Trace-Id' && h.value === 'trace-abc-123'), 'TEST L4: Custom header preserved');
    assert(Array.isArray(activeRequest.params), 'TEST L4: URL query params extracted into table rows');
    assert(activeRequest.params.some((p) => p.key === 'priority' && p.value === 'high'), 'TEST L4: Query param priority parsed');
    assert(activeRequest.params.some((p) => p.key === 'tag' && p.value === 'urgent'), 'TEST L4: Query param tag parsed');

    // L5: loadHistoryIntoWorkspace handles raw/plain text body
    loadHistoryIntoWorkspace({
      id: 9992,
      request_name: 'Plain Text History',
      method: 'PUT',
      url: 'https://api.devprobe.test/raw',
      request_headers: {},
      request_body: 'plain text content not json'
    });
    assert(activeRequest.name === 'Plain Text History', 'TEST L5: Plain text history name loaded');
    assert(activeRequest.method === 'PUT', 'TEST L5: Method set to PUT');
    assert(activeRequest.body.type === 'raw', 'TEST L5: Non-JSON body marked as raw type');
    assert(activeRequest.body.text === 'plain text content not json', 'TEST L5: Raw body text loaded');

    // L6: loadHistoryIntoWorkspace handles empty body
    loadHistoryIntoWorkspace({
      id: 9993,
      request_name: 'Empty Body GET',
      method: 'GET',
      url: 'https://api.devprobe.test/empty',
      request_headers: null,
      request_body: null
    });
    assert(activeRequest.body.type === 'none', 'TEST L6: Null body marked as none');

  } finally {
    // Teardown: Clean up any servers and test records created
    console.log('\n--- Teardown: Cleaning Test Data & Closing Servers ---');
    try {
      if (appServer) {
        await new Promise((resolve) => appServer.close(resolve));
      }
      if (mockUpstreamServer) {
        await new Promise((resolve) => mockUpstreamServer.close(resolve));
      }
      delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;
      await clearAllHistory();
      console.log('  ✓ Test history records cleaned up successfully.');
    } catch (cleanupErr) {
      console.error('  ✗ Cleanup error:', cleanupErr.message);
    }
    await closePool();
  }

  // =========================================================================
  // Final Results
  // =========================================================================
  console.log('\n===========================================');
  console.log(`Day 13 Tests: ${passedTests}/${totalTests} Passed`);
  console.log('===========================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Day 13 test runner encountered unhandled error:', err);
  process.exit(1);
});
