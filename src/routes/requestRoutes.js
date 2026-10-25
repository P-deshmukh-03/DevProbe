/**
 * DevProbe — Request Routes
 *
 * Routes for request configuration validation and HTTP execution endpoints.
 */

const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const { validateRequestPayload } = require('../middleware/validateRequest');

/**
 * POST /api/requests/validate
 * Validates request configuration inputs without outbound HTTP dispatch (preparation-only)
 */
router.post('/validate', validateRequestPayload, requestController.validateRequest);

/**
 * POST /api/requests/execute
 * Validates and executes real outbound HTTP request with SSRF protection, DNS pinning, and limits
 */
router.post('/execute', validateRequestPayload, requestController.executeRequest);

module.exports = router;
