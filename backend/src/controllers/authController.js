import { getAuthUrl, getTokensFromCode, oauth2Client } from '../config/google-oauth.js';

/**
 * Get Google OAuth URL
 */
export const getGoogleAuthUrl = async (req, res) => {
  const authUrl = getAuthUrl();
  res.json({ url: authUrl });
};

/**
 * Handle Google OAuth callback
 */
export const handleGoogleCallback = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({
        error: 'Missing authorization code',
      });
    }

    // Exchange code for tokens
    const tokens = await getTokensFromCode(code);

    // Redirect to frontend with tokens (or store in session)
    // In production, you'd want to handle this more securely
    res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback?tokens=${encodeURIComponent(JSON.stringify(tokens))}`
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      error: 'OAuth callback failed',
      message: error.message,
    });
  }
};

/**
 * Exchange authorization code for tokens
 */
export const exchangeCodeForTokens = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'Missing authorization code',
      });
    }

    const tokens = await getTokensFromCode(code);

    res.json({ tokens });
  } catch (error) {
    console.error('Token exchange error:', error);
    res.status(500).json({
      error: 'Token exchange failed',
      message: error.message,
    });
  }
};

/**
 * Refresh Google OAuth tokens
 */
export const refreshGoogleTokens = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Missing refresh token',
      });
    }

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    res.json({ tokens: credentials });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      message: error.message,
    });
  }
};
