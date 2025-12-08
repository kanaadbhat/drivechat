// controllers/authorizationController.js
// Handles Google Drive OAuth authorization flow to obtain refresh tokens

import { google } from 'googleapis';
import { persistTokensForUser } from '../utils/googleAuth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Build OAuth2 client for Google Drive authorization
 */
function buildOauth2Client(callbackPath = '/callback') {
  const redirectUri =
    callbackPath === '/reauth/callback'
      ? process.env.GOOGLE_OAUTH_REAUTH_REDIRECT_URI
      : process.env.GOOGLE_OAUTH_REDIRECT_URI ||
        `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/authorization/google${callbackPath}`;

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

/**
 * Start Google Drive authorization flow
 * This is the main flow to get refresh tokens with proper OAuth parameters
 */
export const startGoogleDriveAuth = asyncHandler(async (req, res) => {
  const { userId } = req;
  const userEmail = req.query.email; // Get user's email from Clerk session
  console.log('\n🔐 [startGoogleDriveAuth] Starting authorization for user:', userId);
  console.log('   - User email:', userEmail || '(not provided)');
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const oauth2Client = buildOauth2Client();
  const state = Buffer.from(JSON.stringify({ userId, userEmail })).toString('base64');

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required for refresh token
    prompt: 'consent', // Force consent screen to ensure refresh token
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
    // If user email is provided, hint Google which account to use
    ...(userEmail && { login_hint: userEmail }),
  });

  console.log('   - Redirecting to Google authorization URL...');
  return res.redirect(url);
});

/**
 * Handle Google OAuth callback after user grants permission
 */
export const handleGoogleDriveCallback = asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;
  console.log('\n✅ [handleGoogleDriveCallback] Received callback');

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Handle user denial
  if (error) {
    console.log('   ❌ User denied authorization:', error);
    return res.redirect(`${frontendUrl}/authorize?error=access_denied`);
  }

  if (!code || !state) {
    console.error('   ❌ Missing code or state');
    return res.redirect(`${frontendUrl}/authorize?error=missing_params`);
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
  } catch (e) {
    console.error('   ❌ Invalid state:', e.message);
    return res.redirect(`${frontendUrl}/authorize?error=invalid_state`);
  }

  const userId = decoded.userId;
  if (!userId) {
    console.error('   ❌ UserId missing in state');
    return res.redirect(`${frontendUrl}/authorize?error=missing_user`);
  }

  console.log('   - Exchanging code for tokens for user:', userId);

  const oauth2Client = buildOauth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens || !tokens.access_token) {
    console.error('   ❌ Failed to obtain tokens from Google');
    return res.redirect(`${frontendUrl}/authorize?error=token_exchange_failed`);
  }

  console.log('   - ✅ Received tokens from Google');
  console.log('     - Access Token:', tokens.access_token ? '✅' : '❌');
  console.log('     - Refresh Token:', tokens.refresh_token ? '✅' : '❌');

  if (!tokens.refresh_token) {
    console.warn('   ⚠️  No refresh token received - user may have already authorized');
  }

  await persistTokensForUser(userId, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date || tokens.expiryDate,
  });

  console.log('   - 💾 Tokens persisted to Firestore');

  return res.redirect(`${frontendUrl}/authorize?success=true`);
});

/**
 * Start re-authorization flow (when refresh token is missing or expired)
 * This forces the consent screen to appear again
 */
export const startReauthorization = asyncHandler(async (req, res) => {
  const { userId } = req;
  const userEmail = req.query.email; // Get user's email from Clerk session
  console.log('\n🔄 [startReauthorization] Starting for user:', userId);
  console.log('   - User email:', userEmail || '(not provided)');
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const oauth2Client = buildOauth2Client('/reauth/callback');
  const state = Buffer.from(JSON.stringify({ userId, isReauth: true, userEmail })).toString(
    'base64'
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force consent screen
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
    // If user email is provided, hint Google which account to use
    ...(userEmail && { login_hint: userEmail }),
  });

  console.log('   - Redirecting to Google re-authorization URL...');
  return res.redirect(url);
});

/**
 * Handle re-authorization callback
 */
export const handleReauthorizationCallback = asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;
  console.log('\n🔄 [handleReauthorizationCallback] Received callback');

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Handle user denial
  if (error) {
    console.log('   ❌ User denied re-authorization:', error);
    return res.redirect(`${frontendUrl}/authorize?error=access_denied&reauth=true`);
  }

  if (!code || !state) {
    console.error('   ❌ Missing code or state');
    return res.redirect(`${frontendUrl}/authorize?error=missing_params&reauth=true`);
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
  } catch (e) {
    console.error('   ❌ Invalid state:', e.message);
    return res.redirect(`${frontendUrl}/authorize?error=invalid_state&reauth=true`);
  }

  const userId = decoded.userId;
  if (!userId) {
    console.error('   ❌ UserId missing in state');
    return res.redirect(`${frontendUrl}/authorize?error=missing_user&reauth=true`);
  }

  console.log('   - Exchanging code for tokens for user:', userId);

  const oauth2Client = buildOauth2Client('/reauth/callback');
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens || !tokens.access_token) {
    console.error('   ❌ Failed to obtain tokens from Google');
    return res.redirect(`${frontendUrl}/authorize?error=token_exchange_failed&reauth=true`);
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

  return res.redirect(`${frontendUrl}/authorize?success=true&reauth=true`);
});

export default {
  startGoogleDriveAuth,
  handleGoogleDriveCallback,
  startReauthorization,
  handleReauthorizationCallback,
};
