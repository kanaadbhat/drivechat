import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as fileController from '../controllers/fileController.js';

const router = express.Router();

// All file routes require authentication
router.use(requireAuth);

// Upload file to Google Drive
router.post('/upload', asyncHandler(fileController.uploadFile));

// Get file metadata from Drive
router.get('/:fileId', asyncHandler(fileController.getFileMetadata));

// Download file from Drive
router.get('/:fileId/download', asyncHandler(fileController.downloadFile));

// Delete file from Drive
router.delete('/:fileId', asyncHandler(fileController.deleteFile));

// Get file preview/thumbnail
router.get('/:fileId/preview', asyncHandler(fileController.getFilePreview));

export default router;
