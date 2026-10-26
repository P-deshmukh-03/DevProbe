/**
 * DevProbe Day 6 Verification Test Suite
 * Response Viewer Improvements:
 * - Valid JSON formatting & syntax highlighting
 * - Safe rendering & HTML-escaping (XSS prevention)
 * - Invalid & malformed JSON fallback
 * - Plain-text response display
 * - Empty response handling (HTTP 204 & 0-byte bodies)
 * - Binary & unsupported media handling
 * - Non-2xx HTTP responses (4xx, 5xx) as valid execution results
 * - Network errors & timeout states
 * - Response metadata & consecutive request state reset
 * - Copy Body and Copy Headers logic & clipboard fallback
 * - End-to-end integration via DevProbe HTTP execution engine
 * - Regression check on Day 3, 4, 5 contracts
 */

const http = require('http');
const app = require('./src/app.js');
const {
  activeRequest,
  activeResponse,
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
  console.log('=== DevProbe Day 6 Verification Tests ===\n');

  // Start DevProbe application server
  const appServer = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  // Start mock upstream server for integration tests
  const mockUpstreamServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/day6-json') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Response-Id': 'resp-123'
      });
      res.end('{"user":"Prasad","role":"Engineer","skills":["API","Security"],"active":true,"count":10}');
    } else if (url.pathname === '/day6-malformed-json') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8'
      });
      res.end('{"broken": true, missing_brace:');
    } else if (url.pathname === '/day6-text') {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      res.end('Server operational. Status code 200.');
    } else if (url.pathname === '/day6-empty-204') {
      res.writeHead(204);
      res.end();
    } else if (url.pathname === '/day6-binary') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="data.bin"'
      });
      res.end(Buffer.from([0x00, 0xff, 0x00, 0x42, 0x69, 0x6e]));
    } else if (url.pathname === '/day6-non-2xx-404') {
      res.writeHead(404, {
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({ error: 'Endpoint Not Found', code: 'RES_NOT_FOUND' }));
    } else if (url.pathname === '/day6-non-2xx-500') {
      res.writeHead(500, {
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({ error: 'Database Internal Error', code: 'DB_DOWN' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => mockUpstreamServer.listen(0, resolve));
  const upstreamPort = mockUpstreamServer.address().port;

  try {
    // -------------------------------------------------------------------------
    // TEST A: Valid JSON Formatting & Syntax Highlighting
    // -------------------------------------------------------------------------
    console.log('--- TEST A: Valid JSON Formatting & Syntax Highlighting ---');
    const sampleObj = {
      name: 'DevProbe',
      version: 1.0,
      active: true,
      data: null,
      tags: ['api', 'testing']
    };
    const formatted = JSON.stringify(sampleObj, null, 2);
    const highlighted = highlightJsonToHtml(formatted);

    assert(highlighted.includes('class="json-key"'), 'TEST A: Syntax highlighting contains json-key tags');
    assert(highlighted.includes('class="json-string"'), 'TEST A: Syntax highlighting contains json-string tags');
    assert(highlighted.includes('class="json-number"'), 'TEST A: Syntax highlighting contains json-number tags');
    assert(highlighted.includes('class="json-boolean"'), 'TEST A: Syntax highlighting contains json-boolean tags');
    assert(highlighted.includes('class="json-null"'), 'TEST A: Syntax highlighting contains json-null tags');
    assert(highlighted.includes('class="json-punct"'), 'TEST A: Syntax highlighting contains json-punct tags');
    assert(highlighted.includes('&quot;name&quot;'), 'TEST A: Quotes are safely escaped in HTML representation');

    // Test JSON with colons inside string values
    const stringEndingColonObj = { status: 'pending:', note: 'time: 12:00' };
    const highlightedColon = highlightJsonToHtml(JSON.stringify(stringEndingColonObj, null, 2));
    assert(highlightedColon.includes('&quot;status&quot;'), 'TEST A: Correctly highlights key before colon');
    assert(highlightedColon.includes('&quot;pending:&quot;'), 'TEST A: Preserves colon inside string value without splitting token');

    // -------------------------------------------------------------------------
    // TEST B: Safe Rendering & HTML-Escaping (XSS Prevention)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST B: Safe Rendering & HTML-Escaping (XSS Prevention) ---');
    const xssPayload = {
      message: '<script>alert("xss")</script>',
      html: '<img src=x onerror="stealCredentials()">'
    };
    const highlightedXss = highlightJsonToHtml(JSON.stringify(xssPayload, null, 2));

    assert(!highlightedXss.includes('<script>'), 'TEST B: Does not contain raw unescaped <script>');
    assert(highlightedXss.includes('&lt;script&gt;'), 'TEST B: Escapes <script> to &lt;script&gt;');
    assert(!highlightedXss.includes('<img'), 'TEST B: Does not contain raw unescaped <img>');
    assert(highlightedXss.includes('&lt;img'), 'TEST B: Escapes <img> to &lt;img');

    // Test escapeHtml directly
    assert(escapeHtml('<div class="test">&hello</div>') === '&lt;div class=&quot;test&quot;&gt;&amp;hello&lt;/div&gt;', 'TEST B: escapeHtml properly escapes <, >, &, and "');
    assert(escapeHtml(123) === '123', 'TEST B: escapeHtml handles non-string primitives safely');
    assert(escapeHtml(null) === '', 'TEST B: escapeHtml handles null and undefined safely');

    // -------------------------------------------------------------------------
    // TEST C: Invalid and Malformed JSON Fallback
    // -------------------------------------------------------------------------
    console.log('\n--- TEST C: Invalid and Malformed JSON Fallback ---');
    renderResponseToUI({
      status: 200,
      statusText: 'OK',
      timeMs: 40,
      sizeBytes: 32,
      headers: { 'content-type': 'application/json' },
      body: '{"invalid": true, missing_close_brace',
      rawText: '{"invalid": true, missing_close_brace'
    });

    assert(activeResponse.isJson === false, 'TEST C: Malformed JSON sets activeResponse.isJson to false');
    assert(activeResponse.isMalformedJson === true, 'TEST C: Malformed JSON sets activeResponse.isMalformedJson to true');
    assert(activeResponse.rawText === '{"invalid": true, missing_close_brace', 'TEST C: Preserves rawText verbatim');

    // Plain text starting with { that is not declared as JSON
    renderResponseToUI({
      status: 200,
      statusText: 'OK',
      timeMs: 25,
      sizeBytes: 20,
      headers: { 'content-type': 'text/plain' },
      body: '{not_json_template}',
      rawText: '{not_json_template}'
    });

    assert(activeResponse.isJson === false, 'TEST C: Non-JSON plain text with braces is not treated as JSON');
    assert(activeResponse.isMalformedJson === false, 'TEST C: Non-JSON plain text is not marked as malformed JSON');
    assert(activeResponse.rawText === '{not_json_template}', 'TEST C: Plain text rawText preserved');

    // -------------------------------------------------------------------------
    // TEST D: Plain-Text Responses
    // -------------------------------------------------------------------------
    console.log('\n--- TEST D: Plain-Text Responses ---');
    renderResponseToUI({
      status: 200,
      statusText: 'OK',
      timeMs: 15,
      sizeBytes: 13,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: 'Hello, World!',
      rawText: 'Hello, World!'
    });

    assert(activeResponse.isJson === false, 'TEST D: Plain text sets isJson to false');
    assert(activeResponse.isBinary === false, 'TEST D: Plain text sets isBinary to false');
    assert(activeResponse.isMalformedJson === false, 'TEST D: Plain text sets isMalformedJson to false');
    assert(activeResponse.rawText === 'Hello, World!', 'TEST D: Plain text body preserved as string');
    assert(activeResponse.contentType.includes('text/plain'), 'TEST D: Content-Type captured properly');

    // -------------------------------------------------------------------------
    // TEST E: Empty Response Bodies (HTTP 204 & 0-byte Bodies)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST E: Empty Response Bodies (HTTP 204 & 0-byte Bodies) ---');
    renderResponseToUI({
      status: 204,
      statusText: 'No Content',
      timeMs: 10,
      sizeBytes: 0,
      headers: {},
      body: '',
      rawText: ''
    });

    assert(activeResponse.status === 204, 'TEST E: HTTP 204 status recorded');
    assert(activeResponse.isEmpty === true, 'TEST E: HTTP 204 flagged as activeResponse.isEmpty: true');
    assert(activeResponse.rawText === '', 'TEST E: HTTP 204 rawText is empty string');

    // HTTP 200 with 0 bytes
    renderResponseToUI({
      status: 200,
      statusText: 'OK',
      timeMs: 12,
      sizeBytes: 0,
      headers: { 'content-type': 'text/plain' },
      body: '',
      rawText: ''
    });

    assert(activeResponse.isEmpty === true, 'TEST E: 0-byte response flagged as isEmpty: true');

    // -------------------------------------------------------------------------
    // TEST F: Binary / Unsupported Media Handling
    // -------------------------------------------------------------------------
    console.log('\n--- TEST F: Binary / Unsupported Media Handling ---');
    renderResponseToUI({
      status: 200,
      statusText: 'OK',
      timeMs: 35,
      sizeBytes: 64,
      headers: { 'content-type': 'application/octet-stream' },
      body: {
        isBinary: true,
        contentType: 'application/octet-stream',
        sizeBytes: 64,
        preview: '[Binary content: 64 bytes, Content-Type: application/octet-stream]'
      },
      rawText: '[Binary content: 64 bytes, Content-Type: application/octet-stream]'
    });

    assert(activeResponse.isBinary === true, 'TEST F: Binary response flagged as isBinary: true');
    assert(activeResponse.isJson === false, 'TEST F: Binary response isJson is false');
    assert(activeResponse.rawText.includes('Binary content: 64 bytes'), 'TEST F: Provides safe textual descriptor for binary payload');

    // -------------------------------------------------------------------------
    // TEST G: Non-2xx HTTP Responses (4xx, 5xx) As Valid Execution Results
    // -------------------------------------------------------------------------
    console.log('\n--- TEST G: Non-2xx HTTP Responses (4xx, 5xx) ---');
    renderResponseToUI({
      status: 404,
      statusText: 'Not Found',
      timeMs: 45,
      sizeBytes: 42,
      headers: { 'content-type': 'application/json' },
      body: { error: 'Resource Not Found', code: '404' },
      rawText: '{"error":"Resource Not Found","code":"404"}'
    });

    assert(activeResponse.status === 404, 'TEST G: Non-2xx status 404 recorded');
    assert(activeResponse.statusText === 'Not Found', 'TEST G: Non-2xx statusText recorded');
    assert(activeResponse.isJson === true, 'TEST G: Non-2xx JSON response body parsed and formatted');
    assert(activeResponse.body.error === 'Resource Not Found', 'TEST G: Upstream error body fields accessible');

    renderResponseToUI({
      status: 500,
      statusText: 'Internal Server Error',
      timeMs: 80,
      sizeBytes: 30,
      headers: { 'content-type': 'text/plain' },
      body: 'Upstream server crashed',
      rawText: 'Upstream server crashed'
    });

    assert(activeResponse.status === 500, 'TEST G: Non-2xx status 500 recorded');
    assert(activeResponse.rawText === 'Upstream server crashed', 'TEST G: 500 response body string preserved');

    // -------------------------------------------------------------------------
    // TEST H: Network Errors & Timeout States
    // -------------------------------------------------------------------------
    console.log('\n--- TEST H: Network Errors & Timeout States ---');
    renderResponseError('Request timed out after 300ms', 'REQUEST_TIMEOUT');

    assert(activeResponse.status === null, 'TEST H: Network error sets status to null');
    assert(activeResponse.timeMs === null, 'TEST H: Network error clears timeMs');
    assert(activeResponse.sizeBytes === null, 'TEST H: Network error clears sizeBytes');
    assert(activeResponse.rawText.includes('REQUEST_TIMEOUT'), 'TEST H: rawText includes error code');
    assert(activeResponse.rawText.includes('Request timed out'), 'TEST H: rawText includes error message');

    // -------------------------------------------------------------------------
    // TEST I: Response Metadata & Consecutive Request State Reset
    // -------------------------------------------------------------------------
    console.log('\n--- TEST I: Response Metadata & Consecutive Request State Reset ---');
    // Content-Type extraction case-insensitivity
    assert(getContentType({ 'Content-Type': 'application/json' }) === 'application/json', 'TEST I: getContentType handles Title-Case header');
    assert(getContentType({ 'content-type': 'text/plain; charset=utf-8' }) === 'text/plain; charset=utf-8', 'TEST I: getContentType handles lowercase header');
    assert(getContentType({ 'CONTENT-TYPE': 'application/xml' }) === 'application/xml', 'TEST I: getContentType handles uppercase header');
    assert(getContentType({}) === '', 'TEST I: getContentType returns empty string when absent');

    // resetResponseViewer resets all state fields cleanly
    activeResponse.status = 200;
    activeResponse.timeMs = 120;
    activeResponse.sizeBytes = 400;
    activeResponse.headers = { 'x-foo': 'bar' };
    activeResponse.body = { test: true };
    activeResponse.rawText = '{"test":true}';

    resetResponseViewer();

    assert(activeResponse.status === null, 'TEST I: resetResponseViewer resets status to null');
    assert(activeResponse.timeMs === null, 'TEST I: resetResponseViewer resets timeMs to null');
    assert(activeResponse.sizeBytes === null, 'TEST I: resetResponseViewer resets sizeBytes to null');
    assert(activeResponse.rawText === '', 'TEST I: resetResponseViewer resets rawText to empty');
    assert(activeResponse.body === null, 'TEST I: resetResponseViewer resets body to null');
    assert(Object.keys(activeResponse.headers).length === 0, 'TEST I: resetResponseViewer clears headers');

    // -------------------------------------------------------------------------
    // TEST J: Copy Body Logic
    // -------------------------------------------------------------------------
    console.log('\n--- TEST J: Copy Body Logic ---');
    // Empty body copy detection
    activeResponse.status = 204;
    activeResponse.isEmpty = true;
    activeResponse.rawText = '';
    activeResponse.body = '';

    // Mock clipboard API in test environment
    let clipboardWrittenText = null;
    const originalClipboard = global.navigator && global.navigator.clipboard;
    Object.defineProperty(global.navigator, 'clipboard', {
      value: {
        writeText: (text) => {
          clipboardWrittenText = text;
          return Promise.resolve();
        }
      },
      configurable: true,
      writable: true
    });

    const copyResultEmpty = await copyTextToClipboard('', 'Copied', 'Success', 'Failed');
    assert(copyResultEmpty === false, 'TEST J: copyTextToClipboard rejects empty string');
    assert(clipboardWrittenText === null, 'TEST J: Empty string does not write to clipboard');

    const testPayload = JSON.stringify({ copyMe: 'success' }, null, 2);
    const copyResultSuccess = await copyTextToClipboard(testPayload, 'Copied', 'Success', 'Failed');
    assert(copyResultSuccess === true, 'TEST J: copyTextToClipboard succeeds for valid content');
    assert(clipboardWrittenText === testPayload, 'TEST J: Written clipboard content matches formatted string');

    // Test fallback when navigator.clipboard rejects
    global.navigator.clipboard.writeText = () => Promise.reject(new Error('Permission denied'));
    // In headless Node, fallback returns false safely
    const copyResultFallback = await copyTextToClipboard('Fallback Text');
    assert(copyResultFallback === false, 'TEST J: Clipboard failure handled safely without throwing uncaught exception');

    if (originalClipboard !== undefined) {
      Object.defineProperty(global.navigator, 'clipboard', { value: originalClipboard, configurable: true });
    } else {
      delete global.navigator.clipboard;
    }

    // -------------------------------------------------------------------------
    // TEST K: Copy Headers Logic
    // -------------------------------------------------------------------------
    console.log('\n--- TEST K: Copy Headers Logic ---');
    const sampleHeaders = {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache, no-store',
      'x-request-id': 'devprobe-req-999'
    };
    const formattedHeaders = formatHeadersForCopy(sampleHeaders);

    assert(formattedHeaders.includes('content-type: application/json; charset=utf-8'), 'TEST K: Formats Content-Type header line');
    assert(formattedHeaders.includes('cache-control: no-cache, no-store'), 'TEST K: Formats Cache-Control header line');
    assert(formattedHeaders.includes('x-request-id: devprobe-req-999'), 'TEST K: Formats X-Request-Id header line');
    assert(formattedHeaders.split('\n').length === 3, 'TEST K: Each header entry occupies a new line');
    assert(formatHeadersForCopy({}) === '', 'TEST K: Empty headers object returns empty string');
    assert(formatHeadersForCopy(null) === '', 'TEST K: Null headers parameter returns empty string');

    // -------------------------------------------------------------------------
    // TEST L: Integration with Real DevProbe Server & Outbound Execution
    // -------------------------------------------------------------------------
    console.log('\n--- TEST L: Integration with Real DevProbe Server & Outbound Execution ---');
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';

    // 1. Valid JSON execution
    const execRes1 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${upstreamPort}/day6-json`
      }
    });

    assert(execRes1.statusCode === 200, 'TEST L: POST /api/requests/execute returns 200 for JSON endpoint');
    assert(execRes1.json.success === true, 'TEST L: JSON execution reports success: true');
    assert(execRes1.json.data.status === 200, 'TEST L: Upstream status is 200');
    assert(execRes1.json.data.body && execRes1.json.data.body.user === 'Prasad', 'TEST L: Parsed body user matches upstream');
    assert(typeof execRes1.json.data.rawText === 'string', 'TEST L: Backend returns rawText for raw mode display');
    assert(execRes1.json.data.rawText.includes('"user":"Prasad"'), 'TEST L: rawText preserves exact unformatted upstream text');

    // 2. Malformed JSON execution
    const execRes2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${upstreamPort}/day6-malformed-json`
      }
    });

    assert(execRes2.statusCode === 200, 'TEST L: Malformed upstream JSON returns 200 from execution engine');
    assert(typeof execRes2.json.data.body === 'string', 'TEST L: Malformed JSON body falls back to string');
    assert(execRes2.json.data.rawText.includes('missing_brace:'), 'TEST L: Malformed rawText preserved');

    // 3. Plain text execution
    const execRes3 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${upstreamPort}/day6-text`
      }
    });

    assert(execRes3.statusCode === 200, 'TEST L: Plain text returns 200');
    assert(execRes3.json.data.body === 'Server operational. Status code 200.', 'TEST L: Plain text body preserved verbatim');

    // 4. HTTP 204 No Content execution
    const execRes4 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${upstreamPort}/day6-empty-204`
      }
    });

    assert(execRes4.statusCode === 200, 'TEST L: HTTP 204 execution returns 200 response envelope');
    assert(execRes4.json.data.status === 204, 'TEST L: Upstream status is 204');
    assert(execRes4.json.data.body === '', 'TEST L: Upstream body is empty string');

    // 5. Binary content execution
    const execRes5 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${upstreamPort}/day6-binary`
      }
    });

    assert(execRes5.statusCode === 200, 'TEST L: Binary response returns 200');
    assert(execRes5.json.data.body.isBinary === true, 'TEST L: Binary body descriptor flagged as isBinary: true');
    assert(execRes5.json.data.body.preview.includes('Binary content'), 'TEST L: Binary preview text provided');

    // 6. Non-2xx 404 execution
    const execRes6 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${upstreamPort}/day6-non-2xx-404`
      }
    });

    assert(execRes6.statusCode === 200, 'TEST L: Upstream 404 returns 200 execution envelope');
    assert(execRes6.json.data.status === 404, 'TEST L: Data status is 404');
    assert(execRes6.json.data.body.error === 'Endpoint Not Found', 'TEST L: Upstream 404 body preserved');

    // -------------------------------------------------------------------------
    // TEST M: Regression Checks (Day 3, 4, 5 Exports & State Integrity)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST M: Regression Checks ---');
    assert(typeof activeRequest === 'object', 'TEST M: activeRequest state exported');
    assert(typeof activeResponse === 'object', 'TEST M: activeResponse state exported');
    assert(typeof renderResponseToUI === 'function', 'TEST M: renderResponseToUI function exported');
    assert(typeof renderResponseError === 'function', 'TEST M: renderResponseError function exported');
    assert(typeof renderResponseBodyContent === 'function', 'TEST M: renderResponseBodyContent function exported');
    assert(typeof resetResponseViewer === 'function', 'TEST M: resetResponseViewer function exported');
    assert(typeof setResponseLoadingState === 'function', 'TEST M: setResponseLoadingState function exported');
    assert(typeof highlightJsonToHtml === 'function', 'TEST M: highlightJsonToHtml function exported');
    assert(typeof formatHeadersForCopy === 'function', 'TEST M: formatHeadersForCopy function exported');
    assert(typeof copyTextToClipboard === 'function', 'TEST M: copyTextToClipboard function exported');

    // Clean up servers
    await new Promise((resolve) => appServer.close(resolve));
    await new Promise((resolve) => mockUpstreamServer.close(resolve));

    console.log('\n===========================================');
    console.log(`Test Results: ${passedTests}/${totalTests} Passed`);
    console.log('===========================================\n');

  } catch (err) {
    console.error('Fatal error during test execution:', err);
    process.exitCode = 1;
    try {
      appServer.close();
      mockUpstreamServer.close();
    } catch {
      // ignore
    }
  }
}

runTests();
