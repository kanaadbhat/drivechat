// routes/authentication.js
// Routes for Clerk authentication and basic token operations

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as authenticationController from '../controllers/authenticationController.js';

const router = express.Router();

// Clerk provider tokens (server-side retrieval from Clerk backend)
// Note: This may not provide refresh tokens with proper parameters
router.post(
  '/clerk/save-tokens',
  requireAuth,
  asyncHandler(authenticationController.saveClerkProviderTokens)
);

// Client-side token saving (fallback)
router.post(
  '/save-tokens',
  requireAuth,
  asyncHandler(authenticationController.saveProviderTokensFromClient)
);

// Get stored tokens metadata
router.get(
  '/google/tokens',
  requireAuth,
  asyncHandler(authenticationController.getStoredGoogleTokens)
);

// Check connection status and whether authorization is needed
router.get(
  '/google/check',
  requireAuth,
  asyncHandler(authenticationController.checkGoogleConnection)
);

// Revoke and clear tokens
router.delete(
  '/google/revoke',
  requireAuth,
  asyncHandler(authenticationController.revokeGoogleTokens)
);

export default router;
