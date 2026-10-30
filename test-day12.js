/**
 * DevProbe Day 12 Verification Test Suite
 * Environment Management:
 * - Environment CRUD (Create, List, Read, Update, Delete)
 * - Variable CRUD & Cascade Deletion (ON DELETE CASCADE)
 * - Atomic Environment Activation & Deactivation
 * - Secret Security: AES-256-GCM Encryption at Rest, Safe Masking & Secret Preservation
 * - Dynamic Variable Resolution across URL, Params, Headers, Body, and Auth
 * - Missing & Disabled Variable Interception
 * - SSRF Protection via Resolved Environment Variables
 * - SQL Injection Resistance on Environment Endpoints
 * - Non-Destructive State & Backward Compatibility
 * - Live MySQL Persistence & Clean Teardown
 */

const http = require('http');
const app = require('./src/app.js');
const { executeQuery, closePool, checkDatabaseHealth, getPool } = require('./src/config/database.js');
const {
  encryptSecret,
  decryptSecret,
  isMaskedValue,
  maskSecretValue,
  getEncryptionKey
} = require('./src/services/environmentService.js');
const {
  ENVIRONMENTS,
  getEnvironmentVariable,
  resolveVariables,
  prepareRequestUrl,
  resolveEntireRequest,
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
 * Helper to dispatch HTTP requests to the DevProbe test server
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
  console.log('\n=== DevProbe Day 12 Verification Tests ===\n');

  // Verify database connectivity
  const dbHealth = await checkDatabaseHealth();
  const isLiveDb = dbHealth.isConnected;
  if (isLiveDb) {
    console.log('  [Live Environment] MySQL server is connected! Verifying live persistence against devprobe_db.');
  } else {
    console.warn('  [Warning] MySQL is offline. Some live database tests may be skipped.');
  }

  // Start HTTP test server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const createdEnvironmentIds = [];

  try {
    // =========================================================================
    // TEST A: Environment Validation
    // =========================================================================
    console.log('--- TEST A: Environment Validation ---');

    // A1: Missing name
    const resA1 = await makeRequest(server, {
      method: 'POST',
      path: '/api/environments',
      body: { description: 'Missing name' }
    });
    assert(resA1.statusCode === 400, 'TEST A1: Missing environment name returns 400');
    assert(resA1.json && resA1.json.success === false, 'TEST A1: Success is false on missing name');

    // A2: Whitespace-only name
    const resA2 = await makeRequest(server, {
      method: 'POST',
      path: '/api/environments',
      body: { name: '   ', description: 'Whitespace name' }
    });
    assert(resA2.statusCode === 400, 'TEST A2: Whitespace-only environment name returns 400');

    // A3: Name > 255 chars
    const resA3 = await makeRequest(server, {
      method: 'POST',
      path: '/api/environments',
      body: { name: 'E'.repeat(256) }
    });
    assert(resA3.statusCode === 400, 'TEST A3: Environment name > 255 chars returns 400');

    // A4: Invalid environment ID
    const resA4 = await makeRequest(server, {
      method: 'GET',
      path: '/api/environments/not-a-number'
    });
    assert(resA4.statusCode === 400, 'TEST A4: Non-numeric environment ID returns 400');

    // A5: Missing environment ID returns 404
    const resA5 = await makeRequest(server, {
      method: 'GET',
      path: '/api/environments/99999999'
    });
    assert(resA5.statusCode === 404, 'TEST A5: Nonexistent environment ID returns 404');
    assert(resA5.json && resA5.json.error && resA5.json.error.code === 'NOT_FOUND', 'TEST A5: Error code is NOT_FOUND');

    // =========================================================================
    // TEST B: Environment CRUD Operations
    // =========================================================================
    console.log('\n--- TEST B: Environment CRUD Operations ---');

    // B1: Create Environment
    const resB1 = await makeRequest(server, {
      method: 'POST',
      path: '/api/environments',
      body: {
        name: 'Day 12 Staging Environment',
        description: 'Staging environment for API tests',
        variables: [
          { key: 'base_url', value: 'https://staging.api.example.com', is_secret: false },
          { key: 'api_version', value: 'v2', is_secret: false }
        ]
      }
    });
    assert(resB1.statusCode === 201, 'TEST B1: POST /api/environments returns 201 Created');
    assert(resB1.json && resB1.json.success === true, 'TEST B1: Success is true on creation');
    const stagingEnvId = resB1.json.data.id;
    createdEnvironmentIds.push(stagingEnvId);
    assert(resB1.json.data.name === 'Day 12 Staging Environment', 'TEST B1: Preserves environment name');
    assert(resB1.json.data.variables && resB1.json.data.variables.length === 2, 'TEST B1: Stores initial variables');

    // B2: List Environments
    const resB2 = await makeRequest(server, {
      method: 'GET',
      path: '/api/environments'
    });
    assert(resB2.statusCode === 200, 'TEST B2: GET /api/environments returns 200 OK');
    assert(Array.isArray(resB2.json.data), 'TEST B2: Response data is an array');
    const foundCreated = resB2.json.data.find((e) => e.id === stagingEnvId);
    assert(Boolean(foundCreated), 'TEST B2: Created environment appears in listing');
    assert(foundCreated.variable_count === 2, 'TEST B2: Reports correct variable_count');

    // B3: Retrieve by ID
    const resB3 = await makeRequest(server, {
      method: 'GET',
      path: `/api/environments/${stagingEnvId}`
    });
    assert(resB3.statusCode === 200, 'TEST B3: GET /api/environments/:id returns 200 OK');
    assert(resB3.json.data.id === stagingEnvId, 'TEST B3: Retrieved ID matches requested ID');
    assert(resB3.json.data.description === 'Staging environment for API tests', 'TEST B3: Preserves description');

    // B4: Update Environment
    const resB4 = await makeRequest(server, {
      method: 'PUT',
      path: `/api/environments/${stagingEnvId}`,
      body: {
        name: 'Day 12 Updated Staging',
        description: 'Updated staging description'
      }
    });
    assert(resB4.statusCode === 200, 'TEST B4: PUT /api/environments/:id returns 200 OK');
    assert(resB4.json.data.name === 'Day 12 Updated Staging', 'TEST B4: Environment name successfully updated');
    assert(resB4.json.data.description === 'Updated staging description', 'TEST B4: Description successfully updated');

    // B5: Delete Environment
    const resB5Create = await makeRequest(server, {
      method: 'POST',
      path: '/api/environments',
      body: { name: 'To Be Deleted' }
    });
    const toDeleteId = resB5Create.json.data.id;

    const resB5 = await makeRequest(server, {
      method: 'DELETE',
      path: `/api/environments/${toDeleteId}`
    });
    assert(resB5.statusCode === 200, 'TEST B5: DELETE /api/environments/:id returns 200 OK');
    assert(resB5.json.success === true, 'TEST B5: Delete success is true');

    const resB5Check = await makeRequest(server, {
      method: 'GET',
      path: `/api/environments/${toDeleteId}`
    });
    assert(resB5Check.statusCode === 404, 'TEST B5: Deleted environment returns 404');

    // =========================================================================
    // TEST C: Variables Operations, Duplicate Key Rejection & Cascade Deletion
    // =========================================================================
    console.log('\n--- TEST C: Variables Operations & Cascade Deletion ---');

    // C1: Add Variable
    const resC1 = await makeRequest(server, {
      method: 'POST',
      path: `/api/environments/${stagingEnvId}/variables`,
      body: {
        key: 'port',
        value: '8080',
        is_secret: false,
        is_enabled: true
      }
    });
    assert(resC1.statusCode === 201, 'TEST C1: POST /api/environments/:id/variables returns 201');
    assert(resC1.json.data.key === 'port', 'TEST C1: Variable key preserved');
    assert(resC1.json.data.value === '8080', 'TEST C1: Variable value preserved');
    const portVarId = resC1.json.data.id;

    // C2: Duplicate Variable Key Rejected
    const resC2 = await makeRequest(server, {
      method: 'POST',
      path: `/api/environments/${stagingEnvId}/variables`,
      body: {
        key: 'port',
        value: '9000'
      }
    });
    assert(resC2.statusCode === 400, 'TEST C2: Duplicate variable key returns 400');
    assert(resC2.json.error && resC2.json.error.code === 'DUPLICATE_VARIABLE_KEY', 'TEST C2: Code is DUPLICATE_VARIABLE_KEY');

    // C3: Update Variable
    const resC3 = await makeRequest(server, {
      method: 'PUT',
      path: `/api/environments/${stagingEnvId}/variables/${portVarId}`,
      body: {
        value: '8443',
        is_enabled: false
      }
    });
    assert(resC3.statusCode === 200, 'TEST C3: PUT /api/environments/:id/variables/:varId returns 200');
    assert(resC3.json.data.value === '8443', 'TEST C3: Variable value updated');
    assert(resC3.json.data.is_enabled === false, 'TEST C3: is_enabled updated to false');

    // C4: Delete Variable
    const resC4 = await makeRequest(server, {
      method: 'DELETE',
      path: `/api/environments/${stagingEnvId}/variables/${portVarId}`
    });
    assert(resC4.statusCode === 200, 'TEST C4: DELETE variable returns 200 OK');
    assert(resC4.json.data.deleted === true, 'TEST C4: Variable deleted flag is true');

    // C5: Cascade Deletion Verification
    const resC5Env = await makeRequest(server, {
      method: 'POST',
      path: '/api/environments',
      body: {
        name: 'Cascade Test Env',
        variables: [
          { key: 'cascade_var_1', value: 'val1' },
          { key: 'cascade_var_2', value: 'val2' }
        ]
      }
    });
    const cascadeEnvId = resC5Env.json.data.id;

    if (isLiveDb) {
      const [[cntBefore]] = await executeQuery(
        'SELECT COUNT(*) as count FROM environment_variables WHERE environment_id = ?',
        [cascadeEnvId]
      );
      assert(cntBefore.count === 2, 'TEST C5: 2 child variables present in database before deletion');

      // Delete parent environment
      await makeRequest(server, {
        method: 'DELETE',
        path: `/api/environments/${cascadeEnvId}`
      });

      // Verify cascade in MySQL
      const [[cntAfter]] = await executeQuery(
        'SELECT COUNT(*) as count FROM environment_variables WHERE environment_id = ?',
        [cascadeEnvId]
      );
      assert(cntAfter.count === 0, 'TEST C5: Child variables automatically pruned via ON DELETE CASCADE');
    }

    // =========================================================================
    // TEST D: Environment Activation & Deactivation
    // =========================================================================
    console.log('\n--- TEST D: Environment Activation & Deactivation ---');

    // D1: Create two environments
    const resD1A = await makeRequest(server, {
      method: 'POST',
      path: '/api/environments',
      body: { name: 'Env Alpha' }
    });
    const envAlphaId = resD1A.json.data.id;
    createdEnvironmentIds.push(envAlphaId);

    const resD1B = await makeRequest(server, {
      method: 'POST',
      path: '/api/environments',
      body: { name: 'Env Beta' }
    });
    const envBetaId = resD1B.json.data.id;
    createdEnvironmentIds.push(envBetaId);

    // D2: Activate Env Alpha
    const resD2 = await makeRequest(server, {
      method: 'POST',
      path: `/api/environments/${envAlphaId}/activate`
    });
    assert(resD2.statusCode === 200, 'TEST D2: POST /api/environments/:id/activate returns 200');
    assert(resD2.json.data.is_active === true, 'TEST D2: Env Alpha is active');

    // Verify Env Beta is not active
    const resD2Check = await makeRequest(server, { method: 'GET', path: `/api/environments/${envBetaId}` });
    assert(resD2Check.json.data.is_active === false, 'TEST D2: Env Beta is inactive');

    // D3: Activate Env Beta (atomic switch)
    const resD3 = await makeRequest(server, {
      method: 'POST',
      path: `/api/environments/${envBetaId}/activate`
    });
    assert(resD3.statusCode === 200, 'TEST D3: Activating Env Beta returns 200');
    assert(resD3.json.data.is_active === true, 'TEST D3: Env Beta is now active');

    const resD3CheckA = await makeRequest(server, { method: 'GET', path: `/api/environments/${envAlphaId}` });
    assert(resD3CheckA.json.data.is_active === false, 'TEST D3: Env Alpha was automatically deactivated');

    // D4: Deactivate all environments
    const resD4 = await makeRequest(server, {
      method: 'POST',
      path: '/api/environments/deactivate'
    });
    assert(resD4.statusCode === 200, 'TEST D4: POST /api/environments/deactivate returns 200');

    const resD4CheckB = await makeRequest(server, { method: 'GET', path: `/api/environments/${envBetaId}` });
    assert(resD4CheckB.json.data.is_active === false, 'TEST D4: Env Beta is now deactivated');

    // =========================================================================
    // TEST E: Secret Encryption & Masking Security
    // =========================================================================
    console.log('\n--- TEST E: Secret Encryption & Masking Security ---');

    // E1: Service encryption and decryption unit contract
    const rawSecret = 'sk_live_supersecrettoken12345';
    const encryptedSecret = encryptSecret(rawSecret);
    assert(encryptedSecret.startsWith('enc:v1:'), 'TEST E1: Ciphertext uses versioned enc:v1: prefix');
    assert(!encryptedSecret.includes(rawSecret), 'TEST E1: Plaintext secret is never visible in ciphertext');

    const decryptedSecret = decryptSecret(encryptedSecret);
    assert(decryptedSecret === rawSecret, 'TEST E1: Decryption successfully recovers original secret');

    // E2: Masking representation
    const masked = maskSecretValue(rawSecret);
    assert(masked === '••••••••', 'TEST E2: Secret is masked with bullet placeholder');
    assert(isMaskedValue('••••••••') === true, 'TEST E2: isMaskedValue identifies bullet placeholder');

    // E3: Create environment with secret variable
    const resE3 = await makeRequest(server, {
      method: 'POST',
      path: '/api/environments',
      body: {
        name: 'Secret Vault Environment',
        variables: [
          { key: 'api_token', value: 'secret_jwt_xyz789', is_secret: true },
          { key: 'public_config', value: 'visible_value', is_secret: false }
        ]
      }
    });
    const secretEnvId = resE3.json.data.id;
    createdEnvironmentIds.push(secretEnvId);

    // Verify secret is masked in API response
    const secretVar = resE3.json.data.variables.find((v) => v.key === 'api_token');
    assert(secretVar.is_secret === true, 'TEST E3: Variable marked as is_secret = true');
    assert(secretVar.value === '••••••••', 'TEST E3: API response returns masked value');
    assert(secretVar.has_value === true, 'TEST E3: API response indicates has_value = true');

    // E4: Direct database query confirms ZERO plaintext at rest
    if (isLiveDb) {
      const [dbRows] = await executeQuery(
        'SELECT var_key, var_value, is_secret FROM environment_variables WHERE environment_id = ? AND var_key = ?',
        [secretEnvId, 'api_token']
      );
      assert(dbRows.length === 1, 'TEST E4: Record found in MySQL table');
      assert(dbRows[0].var_value.startsWith('enc:v1:'), 'TEST E4: Stored value in database is AES-256-GCM encrypted');
      assert(!dbRows[0].var_value.includes('secret_jwt_xyz789'), 'TEST E4: Plaintext token NOT stored anywhere in database');
    }

    // E5: Secret preservation during update (submitting unchanged mask placeholder)
    const resE5 = await makeRequest(server, {
      method: 'PUT',
      path: `/api/environments/${secretEnvId}`,
      body: {
        name: 'Secret Vault Environment',
        variables: [
          // Submitting masked placeholder back (as frontend does when untouched)
          { key: 'api_token', value: '••••••••', is_secret: true, is_enabled: true },
          { key: 'public_config', value: 'updated_public_value', is_secret: false, is_enabled: true }
        ]
      }
    });
    assert(resE5.statusCode === 200, 'TEST E5: Updating with masked secret returns 200');

    if (isLiveDb) {
      const [dbRowsUpdated] = await executeQuery(
        'SELECT var_value FROM environment_variables WHERE environment_id = ? AND var_key = ?',
        [secretEnvId, 'api_token']
      );
      assert(dbRowsUpdated[0].var_value.startsWith('enc:v1:'), 'TEST E5: Existing ciphertext preserved in database');
      const recovered = decryptSecret(dbRowsUpdated[0].var_value);
      assert(recovered === 'secret_jwt_xyz789', 'TEST E5: Decrypted value confirms secret was NOT overwritten with bullet dots');
    }

    // E6: Key configuration errors fail safely without leaks
    const originalKey = process.env.DEVPROBE_ENCRYPTION_KEY;
    try {
      delete process.env.DEVPROBE_ENCRYPTION_KEY;
      let errCaught = false;
      try {
        encryptSecret('test-secret');
      } catch (err) {
        errCaught = true;
        assert(err.code === 'ENCRYPTION_CONFIG_ERROR', 'TEST E6: Missing key throws ENCRYPTION_CONFIG_ERROR');
      }
      assert(errCaught, 'TEST E6: Error caught when DEVPROBE_ENCRYPTION_KEY missing');
    } finally {
      process.env.DEVPROBE_ENCRYPTION_KEY = originalKey;
    }

    // =========================================================================
    // TEST F: Dynamic Variable Resolution Across All Request Fields
    // =========================================================================
    console.log('\n--- TEST F: Dynamic Variable Resolution Engine ---');

    // Register a mock environment in ENVIRONMENTS for resolution testing
    ENVIRONMENTS['test-env'] = {
      name: 'Resolution Test Environment',
      variables: [
        { key: 'base_url', value: 'https://httpbin.org', is_enabled: true },
        { key: 'endpoint', value: 'post', is_enabled: true },
        { key: 'api_key', value: 'xyz-secret-key-99', is_enabled: true, is_secret: true },
        { key: 'user_name', value: 'antigravity_dev', is_enabled: true },
        { key: 'bearer_token', value: 'bearer-token-abc-123', is_enabled: true },
        { key: 'basic_user', value: 'admin_user', is_enabled: true },
        { key: 'basic_pass', value: 'admin_pass_789', is_enabled: true },
        { key: 'disabled_var', value: 'should_not_resolve', is_enabled: false }
      ]
    };

    // F1: URL and Query Params Resolution
    const resF1 = prepareRequestUrl(
      '{{base_url}}/{{endpoint}}?client={{user_name}}',
      [{ key: 'token', value: '{{api_key}}', enabled: true }],
      'test-env'
    );
    assert(resF1.isValid === true, 'TEST F1: URL and query params resolved successfully');
    assert(resF1.url.includes('https://httpbin.org/post'), 'TEST F1: Resolved URL pathname');
    assert(resF1.url.includes('client=antigravity_dev'), 'TEST F1: Resolved inline query param');
    assert(resF1.url.includes('token=xyz-secret-key-99'), 'TEST F1: Resolved structured query param');

    // F2: Full Request Resolution (URL, Headers, Body, Auth)
    const testRequestConfig = {
      method: 'POST',
      url: '{{base_url}}/{{endpoint}}',
      params: [{ key: 'auth_key', value: '{{api_key}}', enabled: true }],
      headers: [
        { key: 'X-User-ID', value: '{{user_name}}', enabled: true },
        { key: 'Content-Type', value: 'application/json', enabled: true }
      ],
      body: {
        type: 'json',
        text: '{"user": "{{user_name}}", "action": "test"}'
      },
      auth: {
        type: 'bearer',
        bearerToken: '{{bearer_token}}'
      }
    };

    const fullResolved = resolveEntireRequest(testRequestConfig, 'test-env');
    assert(fullResolved.isValid === true, 'TEST F2: resolveEntireRequest succeeds');
    assert(fullResolved.executionPayload.url === 'https://httpbin.org/post?auth_key=xyz-secret-key-99', 'TEST F2: Cloned URL resolved');
    assert(fullResolved.executionPayload.headers['X-User-ID'] === 'antigravity_dev', 'TEST F2: Header value resolved');
    assert(fullResolved.executionPayload.body === '{"user": "antigravity_dev", "action": "test"}', 'TEST F2: JSON body resolved');
    assert(fullResolved.executionPayload.auth.bearerToken === 'bearer-token-abc-123', 'TEST F2: Bearer auth token resolved');

    // F3: Non-Destructive State Guarantee
    assert(testRequestConfig.url === '{{base_url}}/{{endpoint}}', 'TEST F3: Original request URL template is NOT modified');
    assert(testRequestConfig.headers[0].value === '{{user_name}}', 'TEST F3: Original header template is NOT modified');
    assert(testRequestConfig.body.text.includes('{{user_name}}'), 'TEST F3: Original body template is NOT modified');
    assert(testRequestConfig.auth.bearerToken === '{{bearer_token}}', 'TEST F3: Original auth token template is NOT modified');

    // F4: Basic Auth Resolution
    const basicReqConfig = {
      method: 'GET',
      url: '{{base_url}}/get',
      params: [],
      headers: [],
      body: { type: 'none', text: '' },
      auth: {
        type: 'basic',
        basicUsername: '{{basic_user}}',
        basicPassword: '{{basic_pass}}'
      }
    };
    const basicResolved = resolveEntireRequest(basicReqConfig, 'test-env');
    assert(basicResolved.isValid === true, 'TEST F4: Basic auth resolution succeeds');
    assert(basicResolved.executionPayload.auth.basicUsername === 'admin_user', 'TEST F4: Basic username resolved');
    assert(basicResolved.executionPayload.auth.basicPassword === 'admin_pass_789', 'TEST F4: Basic password resolved');

    // F5: Missing Variable Interception
    const missingReqConfig = {
      method: 'GET',
      url: '{{base_url}}/{{nonexistent_var}}',
      params: [],
      headers: [],
      body: { type: 'none', text: '' }
    };
    const missingResolved = resolveEntireRequest(missingReqConfig, 'test-env');
    assert(missingResolved.isValid === false, 'TEST F5: Missing variable fails validation');
    assert(missingResolved.missingVariables.includes('nonexistent_var'), 'TEST F5: Identifies missing variable name');
    assert(missingResolved.error.includes('nonexistent_var'), 'TEST F5: Informative error message without secret exposure');

    // F6: Disabled Variable Interception
    const disabledReqConfig = {
      method: 'GET',
      url: '{{base_url}}/{{disabled_var}}',
      params: [],
      headers: [],
      body: { type: 'none', text: '' }
    };
    const disabledResolved = resolveEntireRequest(disabledReqConfig, 'test-env');
    assert(disabledResolved.isValid === false, 'TEST F6: Disabled variable is treated as unavailable');
    assert(disabledResolved.missingVariables.includes('disabled_var'), 'TEST F6: Identifies disabled variable as missing');

    // =========================================================================
    // TEST G: SSRF Protection via Resolved Environment Variables
    // =========================================================================
    console.log('\n--- TEST G: SSRF Protection with Resolved Variables ---');

    // Setup an environment with SSRF attack targets
    ENVIRONMENTS['ssrf-env'] = {
      name: 'SSRF Attack Vector Test',
      variables: [
        { key: 'loopback_ip', value: 'http://127.0.0.1:8080/admin', is_enabled: true },
        { key: 'localhost_url', value: 'http://localhost:3000/api/health', is_enabled: true },
        { key: 'metadata_url', value: 'http://169.254.169.254/latest/meta-data', is_enabled: true },
        { key: 'file_protocol', value: 'file:///etc/passwd', is_enabled: true }
      ]
    };

    // G1: Resolved loopback target is blocked by backend SSRF engine
    const ssrfLoopback = resolveEntireRequest({
      method: 'GET',
      url: '{{loopback_ip}}'
    }, 'ssrf-env');
    assert(ssrfLoopback.isValid === true, 'TEST G1: Client resolves loopback variable into payload');

    const resG1 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/execute',
      body: ssrfLoopback.executionPayload
    });
    assert(resG1.statusCode === 400, 'TEST G1: Resolved loopback target returns 400 from execution engine');
    assert(resG1.json.error && (resG1.json.error.code === 'INVALID_URL' || resG1.json.error.code === 'BLOCKED_DESTINATION'), 'TEST G1: Error code indicates invalid or blocked URL');
    assert(resG1.json.error && resG1.json.error.message.includes('Loopback'), 'TEST G1: Message explains loopback SSRF block');

    // G2: Resolved localhost hostname is blocked
    const ssrfLocalhost = resolveEntireRequest({
      method: 'GET',
      url: '{{localhost_url}}'
    }, 'ssrf-env');
    const resG2 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/execute',
      body: ssrfLocalhost.executionPayload
    });
    assert(resG2.statusCode === 400, 'TEST G2: Resolved localhost target returns 400');
    assert(resG2.json.error && (resG2.json.error.code === 'INVALID_URL' || resG2.json.error.code === 'BLOCKED_DESTINATION'), 'TEST G2: Error code indicates invalid or blocked URL');
    assert(resG2.json.error && resG2.json.error.message.includes('localhost'), 'TEST G2: Message explains localhost SSRF block');

    // G3: Resolved cloud metadata is blocked
    const ssrfMetadata = resolveEntireRequest({
      method: 'GET',
      url: '{{metadata_url}}'
    }, 'ssrf-env');
    const resG3 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/execute',
      body: ssrfMetadata.executionPayload
    });
    assert(resG3.statusCode === 400, 'TEST G3: Resolved cloud metadata target returns 400');
    assert(resG3.json.error && (resG3.json.error.code === 'INVALID_URL' || resG3.json.error.code === 'BLOCKED_DESTINATION'), 'TEST G3: Error code indicates invalid or blocked URL');
    assert(resG3.json.error && resG3.json.error.message.includes('metadata'), 'TEST G3: Message explains metadata SSRF block');

    // G4: Resolved file:// protocol is blocked
    const ssrfFile = resolveEntireRequest({
      method: 'GET',
      url: '{{file_protocol}}'
    }, 'ssrf-env');
    const resG4 = await makeRequest(server, {
      method: 'POST',
      path: '/api/requests/execute',
      body: ssrfFile.executionPayload
    });
    assert(resG4.statusCode === 400, 'TEST G4: Resolved file:// protocol returns 400');
    assert(resG4.json.error && (resG4.json.error.code === 'INVALID_URL' || resG4.json.error.code === 'INVALID_PROTOCOL'), 'TEST G4: Error code indicates invalid or blocked URL');
    assert(resG4.json.error && resG4.json.error.message.includes('file:'), 'TEST G4: Message explains protocol rejection');

    // =========================================================================
    // TEST H: SQL Injection Resistance on Environment Endpoints
    // =========================================================================
    console.log('\n--- TEST H: SQL Injection Resistance ---');

    const injectionPayload = "'; DROP TABLE environment_variables; --";
    const resH1 = await makeRequest(server, {
      method: 'POST',
      path: '/api/environments',
      body: {
        name: injectionPayload,
        description: "Test ' OR '1'='1"
      }
    });
    assert(resH1.statusCode === 201, 'TEST H1: SQL injection string accepted safely as literal');
    assert(resH1.json.data.name === injectionPayload, 'TEST H1: SQL payload stored literally without executing');
    createdEnvironmentIds.push(resH1.json.data.id);

    if (isLiveDb) {
      const [tableCheck] = await executeQuery("SHOW TABLES LIKE 'environment_variables'");
      assert(tableCheck.length === 1, 'TEST H1: environment_variables table is completely intact');
    }

    // =========================================================================
    // TEST I: Backward Compatibility Regression Contracts
    // =========================================================================
    console.log('\n--- TEST I: Backward Compatibility Regression Contracts ---');

    // Day 3 Regression: getEnvironmentVariable('dev', 'base_url')
    const devBase = getEnvironmentVariable('dev', 'base_url');
    assert(devBase === 'http://localhost:3000', 'TEST I1: getEnvironmentVariable resolves dev base_url');

    // Day 3 Regression: resolveVariables with dev environment
    const devRes = resolveVariables('{{base_url}}/api/v1/users', 'dev');
    assert(devRes.resolvedText === 'http://localhost:3000/api/v1/users', 'TEST I2: resolveVariables resolves dev base_url');
    assert(devRes.missingVariables.length === 0, 'TEST I2: No missing variables in dev');

    // No Environment resolves nothing
    const noEnvRes = resolveVariables('{{base_url}}/users', 'none');
    assert(noEnvRes.missingVariables.includes('base_url'), 'TEST I3: none environment marks base_url as missing');

  } finally {
    // =========================================================================
    // Teardown: Clean up test-created records from live MySQL
    // =========================================================================
    if (isLiveDb) {
      try {
        for (const envId of createdEnvironmentIds) {
          await executeQuery('DELETE FROM environments WHERE id = ?', [envId]);
        }
      } catch (cleanupErr) {
        console.error('  [Notice] Test teardown cleanup notice:', cleanupErr.message);
      }
    }

    // Close HTTP test server & database pool
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
    console.error('Day 12 test execution failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
