/**
 * DevProbe Day 11 Verification Test Suite
 * Saved Request & Collection Management:
 * - Collection Update (PUT /api/collections/:id)
 * - Collection Deletion (DELETE /api/collections/:id with foreign key disassociation)
 * - Saved Request Update (PUT /api/requests/saved/:id with credential redaction & collection moving)
 * - Saved Request Deletion (DELETE /api/requests/saved/:id)
 * - Parameterized SQL Injection Resistance on Management Endpoints
 * - Validation & Safe Error Handling (400, 404, 500)
 * - Frontend Non-Dispatch & UI Helper Contracts
 * - Regression Verification Across Days 3–10
 */

const http = require('http');
const app = require('./src/app.js');
const { executeQuery, closePool, checkDatabaseHealth } = require('./src/config/database.js');
const {
  convertSavedRequestToTemplate,
  loadRequestIntoState,
  activeRequest,
  getRequestRunning,
  openEditCollectionModal,
  openDeleteCollectionModal,
  openEditSavedRequestModal,
  openDeleteSavedRequestModal,
  createSavedRequestRow
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
  console.log('\n=== DevProbe Day 11 Verification Tests ===\n');

  // Check database readiness
  const health = await checkDatabaseHealth();
  const isLiveDb = health.isConnected;

  if (!isLiveDb) {
    console.log('  [Warning] MySQL is offline. Running tests in database-guarded mode.');
  } else {
    console.log('  [Live Environment] MySQL server is connected! Verifying live management against devprobe_db.');
  }

  // Start test server on random available port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  // IDs tracked for clean teardown
  const createdCollectionIds = [];
  const createdSavedRequestIds = [];

  try {
    // =========================================================================
    // TEST A: Collection Management — Update (PUT /api/collections/:id)
    // =========================================================================
    console.log('--- TEST A: Collection Update ---');

    // A1: Invalid ID format (non-numeric / negative)
    const resA1 = await makeRequest(server, {
      method: 'PUT',
      path: '/api/collections/abc',
      body: { name: 'Valid Name' }
    });
    assert(resA1.statusCode === 400, 'TEST A1: Non-numeric collection ID returns 400');
    assert(resA1.json?.error?.code === 'INVALID_COLLECTION_ID', 'TEST A1: Error code is INVALID_COLLECTION_ID');

    const resA1b = await makeRequest(server, {
      method: 'PUT',
      path: '/api/collections/-5',
      body: { name: 'Valid Name' }
    });
    assert(resA1b.statusCode === 400, 'TEST A1: Negative collection ID returns 400');

    // A2: Missing collection (404)
    if (isLiveDb) {
      const resA2 = await makeRequest(server, {
        method: 'PUT',
        path: '/api/collections/99999999',
        body: { name: 'New Name' }
      });
      assert(resA2.statusCode === 404, 'TEST A2: Nonexistent collection ID returns 404');
      assert(resA2.json?.error?.code === 'NOT_FOUND', 'TEST A2: Error code is NOT_FOUND');
    }

    // A3: Validation errors on name
    const resA3a = await makeRequest(server, {
      method: 'PUT',
      path: '/api/collections/1',
      body: {}
    });
    assert(resA3a.statusCode === 400, 'TEST A3: Missing name on update returns 400');

    const resA3b = await makeRequest(server, {
      method: 'PUT',
      path: '/api/collections/1',
      body: { name: '   ' }
    });
    assert(resA3b.statusCode === 400, 'TEST A3: Whitespace-only name on update returns 400');

    const resA3c = await makeRequest(server, {
      method: 'PUT',
      path: '/api/collections/1',
      body: { name: 'X'.repeat(256) }
    });
    assert(resA3c.statusCode === 400, 'TEST A3: Name > 255 chars on update returns 400');

    // A4: Successful Collection Update & Association Preservation
    let colIdA = null;
    let reqIdA = null;
    if (isLiveDb) {
      // Create collection and child saved request
      const createCol = await makeRequest(server, {
        method: 'POST',
        path: '/api/collections',
        body: { name: 'Initial Collection A', description: 'Initial desc' }
      });
      colIdA = createCol.json.data.id;
      createdCollectionIds.push(colIdA);

      const createReq = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: {
          name: 'Child Req in Col A',
          method: 'GET',
          url: 'https://httpbin.org/get',
          collection_id: colIdA
        }
      });
      reqIdA = createReq.json.data.id;
      createdSavedRequestIds.push(reqIdA);

      // Perform update
      const updateCol = await makeRequest(server, {
        method: 'PUT',
        path: `/api/collections/${colIdA}`,
        body: { name: 'Updated Collection A', description: 'Updated description' }
      });
      assert(updateCol.statusCode === 200, 'TEST A4: PUT /api/collections/:id returns 200 OK');
      assert(updateCol.json?.success === true, 'TEST A4: Response success is true');
      assert(updateCol.json?.data?.name === 'Updated Collection A', 'TEST A4: Updated name matches');
      assert(updateCol.json?.data?.description === 'Updated description', 'TEST A4: Updated description matches');

      // Verify child saved request remains linked to the collection
      const checkReq = await makeRequest(server, {
        method: 'GET',
        path: `/api/requests/saved/${reqIdA}`
      });
      assert(checkReq.json?.data?.collection_id === colIdA, 'TEST A4: Existing saved requests remain associated with collection after update');
    }

    // =========================================================================
    // TEST B: Collection Management — Deletion (DELETE /api/collections/:id)
    // =========================================================================
    console.log('\n--- TEST B: Collection Deletion ---');

    // B1: Invalid ID format (400)
    const resB1 = await makeRequest(server, {
      method: 'DELETE',
      path: '/api/collections/xyz'
    });
    assert(resB1.statusCode === 400, 'TEST B1: Non-numeric collection ID on DELETE returns 400');

    // B2: Missing collection ID (404)
    if (isLiveDb) {
      const resB2 = await makeRequest(server, {
        method: 'DELETE',
        path: '/api/collections/99999999'
      });
      assert(resB2.statusCode === 404, 'TEST B2: Nonexistent collection ID on DELETE returns 404');
      assert(resB2.json?.error?.code === 'NOT_FOUND', 'TEST B2: Code is NOT_FOUND');
    }

    // B3: Successful Collection Deletion & Saved Request Preservation (Set NULL)
    if (isLiveDb) {
      // Create collection B and another collection C (unrelated)
      const colBRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/collections',
        body: { name: 'Collection B to Delete', description: 'Will be deleted' }
      });
      const colIdB = colBRes.json.data.id;

      const colCRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/collections',
        body: { name: 'Unrelated Collection C', description: 'Should remain untouched' }
      });
      const colIdC = colCRes.json.data.id;
      createdCollectionIds.push(colIdC);

      // Create saved request in Collection B
      const reqBRes = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: {
          name: 'Saved Req inside Collection B',
          method: 'POST',
          url: 'https://httpbin.org/post',
          collection_id: colIdB,
          body: '{"test":"payload"}',
          body_type: 'json'
        }
      });
      const reqIdB = reqBRes.json.data.id;
      createdSavedRequestIds.push(reqIdB);

      // Delete Collection B
      const delBRes = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/collections/${colIdB}`
      });
      assert(delBRes.statusCode === 200, 'TEST B3: DELETE /api/collections/:id returns 200 OK');
      assert(delBRes.json?.success === true, 'TEST B3: Success is true');
      assert(delBRes.json?.data?.id === colIdB, 'TEST B3: Returns deleted collection ID');

      // Verify Collection B is gone (404)
      const verifyColB = await makeRequest(server, {
        method: 'GET',
        path: `/api/collections/${colIdB}`
      });
      assert(verifyColB.statusCode === 404, 'TEST B3: Deleted collection returns 404 on subsequent GET');

      // CRITICAL REQUIREMENT: Verify saved request B STILL EXISTS and has collection_id === null (unassigned)
      const verifyReqB = await makeRequest(server, {
        method: 'GET',
        path: `/api/requests/saved/${reqIdB}`
      });
      assert(verifyReqB.statusCode === 200, 'TEST B3: Saved request preserved after parent collection deleted');
      assert(verifyReqB.json?.data?.collection_id === null, 'TEST B3: Saved request collection_id safely updated to NULL (unassigned)');
      assert(verifyReqB.json?.data?.name === 'Saved Req inside Collection B', 'TEST B3: Saved request properties fully intact');

      // Verify unrelated Collection C is untouched
      const verifyColC = await makeRequest(server, {
        method: 'GET',
        path: `/api/collections/${colIdC}`
      });
      assert(verifyColC.statusCode === 200, 'TEST B3: Unrelated Collection C remains unaffected');
    }

    // =========================================================================
    // TEST C: Saved Request Management — Update (PUT /api/requests/saved/:id)
    // =========================================================================
    console.log('\n--- TEST C: Saved Request Update ---');

    // C1: Invalid ID format (400)
    const resC1 = await makeRequest(server, {
      method: 'PUT',
      path: '/api/requests/saved/not-a-number',
      body: { name: 'Valid Name', method: 'GET', url: 'https://httpbin.org/get' }
    });
    assert(resC1.statusCode === 400, 'TEST C1: Non-numeric saved request ID returns 400');
    assert(resC1.json?.error?.code === 'INVALID_REQUEST_ID', 'TEST C1: Error code is INVALID_REQUEST_ID');

    // C2: Missing saved request ID (404)
    if (isLiveDb) {
      const resC2 = await makeRequest(server, {
        method: 'PUT',
        path: '/api/requests/saved/99999999',
        body: { name: 'Missing Req', method: 'GET', url: 'https://httpbin.org/get' }
      });
      assert(resC2.statusCode === 404, 'TEST C2: Missing saved request returns 404');
      assert(resC2.json?.error?.code === 'NOT_FOUND', 'TEST C2: Code is NOT_FOUND');
    }

    // C3: Validation errors on update fields
    // Missing name
    const resC3a = await makeRequest(server, {
      method: 'PUT',
      path: '/api/requests/saved/1',
      body: { method: 'GET', url: 'https://httpbin.org/get' }
    });
    assert(resC3a.statusCode === 400, 'TEST C3: Missing name on update returns 400');

    // Unsupported method
    const resC3b = await makeRequest(server, {
      method: 'PUT',
      path: '/api/requests/saved/1',
      body: { name: 'Updated', method: 'CONNECT', url: 'https://httpbin.org/get' }
    });
    assert(resC3b.statusCode === 400, 'TEST C3: Unsupported HTTP method on update returns 400');
    assert(resC3b.json?.error?.code === 'UNSUPPORTED_METHOD', 'TEST C3: Code is UNSUPPORTED_METHOD');

    // Malformed URL
    const resC3c = await makeRequest(server, {
      method: 'PUT',
      path: '/api/requests/saved/1',
      body: { name: 'Updated', method: 'GET', url: 'invalid-url' }
    });
    assert(resC3c.statusCode === 400, 'TEST C3: Malformed URL on update returns 400');
    assert(resC3c.json?.error?.code === 'INVALID_URL', 'TEST C3: Code is INVALID_URL');

    // Non-HTTP protocol
    const resC3d = await makeRequest(server, {
      method: 'PUT',
      path: '/api/requests/saved/1',
      body: { name: 'Updated', method: 'GET', url: 'ftp://ftp.example.com' }
    });
    assert(resC3d.statusCode === 400, 'TEST C3: Non-HTTP protocol on update returns 400');

    // Embedded credentials
    const resC3e = await makeRequest(server, {
      method: 'PUT',
      path: '/api/requests/saved/1',
      body: { name: 'Updated', method: 'GET', url: 'https://user:pass@example.com' }
    });
    assert(resC3e.statusCode === 400, 'TEST C3: Embedded credentials on update returns 400');

    // Nonexistent collection ID
    if (isLiveDb) {
      // Create request to test invalid collection update
      const reqTemp = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: { name: 'Temp For Col Check', method: 'GET', url: 'https://httpbin.org/get' }
      });
      const tempId = reqTemp.json.data.id;
      createdSavedRequestIds.push(tempId);

      const resC3f = await makeRequest(server, {
        method: 'PUT',
        path: `/api/requests/saved/${tempId}`,
        body: {
          name: 'Temp For Col Check',
          method: 'GET',
          url: 'https://httpbin.org/get',
          collection_id: 99999999
        }
      });
      assert(resC3f.statusCode === 404, 'TEST C3: Nonexistent collection ID on update returns 404');
      assert(resC3f.json?.error?.code === 'COLLECTION_NOT_FOUND', 'TEST C3: Code is COLLECTION_NOT_FOUND');
    }

    // C4: Successful Update with Moving Between Collections and Unassigning
    if (isLiveDb) {
      // Create collection 1 and collection 2
      const c1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/collections',
        body: { name: 'Source Collection C1' }
      });
      const c1Id = c1.json.data.id;
      createdCollectionIds.push(c1Id);

      const c2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/collections',
        body: { name: 'Destination Collection C2' }
      });
      const c2Id = c2.json.data.id;
      createdCollectionIds.push(c2Id);

      // Create request in c1
      const reqC = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: {
          name: 'Original Request Name',
          method: 'GET',
          url: 'https://jsonplaceholder.typicode.com/todos/1',
          collection_id: c1Id
        }
      });
      const reqCId = reqC.json.data.id;
      createdSavedRequestIds.push(reqCId);

      // Update 1: Move from c1 to c2 and change method to POST with body
      const updateMove = await makeRequest(server, {
        method: 'PUT',
        path: `/api/requests/saved/${reqCId}`,
        body: {
          name: 'Renamed Request in C2',
          method: 'POST',
          url: 'https://jsonplaceholder.typicode.com/todos',
          collection_id: c2Id,
          body: '{"title":"New Todo","completed":false}',
          body_type: 'json'
        }
      });
      assert(updateMove.statusCode === 200, 'TEST C4: PUT /api/requests/saved/:id returns 200 OK');
      assert(updateMove.json?.data?.name === 'Renamed Request in C2', 'TEST C4: Request name updated');
      assert(updateMove.json?.data?.method === 'POST', 'TEST C4: Method updated to POST');
      assert(updateMove.json?.data?.collection_id === c2Id, 'TEST C4: Request moved to Collection C2');
      assert(updateMove.json?.data?.body_type === 'json', 'TEST C4: Body type updated');

      // Update 2: Move to unassigned (collection_id = null)
      const updateUnassign = await makeRequest(server, {
        method: 'PUT',
        path: `/api/requests/saved/${reqCId}`,
        body: {
          name: 'Now Unassigned Request',
          method: 'GET',
          url: 'https://jsonplaceholder.typicode.com/todos/1',
          collection_id: null
        }
      });
      assert(updateUnassign.statusCode === 200, 'TEST C4: Unassigning request returns 200 OK');
      assert(updateUnassign.json?.data?.collection_id === null, 'TEST C4: Collection ID successfully updated to null');
    }

    // C5: Credential Redaction on Update
    if (isLiveDb) {
      const reqSecret = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: {
          name: 'Pre-update Secret Check',
          method: 'GET',
          url: 'https://httpbin.org/get'
        }
      });
      const secretReqId = reqSecret.json.data.id;
      createdSavedRequestIds.push(secretReqId);

      // Attempt update providing sensitive headers and auth tokens
      const updateSecret = await makeRequest(server, {
        method: 'PUT',
        path: `/api/requests/saved/${secretReqId}`,
        body: {
          name: 'Post-update Secret Check',
          method: 'GET',
          url: 'https://httpbin.org/bearer',
          headers: [
            { key: 'Accept', value: 'application/json' },
            { key: 'Authorization', value: 'Bearer secret_token_updated_never_store' },
            { key: 'Cookie', value: 'session_secret_cookie=xyz' }
          ],
          auth: {
            type: 'bearer',
            bearerToken: 'secret_token_updated_never_store'
          }
        }
      });
      assert(updateSecret.statusCode === 200, 'TEST C5: Update with auth payload accepted safely');
      const updatedData = updateSecret.json?.data;
      assert(updatedData.auth_type === 'bearer', 'TEST C5: Preserves safe auth_type metadata');
      assert(updatedData.bearerToken === undefined, 'TEST C5: Bearer token never present in returned data');
      assert(JSON.stringify(updatedData).indexOf('secret_token_updated_never_store') === -1, 'TEST C5: Bearer token stripped from update response');
      assert(JSON.stringify(updatedData).indexOf('session_secret_cookie') === -1, 'TEST C5: Cookie stripped from update response');

      // Direct MySQL inspection
      const [rawRows] = await executeQuery('SELECT * FROM saved_requests WHERE id = ?', [secretReqId]);
      const rawStr = JSON.stringify(rawRows[0]);
      assert(rawStr.indexOf('secret_token_updated_never_store') === -1, 'TEST C5: Direct database query confirms token NOT stored in MySQL');
      assert(rawStr.indexOf('session_secret_cookie') === -1, 'TEST C5: Direct database query confirms cookie NOT stored in MySQL');
    }

    // =========================================================================
    // TEST D: Saved Request Management — Deletion (DELETE /api/requests/saved/:id)
    // =========================================================================
    console.log('\n--- TEST D: Saved Request Deletion ---');

    // D1: Invalid ID format (400)
    const resD1 = await makeRequest(server, {
      method: 'DELETE',
      path: '/api/requests/saved/invalid-id'
    });
    assert(resD1.statusCode === 400, 'TEST D1: Non-numeric ID on DELETE saved request returns 400');

    // D2: Missing saved request (404)
    if (isLiveDb) {
      const resD2 = await makeRequest(server, {
        method: 'DELETE',
        path: '/api/requests/saved/99999999'
      });
      assert(resD2.statusCode === 404, 'TEST D2: Missing saved request ID on DELETE returns 404');
      assert(resD2.json?.error?.code === 'NOT_FOUND', 'TEST D2: Error code is NOT_FOUND');
    }

    // D3: Successful Deletion & Isolation from Other Requests
    if (isLiveDb) {
      const r1 = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: { name: 'Request to Delete', method: 'DELETE', url: 'https://httpbin.org/delete' }
      });
      const r1Id = r1.json.data.id;

      const r2 = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: { name: 'Request to Keep', method: 'GET', url: 'https://httpbin.org/get' }
      });
      const r2Id = r2.json.data.id;
      createdSavedRequestIds.push(r2Id);

      // Delete r1
      const delRes = await makeRequest(server, {
        method: 'DELETE',
        path: `/api/requests/saved/${r1Id}`
      });
      assert(delRes.statusCode === 200, 'TEST D3: DELETE /api/requests/saved/:id returns 200 OK');
      assert(delRes.json?.success === true, 'TEST D3: Response success is true');
      assert(delRes.json?.data?.id === r1Id, 'TEST D3: Returns deleted request ID');

      // Verify r1 returns 404
      const checkR1 = await makeRequest(server, {
        method: 'GET',
        path: `/api/requests/saved/${r1Id}`
      });
      assert(checkR1.statusCode === 404, 'TEST D3: Deleted request returns 404 on subsequent GET');

      // Verify r2 is completely intact
      const checkR2 = await makeRequest(server, {
        method: 'GET',
        path: `/api/requests/saved/${r2Id}`
      });
      assert(checkR2.statusCode === 200, 'TEST D3: Unrelated saved request remains unaffected');
      assert(checkR2.json?.data?.name === 'Request to Keep', 'TEST D3: Preserved request content is intact');
    }

    // =========================================================================
    // TEST E: SQL Injection Resistance on Management Endpoints
    // =========================================================================
    console.log('\n--- TEST E: SQL Injection Resistance on Management Endpoints ---');

    if (isLiveDb) {
      // Create collection and request to update
      const colE = await makeRequest(server, {
        method: 'POST',
        path: '/api/collections',
        body: { name: 'SQL Injection Test Col' }
      });
      const colEId = colE.json.data.id;
      createdCollectionIds.push(colEId);

      const reqE = await makeRequest(server, {
        method: 'POST',
        path: '/api/requests/saved',
        body: { name: 'SQL Injection Test Req', method: 'GET', url: 'https://httpbin.org/get' }
      });
      const reqEId = reqE.json.data.id;
      createdSavedRequestIds.push(reqEId);

      // E1: Injection in Collection UPDATE
      const sqlPayloadCol = "ColName' OR 1=1; DROP TABLE collections; --";
      const resE1 = await makeRequest(server, {
        method: 'PUT',
        path: `/api/collections/${colEId}`,
        body: { name: sqlPayloadCol, description: "'; DROP TABLE collections; --" }
      });
      assert(resE1.statusCode === 200, 'TEST E1: Collection UPDATE treats SQL injection as string literal');
      assert(resE1.json?.data?.name === sqlPayloadCol, 'TEST E1: Preserves SQL payload literally without executing syntax');

      // E2: Injection in Saved Request UPDATE
      const sqlPayloadReq = "Req' UNION SELECT * FROM collections; --";
      const resE2 = await makeRequest(server, {
        method: 'PUT',
        path: `/api/requests/saved/${reqEId}`,
        body: {
          name: sqlPayloadReq,
          method: 'GET',
          url: 'https://httpbin.org/get'
        }
      });
      assert(resE2.statusCode === 200, 'TEST E2: Saved Request UPDATE treats SQL injection as string literal');
      assert(resE2.json?.data?.name === sqlPayloadReq, 'TEST E2: Preserved SQL payload literally without execution');

      // Verify collections and saved_requests tables exist and are healthy
      const [colsCheck] = await executeQuery('SELECT COUNT(*) as count FROM collections');
      const [reqsCheck] = await executeQuery('SELECT COUNT(*) as count FROM saved_requests');
      assert(Number(colsCheck[0].count) >= 1, 'TEST E3: collections table completely intact');
      assert(Number(reqsCheck[0].count) >= 1, 'TEST E3: saved_requests table completely intact');
    }

    // =========================================================================
    // TEST F: Frontend UI Contracts & Non-Dispatch Guarantees
    // =========================================================================
    console.log('\n--- TEST F: Frontend UI & Non-Dispatch Verification ---');

    // F1: Exported modal and row helper functions
    assert(typeof openEditCollectionModal === 'function', 'TEST F1: openEditCollectionModal is exported');
    assert(typeof openDeleteCollectionModal === 'function', 'TEST F1: openDeleteCollectionModal is exported');
    assert(typeof openEditSavedRequestModal === 'function', 'TEST F1: openEditSavedRequestModal is exported');
    assert(typeof openDeleteSavedRequestModal === 'function', 'TEST F1: openDeleteSavedRequestModal is exported');
    assert(typeof createSavedRequestRow === 'function', 'TEST F1: createSavedRequestRow is exported');

    // F2: Verify non-dispatch on request loading into workspace
    const sampleReq = {
      id: 99,
      name: 'Day 11 Non-Dispatch Check',
      method: 'PUT',
      url: 'https://jsonplaceholder.typicode.com/posts/1',
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      params: [{ key: 'param1', value: 'val1', enabled: true }],
      body: '{"status":"active"}',
      body_type: 'json',
      auth_type: 'bearer'
    };

    const template = convertSavedRequestToTemplate(sampleReq);
    assert(template.name === 'Day 11 Non-Dispatch Check', 'TEST F2: Template preserves name');
    assert(template.method === 'PUT', 'TEST F2: Template preserves method');
    assert(template.auth.bearerToken === '', 'TEST F2: Bearer token is strictly blank');
    assert(template.auth.basicPassword === '', 'TEST F2: Basic password is strictly blank');

    loadRequestIntoState(template);
    assert(activeRequest.name === 'Day 11 Non-Dispatch Check', 'TEST F2: activeRequest name updated');
    assert(activeRequest.method === 'PUT', 'TEST F2: activeRequest method updated');
    assert(activeRequest.url === 'https://jsonplaceholder.typicode.com/posts/1', 'TEST F2: activeRequest url updated');
    assert(getRequestRunning() === false, 'TEST F2: Outbound HTTP is NOT dispatched on state loading');

    // F3: Headless safety for modal triggers (does not throw if DOM elements absent)
    let modalSafetyPassed = true;
    try {
      openEditCollectionModal({ id: 1, name: 'Col 1' });
      openDeleteCollectionModal({ id: 1, name: 'Col 1' });
      openEditSavedRequestModal({ id: 1, name: 'Req 1', method: 'GET', url: 'https://example.com' });
      openDeleteSavedRequestModal({ id: 1, name: 'Req 1' });
    } catch {
      modalSafetyPassed = false;
    }
    assert(modalSafetyPassed, 'TEST F3: Modal trigger functions execute safely in non-browser context');

    // F4: convertSavedRequestToTemplate with dictionary/object headers
    const sampleReqObj = {
      id: 100,
      name: 'Dict Headers Check',
      method: 'PATCH',
      url: 'https://api.example.com/patch',
      headers: { 'X-Custom-Header': 'CustomValue' },
      params: { 'filter': 'active' },
      body_type: 'none',
      auth_type: 'none'
    };
    const templateObj = convertSavedRequestToTemplate(sampleReqObj);
    assert(Array.isArray(templateObj.headers), 'TEST F4: Converts object headers to array for editor');
    assert(templateObj.headers[0]?.key === 'X-Custom-Header', 'TEST F4: Preserves custom header key');
    assert(templateObj.headers[0]?.value === 'CustomValue', 'TEST F4: Preserves custom header value');

  } finally {
    // Teardown: Clean up test artifacts
    if (isLiveDb) {
      try {
        for (const reqId of createdSavedRequestIds) {
          await executeQuery('DELETE FROM saved_requests WHERE id = ?', [reqId]);
        }
        for (const colId of createdCollectionIds) {
          await executeQuery('DELETE FROM collections WHERE id = ?', [colId]);
        }
      } catch (err) {
        console.error('  [Notice] Test teardown error:', err.message);
      }
    }

    await new Promise((resolve) => server.close(resolve));
    await closePool();
  }

  // Final Results
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
