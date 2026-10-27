/**
 * DevProbe Day 8 Verification Test Suite
 * Security Audit, Edge Cases, and Regression Testing:
 * - URL and destination validation (trailing dots, port range, prohibited TLDs)
 * - IPv6 and IP representation edge cases (6to4, NAT64, Teredo, zone IDs)
 * - Redirect security (cross-origin sensitive header stripping, SSRF redirects, RFC 7231 method transitions)
 * - Response streaming and resource limits (incomplete response detection, socket timeout disarming, stream caps)
 * - Sensitive information protection (extended header redaction, Set-Cookie stripping, error sanitization)
 * - Input validation & HTTP smuggling prevention (CRLF header values, case-insensitive duplicate headers)
 * - Express security hardening (X-Powered-By removal, nosniff, frame-options)
 * - Day 3–7 regression verification
 */

const http = require('http');
const net = require('net');
const app = require('./src/app.js');
const {
  validateTargetUrl,
  resolveAndValidateDestination,
  isRestrictedIp,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  expandIPv6,
  sanitizeHeaders,
  SENSITIVE_HEADERS,
  SENSITIVE_RESPONSE_HEADERS,
  PROHIBITED_DOMAIN_SUFFIXES
} = require('./src/config/security.js');
const {
  classifyErrorCode,
  escapeHtml,
  highlightJsonToHtml,
  validateHeaders,
  validateJsonBody,
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
  console.log('=== DevProbe Day 8 Verification Tests ===\n');

  // Start DevProbe application server on an ephemeral port
  const appServer = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const appPort = appServer.address().port;

  // Ephemeral port tracking for mock upstream servers
  let mockPort1 = 0;
  let mockPort2 = 0;

  // Mock server 1: Primary test target simulating various redirect, header, and content behaviors
  const mockServer1 = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/day8-ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', message: 'Day 8 test endpoint healthy' }));
    } else if (url.pathname === '/day8-echo-headers') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ headers: req.headers }));
    } else if (url.pathname === '/day8-redirect-cross-origin') {
      // Redirects to mockServer2 (different origin / port)
      res.writeHead(302, { 'Location': `http://localhost:${mockPort2}/day8-cross-target` });
      res.end();
    } else if (url.pathname === '/day8-redirect-same-origin') {
      // Redirects within mockServer1
      res.writeHead(302, { 'Location': '/day8-echo-headers' });
      res.end();
    } else if (url.pathname === '/day8-redirect-303') {
      res.writeHead(303, { 'Location': '/day8-check-method' });
      res.end();
    } else if (url.pathname === '/day8-redirect-307') {
      res.writeHead(307, { 'Location': '/day8-check-method' });
      res.end();
    } else if (url.pathname === '/day8-check-method') {
      let bodyData = '';
      req.on('data', chunk => { bodyData += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ method: req.method, body: bodyData }));
      });
    } else if (url.pathname === '/day8-redirect-malformed') {
      res.writeHead(302, { 'Location': 'http://[invalid-url' });
      res.end();
    } else if (url.pathname === '/day8-set-cookie') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'session_token=secret123; HttpOnly; Secure',
        'Set-Cookie2': 'session_id=abc456',
        'X-Public-Header': 'public-value'
      });
      res.end(JSON.stringify({ cookieSent: true }));
    } else if (url.pathname === '/day8-incomplete-response') {
      // Intentionally write partial response with Content-Length: 1000 then destroy socket abruptly
      res.writeHead(200, { 'Content-Length': '1000', 'Content-Type': 'text/plain' });
      res.write('Partial data chunk...');
      setTimeout(() => {
        req.socket.destroy();
      }, 50);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  // Mock server 2: Secondary test target simulating cross-origin destination
  const mockServer2 = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/day8-cross-target') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ headers: req.headers, origin: 'mockServer2' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(resolve => mockServer1.listen(0, () => {
    mockPort1 = mockServer1.address().port;
    resolve();
  }));

  await new Promise(resolve => mockServer2.listen(0, () => {
    mockPort2 = mockServer2.address().port;
    resolve();
  }));

  try {
    // -------------------------------------------------------------------------
    // TEST A: URL, Port, and Destination Validation & SSRF Edge Cases
    // -------------------------------------------------------------------------
    console.log('--- TEST A: URL, Port, and Destination Validation ---');

    // A1: Hostname with trailing dot (FQDN root label) on localhost
    const trailingDotLocalhost = validateTargetUrl('http://localhost.:3000/api');
    assert(trailingDotLocalhost.isValid === false, 'TEST A1: Trailing dot localhost. is rejected');
    assert(trailingDotLocalhost.error?.includes('prohibited hostname'), 'TEST A1: Error identifies prohibited hostname');

    // A2: Hostname with trailing dot on cloud metadata hostname
    const trailingDotGcp = validateTargetUrl('http://metadata.google.internal./computeMetadata');
    assert(trailingDotGcp.isValid === false, 'TEST A2: Trailing dot metadata.google.internal. is rejected');
    assert(trailingDotGcp.error?.includes('cloud metadata'), 'TEST A2: Error identifies cloud metadata');

    // A3: Subdomain trailing dot on prohibited domain suffix
    const trailingDotInternal = validateTargetUrl('http://service.local./status');
    assert(trailingDotInternal.isValid === false, 'TEST A3: Trailing dot local. domain is rejected');

    // A4: Prohibited internal TLDs (.corp, .home, .intranet, .onion)
    const corpCheck = validateTargetUrl('http://intranet.corp/admin');
    assert(corpCheck.isValid === false, 'TEST A4: .corp domain suffix is rejected');
    const onionCheck = validateTargetUrl('http://hidden.onion/login');
    assert(onionCheck.isValid === false, 'TEST A4: .onion domain suffix is rejected');

    // A5: Port number validation: port 0 is rejected
    const portZero = validateTargetUrl('http://example.com:0/path');
    assert(portZero.isValid === false, 'TEST A5: Port 0 is rejected');
    assert(portZero.error?.includes('port number'), 'TEST A5: Identifies invalid port number');

    // A6: Port number validation: negative port is rejected
    const portNeg = validateTargetUrl('http://example.com:-80/path');
    assert(portNeg.isValid === false, 'TEST A6: Negative port is rejected');

    // A7: Valid public URLs pass without false positives
    const validPublic1 = validateTargetUrl('https://api.github.com/users/octocat');
    assert(validPublic1.isValid === true, 'TEST A7: Valid public HTTPS URL passes');
    const validPublic2 = validateTargetUrl('http://example.com:8080/data');
    assert(validPublic2.isValid === true, 'TEST A7: Valid public HTTP URL with custom port passes');

    // -------------------------------------------------------------------------
    // TEST B: IPv6 and Tunneling SSRF Edge Cases
    // -------------------------------------------------------------------------
    console.log('\n--- TEST B: IPv6 and Tunneling SSRF Edge Cases ---');

    // B1: 6to4 encapsulation (2002::/16) embedding loopback 127.0.0.1 (7f00:0001)
    const words6to4 = expandIPv6('2002:7f00:1::');
    assert(words6to4 !== null, 'TEST B1: 6to4 address parses successfully');
    const check6to4 = isPrivateOrReservedIPv6(words6to4);
    assert(check6to4.isPrivate === true, 'TEST B1: 6to4 encapsulated loopback is restricted');
    assert(check6to4.reason?.includes('6to4'), 'TEST B1: Reason identifies 6to4 private destination');

    // B2: 6to4 encapsulation embedding RFC 1918 Class A 10.0.0.1 (0a00:0001)
    const words6to4ClassA = expandIPv6('2002:0a00:1::');
    assert(isPrivateOrReservedIPv6(words6to4ClassA).isPrivate === true, 'TEST B2: 6to4 Class A 10.0.0.1 is restricted');

    // B3: NAT64 prefix (64:ff9b::/96) embedding private IPv4
    const wordsNat64 = expandIPv6('64:ff9b::127.0.0.1');
    assert(wordsNat64 !== null, 'TEST B3: NAT64 address parses successfully');
    const checkNat64 = isPrivateOrReservedIPv6(wordsNat64);
    assert(checkNat64.isPrivate === true, 'TEST B3: NAT64 embedded loopback is restricted');
    assert(checkNat64.reason?.includes('NAT64'), 'TEST B3: Reason identifies NAT64 translation');

    // B4: Teredo tunneling (2001:0000::/32)
    const wordsTeredo = expandIPv6('2001:0000:4136:e378:8000:63bf:3fff:fdd2');
    assert(wordsTeredo !== null, 'TEST B4: Teredo address parses successfully');

    // B5: Benchmarking prefix (2001:2::/48)
    const wordsBench = expandIPv6('2001:2:0:0:0:0:0:1');
    assert(isPrivateOrReservedIPv6(wordsBench).isPrivate === true, 'TEST B5: IPv6 Benchmarking prefix (2001:2::/48) is restricted');

    // B6: IPv6 Scope/Zone ID stripped cleanly without crashing parser
    const expandedScoped = expandIPv6('fe80::1%eth0');
    assert(expandedScoped !== null, 'TEST B6: IPv6 zone ID is handled cleanly');
    assert(isPrivateOrReservedIPv6(expandedScoped).isPrivate === true, 'TEST B6: Scoped fe80::1 is restricted as link-local');

    // B7: Destination DNS resolution with trailing dot
    const dnsTrailing = await resolveAndValidateDestination('localhost.', {
      allowLocal: false,
      dnsResolver: async () => [{ address: '127.0.0.1', family: 4 }]
    });
    assert(dnsTrailing.isValid === false, 'TEST B7: resolveAndValidateDestination blocks localhost.');
    assert(dnsTrailing.code === 'BLOCKED_DESTINATION', 'TEST B7: Code is BLOCKED_DESTINATION');

    // -------------------------------------------------------------------------
    // TEST C: Redirect Security & Method / Header Handling
    // -------------------------------------------------------------------------
    console.log('\n--- TEST C: Redirect Security & Header Stripping ---');

    // C1: Cross-origin redirect strips Authorization and Cookie headers
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    const resC1 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort1}/day8-redirect-cross-origin`,
        headers: {
          'Authorization': 'Bearer secret-jwt-token',
          'Cookie': 'sessionId=abc123secret',
          'X-API-Key': 'secret-api-key-999',
          'Custom-Header': 'keep-this-public'
        }
      }
    });

    assert(resC1.statusCode === 200, 'TEST C1: Cross-origin redirect completes');
    const forwardedHeaders = resC1.json?.data?.body?.headers || {};
    assert(!forwardedHeaders['authorization'], 'TEST C1: Authorization header stripped across origins');
    assert(!forwardedHeaders['cookie'], 'TEST C1: Cookie header stripped across origins');
    assert(!forwardedHeaders['x-api-key'], 'TEST C1: X-API-Key header stripped across origins');
    assert(forwardedHeaders['custom-header'] === 'keep-this-public', 'TEST C1: Non-sensitive headers preserved');

    // C2: Same-origin redirect preserves headers
    const resC2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort1}/day8-redirect-same-origin`,
        headers: {
          'Authorization': 'Bearer same-origin-token'
        }
      }
    });
    assert(resC2.statusCode === 200, 'TEST C2: Same-origin redirect completes');
    const sameOriginHeaders = resC2.json?.data?.body?.headers || {};
    assert(sameOriginHeaders['authorization'] === 'Bearer same-origin-token', 'TEST C2: Authorization retained on same-origin redirect');

    // C3: 303 See Other converts POST to GET and drops body
    const resC3 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'POST',
        url: `http://localhost:${mockPort1}/day8-redirect-303`,
        body: JSON.stringify({ name: 'Alice' })
      }
    });
    assert(resC3.statusCode === 200, 'TEST C3: 303 redirect completes');
    assert(resC3.json?.data?.body?.method === 'GET', 'TEST C3: Method rewritten to GET per RFC 7231');
    assert(resC3.json?.data?.body?.body === '', 'TEST C3: Request body payload cleared on 303');

    // C4: 307 Temporary Redirect preserves POST method and body
    const resC4 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'POST',
        url: `http://localhost:${mockPort1}/day8-redirect-307`,
        body: JSON.stringify({ name: 'Bob' })
      }
    });
    assert(resC4.statusCode === 200, 'TEST C4: 307 redirect completes');
    assert(resC4.json?.data?.body?.method === 'POST', 'TEST C4: Method preserved as POST per RFC 7231');
    assert(resC4.json?.data?.body?.body?.includes('Bob'), 'TEST C4: Request body preserved on 307');

    // C5: Malformed Location header produces safe 502 INVALID_REDIRECT
    const resC5 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort1}/day8-redirect-malformed`
      }
    });
    assert(resC5.statusCode === 502, 'TEST C5: Malformed redirect Location returns 502');
    assert(resC5.json?.error?.code === 'INVALID_REDIRECT', 'TEST C5: Error code is INVALID_REDIRECT');

    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    // -------------------------------------------------------------------------
    // TEST D: Response Limits, Incomplete Responses & Stream Cleanup
    // -------------------------------------------------------------------------
    console.log('\n--- TEST D: Response Limits & Stream Cleanup ---');

    // D1: Incomplete response where connection abruptly closes before declared length
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    const resD1 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort1}/day8-incomplete-response`
      }
    });

    assert(resD1.statusCode === 502, 'TEST D1: Incomplete truncated response returns 502');
    assert(resD1.json?.error?.code === 'CONNECTION_ERROR', 'TEST D1: Error code is CONNECTION_ERROR');
    assert(
      resD1.json?.error?.message?.includes('closed') ||
      resD1.json?.error?.message?.includes('Incomplete') ||
      resD1.json?.error?.message?.includes('aborted'),
      'TEST D1: Explains response was interrupted or incomplete'
    );

    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    // -------------------------------------------------------------------------
    // TEST E: Sensitive Information Protection & Error Sanitization
    // -------------------------------------------------------------------------
    console.log('\n--- TEST E: Sensitive Information Protection ---');

    // E1: sanitizeHeaders redacts extended sensitive header list
    const sensitiveDict = {
      'Authorization': 'Bearer 12345',
      'Cookie': 'sid=999',
      'X-API-Key': 'my-key',
      'x-auth-token': 'auth-tok',
      'session-token': 'sess-123',
      'secret': 'super-secret',
      'Accept': 'application/json'
    };
    const sanitized = sanitizeHeaders(sensitiveDict);
    assert(sanitized['Authorization'] === '[REDACTED]', 'TEST E1: Authorization redacted');
    assert(sanitized['Cookie'] === '[REDACTED]', 'TEST E1: Cookie redacted');
    assert(sanitized['X-API-Key'] === '[REDACTED]', 'TEST E1: X-API-Key redacted');
    assert(sanitized['x-auth-token'] === '[REDACTED]', 'TEST E1: x-auth-token redacted');
    assert(sanitized['session-token'] === '[REDACTED]', 'TEST E1: session-token redacted');
    assert(sanitized['secret'] === '[REDACTED]', 'TEST E1: secret redacted');
    assert(sanitized['Accept'] === 'application/json', 'TEST E1: Non-sensitive Accept header preserved');

    // E2: Upstream Set-Cookie and Set-Cookie2 headers redacted from returned metadata
    process.env.DEVPROBE_ALLOW_LOCAL_TARGETS = 'true';
    const resE2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/execute',
      body: {
        method: 'GET',
        url: `http://localhost:${mockPort1}/day8-set-cookie`
      }
    });
    assert(resE2.statusCode === 200, 'TEST E2: Request completes');
    const returnedHeaders = resE2.json?.data?.headers || {};
    assert(!returnedHeaders['set-cookie'], 'TEST E2: Set-Cookie is redacted from response metadata');
    assert(!returnedHeaders['set-cookie2'], 'TEST E2: Set-Cookie2 is redacted from response metadata');
    assert(returnedHeaders['x-public-header'] === 'public-value', 'TEST E2: Non-sensitive response header returned');

    delete process.env.DEVPROBE_ALLOW_LOCAL_TARGETS;

    // -------------------------------------------------------------------------
    // TEST F: Input Validation & HTTP Smuggling / CRLF Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- TEST F: Input Validation & CRLF Prevention ---');

    // F1: CRLF in header value rejected with 400
    const resF1 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'https://api.github.com/users',
        headers: {
          'X-Smuggled': 'value\r\nInjected-Header: evil'
        }
      }
    });
    assert(resF1.statusCode === 400, 'TEST F1: Header with CRLF characters returns 400');
    assert(resF1.json?.error?.code === 'INVALID_HEADER_VALUE', 'TEST F1: Code is INVALID_HEADER_VALUE');
    assert(resF1.json?.error?.message?.includes('newline or carriage return'), 'TEST F1: Rejection message explains CRLF violation');

    // F2: Duplicate case-insensitive headers in backend request body rejected
    const resF2 = await makeRequest(appServer, {
      method: 'POST',
      path: '/api/requests/validate',
      body: {
        method: 'GET',
        url: 'https://api.github.com/users',
        headers: {
          'Accept': 'application/json',
          'accept': 'text/html'
        }
      }
    });
    assert(resF2.statusCode === 400, 'TEST F2: Duplicate case-insensitive headers return 400');
    assert(resF2.json?.error?.code === 'DUPLICATE_HEADER', 'TEST F2: Code is DUPLICATE_HEADER');

    // F3: classifyErrorCode categorizes DUPLICATE_HEADER as VALIDATION
    assert(classifyErrorCode('DUPLICATE_HEADER') === 'VALIDATION', 'TEST F3: DUPLICATE_HEADER classified as VALIDATION');

    // -------------------------------------------------------------------------
    // TEST G: Express Middleware & Security Headers Review
    // -------------------------------------------------------------------------
    console.log('\n--- TEST G: Express Middleware & Security Headers ---');

    // G1: X-Powered-By is disabled
    const healthCheck = await makeRequest(appServer, { method: 'GET', path: '/api/health' });
    assert(!healthCheck.headers['x-powered-by'], 'TEST G1: X-Powered-By header is disabled on responses');

    // G2: X-Content-Type-Options: nosniff is set
    assert(healthCheck.headers['x-content-type-options'] === 'nosniff', 'TEST G2: X-Content-Type-Options: nosniff is present');

    // G3: X-Frame-Options: DENY is set
    assert(healthCheck.headers['x-frame-options'] === 'DENY', 'TEST G3: X-Frame-Options: DENY is present');

    // -------------------------------------------------------------------------
    // TEST H: Day 3-7 Regression & Contract Continuity
    // -------------------------------------------------------------------------
    console.log('\n--- TEST H: Day 3-7 Regression Contracts ---');

    // H1: escapeHtml sanitizes HTML markup
    assert(escapeHtml('<script>alert("day8")</script>') === '&lt;script&gt;alert(&quot;day8&quot;)&lt;/script&gt;', 'TEST H1: escapeHtml sanitizes markup');

    // H2: highlightJsonToHtml renders syntax tags
    const highlighted = highlightJsonToHtml('{"day": 8}');
    assert(highlighted.includes('class="json-key"'), 'TEST H2: highlightJsonToHtml formats keys');
    assert(highlighted.includes('class="json-number"'), 'TEST H2: highlightJsonToHtml formats numbers');

    // H3: validateHeaders handles case-insensitive duplicates
    const headerCheck = validateHeaders([
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'content-type', value: 'text/plain', enabled: true }
    ]);
    assert(headerCheck.isValid === false, 'TEST H3: validateHeaders rejects duplicate keys');

    // H4: validateJsonBody validates valid and malformed JSON
    assert(validateJsonBody('{"security": "verified"}', 'json').isValid === true, 'TEST H4: Valid JSON passes');
    assert(validateJsonBody('{broken json', 'json').isValid === false, 'TEST H4: Broken JSON fails gracefully');

    // H5: formatHeadersForCopy formats dictionary to text
    const copiedText = formatHeadersForCopy({ 'User-Agent': 'DevProbe/1.0', 'Accept': 'application/json' });
    assert(copiedText.includes('User-Agent: DevProbe/1.0'), 'TEST H5: formatHeadersForCopy outputs lines');

    // H6: copyTextToClipboard handles empty strings without throwing
    const copyEmptyResult = await copyTextToClipboard('');
    assert(copyEmptyResult === false, 'TEST H6: copyTextToClipboard handles empty string');

  } finally {
    await new Promise(resolve => appServer.close(resolve));
    await new Promise(resolve => mockServer1.close(resolve));
    await new Promise(resolve => mockServer2.close(resolve));
  }

  console.log('\n===========================================');
  console.log(`Test Results: ${passedTests}/${totalTests} Passed`);
  console.log('===========================================\n');

  if (passedTests !== totalTests) {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('Day 8 Test Suite Error:', err);
  process.exit(1);
});
