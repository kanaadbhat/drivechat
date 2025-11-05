import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as authController from '../controllers/authController.js';

const router = express.Router();

// Get Google OAuth token for current user
router.get('/google-token', requireAuth, asyncHandler(authController.getGoogleToken));

export default router;
