// controllers/authenticationController.js
// Handles Clerk authentication and basic token operations

import { asyncHandler } from '../utils/asyncHandler.js';
import { firestoreHelpers } from '../config/firebase.js';

/**
 * All Drive tokens are handled client-side (GIS). Server no longer stores or proxies tokens.
 * These endpoints are retained for backward compatibility but now respond with a clear message.
 */
export const saveClerkProviderTokens = asyncHandler(async (req, res) => {
  const { userId } = req;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  return res.status(400).json({
    error: 'Drive tokens are managed client-side; server storage is disabled.',
  });
});

export const saveProviderTokensFromClient = asyncHandler(async (req, res) => {
  const { userId } = req;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  return res.status(400).json({
    error: 'Drive tokens are managed client-side; server storage is disabled.',
  });
});

export const getStoredGoogleTokens = asyncHandler(async (req, res) => {
  const { userId } = req;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  return res.status(404).json({
    error: 'No tokens stored. Drive access is client-side only.',
  });
});

export const checkGoogleConnection = asyncHandler(async (req, res) => {
  const { userId } = req;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // Clear any legacy metadata and mark disconnected
  try {
    await firestoreHelpers.setUserDoc(userId, {
      driveConnected: false,
      driveProviderTokens: null,
      lastActive: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[checkGoogleConnection] Failed to update user doc:', err.message);
  }

  return res.json({
    connected: false,
    hasRefreshToken: false,
    needsAuthorization: false, // client handles authorization directly
    driveConnected: false,
  });
});

export const revokeGoogleTokens = asyncHandler(async (req, res) => {
  const { userId } = req;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await firestoreHelpers.setUserDoc(userId, {
      driveProviderTokens: null,
      driveConnected: false,
    });
  } catch (err) {
    console.error('[revokeGoogleTokens] Failed to clear user doc:', err.message);
  }

  return res.json({ success: true });
});

export default {
  saveClerkProviderTokens,
  saveProviderTokensFromClient,
  getStoredGoogleTokens,
  checkGoogleConnection,
  revokeGoogleTokens,
};
