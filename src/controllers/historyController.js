/**
 * DevProbe — History Controller
 * Day 13: Request History & Execution Management
 *
 * Handles HTTP requests for viewing, paginating, retrieving,
 * and deleting request execution history.
 */

const historyService = require('../services/historyService');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/history
 * Retrieves paginated execution history summary list.
 * Query parameters:
 * - page: 1-based page index (default: 1)
 * - limit: number of records per page (default: 20, max: 100)
 */
async function getHistory(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;

    const numPage = Number(page);
    if (!Number.isInteger(numPage) || numPage < 1) {
      throw new AppError('Page must be a positive integer', 400, 'INVALID_PAGINATION', null, 'page');
    }

    const numLimit = Number(limit);
    if (!Number.isInteger(numLimit) || numLimit < 1) {
      throw new AppError('Limit must be a positive integer', 400, 'INVALID_PAGINATION', null, 'limit');
    }

    // Clamp limit to 100 maximum
    const effectiveLimit = Math.min(numLimit, 100);

    const result = await historyService.getHistory({
      page: numPage,
      limit: effectiveLimit
    });

    return res.status(200).json({
      success: true,
      message: 'History retrieved successfully',
      data: result.items,
      pagination: result.pagination
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/history/:id
 * Retrieves the full detail of a single history record by ID.
 */
async function getHistoryById(req, res, next) {
  try {
    const { id } = req.params;
    const numericId = Number(id);

    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new AppError('History ID must be a positive integer', 400, 'INVALID_HISTORY_ID', null, 'id');
    }

    const record = await historyService.getHistoryById(numericId);

    if (!record) {
      throw new AppError(`History record with ID ${numericId} not found`, 404, 'NOT_FOUND', null, 'id');
    }

    return res.status(200).json({
      success: true,
      message: 'History record retrieved successfully',
      data: record
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/history/:id
 * Deletes a single history record by ID.
 */
async function deleteHistoryById(req, res, next) {
  try {
    const { id } = req.params;
    const numericId = Number(id);

    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new AppError('History ID must be a positive integer', 400, 'INVALID_HISTORY_ID', null, 'id');
    }

    const result = await historyService.deleteHistoryById(numericId);

    if (!result.deleted) {
      throw new AppError(`History record with ID ${numericId} not found`, 404, 'NOT_FOUND', null, 'id');
    }

    return res.status(200).json({
      success: true,
      message: 'History record deleted successfully',
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/history
 * Clears all execution history records.
 */
async function clearHistory(req, res, next) {
  try {
    const result = await historyService.clearAllHistory();

    return res.status(200).json({
      success: true,
      message: 'All history records cleared successfully',
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getHistory,
  getHistoryById,
  deleteHistoryById,
  clearHistory
};

