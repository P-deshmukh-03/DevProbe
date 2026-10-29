// Load environment variables
require('dotenv').config();

const express = require('express');
const path = require('path');
const requestRoutes = require('./routes/requestRoutes');
const collectionRoutes = require('./routes/collectionRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { EXECUTION_LIMITS } = require('./config/security');
const { checkDatabaseHealth, closePool } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Security hardening: Disable X-Powered-By fingerprinting header
app.disable('x-powered-by');

// Security headers middleware: prevent MIME sniffing and clickjacking
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Body parsing middleware with configured payload limits
app.use(express.json({ limit: EXECUTION_LIMITS.BODY_SIZE_LIMIT_EXPRESS }));
app.use(express.urlencoded({ extended: true, limit: EXECUTION_LIMITS.BODY_SIZE_LIMIT_EXPRESS }));

// Serve static assets from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint (preserves existing Day 3–8 contract)
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'DevProbe server is running'
  });
});

// Database readiness endpoint (Day 9: MySQL Health Check)
app.get('/api/health/db', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    const statusCode = dbHealth.isConnected ? 200 : 503;
    return res.status(statusCode).json({
      success: dbHealth.isConnected,
      database: dbHealth
    });
  } catch {
    return res.status(503).json({
      success: false,
      database: {
        isConnected: false,
        status: 'disconnected',
        message: 'Database readiness check failed',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// API Routes (Days 4–10)
app.use('/api/collections', collectionRoutes);
app.use('/api/requests', requestRoutes);

// Homepage route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 Not Found handler for unmatched routes
app.use(notFoundHandler);

// Centralized error-handling middleware
app.use(errorHandler);

// Start the server if executed directly
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`DevProbe server is running at http://localhost:${PORT}`);
  });

  // Graceful shutdown handling
  const shutdown = async () => {
    console.log('Shutting down DevProbe server...');
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;
