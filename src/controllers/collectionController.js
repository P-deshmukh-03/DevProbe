/**
 * DevProbe — Collection Controller
 * Day 10: Collections and Saved Requests Persistence
 * Day 15: Collection Import/Export & API Documentation Endpoints
 *
 * Handles HTTP requests for collections listing, creation, import/export, and docs generation.
 */

const collectionService = require('../services/collectionService');
const collectionTransferService = require('../services/collectionTransferService');
const documentationService = require('../services/documentationService');
const { AppError } = require('../middleware/errorHandler');

/**
 * Generates an RFC 6266 / RFC 5987 compliant Content-Disposition header.
 * Sanitizes the filename to prevent header injection (CRLF), directory traversal,
 * or broken quoting, while providing both an ASCII fallback and UTF-8 encoded filename.
 *
 * @param {string} rawName - Collection or file name
 * @param {string} ext - Extension without dot (e.g. 'json', 'md', 'html')
 * @param {boolean} [isAttachment=true] - Whether to send as attachment or inline
 * @returns {string} Sanitized Content-Disposition header value
 */
function buildContentDisposition(rawName, ext, isAttachment = true) {
  const safeAscii = String(rawName || 'collection')
    .replace(/[\r\n\t"\\/<>:|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'collection';

  const asciiFilename = `${safeAscii}.${ext}`;
  const encodedFilename = encodeURIComponent(String(rawName || 'collection').trim()) + `.${ext}`;
  const dispositionType = isAttachment ? 'attachment' : 'inline';

  return `${dispositionType}; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
}

/**
 * Handle GET /api/collections
 * Retrieves all saved collections.
 */
async function getCollections(req, res, next) {
  try {
    const collections = await collectionService.getAllCollections();
    return res.status(200).json({
      success: true,
      data: collections
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle GET /api/collections/:id
 * Retrieves a single collection by ID.
 */
async function getCollectionById(req, res, next) {
  try {
    const { id } = req.params;
    const collection = await collectionService.getCollectionById(id);

    if (!collection) {
      throw new AppError(`Collection with ID ${id} not found`, 404, 'NOT_FOUND');
    }

    return res.status(200).json({
      success: true,
      data: collection
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle POST /api/collections
 * Creates a new collection.
 */
async function createCollection(req, res, next) {
  try {
    const { name, description } = req.body || {};
    const newCollection = await collectionService.createCollection({ name, description });

    return res.status(201).json({
      success: true,
      message: 'Collection created successfully',
      data: newCollection
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle PUT /api/collections/:id
 * Updates an existing collection.
 */
async function updateCollection(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description } = req.body || {};
    const updated = await collectionService.updateCollection(id, { name, description });

    return res.status(200).json({
      success: true,
      message: 'Collection updated successfully',
      data: updated
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle DELETE /api/collections/:id
 * Deletes a collection safely (unassigning its saved requests).
 */
async function deleteCollection(req, res, next) {
  try {
    const { id } = req.params;
    const result = await collectionService.deleteCollection(id);

    return res.status(200).json({
      success: true,
      message: 'Collection deleted successfully',
      data: result
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle GET /api/collections/:id/export
 * Exports a collection and all associated requests as devprobe/v1 JSON.
 */
async function exportCollection(req, res, next) {
  try {
    const { id } = req.params;
    const exportBundle = await collectionTransferService.exportCollection(id);

    // Support optional query ?download=false or ?inline=true for inline viewing, default to attachment download
    const isAttachment = req.query.download !== 'false' && req.query.inline !== 'true';
    const disposition = buildContentDisposition(exportBundle.collection?.name, 'json', isAttachment);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', disposition);

    return res.status(200).send(JSON.stringify(exportBundle, null, 2));
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle POST /api/collections/import
 * Imports a collection bundle from devprobe/v1 JSON payload.
 */
async function importCollection(req, res, next) {
  try {
    const payload = req.body;
    const importedData = await collectionTransferService.importCollection(payload);

    return res.status(201).json({
      success: true,
      message: 'Collection imported successfully',
      data: importedData
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle GET /api/collections/:id/docs/markdown
 * Generates and returns structured GitHub-Flavored Markdown API documentation.
 */
async function getCollectionMarkdownDoc(req, res, next) {
  try {
    const { id } = req.params;
    const { collection, markdown } = await documentationService.getCollectionMarkdown(id);

    const isAttachment = req.query.download !== 'false' && req.query.inline !== 'true';
    const disposition = buildContentDisposition(collection.name, 'md', isAttachment);

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', disposition);

    return res.status(200).send(markdown);
  } catch (err) {
    return next(err);
  }
}

/**
 * Handle GET /api/collections/:id/docs/html
 * Generates and returns standalone HTML5 API documentation with embedded CSS and themes.
 */
async function getCollectionHtmlDoc(req, res, next) {
  try {
    const { id } = req.params;
    const { collection, html } = await documentationService.getCollectionHtml(id);

    const isAttachment = req.query.download !== 'false' && req.query.inline !== 'true';
    const disposition = buildContentDisposition(collection.name, 'html', isAttachment);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', disposition);

    return res.status(200).send(html);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
  exportCollection,
  importCollection,
  getCollectionMarkdownDoc,
  getCollectionHtmlDoc,
  buildContentDisposition
};

