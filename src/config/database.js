/**
 * DevProbe — Database Configuration and Connection Pool Module
 * Day 9: MySQL Database Integration
 *
 * Provides a resilient, reusable connection pool for MySQL / MariaDB (e.g. XAMPP):
 * - Reads connection settings from environment variables with safe defaults.
 * - Manages a lazy singleton connection pool to avoid opening multiple pools.
 * - Redacts passwords and credentials from logs, errors, and public output.
 * - Exposes connectivity testing, health checks, and graceful shutdown handlers.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

/**
 * Singleton pool instance reference.
 * Initialized lazily on first access via getPool().
 */
let poolInstance = null;

/**
 * Parses and returns the active database configuration from environment variables.
 * Provides sensible defaults suitable for local development (e.g., standard XAMPP setup).
 *
 * @returns {object} Database configuration object
 */
function getDatabaseConfig() {
  const port = parseInt(process.env.DB_PORT, 10);
  const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT, 10);
  const connectTimeout = parseInt(process.env.DB_CONNECT_TIMEOUT, 10);
  const queueLimit = parseInt(process.env.DB_QUEUE_LIMIT, 10);

  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number.isNaN(port) || port <= 0 ? 3306 : port,
    database: process.env.DB_NAME || 'devprobe_db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
    waitForConnections: process.env.DB_WAIT_FOR_CONNECTIONS !== 'false',
    connectionLimit: Number.isNaN(connectionLimit) || connectionLimit <= 0 ? 10 : connectionLimit,
    connectTimeout: Number.isNaN(connectTimeout) || connectTimeout <= 0 ? 10000 : connectTimeout,
    queueLimit: Number.isNaN(queueLimit) || queueLimit < 0 ? 0 : queueLimit,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  };
}

/**
 * Returns a sanitized view of the database configuration safe for logging and health diagnostics.
 * Passwords and sensitive parameters are strictly masked.
 *
 * @returns {object} Safe database configuration
 */
function getSanitizedConfig() {
  const config = getDatabaseConfig();
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    connectionLimit: config.connectionLimit,
    connectTimeout: config.connectTimeout,
    hasPassword: Boolean(config.password && config.password.length > 0)
  };
}

/**
 * Retrieves the active MySQL connection pool. Creates one lazily if it does not yet exist.
 *
 * @param {object} [customConfig] - Optional config override for testing
 * @returns {mysql.Pool} Reusable mysql2/promise pool
 */
function getPool(customConfig = null) {
  if (customConfig) {
    return mysql.createPool(customConfig);
  }

  if (!poolInstance) {
    const config = getDatabaseConfig();
    poolInstance = mysql.createPool(config);
  }

  return poolInstance;
}

/**
 * Gracefully closes the active connection pool if open.
 * Resets the singleton instance so future calls can re-establish if needed.
 *
 * @returns {Promise<boolean>} True if pool was closed or false if no pool was active
 */
async function closePool() {
  if (poolInstance) {
    try {
      await poolInstance.end();
    } catch {
      // Ignore errors on pool close during teardown
    } finally {
      poolInstance = null;
    }
    return true;
  }
  return false;
}

/**
 * Formats database errors into safe, sanitized messages without leaking passwords,
 * full connection strings, file paths, or raw stack traces.
 *
 * @param {Error} err - The caught error
 * @returns {string} Safe, human-readable error description
 */
function sanitizeDatabaseError(err) {
  if (!err) return 'Unknown database error';

  const code = err.code || 'UNKNOWN';

  switch (code) {
    case 'ECONNREFUSED':
      return 'Database server refused connection. Verify MySQL service is running.';
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_ACCESS_DENIED_NO_PASSWORD_ERROR':
      return 'Authentication failed. Check DB_USER and DB_PASSWORD configuration.';
    case 'ER_BAD_DB_ERROR':
      return `Database '${getDatabaseConfig().database}' does not exist. Verify schema initialization.`;
    case 'ETIMEDOUT':
    case 'PROTOCOL_SEQUENCE_TIMEOUT':
      return 'Database connection timed out. Check host and port availability.';
    case 'ENOTFOUND':
      return 'Database host could not be resolved. Check DB_HOST configuration.';
    default:
      return `Database connection issue (${code}). Verify database service status.`;
  }
}

/**
 * Tests connectivity to the database by acquiring a connection and executing a lightweight ping.
 *
 * @param {mysql.Pool} [targetPool] - Optional pool to test (defaults to singleton getPool())
 * @returns {Promise<{ isConnected: boolean, status: string, message: string, timestamp: string }>}
 */
async function testConnection(targetPool = null) {
  const pool = targetPool || getPool();
  const timestamp = new Date().toISOString();

  try {
    // Lightweight heartbeat query
    const [rows] = await pool.query('SELECT 1 AS health');
    const isHealthy = Boolean(rows && rows[0] && rows[0].health === 1);

    if (isHealthy) {
      return {
        isConnected: true,
        status: 'connected',
        message: 'Database connection established successfully',
        timestamp
      };
    }

    return {
      isConnected: false,
      status: 'disconnected',
      message: 'Database responded unexpectedly to health check',
      timestamp
    };
  } catch (err) {
    return {
      isConnected: false,
      status: 'disconnected',
      message: sanitizeDatabaseError(err),
      timestamp
    };
  }
}

/**
 * Reusable database readiness / health check function suitable for API endpoints.
 *
 * @returns {Promise<{ isConnected: boolean, status: string, message: string, timestamp: string, database: string }>}
 */
async function checkDatabaseHealth() {
  const connectionResult = await testConnection();
  const safeConfig = getSanitizedConfig();

  return {
    ...connectionResult,
    database: safeConfig.database
  };
}

/**
 * Helper to execute a parameterized SQL query safely using the connection pool.
 * Enforces parameterization to protect against SQL injection vulnerabilities.
 *
 * @param {string} sql - Parameterized SQL statement with ? placeholders
 * @param {Array} [params] - Array of parameter values matching placeholders
 * @returns {Promise<[Array, Array]>} Query result rows and fields
 */
async function executeQuery(sql, params = []) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new Error('SQL statement must be a non-empty string');
  }

  if (!Array.isArray(params)) {
    throw new Error('Query parameters must be supplied as an Array');
  }

  const pool = getPool();
  return pool.execute(sql, params);
}

module.exports = {
  getDatabaseConfig,
  getSanitizedConfig,
  getPool,
  closePool,
  testConnection,
  checkDatabaseHealth,
  sanitizeDatabaseError,
  executeQuery
};

