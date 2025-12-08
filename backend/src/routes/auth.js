import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as authController from '../controllers/authController.js';

const router = express.Router();

// Clerk provider tokens (server-side retrieval from Clerk backend)
router.post(
  '/clerk/save-provider-tokens',
  requireAuth,
  asyncHandler(authController.saveClerkProviderTokens)
);

// Client-side token saving (fallback when Clerk doesn't expose tokens)
router.post(
  '/save-provider-tokens',
  requireAuth,
  asyncHandler(authController.saveProviderTokensFromClient)
);

// Get stored tokens
router.get('/google/tokens', requireAuth, asyncHandler(authController.getStoredGoogleTokens));

// Check connection status
router.get('/google/check', requireAuth, asyncHandler(authController.checkGoogleConnection));

// Revoke tokens
router.delete('/google/revoke', requireAuth, asyncHandler(authController.revokeGoogleTokens));

export default router;
