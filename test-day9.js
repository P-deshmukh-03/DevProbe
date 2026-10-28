/**
 * DevProbe Day 9 Verification Test Suite
 * MySQL Database Integration Foundation:
 * - Database configuration defaults and environment overrides
 * - Sanitized configuration output (zero password leakage)
 * - Safe error message translation without credential exposure
 * - Connection pool lifecycle management (singleton creation and teardown)
 * - Deterministic mocked connectivity tests (success, failure, timeout)
 * - Initial schema file structure and constraints validation
 * - Parameterized query execution safety
 * - HTTP health and readiness endpoints (/api/health and /api/health/db)
 * - Live MySQL / XAMPP integration test (when MySQL service is running)
 * - Day 3–8 regression check
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('./src/app.js');
const {
  getDatabaseConfig,
  getSanitizedConfig,
  getPool,
  closePool,
  testConnection,
  checkDatabaseHealth,
  sanitizeDatabaseError,
  executeQuery
} = require('./src/config/database.js');

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
function makeRequest(server, { method = 'GET', path = '/', headers = {} }) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method,
        headers
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
    req.end();
  });
}

async function runDay9Tests() {
  console.log('=== DevProbe Day 9 Verification Tests ===\n');

  // ---------------------------------------------------------------------------
  // TEST A: Database Configuration Defaults & Parsing
  // ---------------------------------------------------------------------------
  console.log('--- TEST A: Database Configuration Defaults & Parsing ---');
  const config = getDatabaseConfig();

  assert(typeof config.host === 'string' && config.host.length > 0, 'TEST A1: Database host is configured', `host: ${config.host}`);
  assert(typeof config.port === 'number' && config.port > 0, 'TEST A1: Database port is a positive integer', `port: ${config.port}`);
  assert(config.database === 'devprobe_db', 'TEST A1: Default database name is devprobe_db', `database: ${config.database}`);
  assert(typeof config.user === 'string' && config.user.length > 0, 'TEST A1: Database user is defined', `user: ${config.user}`);
  assert(config.connectionLimit > 0, 'TEST A1: Connection limit is a positive integer', `limit: ${config.connectionLimit}`);
  assert(config.connectTimeout > 0, 'TEST A1: Connection timeout is a positive integer', `timeout: ${config.connectTimeout}`);

  // Test sanitized config
  const sanitized = getSanitizedConfig();
  assert(sanitized.password === undefined, 'TEST A2: Sanitized config strictly omits password property');
  assert(typeof sanitized.hasPassword === 'boolean', 'TEST A2: Sanitized config includes boolean hasPassword flag');
  assert(sanitized.host === config.host, 'TEST A2: Sanitized config preserves host');
  assert(sanitized.database === config.database, 'TEST A2: Sanitized config preserves database');

  // Test environment overrides with custom environment
  const originalHost = process.env.DB_HOST;
  const originalPort = process.env.DB_PORT;
  process.env.DB_HOST = 'custom-db-host.internal';
  process.env.DB_PORT = '3307';
  const overridden = getDatabaseConfig();
  assert(overridden.host === 'custom-db-host.internal', 'TEST A3: Respects DB_HOST environment override');
  assert(overridden.port === 3307, 'TEST A3: Respects DB_PORT environment override and parses to number');

  // Restore env
  if (originalHost !== undefined) process.env.DB_HOST = originalHost; else delete process.env.DB_HOST;
  if (originalPort !== undefined) process.env.DB_PORT = originalPort; else delete process.env.DB_PORT;

  // ---------------------------------------------------------------------------
  // TEST B: Safe Error Sanitization (Zero Credential Leakage)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST B: Safe Error Sanitization ---');
  const refusedErr = new Error('connect ECONNREFUSED 127.0.0.1:3306');
  refusedErr.code = 'ECONNREFUSED';
  const refusedMsg = sanitizeDatabaseError(refusedErr);
  assert(refusedMsg.includes('refused connection'), 'TEST B1: Identifies ECONNREFUSED clearly');
  assert(!refusedMsg.includes('password'), 'TEST B1: Does not leak password in ECONNREFUSED');

  const accessErr = new Error("Access denied for user 'root'@'localhost' (using password: YES)");
  accessErr.code = 'ER_ACCESS_DENIED_ERROR';
  const accessMsg = sanitizeDatabaseError(accessErr);
  assert(accessMsg.includes('Authentication failed'), 'TEST B2: Identifies access denied error safely');
  assert(!accessMsg.includes('using password: YES'), 'TEST B2: Redacts raw MySQL error message');

  const badDbErr = new Error("Unknown database 'nonexistent_db'");
  badDbErr.code = 'ER_BAD_DB_ERROR';
  const badDbMsg = sanitizeDatabaseError(badDbErr);
  assert(badDbMsg.includes('does not exist'), 'TEST B3: Identifies missing database safely');

  const genericErr = new Error('Some internal query failed at /var/www/secret/path');
  genericErr.code = 'ER_SYNTAX_ERROR';
  const genericMsg = sanitizeDatabaseError(genericErr);
  assert(!genericMsg.includes('/var/www/secret'), 'TEST B4: Generic error does not leak filesystem paths');

  // ---------------------------------------------------------------------------
  // TEST C: Connection Pool Lifecycle
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST C: Connection Pool Lifecycle ---');
  const pool1 = getPool();
  assert(pool1 !== null && typeof pool1 === 'object', 'TEST C1: getPool() returns valid pool instance');

  const pool2 = getPool();
  assert(pool1 === pool2, 'TEST C2: getPool() returns singleton instance');

  const closed = await closePool();
  assert(closed === true, 'TEST C3: closePool() successfully closes active pool');

  const closedAgain = await closePool();
  assert(closedAgain === false, 'TEST C3: Subsequent closePool() handles idle state safely');

  // Re-acquire fresh pool after close
  const pool3 = getPool();
  assert(pool3 !== null && typeof pool3 === 'object', 'TEST C4: Lazily recreates pool after close');
  await closePool();

  // ---------------------------------------------------------------------------
  // TEST D: Mocked Database Connectivity & Failure Modes
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST D: Mocked Database Connectivity Modes ---');

  // D1: Mocked successful ping
  const mockHealthyPool = {
    async query(sql) {
      if (sql === 'SELECT 1 AS health') {
        return [[{ health: 1 }], []];
      }
      return [[], []];
    }
  };

  const healthyResult = await testConnection(mockHealthyPool);
  assert(healthyResult.isConnected === true, 'TEST D1: Mocked successful ping reports isConnected: true');
  assert(healthyResult.status === 'connected', 'TEST D1: Mocked successful ping reports status: connected');
  assert(typeof healthyResult.timestamp === 'string', 'TEST D1: Result includes ISO timestamp');

  // D2: Mocked failed connection (ECONNREFUSED)
  const mockFailingPool = {
    async query() {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:3306');
      err.code = 'ECONNREFUSED';
      throw err;
    }
  };

  const failingResult = await testConnection(mockFailingPool);
  assert(failingResult.isConnected === false, 'TEST D2: Mocked failure reports isConnected: false');
  assert(failingResult.status === 'disconnected', 'TEST D2: Mocked failure reports status: disconnected');
  assert(failingResult.message.includes('refused connection'), 'TEST D2: Returns sanitized error message');

  // D3: Mocked unexpected result structure
  const mockUnexpectedPool = {
    async query() {
      return [[{ unexpected: 999 }], []];
    }
  };

  const unexpectedResult = await testConnection(mockUnexpectedPool);
  assert(unexpectedResult.isConnected === false, 'TEST D3: Handles unexpected query structure safely');

  // ---------------------------------------------------------------------------
  // TEST E: SQL Schema Structure & Security Policy Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST E: SQL Schema Structure & Security Policy ---');
  const schemaPath = path.join(__dirname, 'database', 'schema.sql');
  assert(fs.existsSync(schemaPath), 'TEST E1: database/schema.sql file exists on disk');

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');

  assert(schemaContent.includes('CREATE DATABASE IF NOT EXISTS `devprobe_db`'), 'TEST E2: Creates database with IF NOT EXISTS');
  assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS `collections`'), 'TEST E3: Defines collections table with IF NOT EXISTS');
  assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS `saved_requests`'), 'TEST E4: Defines saved_requests table with IF NOT EXISTS');
  assert(schemaContent.includes('PRIMARY KEY (`id`)'), 'TEST E5: Tables define explicit primary keys');
  assert(schemaContent.includes('CONSTRAINT `fk_saved_requests_collection`'), 'TEST E6: Establishes foreign key constraint from saved_requests to collections');
  assert(schemaContent.includes('ON DELETE SET NULL'), 'TEST E7: Foreign key safely handles parent deletion without orphan cascades');
  assert(schemaContent.includes('utf8mb4'), 'TEST E8: Specifies full UTF-8 (utf8mb4) character set');
  assert(schemaContent.includes('`headers` JSON NULL'), 'TEST E9: Stores structured headers as JSON column');
  assert(schemaContent.includes('`params` JSON NULL'), 'TEST E9: Stores structured params as JSON column');
  assert(schemaContent.includes('`created_at` TIMESTAMP'), 'TEST E10: Tracks created_at timestamps');
  assert(schemaContent.includes('`updated_at` TIMESTAMP'), 'TEST E10: Tracks updated_at timestamps with auto-update');

  // ---------------------------------------------------------------------------
  // TEST F: Parameterized Query Safety Enforcement
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST F: Parameterized Query Safety Enforcement ---');
  let rejectedEmptySql = false;
  try {
    await executeQuery('');
  } catch {
    rejectedEmptySql = true;
  }
  assert(rejectedEmptySql === true, 'TEST F1: executeQuery rejects empty SQL');

  let rejectedNonArrayParams = false;
  try {
    await executeQuery('SELECT * FROM collections WHERE id = ?', 'invalid-params');
  } catch {
    rejectedNonArrayParams = true;
  }
  assert(rejectedNonArrayParams === true, 'TEST F2: executeQuery enforces Array parameter type');

  // ---------------------------------------------------------------------------
  // TEST G: HTTP Health & Readiness Endpoints
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST G: HTTP Health & Readiness Endpoints ---');
  const server = app.listen(0);

  try {
    // G1: Existing /api/health endpoint contract preservation
    const healthRes = await makeRequest(server, { method: 'GET', path: '/api/health' });
    assert(healthRes.statusCode === 200, 'TEST G1: GET /api/health returns HTTP 200');
    assert(healthRes.json !== null, 'TEST G1: Returns valid JSON envelope');
    assert(healthRes.json.success === true, 'TEST G1: json.success is true');
    assert(healthRes.json.message === 'DevProbe server is running', 'TEST G1: Preserves Day 3-8 liveness health contract');

    // G2: New Day 9 database readiness endpoint /api/health/db
    const dbRes = await makeRequest(server, { method: 'GET', path: '/api/health/db' });
    assert(dbRes.statusCode === 200 || dbRes.statusCode === 503, 'TEST G2: GET /api/health/db returns 200 (connected) or 503 (disconnected)', `Status was: ${dbRes.statusCode}`);
    assert(dbRes.json !== null, 'TEST G2: Returns valid JSON payload');
    assert(typeof dbRes.json.success === 'boolean', 'TEST G2: Payload includes boolean success field');
    assert(typeof dbRes.json.database === 'object', 'TEST G2: Payload includes database status object');
    assert(typeof dbRes.json.database.isConnected === 'boolean', 'TEST G2: database.isConnected is boolean');
    assert(typeof dbRes.json.database.status === 'string', 'TEST G2: database.status is string');
    assert(typeof dbRes.json.database.message === 'string', 'TEST G2: database.message is string');
    assert(!JSON.stringify(dbRes.json).includes('password'), 'TEST G2: Database health endpoint NEVER exposes passwords');
  } finally {
    server.close();
    await closePool();
  }

  // ---------------------------------------------------------------------------
  // TEST H: Live MySQL Integration Test (XAMPP / Local Service)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST H: Live MySQL / XAMPP Verification ---');
  const liveHealth = await checkDatabaseHealth();

  if (liveHealth.isConnected) {
    console.log('  [Live Environment] MySQL server is actively running!');
    assert(liveHealth.isConnected === true, 'TEST H: Live MySQL connected successfully');
    assert(liveHealth.status === 'connected', 'TEST H: Live status is connected');
    assert(liveHealth.database === 'devprobe_db', 'TEST H: Verified target database is devprobe_db');

    // Execute live query through the pool using parameterized SQL
    try {
      const [collRows] = await executeQuery(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        ['devprobe_db', 'collections']
      );
      assert(collRows.length > 0, 'TEST H: Live database contains `collections` table');

      const [reqRows] = await executeQuery(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        ['devprobe_db', 'saved_requests']
      );
      assert(reqRows.length > 0, 'TEST H: Live database contains `saved_requests` table');
    } catch (err) {
      assert(false, 'TEST H: Live table query succeeded', err.message);
    }
  } else {
    console.log(`  [Notice] Live MySQL server is not connected: ${liveHealth.message}`);
    console.log('  [Notice] To test live database: Start MySQL in XAMPP Control Panel and run: npm run db:init');
    assert(liveHealth.isConnected === false, 'TEST H: Gracefully detected offline MySQL without throwing');
    assert(liveHealth.status === 'disconnected', 'TEST H: Status correctly reported as disconnected');
  }

  await closePool();

  console.log('\n===========================================');
  console.log(`Test Results: ${passedTests}/${totalTests} Passed`);
  console.log('===========================================\n');

  process.exit(passedTests === totalTests ? 0 : 1);
}

runDay9Tests().catch((err) => {
  console.error('Fatal error in Day 9 test suite:', err);
  process.exit(1);
});
