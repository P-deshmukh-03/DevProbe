/**
 * DevProbe Day 10 Verification Test Suite
 * Collections and Saved Requests Persistence:
 * - Collections API (Listing, Creation, Validation, Error Handling)
 * - Saved Requests API (Listing, Collection Filtering, ID Retrieval, Creation, Validation)
 * - Authentication & Secret Protection (Purging passwords, bearer tokens, session cookies, sensitive headers)
 * - Parameterized SQL Injection Resistance
 * - Database Error Sanitization & Safe Diagnostics
 * - Frontend Non-Dispatch Verification (State loading without accidental HTTP execution)
 * - Live MySQL Persistence Verification & Clean Teardown
 */

const http = require('http');
const app = require('./src/app.js');
const { executeQuery, closePool, checkDatabaseHealth } = require('./src/config/database.js');
const {
  convertSavedRequestToTemplate,
  loadRequestIntoState,
  activeRequest,
  getRequestRunning
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

    if (body !== null && typeof body === 'object') {
      payload = JSON.stringify(body);
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    } else if (typeof body === 'string') {
      payload = body;
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
            // Non-JSON response
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
  console.log('\n=== DevProbe Day 10 Verification Tests ===\n');

  // Check database readiness
  const health = await checkDatabaseHealth();
  const isLiveDb = health.isConnected;

  if (!isLiveDb) {
    console.log('  [Warning] MySQL is offline. Running tests in database-guarded mode.');
  } else {
    console.log('  [Live Environment] MySQL server is connected! Verifying live persistence against devprobe_db.');
  }

  // Start test server on random available port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  // IDs tracked for clean teardown
  const createdCollectionIds = [];
  const createdSavedRequestIds = [];

  try {
    // =========================================================================
    // TEST A: Collections API — Validation
    // =========================================================================
    console.log('--- TEST A: Collections Validation ---');

    // A1: Missing name
    const resA1 = await makeRequest(server, {
      method: 'POST',
      path: '/api/collections',
      body: {}
    });
    assert(resA1.statusCode === 400, 'TEST A1: Missing collection name returns 400');
    assert(resA1.json && resA1.json.success === false, 'TEST A1: Success is false on missing name');
    assert(resA1.json?.error?.code === 'VALIDATION_ERROR', 'TEST A1: Error code is VALIDATION_ERROR');

    // A2: Whitespace-only name
    const resA2 = await makeRequest(server, {
      method: 'POST',
      path: '/api/collections',
      body: { name: '   ' }
    });
    assert(resA2.statusCode === 400, 'TEST A2: Whitespace-only collection name returns 400');

    // A3: Exceeds maximum length (255 chars)
    const longName = 'A'.repeat(256);
    const resA3 = await makeRequest(server, {
      method: 'POST',
      path: '/api/collections',
      body: { name: longName }
    });
    assert(resA3.statusCode === 400, 'TEST A3: Collection name > 255 chars returns 400');

    // =========================================================================
    // TEST B: Collections API — Creation & Listing
    // =========================================================================
    console.log('\n--- TEST B: Collections Creation & Listing ---');

    let testCollectionId = null;
    if (isLiveDb) {
      // B1: Create valid collection
      const resB1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/collections',
        body: {
          name: 'Day 10 Test Collection',
          description: 'A test collection for Day 10 verification'
        }
      });
      assert(resB1.statusCode === 201, 'TEST B1: POST /api/collections returns 201 Created');
      assert(resB1.json && resB1.json.success === true, 'TEST B1: Response success is true');
      assert(resB1.json?.data?.id !== undefined, 'TEST B1: Returns generated collection ID');
      assert(resB1.json?.data?.name === 'Day 10 Test Collection', 'TEST B1: Preserves collection name');
      assert(resB1.json?.data?.description === 'A test collection for Day 10 verification', 'TEST B1: Preserves description');
      assert(Boolean(resB1.json?.data?.created_at), 'TEST B1: Returns created_at timestamp');

      testCollectionId = resB1.json.data.id;
      createdCollectionIds.push(testCollectionId);

      // B2: List collections
      const resB2 = await makeRequest(server, {
        method: 'GET',
        path: '/api/collections'
      });
      assert(resB2.statusCode === 200, 'TEST B2: GET /api/collections returns 200 OK');
      assert(Array.isArray(resB2.json?.data), 'TEST B2: Collections data is an Array');
      const foundCol = resB2.json.data.find((c) => c.id === testCollectionId);
      assert(Boolean(foundCol), 'TEST B2: Newly created collection appears in list');

      // B3: Retrieve specific collection by ID
      const resB3 = await makeRequest(server, {
        method: 'GET',
        path: `/api/collections/${testCollectionId}`
      });
      assert(resB3.statusCode === 200, 'TEST B3: GET /api/collections/:id returns 200');
      assert(resB3.json?.data?.id === testCollectionId, 'TEST B3: Retrieved collection matches ID');

      // B4: Retrieve nonexistent collection ID
      const resB4 = await makeRequest(server, {
        method: 'GET',
        path: '/api/collections/99999999'
      });
      assert(resB4.statusCode === 404, 'TEST B4: Nonexistent collection ID returns 404');
      assert(resB4.json?.error?.code === 'NOT_FOUND', 'TEST B4: Returns NOT_FOUND error code');
    } else {
      console.log('  [Skipped Live DB subtests for Collections: MySQL offline]');
    }

    // =========================================================================
    // TEST C: Saved Requests API — Validation
    // =========================================================================
    console.log('\n--- TEST C: Saved Requests Validation ---');

    // C1: Missing request name
    const resC1 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/saved',
      body: {
        method: 'GET',
        url: 'https://httpbin.org/get'
      }
    });
    assert(resC1.statusCode === 400, 'TEST C1: Missing request name returns 400');
    assert(resC1.json?.error?.code === 'VALIDATION_ERROR', 'TEST C1: Code is VALIDATION_ERROR');

    // C2: Empty request name
    const resC2 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/saved',
      body: {
        name: '   ',
        method: 'GET',
        url: 'https://httpbin.org/get'
      }
    });
    assert(resC2.statusCode === 400, 'TEST C2: Empty request name returns 400');

    // C3: Unsupported HTTP method
    const resC3 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/saved',
      body: {
        name: 'Invalid Method Test',
        method: 'CONNECT',
        url: 'https://httpbin.org/get'
      }
    });
    assert(resC3.statusCode === 400, 'TEST C3: Unsupported HTTP method returns 400');
    assert(resC3.json?.error?.code === 'UNSUPPORTED_METHOD', 'TEST C3: Code is UNSUPPORTED_METHOD');

    // C4: Invalid URL format
    const resC4 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/saved',
      body: {
        name: 'Invalid URL Test',
        method: 'GET',
        url: 'not-a-valid-url'
      }
    });
    assert(resC4.statusCode === 400, 'TEST C4: Malformed URL returns 400');
    assert(resC4.json?.error?.code === 'INVALID_URL', 'TEST C4: Code is INVALID_URL');

    // C5: Unsupported protocol (file://, ftp://)
    const resC5 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/saved',
      body: {
        name: 'File Protocol Test',
        method: 'GET',
        url: 'file:///etc/passwd'
      }
    });
    assert(resC5.statusCode === 400, 'TEST C5: Non-HTTP protocol (file://) returns 400');
    assert(resC5.json?.error?.code === 'INVALID_PROTOCOL', 'TEST C5: Code is INVALID_PROTOCOL');

    // C6: Embedded credentials in URL
    const resC6 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/saved',
      body: {
        name: 'Embedded Creds Test',
        method: 'GET',
        url: 'https://admin:supersecret@example.com/api'
      }
    });
    assert(resC6.statusCode === 400, 'TEST C6: URL with embedded credentials returns 400');
    assert(resC6.json?.error?.code === 'EMBEDDED_CREDENTIALS', 'TEST C6: Code is EMBEDDED_CREDENTIALS');

    // C7: Nonexistent collection ID
    if (isLiveDb) {
      const resC7 = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: {
          name: 'Orphan Request Test',
          method: 'GET',
          url: 'https://httpbin.org/get',
          collection_id: 99999999
        }
      });
      assert(resC7.statusCode === 404, 'TEST C7: Nonexistent collection ID returns 404');
      assert(resC7.json?.error?.code === 'COLLECTION_NOT_FOUND', 'TEST C7: Code is COLLECTION_NOT_FOUND');
    }

    // =========================================================================
    // TEST D: Saved Requests API — Creation & Persistence
    // =========================================================================
    console.log('\n--- TEST D: Saved Requests Creation & Persistence ---');

    let savedRequestId1 = null;
    let savedRequestId2 = null;

    if (isLiveDb) {
      // D1: Create saved request linked to collection
      const resD1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: {
          name: 'Get User Data',
          method: 'GET',
          url: 'https://jsonplaceholder.typicode.com/users/1',
          collection_id: testCollectionId,
          params: [{ key: 'active', value: 'true' }],
          headers: [{ key: 'Accept', value: 'application/json' }],
          body_type: 'none'
        }
      });
      assert(resD1.statusCode === 201, 'TEST D1: POST /api/requests/saved returns 201 Created');
      assert(resD1.json?.success === true, 'TEST D1: Response success is true');
      assert(resD1.json?.data?.id !== undefined, 'TEST D1: Generated saved request ID present');
      assert(resD1.json?.data?.collection_id === testCollectionId, 'TEST D1: Linked to correct collection');
      assert(resD1.json?.data?.name === 'Get User Data', 'TEST D1: Preserves request name');
      assert(resD1.json?.data?.method === 'GET', 'TEST D1: Preserves method');
      assert(resD1.json?.data?.url === 'https://jsonplaceholder.typicode.com/users/1', 'TEST D1: Preserves URL');

      savedRequestId1 = resD1.json.data.id;
      createdSavedRequestIds.push(savedRequestId1);

      // D2: Create saved request with body and null collection (unassigned)
      const resD2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: {
          name: 'Create Post Item',
          method: 'POST',
          url: 'https://jsonplaceholder.typicode.com/posts',
          collection_id: null,
          body: JSON.stringify({ title: 'test', body: 'content', userId: 1 }),
          body_type: 'json'
        }
      });
      assert(resD2.statusCode === 201, 'TEST D2: Saved request without collection returns 201');
      assert(resD2.json?.data?.collection_id === null, 'TEST D2: Null collection ID preserved');
      assert(resD2.json?.data?.body_type === 'json', 'TEST D2: Preserves body_type');

      savedRequestId2 = resD2.json.data.id;
      createdSavedRequestIds.push(savedRequestId2);
    } else {
      console.log('  [Skipped Live DB subtests for Saved Requests: MySQL offline]');
    }

    // =========================================================================
    // TEST E: Saved Requests API — Listing, Filtering, and Retrieval
    // =========================================================================
    console.log('\n--- TEST E: Saved Requests Listing, Filtering & Retrieval ---');

    if (isLiveDb) {
      // E1: List all saved requests
      const resE1 = await makeRequest(server, {
        method: 'GET',
        path: '/api/requests/saved'
      });
      assert(resE1.statusCode === 200, 'TEST E1: GET /api/requests/saved returns 200');
      assert(Array.isArray(resE1.json?.data), 'TEST E1: Data is an Array');
      const req1Present = resE1.json.data.some((r) => r.id === savedRequestId1);
      const req2Present = resE1.json.data.some((r) => r.id === savedRequestId2);
      assert(req1Present && req2Present, 'TEST E1: All created saved requests listed');

      // E2: Filter saved requests by collection ID
      const resE2 = await makeRequest(server, {
        method: 'GET',
        path: `/api/requests/saved?collectionId=${testCollectionId}`
      });
      assert(resE2.statusCode === 200, 'TEST E2: Filtered query returns 200');
      assert(Array.isArray(resE2.json?.data), 'TEST E2: Filtered result is Array');
      const allBelong = resE2.json.data.every((r) => r.collection_id === testCollectionId);
      assert(allBelong, 'TEST E2: All returned requests belong to queried collection');
      assert(resE2.json.data.some((r) => r.id === savedRequestId1), 'TEST E2: Collection-linked request included');
      assert(!resE2.json.data.some((r) => r.id === savedRequestId2), 'TEST E2: Unassigned request excluded');

      // E3: Filter with invalid non-numeric collection ID
      const resE3 = await makeRequest(server, {
        method: 'GET',
        path: '/api/requests/saved?collectionId=invalid_id'
      });
      assert(resE3.statusCode === 400, 'TEST E3: Non-numeric collectionId query filter returns 400');

      // E4: Retrieve specific saved request by ID
      const resE4 = await makeRequest(server, {
        method: 'GET',
        path: `/api/requests/saved/${savedRequestId1}`
      });
      assert(resE4.statusCode === 200, 'TEST E4: GET /api/requests/saved/:id returns 200');
      assert(resE4.json?.data?.id === savedRequestId1, 'TEST E4: Retrieved request matches ID');

      // E5: Retrieve nonexistent saved request ID
      const resE5 = await makeRequest(server, {
        method: 'GET',
        path: '/api/requests/saved/99999999'
      });
      assert(resE5.statusCode === 404, 'TEST E5: Missing saved request ID returns 404');
      assert(resE5.json?.error?.code === 'NOT_FOUND', 'TEST E5: Code is NOT_FOUND');

      // E6: Non-numeric ID in route parameter
      const resE6 = await makeRequest(server, {
        method: 'GET',
        path: '/api/requests/saved/abc-not-number'
      });
      assert(resE6.statusCode === 400, 'TEST E6: Non-numeric saved request ID returns 400');
    } else {
      console.log('  [Skipped Live DB subtests for Listing/Retrieval: MySQL offline]');
    }

    // =========================================================================
    // TEST F: Authentication & Secret Protection
    // =========================================================================
    console.log('\n--- TEST F: Authentication & Secret Protection ---');

    if (isLiveDb) {
      // F1: Bearer token in auth object
      const resF1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: {
          name: 'Sensitive Bearer Token Request',
          method: 'GET',
          url: 'https://httpbin.org/bearer',
          headers: [
            { key: 'Accept', value: 'application/json' },
            { key: 'Authorization', value: 'Bearer secret_token_xyz_never_save' }
          ],
          auth: {
            type: 'bearer',
            bearerToken: 'secret_token_xyz_never_save'
          }
        }
      });
      assert(resF1.statusCode === 201, 'TEST F1: Saves request with bearer auth scheme safely');
      const savedF1 = resF1.json?.data;
      createdSavedRequestIds.push(savedF1.id);

      assert(savedF1.auth_type === 'bearer', 'TEST F1: Persists safe auth_type metadata');
      assert(savedF1.bearerToken === undefined, 'TEST F1: Never returns bearerToken property');
      assert(JSON.stringify(savedF1).indexOf('secret_token_xyz_never_save') === -1, 'TEST F1: Bearer token NEVER persisted or returned');

      // Verify Authorization header was stripped from headers array
      const hasAuthHeader = (savedF1.headers || []).some((h) => h.key?.toLowerCase() === 'authorization');
      assert(!hasAuthHeader, 'TEST F1: Authorization header stripped from persisted headers');

      // F2: Basic auth credentials protection
      const resF2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: {
          name: 'Sensitive Basic Auth Request',
          method: 'GET',
          url: 'https://httpbin.org/basic-auth/user/passwd',
          headers: [
            { key: 'Cookie', value: 'session_id=super_secret_cookie_12345' },
            { key: 'X-API-Key', value: 'api_key_secret_9999' }
          ],
          auth: {
            type: 'basic',
            basicUsername: 'admin_user',
            basicPassword: 'super_secret_password_do_not_persist'
          }
        }
      });
      assert(resF2.statusCode === 201, 'TEST F2: Saves request with basic auth safely');
      const savedF2 = resF2.json?.data;
      createdSavedRequestIds.push(savedF2.id);

      assert(savedF2.auth_type === 'basic', 'TEST F2: Persists safe auth_type metadata');
      assert(savedF2.basicPassword === undefined, 'TEST F2: Never returns basicPassword');
      assert(JSON.stringify(savedF2).indexOf('super_secret_password_do_not_persist') === -1, 'TEST F2: Password NEVER persisted or returned');
      assert(JSON.stringify(savedF2).indexOf('super_secret_cookie_12345') === -1, 'TEST F2: Cookie NEVER persisted or returned');
      assert(JSON.stringify(savedF2).indexOf('api_key_secret_9999') === -1, 'TEST F2: API key NEVER persisted or returned');

      // Verify in raw MySQL database row directly
      const [rawRows] = await executeQuery('SELECT * FROM saved_requests WHERE id = ?', [savedF1.id]);
      const rawRowStr = JSON.stringify(rawRows[0]);
      assert(rawRowStr.indexOf('secret_token_xyz_never_save') === -1, 'TEST F3: Direct DB query proves bearer token NOT stored in MySQL');
    } else {
      console.log('  [Skipped Live DB subtests for Secret Protection: MySQL offline]');
    }

    // =========================================================================
    // TEST G: Parameterized SQL & Injection Resistance
    // =========================================================================
    console.log('\n--- TEST G: Parameterized SQL & Injection Resistance ---');

    if (isLiveDb) {
      // G1: SQL injection in collection name
      const sqlInjectionName = "TestCollection' OR '1'='1'; DROP TABLE collections; --";
      const resG1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/collections',
        body: { name: sqlInjectionName }
      });
      assert(resG1.statusCode === 201, 'TEST G1: SQL injection string treated as safe literal value');
      assert(resG1.json?.data?.name === sqlInjectionName, 'TEST G1: Name safely preserved as literal string');
      if (resG1.json?.data?.id) createdCollectionIds.push(resG1.json.data.id);

      // Verify tables still exist
      const [tableCheck] = await executeQuery(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        ['devprobe_db', 'collections']
      );
      assert(tableCheck.length > 0, 'TEST G1: Collections table completely intact and untampered');

      // G2: SQL injection in saved request parameters
      const resG2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: {
          name: "Req' UNION SELECT 1,2,3,4,5,6,7,8,9,10,11,12 --",
          method: 'GET',
          url: 'https://httpbin.org/get'
        }
      });
      assert(resG2.statusCode === 201, 'TEST G2: SQL injection in request name parameterized safely');
      if (resG2.json?.data?.id) createdSavedRequestIds.push(resG2.json.data.id);
    } else {
      console.log('  [Skipped Live DB subtests for SQL Injection: MySQL offline]');
    }

    // =========================================================================
    // TEST H: Safe Database Diagnostics & Non-leaking Errors
    // =========================================================================
    console.log('\n--- TEST H: Database Error Handling ---');

    // H1: Database readiness check retains healthy response
    const resH1 = await makeRequest(server, {
      method: 'GET',
      path: '/api/health/db'
    });
    assert(resH1.statusCode === 200 || resH1.statusCode === 503, 'TEST H1: /api/health/db returns 200 or 503');
    assert(resH1.json?.database?.hasPassword === undefined, 'TEST H1: Database health NEVER exposes passwords');

    // =========================================================================
    // TEST I: Frontend Integration & Non-Dispatch Verification
    // =========================================================================
    console.log('\n--- TEST I: Frontend Non-Dispatch Verification ---');

    // I1: convertSavedRequestToTemplate formats saved request safely
    const mockDbRow = {
      id: 42,
      name: 'Loaded Test Request',
      method: 'POST',
      url: 'https://jsonplaceholder.typicode.com/posts',
      headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
      params: [{ key: 'limit', value: '10', enabled: true }],
      body: '{"foo":"bar"}',
      body_type: 'json',
      auth_type: 'bearer'
    };

    const template = convertSavedRequestToTemplate(mockDbRow);
    assert(template !== null, 'TEST I1: convertSavedRequestToTemplate returns object');
    assert(template.name === 'Loaded Test Request', 'TEST I1: Template preserves name');
    assert(template.method === 'POST', 'TEST I1: Template preserves method');
    assert(template.url === 'https://jsonplaceholder.typicode.com/posts', 'TEST I1: Template preserves URL');
    assert(template.body.type === 'json', 'TEST I1: Template preserves body type');
    assert(template.body.text === '{"foo":"bar"}', 'TEST I1: Template preserves body text');
    assert(template.auth.type === 'bearer', 'TEST I1: Template preserves auth type');
    assert(template.auth.bearerToken === '', 'TEST I1: Bearer token is strictly blank');
    assert(template.auth.basicPassword === '', 'TEST I1: Password is strictly blank');

    // I2: Loading saved request into activeRequest state does NOT trigger execution
    loadRequestIntoState(template);

    assert(activeRequest.name === 'Loaded Test Request', 'TEST I2: activeRequest state name updated');
    assert(activeRequest.method === 'POST', 'TEST I2: activeRequest method updated to POST');
    assert(activeRequest.url === 'https://jsonplaceholder.typicode.com/posts', 'TEST I2: activeRequest URL updated');
    assert(activeRequest.body.type === 'json', 'TEST I2: activeRequest body type is json');
    assert(activeRequest.auth.type === 'bearer', 'TEST I2: activeRequest auth type is bearer');
    assert(getRequestRunning() === false, 'TEST I2: isRequestRunning remains false — no outbound HTTP dispatched');

  } finally {
    // =========================================================================
    // Teardown: Clean up test data from live database
    // =========================================================================
    if (isLiveDb) {
      try {
        for (const reqId of createdSavedRequestIds) {
          await executeQuery('DELETE FROM saved_requests WHERE id = ?', [reqId]);
        }
        for (const colId of createdCollectionIds) {
          await executeQuery('DELETE FROM collections WHERE id = ?', [colId]);
        }
      } catch (err) {
        console.error('  [Notice] Test cleanup error:', err.message);
      }
    }

    // Close HTTP test server
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  }

  // =========================================================================
  // Final Results
  // =========================================================================
  console.log('\n===========================================');
  console.log(`Test Results: ${passedTests}/${totalTests} Passed`);
  console.log('===========================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };

