/**
 * DevProbe — Request Routes
 *
 * Routes for request configuration and validation endpoints.
 */

const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const { validateRequestPayload } = require('../middleware/validateRequest');

/**
 * POST /api/requests/validate
 * Validates request configuration inputs without outbound HTTP dispatch
 */
router.post('/validate', validateRequestPayload, requestController.validateRequest);

module.exports = router;
