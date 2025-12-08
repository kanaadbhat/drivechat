import express from 'express';
import { requireAuthFlexible } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  startGoogleOAuth,
  handleGoogleOAuthCallback,
  startGoogleReconsent,
  handleGoogleReconsent,
} from '../controllers/authController.js';

const router = express.Router();

// Fallback OAuth flow - only if Clerk doesn't handle Drive scopes
// Use flexible auth to accept token from query string (for frontend redirects)
router.get('/google/auth', requireAuthFlexible, asyncHandler(startGoogleOAuth));

// Google OAuth callback - public route (Google redirects here)
router.get('/google/callback', handleGoogleOAuthCallback);

// Re-consent flow - prompt user to re-authorize with offline access
router.get('/google/reconsent', requireAuthFlexible, asyncHandler(startGoogleReconsent));

// Re-consent callback - handle Google response and persist refresh token
router.get('/google/reconsent/callback', handleGoogleReconsent);

export default router;
