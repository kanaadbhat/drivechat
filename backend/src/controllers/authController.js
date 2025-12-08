// controllers/authController.js
import { google } from 'googleapis';
import clerk from '../config/clerk.js';
import admin from 'firebase-admin';
import {
  persistTokensForUser,
  getStoredTokens,
  // getOAuthClientForUser,
  // clearStoredTokens,
  tryFetchClerkProviderTokens,
} from '../utils/googleAuth.js';

const db = admin.firestore();

// Build a standard OAuth2 client (used for server-side start/callback fallback)
function buildOauth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/google/callback`
  );
}

/**
 * Try to fetch provider token from Clerk backend.
 * Uses the helper from googleAuth.js which handles arrays and various response shapes.
 */
async function fetchClerkProviderTokens(userId) {
  console.log(
    `\n   📞 [fetchClerkProviderTokens] Attempting to fetch OAuth tokens from Clerk for user: ${userId}`
  );

  // First, let's see what OAuth connections the user has
  try {
    const user = await clerk.users.getUser(userId);
    const oauthAccounts =
      user.externalAccounts?.filter((acc) => acc.provider?.includes('oauth')) || [];
    console.log(
      `     📊 User OAuth connections:`,
      oauthAccounts.map((o) => ({ provider: o.provider, id: o.id }))
    );
  } catch (userErr) {
    console.log('     ⚠️  Could not fetch user OAuth connections:', userErr.message);
  }

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
 * Save Clerk-provided provider tokens server-side (recommended flow).
 * Calls Clerk backend to get OAuth tokens, normalizes and persists them using helper.
 */
export const saveClerkProviderTokens = async (req, res) => {
  try {
    const { userId } = req;
    console.log('\n🔐 [saveClerkProviderTokens] Starting for user:', userId);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // First, let's see what OAuth connections the user has
    try {
      const user = await clerk.users.getUser(userId);
      const oauthConnections =
        user.externalAccounts?.filter((acc) => acc.provider?.startsWith('oauth')) || [];
      console.log(
        `   📊 User has ${oauthConnections.length} OAuth connections:`,
        oauthConnections.map((o) => ({ provider: o.provider, id: o.id }))
      );
    } catch (userErr) {
      console.log('   ⚠️  Could not fetch user OAuth connections:', userErr.message);
    }

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
        note: 'Ensure the Google social connection is enabled in Clerk and that the requested scopes include Drive. If Clerk does not expose tokens in your plan, use the client->server flow.',
      });
    }

    // Normalize token fields: some Clerk shapes use access_token, some use accessToken etc.
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
 * Use this when Clerk doesn't expose tokens to backend in your setup.
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
 * Start server-side OAuth to request Drive scopes (fallback)
 */
export const startGoogleOAuth = async (req, res) => {
  try {
    const { userId } = req;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const oauth2Client = buildOauth2Client();
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state,
    });

    return res.redirect(url);
  } catch (err) {
    console.error('startGoogleOAuth error', err);
    return res.status(500).json({ error: 'Failed to start OAuth', message: err.message });
  }
};

/**
 * OAuth callback handler (fallback)
 */
export const handleGoogleOAuthCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).json({ error: 'Missing code or state' });

    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch (e) {
      return res.status(400).json({ error: 'Invalid state', e });
    }

    const userId = decoded.userId;
    if (!userId) return res.status(400).json({ error: 'UserId missing in state' });

    const oauth2Client = buildOauth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens || !tokens.access_token) {
      return res.status(500).json({ error: 'Failed to obtain tokens from Google' });
    }

    await persistTokensForUser(userId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || tokens.expiryDate,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/chat?oauth=success`);
  } catch (err) {
    console.error('handleGoogleOAuthCallback error', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(
      `${frontendUrl}/chat?oauth=error&message=${encodeURIComponent(err.message)}`
    );
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
 * Check connection boolean
 */
export const checkGoogleConnection = async (req, res) => {
  try {
    const { userId } = req;
    console.log('\n🔍 [checkGoogleConnection] Checking for user:', userId);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let td = await getStoredTokens(userId);
    console.log('   - Firestore tokens:', td ? '✅ Found' : '❌ Not found');

    // If no stored tokens, try to get from Clerk (auto-save on first check)
    if (!td) {
      console.log('   - No Firestore tokens, attempting Clerk auto-save...');
      const clerkTokens = await fetchClerkProviderTokens(userId);
      console.log('   - Clerk tokens:', clerkTokens ? '✅ Found' : '❌ Not found');

      if (clerkTokens && clerkTokens.access_token) {
        console.log('   - 💾 Auto-saving Clerk tokens to Firestore...');
        const normalized = {
          access_token: clerkTokens.access_token || clerkTokens.accessToken || clerkTokens.token,
          refresh_token:
            clerkTokens.refresh_token || clerkTokens.refreshToken || clerkTokens.refreshTokenValue,
          expires_at:
            clerkTokens.expires_at ||
            clerkTokens.expiresAt ||
            clerkTokens.expiry_date ||
            clerkTokens.expiryDate,
        };
        console.log('     - Access Token:', normalized.access_token ? '✅' : '❌');
        console.log('     - Refresh Token:', normalized.refresh_token ? '✅' : '❌');
        await persistTokensForUser(userId, normalized);
        td = await getStoredTokens(userId);
        console.log('     - ✅ Saved to Firestore');
      }
    }

    const connected = !!td;
    const hasRefreshToken = !!(td && (td.refreshToken || td.refresh_token));
    const needsReconsent = !!(td && (td.needsReconsent || td.needs_reconsent));

    console.log('   - Final status: ' + (connected ? '✅ CONNECTED' : '❌ NOT CONNECTED'));
    console.log('   - Has refresh token:', hasRefreshToken ? '✅' : '❌');
    console.log('   - Needs reconsent:', needsReconsent ? '⚠️  YES' : '❌ NO');

    return res.json({
      connected,
      hasRefreshToken,
      needsReconsent,
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

    const td = await getStoredTokens(userId);
    if (!td || !td.accessToken) return res.status(404).json({ error: 'No tokens to revoke' });

    const oauth2Client = buildOauth2Client();
    try {
      await oauth2Client.revokeToken(td.accessToken || td.access_token);
    } catch (revokeErr) {
      console.warn('revoke token warning', revokeErr?.message || revokeErr);
    }

    await db.collection('users').doc(userId).collection('oauth').doc('google').delete();
    return res.json({ success: true });
  } catch (err) {
    console.error('revokeGoogleTokens error', err);
    return res.status(500).json({ error: 'Failed to revoke tokens', message: err.message });
  }
};

/**
 * Start Google re-consent flow (when refresh token is missing)
 * Redirects to Google with prompt=consent to force consent screen and get refresh token
 */
export const startGoogleReconsent = async (req, res) => {
  try {
    const { userId } = req;
    console.log('\n🔄 [startGoogleReconsent] Starting for user:', userId);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Create OAuth2 client with reconsent callback URL
    const reconsentOAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/oauth/google/reconsent/callback`
    );

    const state = Buffer.from(JSON.stringify({ userId, isReconsent: true })).toString('base64');

    const url = reconsentOAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Force consent screen
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state,
    });

    console.log('   - Redirecting to Google auth URL...');
    return res.redirect(url);
  } catch (err) {
    console.error('❌ [startGoogleReconsent] Error:', err.message);
    return res.status(500).json({ error: 'Failed to start re-consent', message: err.message });
  }
};

/**
 * Handle Google re-consent callback
 * Persists tokens (including refresh token) after re-consent
 */
export const handleGoogleReconsent = async (req, res) => {
  try {
    const { code, state } = req.query;
    console.log('\n🔄 [handleGoogleReconsent] Received callback');
    if (!code || !state) {
      console.error('   ❌ Missing code or state');
      return res.status(400).json({ error: 'Missing code or state' });
    }

    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch (e) {
      console.error('   ❌ Invalid state:', e.message);
      return res.status(400).json({ error: 'Invalid state' });
    }

    const userId = decoded.userId;
    if (!userId) {
      console.error('   ❌ UserId missing in state');
      return res.status(400).json({ error: 'UserId missing in state' });
    }

    console.log('   - Exchanging code for tokens for user:', userId);

    // Create OAuth2 client with reconsent callback URL
    const reconsentOAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/oauth/google/reconsent/callback`
    );

    const { tokens } = await reconsentOAuth2Client.getToken(code);

    if (!tokens || !tokens.access_token) {
      console.error('   ❌ Failed to obtain tokens from Google');
      return res.status(500).json({ error: 'Failed to obtain tokens from Google' });
    }

    console.log('   - ✅ Received tokens from Google');
    console.log('     - Access Token:', tokens.access_token ? '✅' : '❌');
    console.log('     - Refresh Token:', tokens.refresh_token ? '✅' : '❌');

    await persistTokensForUser(userId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || tokens.expiryDate,
    });

    console.log('   - 💾 Tokens persisted to Firestore');

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/chat?reconsent=success`);
  } catch (err) {
    console.error('❌ [handleGoogleReconsent] Error:', err.message);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(
      `${frontendUrl}/chat?reconsent=error&message=${encodeURIComponent(err.message)}`
    );
  }
};

export default {
  saveClerkProviderTokens,
  saveProviderTokensFromClient,
  startGoogleOAuth,
  handleGoogleOAuthCallback,
  getStoredGoogleTokens,
  checkGoogleConnection,
  revokeGoogleTokens,
  startGoogleReconsent,
  handleGoogleReconsent,
};
