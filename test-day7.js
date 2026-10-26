/**
 * DevProbe Day 7 Verification Test Suite
 * Error Handling and Request Validation:
 * - Request input validation (URLs, HTTP methods, headers, JSON body, auth, settings)
 * - Preservation of valid values such as 0 and false
 * - SSRF and destination blocking resilience
 * - Transport failures (timeouts, connection refused, DNS errors) return safe errors
 * - Upstream 4xx/5xx responses remain distinguishable from transport errors
 * - Unexpected internal errors do not expose stack traces or internal secrets
 * - Concurrency guard and duplicate request prevention
 * - Stale response metadata clearing during loading and error states
 * - Frontend recovery and successful execution following a failure
 * - Error classification (BLOCKED, VALIDATION, TRANSPORT, INTERNAL)
 * - Regression check on Day 3-6 contracts
 */

const http = require('http');
const net = require('net');
const app = require('./src/app.js');
const {
  activeRequest,
  activeResponse,
  isRequestRunning,
  getRequestRunning,
  setRequestRunning,
  classifyErrorCode,
  switchConfigTab,
  setUrlInputError,
  prepareRequestUrl,
  validateHeaders,
  validateJsonBody,
  handleSendRequest,
  renderResponseToUI,
  renderResponseError,
  renderResponseBodyContent,
  resetResponseViewer,
  setResponseLoadingState,
  escapeHtml,
  getContentType,
  highlightJsonToHtml,
  formatHeadersForCopy,
  copyTextToClipboard
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
 * Helper to dispatch HTTP requests to DevProbe test server
 */
function makeRequest(server, { method = 'GET', path = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqHeaders = { ...headers };

    let payload = null;
    if (body !== null) {
      if (typeof body === 'string') {
        payload = body;
      } else {
        payload = JSON.stringify(body);
        if (!reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(rawData);
          } catch {
            // Not JSON
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            rawData,
            json
          });
        });
      }
    );

    req.on('error', reject);

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== DevProbe Day 7 Verification Tests ===\n');

  // Start DevProbe application server on an ephemeral port
  const appServer = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  // Start mock upstream server to simulate various server responses
  const mockUpstreamServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/day7-ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', message: 'Day 7 test endpoint healthy' }));
    } else if (url.pathname === '/day7-echo-body') {
      let bodyData = '';
      req.on('data', chunk => { bodyData += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ receivedBody: bodyData, method: req.method }));
      });
    } else if (url.pathname === '/day7-upstream-404') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Resource Not Found', code: 'RES_404' }));
    } else if (url.pathname === '/day7-upstream-500') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream Internal Database Error', code: 'DB_ERROR' }));
    } else if (url.pathname === '/day7-timeout') {
      // Never respond to trigger client/service timeout
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200);
          res.end('Delayed');
        }
      }, 5000);
    } else {
      res.writeHead(200);
      res.end('Default upstream');
    }
  });

  const mockPort = await new Promise((resolve) => {
    mockUpstreamServer.listen(0, () => resolve(mockUpstreamServer.address().port));
  });

  try {
    // -------------------------------------------------------------------------
    // TEST A: Request Input Validation & Error Structure
    // -------------------------------------------------------------------------
    console.log('--- TEST A: Request Input Validation & Error Structure ---');

    // A1: Missing / Empty URL
    const resA1 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: { method: 'GET', url: '' }
    });
    assert(resA1.statusCode === 400, 'TEST A1: Empty URL returns 400');
    assert(resA1.json?.success === false, 'TEST A1: success is false');
    assert(resA1.json?.error?.code === 'MISSING_URL', 'TEST A1: error code is MISSING_URL');
    assert(resA1.json?.error?.field === 'url', 'TEST A1: error identifies field url');

    // A2: Malformed URL syntax
    const resA2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: { method: 'GET', url: 'not-a-valid-url-format' }
    });
    assert(resA2.statusCode === 400, 'TEST A2: Malformed URL returns 400');
    assert(resA2.json?.error?.code === 'INVALID_URL', 'TEST A2: error code is INVALID_URL');
    assert(resA2.json?.error?.field === 'url', 'TEST A2: identifies field url');

    // A3: Missing HTTP Method
    const resA3 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: { url: 'https://api.example.com/data' }
    });
    assert(resA3.statusCode === 400, 'TEST A3: Missing method returns 400');
    assert(resA3.json?.error?.code === 'MISSING_METHOD', 'TEST A3: error code is MISSING_METHOD');
    assert(resA3.json?.error?.field === 'method', 'TEST A3: identifies field method');

    // A4: Unsupported HTTP Method
    const resA4 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: { method: 'PURGE', url: 'https://api.example.com/data' }
    });
    assert(resA4.statusCode === 400, 'TEST A4: Unsupported method returns 400');
    assert(resA4.json?.error?.code === 'UNSUPPORTED_METHOD', 'TEST A4: error code is UNSUPPORTED_METHOD');
    assert(resA4.json?.error?.field === 'method', 'TEST A4: identifies field method');

    // A5: Invalid Header Name
    const resA5 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'https://api.example.com',
        headers: { 'Invalid Header:Name': 'value' }
      }
    });
    assert(resA5.statusCode === 400, 'TEST A5: Invalid header name returns 400');
    assert(resA5.json?.error?.code === 'INVALID_HEADER_NAME', 'TEST A5: error code is INVALID_HEADER_NAME');
    assert(resA5.json?.error?.field === 'headers', 'TEST A5: identifies field headers');

    // A6: Non-string Header Value
    const resA6 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'https://api.example.com',
        headers: { 'X-Numeric-Header': 9999 }
      }
    });
    assert(resA6.statusCode === 400, 'TEST A6: Non-string header value returns 400');
    assert(resA6.json?.error?.code === 'INVALID_HEADER_VALUE', 'TEST A6: error code is INVALID_HEADER_VALUE');
    assert(resA6.json?.error?.field === 'headers', 'TEST A6: identifies field headers');

    // A7: Invalid Auth Configuration Type
    const resA7 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'https://api.example.com',
        auth: { type: 'unsupported-auth-scheme' }
      }
    });
    assert(resA7.statusCode === 400, 'TEST A7: Unsupported auth type returns 400');
    assert(resA7.json?.error?.code === 'INVALID_AUTH', 'TEST A7: error code is INVALID_AUTH');
    assert(resA7.json?.error?.field === 'auth', 'TEST A7: identifies field auth');

    // A8: Non-string Auth Bearer Token
    const resA8 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'https://api.example.com',
        auth: { type: 'bearer', bearerToken: 12345 }
      }
    });
    assert(resA8.statusCode === 400, 'TEST A8: Non-string bearer token returns 400');
    assert(resA8.json?.error?.code === 'INVALID_AUTH', 'TEST A8: error code is INVALID_AUTH');

    // A9: Invalid Settings Type
    const resA9 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'https://api.example.com',
        settings: { timeoutMs: -100 }
      }
    });
    assert(resA9.statusCode === 400, 'TEST A9: Negative timeoutMs returns 400');
    assert(resA9.json?.error?.code === 'INVALID_SETTINGS', 'TEST A9: error code is INVALID_SETTINGS');

    // -------------------------------------------------------------------------
    // TEST B: Preservation of Valid Primitive Values (0 and false)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST B: Preservation of Valid Primitive Values (0 and false) ---');

    // B1: Query parameter values 0 and false preserved
    const prepUrl = prepareRequestUrl('https://api.example.com/items', [
      { key: 'count', value: 0, enabled: true },
      { key: 'active', value: false, enabled: true }
    ]);
    assert(prepUrl.isValid === true, 'TEST B1: URL preparation succeeds');
    assert(prepUrl.url.includes('count=0'), 'TEST B1: Preserves 0 as query parameter');
    assert(prepUrl.url.includes('active=false'), 'TEST B1: Preserves false as query parameter');

    // B2: Request body with primitive 0 preserved and accepted
    const resB2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'POST',
        url: 'https://api.example.com',
        body: 0
      }
    });
    assert(resB2.statusCode === 200, 'TEST B2: Numeric 0 body is accepted');
    assert(resB2.json?.data?.body?.present === true, 'TEST B2: Numeric 0 flagged as present');

    // B3: Request body with primitive boolean false preserved and accepted
    const resB3 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'POST',
        url: 'https://api.example.com',
        body: false
      }
    });
    assert(resB3.statusCode === 200, 'TEST B3: Boolean false body is accepted');
    assert(resB3.json?.data?.body?.present === true, 'TEST B3: Boolean false flagged as present');

    // -------------------------------------------------------------------------
    // TEST C: SSRF Protections & Blocked Destination Feedback
    // -------------------------------------------------------------------------
    console.log('\n--- TEST C: SSRF Protections & Blocked Destination Feedback ---');

    const blockedCases = [
      { url: 'http://127.0.0.1:8080/test', name: 'IPv4 loopback' },
      { url: 'http://localhost:3000/api', name: 'localhost hostname' },
      { url: 'http://169.254.169.254/latest/meta-data/', name: 'Cloud metadata IMDS' },
      { url: 'http://10.0.0.5/api', name: 'Private RFC 1918 Class A' },
      { url: 'http://192.168.1.1/router', name: 'Private RFC 1918 Class C' },
      { url: 'http://metadata.google.internal/compute', name: 'GCP metadata domain' }
    ];

    for (const item of blockedCases) {
      const resC = await makeRequest(appServer, {
        method: 'POST',
        path: '/api/requests/execute',
        body: { method: 'GET', url: item.url }
      });
      assert(resC.statusCode === 400, `TEST C: Blocks ${item.name} with 400`);
      assert(
        resC.json?.error?.code === 'INVALID_URL' || resC.json?.error?.code === 'BLOCKED_DESTINATION',
        `TEST C: Code reflects blocked/invalid URL for ${item.name}`
      );
      assert(
        !resC.rawData.includes('password') && !resC.rawData.includes('token') && !resC.rawData.includes('Error:'),
        `TEST C: Error message is safe without leaking secrets`
      );
    }

    // -------------------------------------------------------------------------
    // TEST D: Upstream 4xx/5xx Responses vs Transport Failures
    // -------------------------------------------------------------------------
    console.log('\n--- TEST D: Upstream 4xx/5xx Responses vs Transport Failures ---');

    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';

    // D1: Upstream 404 is an inspectable 200 execution result
    const resD1 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/day7-upstream-404`
      }
    });
    assert(resD1.statusCode === 200, 'TEST D1: Upstream 404 returns DevProbe 200 execution envelope');
    assert(resD1.json?.success === true, 'TEST D1: reports execution success: true');
    assert(resD1.json?.data?.status === 404, 'TEST D1: records upstream status 404');
    assert(resD1.json?.data?.body?.code === 'RES_404', 'TEST D1: upstream 404 body preserved');
    assert(typeof resD1.json?.data?.timeMs === 'number', 'TEST D1: measures roundtrip time for 404');

    // D2: Upstream 500 is an inspectable 200 execution result
    const resD2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/day7-upstream-500`
      }
    });
    assert(resD2.statusCode === 200, 'TEST D2: Upstream 500 returns DevProbe 200 execution envelope');
    assert(resD2.json?.data?.status === 500, 'TEST D2: records upstream status 500');
    assert(resD2.json?.data?.body?.code === 'DB_ERROR', 'TEST D2: upstream 500 body preserved');

    // D3: Transport Timeout produces 504 Gateway Timeout (NOT 200)
    const resD3 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/day7-timeout`,
        settings: { timeoutMs: 200 }
      }
    });
    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    assert(resD3.statusCode === 504, 'TEST D3: Transport timeout produces 504');
    assert(resD3.json?.success === false, 'TEST D3: transport timeout reports success: false');
    assert(resD3.json?.error?.code === 'REQUEST_TIMEOUT', 'TEST D3: error code is REQUEST_TIMEOUT');

    // -------------------------------------------------------------------------
    // TEST E: Resilience & Information Leakage Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- TEST E: Resilience & Information Leakage Prevention ---');

    // E1: Undefined API endpoint returns structured JSON 404 without stack traces
    const resE1 = await makeRequest(appServer, {
      method: 'GET',
      path: '/api/undefined/non-existent-route'
    });
    assert(resE1.statusCode === 404, 'TEST E1: Unknown API endpoint returns 404');
    assert(resE1.json?.success === false, 'TEST E1: success is false');
    assert(resE1.json?.error?.code === 'NOT_FOUND', 'TEST E1: error code is NOT_FOUND');
    assert(!resE1.rawData.includes('at '), 'TEST E1: No stack traces exposed in 404 response');

    // E2: Malformed JSON sent to execute endpoint returns controlled 400
    const resE2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      headers: { 'Content-Type': 'application/json' },
      body: '{"method": "GET", malformed json payload!!!'
    });
    assert(resE2.statusCode === 400, 'TEST E2: Malformed JSON payload returns 400');
    assert(resE2.json?.error?.code === 'INVALID_JSON', 'TEST E2: code is INVALID_JSON');
    assert(!resE2.rawData.includes('SyntaxError:'), 'TEST E2: SyntaxError stack trace is not exposed');

    // -------------------------------------------------------------------------
    // TEST F: Error Categorization Logic
    // -------------------------------------------------------------------------
    console.log('\n--- TEST F: Error Categorization Logic ---');

    assert(classifyErrorCode('BLOCKED_DESTINATION') === 'BLOCKED', 'TEST F1: BLOCKED_DESTINATION categorized as BLOCKED');
    assert(classifyErrorCode('INVALID_URL') === 'VALIDATION', 'TEST F2: INVALID_URL categorized as VALIDATION');
    assert(classifyErrorCode('MISSING_METHOD') === 'VALIDATION', 'TEST F3: MISSING_METHOD categorized as VALIDATION');
    assert(classifyErrorCode('UNSUPPORTED_METHOD') === 'VALIDATION', 'TEST F4: UNSUPPORTED_METHOD categorized as VALIDATION');
    assert(classifyErrorCode('INVALID_HEADER_NAME') === 'VALIDATION', 'TEST F5: INVALID_HEADER_NAME categorized as VALIDATION');
    assert(classifyErrorCode('INVALID_JSON') === 'VALIDATION', 'TEST F6: INVALID_JSON categorized as VALIDATION');
    assert(classifyErrorCode('INVALID_AUTH') === 'VALIDATION', 'TEST F7: INVALID_AUTH categorized as VALIDATION');
    assert(classifyErrorCode('REQUEST_TIMEOUT') === 'TRANSPORT', 'TEST F8: REQUEST_TIMEOUT categorized as TRANSPORT');
    assert(classifyErrorCode('CONNECTION_ERROR') === 'TRANSPORT', 'TEST F9: CONNECTION_ERROR categorized as TRANSPORT');
    assert(classifyErrorCode('DNS_RESOLUTION_FAILED') === 'TRANSPORT', 'TEST F10: DNS_RESOLUTION_FAILED categorized as TRANSPORT');
    assert(classifyErrorCode('INTERNAL_ERROR') === 'INTERNAL', 'TEST F11: INTERNAL_ERROR categorized as INTERNAL');

    // -------------------------------------------------------------------------
    // TEST G: Frontend State Lifecycle & Concurrency Guard
    // -------------------------------------------------------------------------
    console.log('\n--- TEST G: Frontend State Lifecycle & Concurrency Guard ---');

    // G1: Concurrency lock prevents duplicate executions while request is active
    setRequestRunning(false);
    assert(getRequestRunning() === false, 'TEST G1: isRequestRunning initial state is false');

    setRequestRunning(true);
    assert(getRequestRunning() === true, 'TEST G1: isRequestRunning flags active execution');

    // Reset lock
    setRequestRunning(false);
    assert(getRequestRunning() === false, 'TEST G1: isRequestRunning resets cleanly');

    // G2: setResponseLoadingState clears stale response state from previous execution
    // Seed fake previous response data
    activeResponse.status = 200;
    activeResponse.statusText = 'OK';
    activeResponse.timeMs = 120;
    activeResponse.sizeBytes = 2048;
    activeResponse.body = { prevData: true };
    activeResponse.rawText = '{"prevData": true}';
    activeResponse.isJson = true;

    // Trigger loading state
    setResponseLoadingState();

    assert(activeResponse.status === null, 'TEST G2: Loading state wipes stale status');
    assert(activeResponse.timeMs === null, 'TEST G2: Loading state wipes stale timeMs');
    assert(activeResponse.sizeBytes === null, 'TEST G2: Loading state wipes stale sizeBytes');
    assert(activeResponse.body === null, 'TEST G2: Loading state wipes stale body');
    assert(activeResponse.rawText === '', 'TEST G2: Loading state wipes stale rawText');
    assert(activeResponse.isJson === false, 'TEST G2: Loading state resets isJson');
    assert(Object.keys(activeResponse.headers).length === 0, 'TEST G2: Loading state resets headers');

    // G3: renderResponseError displays categorized error and does not retain stale response data
    renderResponseError('Target IP 127.0.0.1 is restricted', 'BLOCKED_DESTINATION');
    assert(activeResponse.status === null, 'TEST G3: Blocked error keeps status null');
    assert(activeResponse.timeMs === null, 'TEST G3: Blocked error keeps timeMs null');
    assert(activeResponse.sizeBytes === null, 'TEST G3: Blocked error keeps sizeBytes null');
    assert(activeResponse.rawText.includes('BLOCKED_DESTINATION'), 'TEST G3: rawText includes error code');
    assert(activeResponse.rawText.includes('127.0.0.1'), 'TEST G3: rawText includes error message');

    // G4: Successful response recovery following an error
    renderResponseToUI({
      status: 200,
      statusText: 'OK',
      timeMs: 45,
      sizeBytes: 120,
      headers: { 'content-type': 'application/json' },
      body: { recovered: true }
    });

    assert(activeResponse.status === 200, 'TEST G4: UI recovers to status 200');
    assert(activeResponse.statusText === 'OK', 'TEST G4: statusText updated');
    assert(activeResponse.timeMs === 45, 'TEST G4: timeMs updated');
    assert(activeResponse.sizeBytes === 120, 'TEST G4: sizeBytes updated');
    assert(activeResponse.isJson === true, 'TEST G4: isJson identified');
    assert(activeResponse.body?.recovered === true, 'TEST G4: body payload updated');

    // G5: Reset response viewer restores pristine state
    resetResponseViewer();
    assert(activeResponse.status === null, 'TEST G5: Reset restores null status');
    assert(activeResponse.body === null, 'TEST G5: Reset restores null body');
    assert(activeResponse.rawText === '', 'TEST G5: Reset restores empty rawText');

    // -------------------------------------------------------------------------
    // TEST H: Day 3-6 Regression Contracts
    // -------------------------------------------------------------------------
    console.log('\n--- TEST H: Day 3-6 Regression Contracts ---');

    assert(typeof escapeHtml === 'function', 'TEST H: escapeHtml exported');
    assert(escapeHtml('<script>alert("xss")</script>') === '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', 'TEST H: escapeHtml sanitizes markup');

    assert(typeof highlightJsonToHtml === 'function', 'TEST H: highlightJsonToHtml exported');
    const highlighted = highlightJsonToHtml('{\n  "key": "value"\n}');
    assert(highlighted.includes('class="json-key"'), 'TEST H: highlightJsonToHtml highlights keys');
    assert(highlighted.includes('class="json-string"'), 'TEST H: highlightJsonToHtml highlights strings');

    assert(typeof formatHeadersForCopy === 'function', 'TEST H: formatHeadersForCopy exported');
    const formattedHeaders = formatHeadersForCopy({ 'Accept': 'application/json', 'User-Agent': 'DevProbe' });
    assert(formattedHeaders.includes('Accept: application/json'), 'TEST H: formatHeadersForCopy formats headers');

    assert(typeof copyTextToClipboard === 'function', 'TEST H: copyTextToClipboard exported');
    const copyEmpty = await copyTextToClipboard('');
    assert(copyEmpty === false, 'TEST H: copyTextToClipboard safely handles empty string');

    assert(typeof validateHeaders === 'function', 'TEST H: validateHeaders exported');
    const headerCheck = validateHeaders([
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'accept', value: 'text/html', enabled: true }
    ]);
    assert(headerCheck.isValid === false, 'TEST H: Duplicate case-insensitive header rejected');

    assert(typeof validateJsonBody === 'function', 'TEST H: validateJsonBody exported');
    const validJson = validateJsonBody('{"valid": true}', 'json');
    assert(validJson.isValid === true, 'TEST H: Valid JSON passes validation');
    const invalidJson = validateJsonBody('{not json', 'json');
    assert(invalidJson.isValid === false, 'TEST H: Invalid JSON fails validation gracefully');

  } finally {
    await new Promise((resolve) => appServer.close(resolve));
    await new Promise((resolve) => mockUpstreamServer.close(resolve));
  }

  console.log('\n===========================================');
  console.log(`Test Results: ${passedTests}/${totalTests} Passed`);
  console.log('===========================================\n');

  if (passedTests !== totalTests) {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('Day 7 Test Suite Error:', err);
  process.exit(1);
});
