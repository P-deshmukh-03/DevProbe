/**
 * DevProbe Day 4 Verification Test Suite
 * Tests all requirements from Section 9 (TEST A through TEST M)
 */

const http = require('http');
const app = require('./src/app.js');

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
 * Helper to make HTTP requests against the test server
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
          } catch (e) {
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
  console.log('=== DevProbe Day 4 Verification Tests ===\n');

  // Start app server on random available port
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    // -------------------------------------------------------------------------
    // TEST A — Health endpoint
    // -------------------------------------------------------------------------
    console.log('--- TEST A: Health Endpoint ---');
    const resA = await makeRequest(server, { method: 'GET', path: '/api/health' });
    assert(resA.statusCode === 200, 'TEST A: GET /api/health returns 200');
    assert(resA.json?.success === true, 'TEST A: json.success is true');
    assert(resA.json?.message === 'DevProbe server is running', 'TEST A: expected message returned');

    // -------------------------------------------------------------------------
    // TEST B — Valid request configuration
    // -------------------------------------------------------------------------
    console.log('\n--- TEST B: Valid Request Configuration ---');
    const resB = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/users/1',
        headers: {
          Accept: 'application/json'
        },
        body: null
      }
    });
    assert(resB.statusCode === 200, 'TEST B: Status code is 200');
    assert(resB.json?.success === true, 'TEST B: success is true');
    assert(resB.json?.data?.readyForExecution === true, 'TEST B: data.readyForExecution is true');
    assert(resB.json?.data?.method === 'GET', 'TEST B: normalized method is GET');
    assert(resB.json?.data?.url === 'https://jsonplaceholder.typicode.com/users/1', 'TEST B: validated URL matches');
    assert(resB.json?.data?.headers?.Accept === 'application/json', 'TEST B: Accept header preserved');

    // -------------------------------------------------------------------------
    // TEST C — Unsupported method
    // -------------------------------------------------------------------------
    console.log('\n--- TEST C: Unsupported Method ---');
    const resC = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'TRACE',
        url: 'https://jsonplaceholder.typicode.com/users/1'
      }
    });
    assert(resC.statusCode === 400, 'TEST C: TRACE method returns 400');
    assert(resC.json?.success === false, 'TEST C: success is false');
    assert(resC.json?.error?.code === 'UNSUPPORTED_METHOD', 'TEST C: error code is UNSUPPORTED_METHOD');

    // -------------------------------------------------------------------------
    // TEST D — Invalid URL
    // -------------------------------------------------------------------------
    console.log('\n--- TEST D: Invalid URL ---');
    const resD = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'invalid-url-without-protocol'
      }
    });
    assert(resD.statusCode === 400, 'TEST D: Malformed URL returns 400');
    assert(resD.json?.success === false, 'TEST D: success is false');
    assert(resD.json?.error?.code === 'INVALID_URL', 'TEST D: error code is INVALID_URL');

    // -------------------------------------------------------------------------
    // TEST E — Invalid protocol
    // -------------------------------------------------------------------------
    console.log('\n--- TEST E: Invalid Protocol ---');
    const resE1 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'file:///etc/passwd'
      }
    });
    assert(resE1.statusCode === 400, 'TEST E: file:// protocol returns 400');
    assert(resE1.json?.error?.message?.includes('Unsupported protocol'), 'TEST E: file:// protocol error message');

    const resE2 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'ftp://ftp.example.com/files'
      }
    });
    assert(resE2.statusCode === 400, 'TEST E: ftp:// protocol returns 400');

    // -------------------------------------------------------------------------
    // TEST F — Embedded credentials
    // -------------------------------------------------------------------------
    console.log('\n--- TEST F: Embedded Credentials in URL ---');
    const resF = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'https://admin:supersecret@api.example.com/data'
      }
    });
    assert(resF.statusCode === 400, 'TEST F: Embedded credentials return 400');
    assert(resF.json?.error?.message?.includes('embedded credentials'), 'TEST F: Explains credential rejection');

    // -------------------------------------------------------------------------
    // TEST G — Unsafe destination (SSRF targets)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST G: Unsafe Destinations (SSRF targets) ---');
    const unsafeUrls = [
      { url: 'http://localhost:8080/admin', desc: 'localhost' },
      { url: 'http://127.0.0.1:3000/api/health', desc: 'IPv4 loopback 127.0.0.1' },
      { url: 'http://169.254.169.254/latest/meta-data/', desc: 'AWS/GCP Cloud Metadata IMDS' },
      { url: 'http://192.168.1.1/router', desc: 'Private IPv4 Class C' },
      { url: 'http://10.0.0.1/internal', desc: 'Private IPv4 Class A' },
      { url: 'http://172.16.0.5/api', desc: 'Private IPv4 Class B' },
      { url: 'http://metadata.google.internal/computeMetadata/v1/', desc: 'Google Cloud metadata domain' },
      { url: 'http://[::1]/secret', desc: 'IPv6 loopback ::1' },
      { url: 'http://[::ffff:127.0.0.1]/', desc: 'IPv4-mapped IPv6 loopback' }
    ];

    for (const item of unsafeUrls) {
      const resG = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/validate',
        body: { method: 'GET', url: item.url }
      });
      assert(resG.statusCode === 400, `TEST G: Rejects ${item.desc}`);
      assert(resG.json?.success === false, `TEST G: Success is false for ${item.desc}`);
    }

    // -------------------------------------------------------------------------
    // TEST H — Invalid headers
    // -------------------------------------------------------------------------
    console.log('\n--- TEST H: Invalid Headers ---');
    const resH1 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'https://api.example.com',
        headers: {
          'Invalid Header Name With Spaces': 'value'
        }
      }
    });
    assert(resH1.statusCode === 400, 'TEST H: Malformed header name returns 400');
    assert(resH1.json?.error?.code === 'INVALID_HEADER_NAME', 'TEST H: Code is INVALID_HEADER_NAME');

    const resH2 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'https://api.example.com',
        headers: {
          'Content-Type': 12345
        }
      }
    });
    assert(resH2.statusCode === 400, 'TEST H: Non-string header value returns 400');
    assert(resH2.json?.error?.code === 'INVALID_HEADER_VALUE', 'TEST H: Code is INVALID_HEADER_VALUE');

    // -------------------------------------------------------------------------
    // TEST I — Missing fields
    // -------------------------------------------------------------------------
    console.log('\n--- TEST I: Missing Fields ---');
    const resI1 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET'
      }
    });
    assert(resI1.statusCode === 400, 'TEST I: Missing URL returns 400');
    assert(resI1.json?.error?.code === 'MISSING_URL', 'TEST I: Code is MISSING_URL');

    const resI2 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        url: 'https://api.example.com'
      }
    });
    assert(resI2.statusCode === 400, 'TEST I: Missing method returns 400');
    assert(resI2.json?.error?.code === 'MISSING_METHOD', 'TEST I: Code is MISSING_METHOD');

    // -------------------------------------------------------------------------
    // TEST J — Unknown route
    // -------------------------------------------------------------------------
    console.log('\n--- TEST J: Unknown Route ---');
    const resJ = await makeRequest(server, {
      method: 'GET',
      path: '/api/routes/non-existent-endpoint'
    });
    assert(resJ.statusCode === 404, 'TEST J: Unknown API endpoint returns 404');
    assert(resJ.json?.success === false, 'TEST J: success is false');
    assert(resJ.json?.error?.code === 'NOT_FOUND', 'TEST J: Code is NOT_FOUND');

    // -------------------------------------------------------------------------
    // TEST K — Error handling (Malformed JSON and Oversized payload)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST K: Error Handling ---');
    const resK1 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      headers: { 'Content-Type': 'application/json' },
      body: '{"method": "GET", malformed json!'
    });
    assert(resK1.statusCode === 400, 'TEST K: Malformed JSON produces controlled 400');
    assert(resK1.json?.error?.code === 'INVALID_JSON', 'TEST K: Code is INVALID_JSON');
    assert(!resK1.rawData.includes('SyntaxError:'), 'TEST K: Raw stack trace is not exposed in response body');

    // Oversized body test (larger than 1 MB)
    const largeBody = 'x'.repeat(1024 * 1024 + 100);
    const resK2 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'POST',
        url: 'https://api.example.com/data',
        body: largeBody
      }
    });
    assert(resK2.statusCode === 413, 'TEST K: Payload larger than 1 MB produces 413');
    assert(resK2.json?.error?.code === 'PAYLOAD_TOO_LARGE', 'TEST K: Code is PAYLOAD_TOO_LARGE');

    // -------------------------------------------------------------------------
    // TEST L — Sensitive information
    // -------------------------------------------------------------------------
    console.log('\n--- TEST L: Sensitive Information Protection ---');
    const secretBearer = 'super-secret-bearer-token-abc-123';
    const secretCookie = 'session_id=secret-session-cookie-xyz';
    const secretPassword = 'my-super-secret-password-999';

    const resL = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {
          'Authorization': `Bearer ${secretBearer}`,
          'Cookie': secretCookie,
          'Accept': 'application/json'
        },
        auth: {
          type: 'basic',
          basicUsername: 'admin',
          basicPassword: secretPassword
        },
        body: '{"test":true}'
      }
    });

    assert(resL.statusCode === 200, 'TEST L: Valid configuration with auth accepted');
    assert(!resL.rawData.includes(secretBearer), 'TEST L: Bearer token is NEVER echoed in response');
    assert(!resL.rawData.includes(secretCookie), 'TEST L: Cookie value is NEVER echoed in response');
    assert(!resL.rawData.includes(secretPassword), 'TEST L: Password is NEVER echoed in response');
    assert(resL.json?.data?.headers?.Authorization === '[REDACTED]', 'TEST L: Authorization header is redacted');
    assert(resL.json?.data?.headers?.Cookie === '[REDACTED]', 'TEST L: Cookie header is redacted');
    assert(resL.json?.data?.headers?.Accept === 'application/json', 'TEST L: Non-sensitive headers remain intact');
    assert(resL.json?.data?.auth?.configured === true, 'TEST L: Auth configuration acknowledged safely');
    assert(resL.json?.data?.auth?.credentialsExposed === false, 'TEST L: Credentials exposure confirmed false');

    // -------------------------------------------------------------------------
    // TEST M — No outbound execution
    // -------------------------------------------------------------------------
    console.log('\n--- TEST M: No Outbound HTTP Execution ---');
    let destinationHit = false;
    const dummyDestinationServer = http.createServer((req, res) => {
      destinationHit = true;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Destination received request');
    });

    await new Promise((resolve) => dummyDestinationServer.listen(0, resolve));
    const dummyPort = dummyDestinationServer.address().port;

    // Temporarily allow local target in environment for this specific test
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';

    try {
      const resM = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/validate',
        body: {
          method: 'GET',
          url: `http://localhost:${dummyPort}/test-destination`
        }
      });

      assert(resM.statusCode === 200, 'TEST M: Validation succeeds');
      assert(resM.json?.data?.readyForExecution === true, 'TEST M: Reports readyForExecution true');
      assert(resM.json?.data?.executionStatus === 'NOT_EXECUTED', 'TEST M: Reports executionStatus NOT_EXECUTED');

      // Wait 100ms to verify no delayed outbound request fired
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert(destinationHit === false, 'TEST M: Zero outbound HTTP requests sent to target destination');
    } finally {
      delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;
      dummyDestinationServer.close();
    }

    console.log('\n===========================================');
    console.log(`Test Results: ${passedTests}/${totalTests} Passed`);
    console.log('===========================================\n');

    server.close();
    process.exit(passedTests === totalTests ? 0 : 1);
  } catch (err) {
    server.close();
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runTests();
