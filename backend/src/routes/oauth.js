import express from 'express';
import {
  startGoogleOAuth,
  handleGoogleOAuthCallback,
  getStoredGoogleTokens,
  checkGoogleConnection,
} from '../controllers/oauthController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Start OAuth flow - user redirects to this
// No middleware - handles token from query parameter instead
router.get('/google/auth', startGoogleOAuth);

// Google OAuth callback - public route (Google redirects here)
router.get('/google/callback', handleGoogleOAuthCallback);

// Get stored tokens for authenticated user
router.get('/google/tokens', requireAuth, getStoredGoogleTokens);

// Check if user has Google connected
router.get('/google/check', requireAuth, checkGoogleConnection);

export default router;
