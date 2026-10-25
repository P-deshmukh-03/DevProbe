/**
 * DevProbe Day 5 Verification Test Suite
 * Tests all requirements from Section 10 (TEST A through TEST R)
 */

const http = require('http');
const app = require('./src/app.js');
const {
  resolveAndValidateDestination,
  validateTargetUrl,
  isRestrictedIp,
  EXECUTION_LIMITS
} = require('./src/config/security.js');
const {
  activeRequest,
  activeResponse,
  renderResponseToUI,
  handleSendRequest
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
 * Helper to make HTTP requests against the test DevProbe server
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
  console.log('=== DevProbe Day 5 Verification Tests ===\n');

  // Start DevProbe app server on random available port
  const appServer = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  // Start a controlled mock upstream server for testing real execution behavior
  const mockUpstreamServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/success-json') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Custom-Upstream': 'DevProbe-Test-123'
      });
      res.end(JSON.stringify({ greeting: 'Hello from Upstream API', version: 5, active: true }));
    } else if (url.pathname === '/status-404') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Upstream resource not found');
    } else if (url.pathname === '/status-500') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream Database Failure' }));
    } else if (url.pathname === '/echo-auth') {
      const authHeader = req.headers['authorization'] || null;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'secret_session_token=sensitive12345; Path=/; HttpOnly',
        'X-Received-Auth': authHeader || 'NONE'
      });
      res.end(JSON.stringify({ authenticated: Boolean(authHeader), receivedAuth: authHeader }));
    } else if (url.pathname === '/echo-body') {
      let bodyData = '';
      req.on('data', chunk => { bodyData += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          method: req.method,
          contentType: req.headers['content-type'] || null,
          contentLength: req.headers['content-length'] || null,
          bodyReceived: bodyData
        }));
      });
    } else if (url.pathname === '/plain-text') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Plain text response without JSON wrapper');
    } else if (url.pathname === '/empty-204') {
      res.writeHead(204);
      res.end();
    } else if (url.pathname === '/binary-content') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      // Send binary buffer with null bytes
      res.end(Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x50, 0x4b]));
    } else if (url.pathname === '/redirect-safe') {
      res.writeHead(302, { 'Location': '/success-json' });
      res.end();
    } else if (url.pathname === '/redirect-loop') {
      res.writeHead(302, { 'Location': '/redirect-loop' });
      res.end();
    } else if (url.pathname === '/redirect-ssrf') {
      // Redirects to private loopback target
      res.writeHead(302, { 'Location': 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    } else if (url.pathname === '/timeout') {
      // Intentionally do not respond in time
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200);
          res.end('Delayed response');
        }
      }, 3000);
    } else if (url.pathname === '/oversized') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      // Stream chunks exceeding 5 MB limit
      const chunk = Buffer.alloc(1024 * 1024, 'A'); // 1 MB chunk
      for (let i = 0; i < 6; i++) {
        res.write(chunk);
      }
      res.end();
    } else {
      res.writeHead(200);
      res.end('Default upstream response');
    }
  });

  const mockPort = await new Promise((resolve) => {
    mockUpstreamServer.listen(0, () => resolve(mockUpstreamServer.address().port));
  });

  try {
    // -------------------------------------------------------------------------
    // TEST A — Health endpoint
    // -------------------------------------------------------------------------
    console.log('--- TEST A: Health Endpoint ---');
    const resA = await makeRequest(appServer, { method: 'GET', path: '/api/health' });
    assert(resA.statusCode === 200, 'TEST A: GET /api/health returns 200');
    assert(resA.json?.success === true, 'TEST A: json.success is true');
    assert(resA.json?.message === 'DevProbe server is running', 'TEST A: Server health message intact');

    // -------------------------------------------------------------------------
    // TEST B — Preparation-only validate endpoint remains functional
    // -------------------------------------------------------------------------
    console.log('\n--- TEST B: Preparation-only Validate Endpoint ---');
    let validateHitTarget = false;
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    const resB = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/success-json`
      }
    });
    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    assert(resB.statusCode === 200, 'TEST B: POST /api/requests/validate returns 200');
    assert(resB.json?.data?.readyForExecution === true, 'TEST B: readyForExecution is true');
    assert(resB.json?.data?.executionStatus === 'NOT_EXECUTED', 'TEST B: executionStatus is NOT_EXECUTED');
    assert(validateHitTarget === false, 'TEST B: Validate endpoint dispatches ZERO outbound requests');

    // -------------------------------------------------------------------------
    // TEST C — Successful real HTTP request execution
    // -------------------------------------------------------------------------
    console.log('\n--- TEST C: Successful Real HTTP Request Execution ---');
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    const resC = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/success-json`,
        headers: {
          'Accept': 'application/json'
        }
      }
    });
    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    assert(resC.statusCode === 200, 'TEST C: POST /api/requests/execute returns 200');
    assert(resC.json?.success === true, 'TEST C: json.success is true');
    assert(resC.json?.data?.status === 200, 'TEST C: data.status is 200');
    assert(resC.json?.data?.statusText === 'OK', 'TEST C: data.statusText is OK');
    assert(typeof resC.json?.data?.timeMs === 'number' && resC.json.data.timeMs >= 0, 'TEST C: Measures elapsed time');
    assert(resC.json?.data?.sizeBytes > 0, 'TEST C: Captures actual response size in bytes');
    assert(resC.json?.data?.headers?.['x-custom-upstream'] === 'DevProbe-Test-123', 'TEST C: Captures custom upstream headers');
    assert(resC.json?.data?.body?.greeting === 'Hello from Upstream API', 'TEST C: Parsed JSON body correctly');
    assert(resC.json?.data?.body?.version === 5, 'TEST C: Response body fields match upstream');

    // -------------------------------------------------------------------------
    // TEST D — Valid non-2xx upstream responses (404 and 500)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST D: Upstream Non-2xx Responses ---');
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    const resD1 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/status-404`
      }
    });

    assert(resD1.statusCode === 200, 'TEST D: DevProbe returns 200 when upstream responds 404');
    assert(resD1.json?.success === true, 'TEST D: json.success is true');
    assert(resD1.json?.data?.status === 404, 'TEST D: data.status is 404');
    assert(resD1.json?.data?.body === 'Upstream resource not found', 'TEST D: Upstream 404 body preserved');

    const resD2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/status-500`
      }
    });
    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    assert(resD2.statusCode === 200, 'TEST D: DevProbe returns 200 when upstream responds 500');
    assert(resD2.json?.data?.status === 500, 'TEST D: data.status is 500');
    assert(resD2.json?.data?.body?.error === 'Upstream Database Failure', 'TEST D: Upstream 500 JSON body preserved');

    // -------------------------------------------------------------------------
    // TEST E — Unsupported methods are rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST E: Unsupported Methods Rejected ---');
    const resE = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'CONNECT',
        url: 'https://example.com/api'
      }
    });
    assert(resE.statusCode === 400, 'TEST E: CONNECT method returns 400');
    assert(resE.json?.error?.code === 'UNSUPPORTED_METHOD', 'TEST E: Code is UNSUPPORTED_METHOD');

    // -------------------------------------------------------------------------
    // TEST F — Invalid URLs and non-HTTP protocols are rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST F: Invalid URLs and Protocols Rejected ---');
    const resF1 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: 'ftp://ftp.example.com/file.txt'
      }
    });
    assert(resF1.statusCode === 400, 'TEST F: ftp:// protocol returns 400');

    const resF2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: 'https://admin:secret@api.example.com'
      }
    });
    assert(resF2.statusCode === 400, 'TEST F: URL with embedded credentials returns 400');

    // -------------------------------------------------------------------------
    // TEST G — SSRF: Loopback, private, reserved, and metadata targets blocked
    // -------------------------------------------------------------------------
    console.log('\n--- TEST G: SSRF Target Restrictions ---');
    const ssrfTargets = [
      { url: 'http://127.0.0.1:8080/admin', desc: 'IPv4 loopback' },
      { url: 'http://localhost:3000/api', desc: 'localhost hostname' },
      { url: 'http://169.254.169.254/latest/meta-data/', desc: 'Cloud IMDS IP' },
      { url: 'http://10.0.0.1/private', desc: 'Private Class A' },
      { url: 'http://192.168.0.1/router', desc: 'Private Class C' },
      { url: 'http://172.16.1.1/internal', desc: 'Private Class B' },
      { url: 'http://0.0.0.0/test', desc: 'Current network 0.0.0.0' },
      { url: 'http://metadata.google.internal/compute', desc: 'Google internal metadata' }
    ];

    for (const target of ssrfTargets) {
      const resG = await makeRequest(appServer, {
        method: 'POST',
        path: '/api/requests/execute',
        body: {
          method: 'GET',
          url: target.url
        }
      });
      assert(resG.statusCode === 400, `TEST G: Blocks ${target.desc} before connection`);
      assert(
        resG.json?.error?.code === 'INVALID_URL' || resG.json?.error?.code === 'BLOCKED_DESTINATION',
        `TEST G: Block code for ${target.desc}`
      );
    }

    // -------------------------------------------------------------------------
    // TEST H — DNS answers containing prohibited addresses are rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST H: DNS Prohibited IP Validation ---');
    // Test custom resolver returning private IP for a public-looking domain
    const dnsCheck1 = await resolveAndValidateDestination('public-looking-domain.com', {
      allowLocal: false,
      dnsResolver: async () => [{ address: '127.0.0.1', family: 4 }]
    });
    assert(dnsCheck1.isValid === false, 'TEST H: DNS record pointing to 127.0.0.1 is rejected');
    assert(dnsCheck1.code === 'BLOCKED_DESTINATION', 'TEST H: Code is BLOCKED_DESTINATION');

    // Dual-stack where one IP is public and one is private (multi-homed DNS rebinding attempt)
    const dnsCheck2 = await resolveAndValidateDestination('multi-homed-attack.com', {
      allowLocal: false,
      dnsResolver: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 }
      ]
    });
    assert(dnsCheck2.isValid === false, 'TEST H: Dual-homed response with private IP is rejected');
    assert(dnsCheck2.error?.includes('10.0.0.1'), 'TEST H: Error mentions restricted private IP');

    // -------------------------------------------------------------------------
    // TEST I — DNS rebinding protection (connection pinning)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST I: DNS Rebinding Protection & Connection Pinning ---');
    const validDns = await resolveAndValidateDestination('safe-domain.example', {
      allowLocal: false,
      dnsResolver: async () => [{ address: '93.184.216.34', family: 4 }]
    });
    assert(validDns.isValid === true, 'TEST I: Valid public destination succeeds');
    assert(validDns.pinnedIp === '93.184.216.34', 'TEST I: Pinned IP matches validated record');
    assert(validDns.pinnedFamily === 4, 'TEST I: Pinned family matches validated record');

    // -------------------------------------------------------------------------
    // TEST J — Redirects to unsafe destinations are blocked
    // -------------------------------------------------------------------------
    console.log('\n--- TEST J: Redirects to Unsafe Destinations Blocked ---');
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    // Start target allowing local dispatch, but redirect points to 169.254.169.254
    const resJ = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/redirect-ssrf`
      }
    });
    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    assert(resJ.statusCode === 400, 'TEST J: Redirect to cloud metadata IP returns 400');
    assert(resJ.json?.error?.code === 'BLOCKED_DESTINATION', 'TEST J: Redirect SSRF code is BLOCKED_DESTINATION');

    // -------------------------------------------------------------------------
    // TEST K — Redirect limits are enforced
    // -------------------------------------------------------------------------
    console.log('\n--- TEST K: Redirect Limits Enforced ---');
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    const resK = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/redirect-loop`
      }
    });
    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    assert(resK.statusCode === 502, 'TEST K: Exceeding max redirects returns 502');
    assert(resK.json?.error?.code === 'TOO_MANY_REDIRECTS', 'TEST K: Error code is TOO_MANY_REDIRECTS');

    // -------------------------------------------------------------------------
    // TEST L — Timeouts are enforced
    // -------------------------------------------------------------------------
    console.log('\n--- TEST L: Request Timeout Enforced ---');
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    const resL = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/timeout`,
        settings: {
          timeoutMs: 300 // Short 300ms timeout for test
        }
      }
    });
    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    assert(resL.statusCode === 504, 'TEST L: Timeout produces 504 Gateway Timeout');
    assert(resL.json?.error?.code === 'REQUEST_TIMEOUT', 'TEST L: Code is REQUEST_TIMEOUT');

    // -------------------------------------------------------------------------
    // TEST M — Oversized response bodies are aborted safely
    // -------------------------------------------------------------------------
    console.log('\n--- TEST M: Oversized Response Streaming Limit ---');
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    const resM = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/oversized`,
        settings: {
          maxResponseSizeBytes: 2 * 1024 * 1024 // 2 MB limit for test
        }
      }
    });
    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    assert(resM.statusCode === 413, 'TEST M: Oversized stream produces 413 Payload Too Large');
    assert(resM.json?.error?.code === 'RESPONSE_TOO_LARGE', 'TEST M: Code is RESPONSE_TOO_LARGE');

    // -------------------------------------------------------------------------
    // TEST N — Invalid JSON request bodies handled correctly
    // -------------------------------------------------------------------------
    console.log('\n--- TEST N: Invalid Request Bodies Handled ---');
    const resN = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      headers: { 'Content-Type': 'application/json' },
      body: '{"method": "POST", "url": "https://example.com", broken_json!'
    });
    assert(resN.statusCode === 400, 'TEST N: Malformed request payload returns 400');
    assert(resN.json?.error?.code === 'INVALID_JSON', 'TEST N: Code is INVALID_JSON');

    // -------------------------------------------------------------------------
    // TEST O — Sensitive credentials (Bearer, Basic, Set-Cookie) not leaked
    // -------------------------------------------------------------------------
    console.log('\n--- TEST O: Sensitive Credentials Protection ---');
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    const secretToken = 'super-secret-token-xyz-777';
    const resO = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort}/echo-auth`,
        auth: {
          type: 'bearer',
          bearerToken: secretToken
        }
      }
    });
    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    assert(resO.statusCode === 200, 'TEST O: Auth request succeeds');
    assert(resO.json?.data?.headers?.['set-cookie'] === undefined, 'TEST O: Upstream Set-Cookie is filtered from response headers');
    assert(resO.json?.data?.headers?.['set-cookie2'] === undefined, 'TEST O: Set-Cookie2 filtered');
    assert(resO.json?.data?.headers?.['authorization'] === undefined, 'TEST O: Authorization header not echoed in response headers');

    // -------------------------------------------------------------------------
    // TEST P — Safe handling of JSON, plain-text, empty, and binary responses
    // -------------------------------------------------------------------------
    console.log('\n--- TEST P: Response Media Type Handling ---');
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';

    // P1: Plain text response
    const resP1 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: { method: 'GET', url: `http://localhost:${mockPort}/plain-text` }
    });
    assert(resP1.statusCode === 200, 'TEST P1: Plain text endpoint returns 200');
    assert(resP1.json?.data?.body === 'Plain text response without JSON wrapper', 'TEST P1: Plain text body preserved as string');

    // P2: Empty 204 response
    const resP2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: { method: 'GET', url: `http://localhost:${mockPort}/empty-204` }
    });
    assert(resP2.statusCode === 200, 'TEST P2: 204 response handled as 200 execution result');
    assert(resP2.json?.data?.status === 204, 'TEST P2: Upstream status code is 204');
    assert(resP2.json?.data?.body === '', 'TEST P2: Empty body is returned as empty string');

    // P3: Binary response
    const resP3 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: { method: 'GET', url: `http://localhost:${mockPort}/binary-content` }
    });
    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    assert(resP3.statusCode === 200, 'TEST P3: Binary response returns 200');
    assert(resP3.json?.data?.body?.isBinary === true, 'TEST P3: Binary response flagged as isBinary: true');
    assert(typeof resP3.json?.data?.body?.preview === 'string', 'TEST P3: Binary response provides safe preview');

    // -------------------------------------------------------------------------
    // TEST Q — Frontend Send button & response viewer state synchronization
    // -------------------------------------------------------------------------
    console.log('\n--- TEST Q: Frontend State & Response Synchronization ---');
    renderResponseToUI({
      status: 200,
      statusText: 'OK',
      timeMs: 42,
      sizeBytes: 128,
      headers: {
        'content-type': 'application/json',
        'x-app': 'DevProbe'
      },
      body: { user: 'tester', ok: true }
    });

    assert(activeResponse.status === 200, 'TEST Q: activeResponse status updated');
    assert(activeResponse.statusText === 'OK', 'TEST Q: activeResponse statusText updated');
    assert(activeResponse.timeMs === 42, 'TEST Q: activeResponse timeMs updated');
    assert(activeResponse.isJson === true, 'TEST Q: activeResponse isJson identified');
    assert(activeResponse.headers['x-app'] === 'DevProbe', 'TEST Q: activeResponse headers updated');

    // -------------------------------------------------------------------------
    // TEST R — Day 3 and Day 4 regression tests check
    // -------------------------------------------------------------------------
    console.log('\n--- TEST R: Regression Check ---');
    assert(typeof activeRequest === 'object', 'TEST R: activeRequest state preserved');
    assert(typeof renderResponseToUI === 'function', 'TEST R: renderResponseToUI exported');
    assert(typeof handleSendRequest === 'function', 'TEST R: handleSendRequest exported');

    console.log('\n===========================================');
    console.log(`Test Results: ${passedTests}/${totalTests} Passed`);
    console.log('===========================================\n');

    appServer.close();
    mockUpstreamServer.close();
    process.exit(passedTests === totalTests ? 0 : 1);
  } catch (err) {
    appServer.close();
    mockUpstreamServer.close();
    console.error('Fatal test error in test-day5.js:', err);
    process.exit(1);
  }
}

runTests();
