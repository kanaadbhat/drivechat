import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  userProfileLimiter,
  deviceLimiter,
  sensitiveActionLimiter,
} from '../middleware/rateLimiter.js';
import * as userController from '../controllers/userController.js';

const router = express.Router();

// All user routes require authentication
router.use(requireAuth);

// Get current user profile
router.get('/me', userProfileLimiter, asyncHandler(userController.getCurrentUser));

// Update user profile
router.patch('/me', userProfileLimiter, asyncHandler(userController.updateUser));

// Get user devices
router.get('/devices', userProfileLimiter, asyncHandler(userController.getDevices));

// Create/register a device
router.post('/devices', deviceLimiter, asyncHandler(userController.createDevice));

// Update device (rename)
router.patch('/devices/:deviceId', deviceLimiter, asyncHandler(userController.updateDevice));

// Delete device
router.delete('/devices/:deviceId', deviceLimiter, asyncHandler(userController.deleteDevice));

// Get user analytics
router.get('/analytics', userProfileLimiter, asyncHandler(userController.getAnalytics));

// Delete user account
router.delete('/me', sensitiveActionLimiter, asyncHandler(userController.deleteAccount));

export default router;
