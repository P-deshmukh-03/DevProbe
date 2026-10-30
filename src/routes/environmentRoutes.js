/**
 * DevProbe — Environment Routes
 * Day 12: Environment Management
 *
 * Defines REST endpoints for environment and environment-variable operations.
 */

const express = require('express');
const router = express.Router();
const environmentController = require('../controllers/environmentController');

// Deactivation endpoint (must precede /:id to prevent route shadowing)
router.post('/deactivate', environmentController.deactivateEnvironment);

// Environment CRUD Endpoints
router.get('/', environmentController.getEnvironments);
router.get('/:id', environmentController.getEnvironmentById);
router.post('/', environmentController.createEnvironment);
router.put('/:id', environmentController.updateEnvironment);
router.delete('/:id', environmentController.deleteEnvironment);

// Activation endpoint
router.post('/:id/activate', environmentController.activateEnvironment);

// Granular Variable CRUD Endpoints
router.post('/:id/variables', environmentController.addVariable);
router.put('/:id/variables/:varId', environmentController.updateVariable);
router.delete('/:id/variables/:varId', environmentController.deleteVariable);

module.exports = router;

