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

// Execute if run directly from command line
if (require.main === module) {
  initializeDatabase().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { initializeDatabase };

