/**
 * DevProbe — Environment Controller
 * Day 12: Environment Management
 *
 * Handles HTTP requests for environment and environment-variable endpoints.
 */

const environmentService = require('../services/environmentService');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/environments
 * List all environments with variable counts and active status
 */
async function getEnvironments(req, res, next) {
  try {
    const environments = await environmentService.getAllEnvironments();
    return res.status(200).json({
      success: true,
      data: environments
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/environments/:id
 * Retrieve single environment with variables (secrets masked)
 */
async function getEnvironmentById(req, res, next) {
  try {
    const environment = await environmentService.getEnvironmentById(req.params.id, { includeDecrypted: false });
    if (!environment) {
      throw new AppError(`Environment with ID ${req.params.id} not found`, 404, 'NOT_FOUND', null, 'id');
    }
    return res.status(200).json({
      success: true,
      data: environment
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/environments
 * Create a new environment
 */
async function createEnvironment(req, res, next) {
  try {
    const environment = await environmentService.createEnvironment(req.body);
    return res.status(201).json({
      success: true,
      message: 'Environment created successfully',
      data: environment
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /api/environments/:id
 * Update an environment and optionally synchronize its variables
 */
async function updateEnvironment(req, res, next) {
  try {
    const environment = await environmentService.updateEnvironment(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: 'Environment updated successfully',
      data: environment
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/environments/:id
 * Delete an environment and cascade to variables
 */
async function deleteEnvironment(req, res, next) {
  try {
    const result = await environmentService.deleteEnvironment(req.params.id);
    return res.status(200).json({
      success: true,
      message: `Environment '${result.name}' deleted successfully`,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/environments/:id/activate
 * Set an environment as active, deactivating all others
 */
async function activateEnvironment(req, res, next) {
  try {
    const activated = await environmentService.activateEnvironment(req.params.id);
    return res.status(200).json({
      success: true,
      message: `Environment '${activated.name}' is now active`,
      data: activated
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/environments/deactivate
 * Deactivates all environments ("No Environment" active)
 */
async function deactivateEnvironment(req, res, next) {
  try {
    const result = await environmentService.deactivateAllEnvironments();
    return res.status(200).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/environments/:id/variables
 * Add a variable to an environment
 */
async function addVariable(req, res, next) {
  try {
    const variable = await environmentService.addVariable(req.params.id, req.body);
    return res.status(201).json({
      success: true,
      message: 'Variable added successfully',
      data: variable
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /api/environments/:id/variables/:varId
 * Update a variable in an environment
 */
async function updateVariable(req, res, next) {
  try {
    const variable = await environmentService.updateVariable(req.params.id, req.params.varId, req.body);
    return res.status(200).json({
      success: true,
      message: 'Variable updated successfully',
      data: variable
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/environments/:id/variables/:varId
 * Delete a variable from an environment
 */
async function deleteVariable(req, res, next) {
  try {
    const result = await environmentService.deleteVariable(req.params.id, req.params.varId);
    return res.status(200).json({
      success: true,
      message: 'Variable deleted successfully',
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getEnvironments,
  getEnvironmentById,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  activateEnvironment,
  deactivateEnvironment,
  addVariable,
  updateVariable,
  deleteVariable
};

