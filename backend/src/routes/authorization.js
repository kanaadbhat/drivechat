// routes/authorization.js
// Routes for Google Drive OAuth authorization flow

import express from 'express';
import { requireAuthFlexible } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  startGoogleDriveAuth,
  handleGoogleDriveCallback,
  startReauthorization,
  handleReauthorizationCallback,
} from '../controllers/authorizationController.js';

const router = express.Router();

// Main Google Drive authorization flow - requires JWT from query string or header
router.get('/google/start', requireAuthFlexible, asyncHandler(startGoogleDriveAuth));

// Google OAuth callback - public route (Google redirects here)
router.get('/google/callback', handleGoogleDriveCallback);

// Re-authorization flow - when refresh token is missing or expired
router.get('/google/reauth', requireAuthFlexible, asyncHandler(startReauthorization));

// Re-authorization callback
router.get('/google/reauth/callback', handleReauthorizationCallback);

export default router;
