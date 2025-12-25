import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as userController from '../controllers/userController.js';

const router = express.Router();

// All user routes require authentication
router.use(requireAuth);

// Get current user profile
router.get('/me', asyncHandler(userController.getCurrentUser));

// Update user profile
router.patch('/me', asyncHandler(userController.updateUser));

// Get user devices
router.get('/devices', asyncHandler(userController.getDevices));

// Create/register a device
router.post('/devices', asyncHandler(userController.createDevice));

// Update device (rename)
router.patch('/devices/:deviceId', asyncHandler(userController.updateDevice));

// Delete device
router.delete('/devices/:deviceId', asyncHandler(userController.deleteDevice));

// Get user analytics
router.get('/analytics', asyncHandler(userController.getAnalytics));

// Delete user account
router.delete('/me', asyncHandler(userController.deleteAccount));

export default router;
