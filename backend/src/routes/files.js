import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as fileController from '../controllers/fileController.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Upload file to Google Drive
router.post(
  '/upload',
  fileController.fileUploadMiddleware,
  asyncHandler(fileController.uploadFile)
);

// Get file metadata from Drive
router.get('/:fileId', asyncHandler(fileController.getFileMetadata));

// Download file from Drive
router.get('/:fileId/download', asyncHandler(fileController.downloadFile));

// Delete file from Drive
router.delete('/:fileId', asyncHandler(fileController.deleteFile));

// Get file preview/thumbnail
router.get('/:fileId/preview', asyncHandler(fileController.getFilePreview));

// Proxy file content (for images/videos) - supports both header and query param auth
router.get(
  '/:fileId/content',
  asyncHandler(async (req, res, next) => {
    // Check for token in query param (for <img> and <video> tags)
    const tokenFromQuery = req.query.token;
    if (tokenFromQuery && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${tokenFromQuery}`;
    }
    next();
  }),
  requireAuth,
  asyncHandler(fileController.proxyFileContent)
);

export default router;
