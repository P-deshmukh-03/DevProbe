/**
 * DevProbe — Database Schema Initialization Script
 * Day 9: MySQL Database Foundation
 *
 * Connects to the configured MySQL/MariaDB instance and applies database/schema.sql.
 * Safe to execute multiple times (CREATE TABLE IF NOT EXISTS).
 *
 * Usage:
 *   node database/init.js
 *   npm run db:init
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getDatabaseConfig, sanitizeDatabaseError } = require('../src/config/database');

async function initializeDatabase() {
  const config = getDatabaseConfig();
  console.log(`Connecting to MySQL at ${config.host}:${config.port} (user: ${config.user})...`);

  let connection = null;

  try {
    // 1. Connect to MySQL server without selecting target database first
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      multipleStatements: true,
      connectTimeout: config.connectTimeout
    });

    console.log('✓ Successfully connected to MySQL server.');

    // 2. Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // 3. Execute schema SQL statements
    console.log(`Applying schema to database '${config.database}'...`);
    await connection.query(schemaSql);
    console.log('✓ Schema applied successfully.');

    // 4. Verify table existence
    await connection.changeUser({ database: config.database });
    const [tables] = await connection.query('SHOW TABLES;');
    const tableNames = tables.map(row => Object.values(row)[0]);

    // 5. Apply non-destructive incremental migrations for pre-existing tables
    console.log(`Checking schema migrations for '${config.database}'...`);
    await applyMigrations(connection, config.database);

    console.log(`✓ Database '${config.database}' is ready with tables:`, tableNames.join(', '));
    return { success: true, tables: tableNames };
  } catch (err) {
    const safeMsg = sanitizeDatabaseError(err);
    console.error(`✗ Database initialization failed: ${safeMsg}`);
    console.error('Troubleshooting: Ensure MySQL is running in XAMPP Control Panel and .env has correct credentials.');
    return { success: false, error: safeMsg };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Idempotently applies incremental column migrations to ensure existing tables
 * match the latest schema requirements without destructive changes.
 *
 * @param {mysql.Connection} connection - Active MySQL connection
 * @param {string} databaseName - Name of target database
 */
async function applyMigrations(connection, databaseName) {
  async function columnExists(tableName, columnName) {
    const [rows] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [databaseName, tableName, columnName]
    );
    return rows.length > 0;
  }

  // Day 14 Migration 1: Add assertions JSON NULL to saved_requests if missing
  const hasAssertions = await columnExists('saved_requests', 'assertions');
  if (!hasAssertions) {
    console.log('Applying Day 14 migration: adding `assertions` column to `saved_requests`...');
    await connection.query(
      'ALTER TABLE `saved_requests` ADD COLUMN `assertions` JSON NULL AFTER `auth_type`;'
    );
    console.log('✓ Added `assertions` column to `saved_requests`.');
  } else {
    console.log('✓ Column `saved_requests.assertions` already present.');
  }

  // Day 14 Migration 2: Add test_results JSON NULL to request_history if missing
  const hasTestResults = await columnExists('request_history', 'test_results');
  if (!hasTestResults) {
    console.log('Applying Day 14 migration: adding `test_results` column to `request_history`...');
    await connection.query(
      'ALTER TABLE `request_history` ADD COLUMN `test_results` JSON NULL AFTER `error_message`;'
    );
    console.log('✓ Added `test_results` column to `request_history`.');
  } else {
    console.log('✓ Column `request_history.test_results` already present.');
  }

  // Day 15 Migration 1: Add description TEXT NULL to saved_requests if missing
  const hasDescription = await columnExists('saved_requests', 'description');
  if (!hasDescription) {
    console.log('Applying Day 15 migration: adding `description` column to `saved_requests`...');
    await connection.query(
      'ALTER TABLE `saved_requests` ADD COLUMN `description` TEXT NULL AFTER `name`;'
    );
    console.log('✓ Added `description` column to `saved_requests`.');
  } else {
    console.log('✓ Column `saved_requests.description` already present.');
  }
}

// Execute if run directly from command line
if (require.main === module) {
  initializeDatabase().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { initializeDatabase, applyMigrations };

