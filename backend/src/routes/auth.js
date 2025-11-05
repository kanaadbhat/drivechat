import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as authController from '../controllers/authController.js';

const router = express.Router();

// OAuth routes
router.get('/google/url', asyncHandler(authController.getGoogleAuthUrl));
router.get('/google/callback', asyncHandler(authController.handleGoogleCallback));
router.post('/google/tokens', asyncHandler(authController.exchangeCodeForTokens));
router.post('/google/refresh', asyncHandler(authController.refreshGoogleTokens));

export default router;
