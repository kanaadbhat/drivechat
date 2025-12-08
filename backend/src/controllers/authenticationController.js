// controllers/authenticationController.js
// Handles Clerk authentication and basic token operations

import {
  persistTokensForUser,
  getStoredTokens,
  clearStoredTokens,
  tryFetchClerkProviderTokens,
} from '../utils/googleAuth.js';

/**
 * Try to fetch provider token from Clerk backend.
 * Uses the helper from googleAuth.js which handles arrays and various response shapes.
 */
async function fetchClerkProviderTokens(userId) {
  console.log(
    `\n   📞 [fetchClerkProviderTokens] Attempting to fetch OAuth tokens from Clerk for user: ${userId}`
  );

  // Use the enhanced helper that handles arrays and different response shapes
  const tokenResp = await tryFetchClerkProviderTokens(userId);

  if (tokenResp && tokenResp.access_token) {
    console.log(`     ✅ Successfully fetched tokens from Clerk`);
    return tokenResp;
  }

  console.log(`     ❌ No valid Clerk OAuth tokens found`);
  return null;
}

/**
 * Save Clerk-provided provider tokens server-side.
 * This attempts to get tokens from Clerk, but won't provide refresh tokens
 * with the necessary parameters. Use authorization flow for complete setup.
 */
export const saveClerkProviderTokens = async (req, res) => {
  try {
    const { userId } = req;
    console.log('\n🔐 [saveClerkProviderTokens] Starting for user:', userId);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Try fetch from Clerk backend
    console.log('📥 [saveClerkProviderTokens] Fetching tokens from Clerk...');
    const tokenResp = await fetchClerkProviderTokens(userId);
    console.log(
      '📥 [saveClerkProviderTokens] Clerk response:',
      tokenResp ? '✅ Found tokens' : '❌ No tokens'
    );

    if (!tokenResp || !tokenResp.access_token) {
      console.warn('⚠️  [saveClerkProviderTokens] No valid Clerk tokens found for user:', userId);
      return res.status(404).json({
        error: 'No provider tokens available from Clerk',
        note: 'Clerk tokens do not include refresh tokens. Complete authorization flow to get full access.',
      });
    }

    // Normalize token fields
    const normalized = {
      access_token: tokenResp.access_token || tokenResp.accessToken || tokenResp.token,
      refresh_token:
        tokenResp.refresh_token || tokenResp.refreshToken || tokenResp.refreshTokenValue,
      expires_at:
        tokenResp.expires_at ||
        tokenResp.expiresAt ||
        tokenResp.expiry_date ||
        tokenResp.expiryDate,
    };

    console.log('✅ [saveClerkProviderTokens] Normalized tokens:');
    console.log('   - Access Token:', normalized.access_token ? '✅ Present' : '❌ Missing');
    console.log('   - Refresh Token:', normalized.refresh_token ? '✅ Present' : '❌ Missing');
    console.log(
      '   - Expiry Date:',
      normalized.expires_at ? new Date(normalized.expires_at).toISOString() : '❌ Missing'
    );

    await persistTokensForUser(userId, normalized);
    console.log('💾 [saveClerkProviderTokens] Tokens persisted to Firestore for user:', userId);

    return res.json({
      success: true,
      saved: true,
      tokenInfo: {
        hasAccessToken: !!normalized.access_token,
        hasRefreshToken: !!normalized.refresh_token,
      },
    });
  } catch (err) {
    console.error('❌ [saveClerkProviderTokens] Error:', err.message);
    return res
      .status(500)
      .json({ error: 'Failed to save clerk provider tokens', message: err.message });
  }
};

/**
 * Fallback: save provider tokens posted from the client.
 * Body: { accessToken, refreshToken?, expiryDate? }
 */
export const saveProviderTokensFromClient = async (req, res) => {
  try {
    const { userId } = req;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { accessToken, refreshToken, expiryDate } = req.body;
    if (!accessToken) return res.status(400).json({ error: 'accessToken required' });

    await persistTokensForUser(userId, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiryDate,
    });

    return res.json({ success: true, saved: true });
  } catch (err) {
    console.error('saveProviderTokensFromClient error', err);
    return res.status(500).json({ error: 'Failed to persist tokens', message: err.message });
  }
};

/**
 * Return stored token metadata for client
 */
export const getStoredGoogleTokens = async (req, res) => {
  try {
    const { userId } = req;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const td = await getStoredTokens(userId);
    if (!td) return res.status(404).json({ error: 'No tokens stored' });

    // Don't return refresh token to client for safety; just flag presence
    return res.json({
      accessToken: td.accessToken || td.access_token,
      expiryDate: td.expiryDate || td.expiry_date,
      hasRefreshToken: !!(td.refreshToken || td.refresh_token),
    });
  } catch (err) {
    console.error('getStoredGoogleTokens error', err);
    return res.status(500).json({ error: 'Failed to get tokens', message: err.message });
  }
};

/**
 * Check connection status and whether authorization is needed
 */
export const checkGoogleConnection = async (req, res) => {
  try {
    const { userId } = req;
    console.log('\n🔍 [checkGoogleConnection] Checking for user:', userId);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const td = await getStoredTokens(userId);
    console.log('   - Firestore tokens:', td ? '✅ Found' : '❌ Not found');

    const connected = !!td;
    const hasRefreshToken = !!(td && (td.refreshToken || td.refresh_token));
    const needsAuthorization = !connected || !hasRefreshToken;

    console.log('   - Final status: ' + (connected ? '✅ CONNECTED' : '❌ NOT CONNECTED'));
    console.log('   - Has refresh token:', hasRefreshToken ? '✅' : '❌');
    console.log('   - Needs authorization:', needsAuthorization ? '⚠️  YES' : '❌ NO');

    return res.json({
      connected,
      hasRefreshToken,
      needsAuthorization, // Flag to show if user needs to complete OAuth flow
    });
  } catch (err) {
    console.error('❌ [checkGoogleConnection] Error:', err.message);
    return res.status(500).json({ error: 'Failed to check connection', message: err.message });
  }
};

/**
 * Revoke tokens and clear stored tokens
 */
export const revokeGoogleTokens = async (req, res) => {
  try {
    const { userId } = req;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await clearStoredTokens(userId);
    return res.json({ success: true });
  } catch (err) {
    console.error('revokeGoogleTokens error', err);
    return res.status(500).json({ error: 'Failed to revoke tokens', message: err.message });
  }
};

export default {
  saveClerkProviderTokens,
  saveProviderTokensFromClient,
  getStoredGoogleTokens,
  checkGoogleConnection,
  revokeGoogleTokens,
};
