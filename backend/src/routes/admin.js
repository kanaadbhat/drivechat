import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();

// All admin routes require authentication
router.use(requireAuth);

// Manually trigger cleanup
router.post('/cleanup', asyncHandler(adminController.triggerCleanup));

// Get cleanup stats
router.get('/cleanup/stats', asyncHandler(adminController.getCleanupStats));

// Get system stats
router.get('/stats', asyncHandler(adminController.getSystemStats));

export default router;
