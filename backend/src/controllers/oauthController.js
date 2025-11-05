import { google } from 'googleapis';
import admin from 'firebase-admin';
import clerk from '../config/clerk.js';

const db = admin.firestore();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/oauth/google/callback`
);

/**
 * Start Google OAuth flow
 * Frontend redirects user to this endpoint with Clerk session token
 */
export const startGoogleOAuth = async (req, res) => {
  try {
    let userId = req.userId; // From middleware

    // If not from middleware, try query parameter (for redirects)
    if (!userId && req.query.token) {
      try {
        const payload = await clerk.verifyToken(req.query.token);
        userId = payload.sub;
        console.log('OAuth: Verified token from query param, userId:', userId);
      } catch (error) {
        console.error('Failed to verify token from query param:', error.message);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid authentication token',
        });
      }
    }

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User ID not found in auth token',
      });
    }

    // Store userId in session state (in production, use secure session storage)
    // For now, we'll encode it in the state parameter
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');

    // Generate the auth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Get refresh token too
      scope: [
        'https://www.googleapis.com/auth/drive.file', // Access to files user creates
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state, // Include state for security
    });

    console.log('Redirecting to Google OAuth:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('OAuth start error:', error);
    res.status(500).json({
      error: 'OAuth initialization failed',
      message: error.message,
    });
  }
};

/**
 * Google OAuth callback - handles redirect from Google
 * Exchanges auth code for access/refresh tokens and stores in Firestore
 */
export const handleGoogleOAuthCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({
        error: 'Invalid callback',
        message: 'Missing code or state parameter',
      });
    }

    // Decode state to get userId
    let decodedState;
    try {
      decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch (error) {
      console.error('State decode error:', error);
      return res.status(400).json({
        error: 'Invalid state parameter',
        message: 'Could not decode state',
      });
    }

    const userId = decodedState.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'Invalid state',
        message: 'User ID not found in state',
      });
    }

    console.log('OAuth callback for user:', userId);

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    console.log('Got tokens from Google:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expiry_date,
    });

    // Store tokens in Firestore
    await db.collection('users').doc(userId).collection('oauth').doc('google').set(
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        scope: tokens.scope,
        tokenType: tokens.token_type,
        updatedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    );

    console.log('Tokens saved to Firestore for user:', userId);

    // Redirect back to frontend with success
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/chat?oauth=success`);
  } catch (error) {
    console.error('OAuth callback error:', error);

    // Redirect to frontend with error
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/chat?oauth=error&message=${encodeURIComponent(error.message)}`);
  }
};

/**
 * Get stored Google OAuth tokens for authenticated user
 */
export const getStoredGoogleTokens = async (req, res) => {
  try {
    const { userId } = req;

    const tokenDoc = await db
      .collection('users')
      .doc(userId)
      .collection('oauth')
      .doc('google')
      .get();

    if (!tokenDoc.exists) {
      return res.status(404).json({
        error: 'No tokens found',
        message: 'User has not connected Google account',
      });
    }

    const tokenData = tokenDoc.data();

    // Check if token is expired and refresh if needed
    if (tokenData.expiryDate && tokenData.expiryDate < Date.now()) {
      console.log('Token expired, attempting refresh...');

      if (!tokenData.refreshToken) {
        return res.status(401).json({
          error: 'Token expired',
          message: 'Refresh token not available. Please re-authenticate with Google.',
        });
      }

      // Set refresh token and attempt refresh
      oauth2Client.setCredentials({
        refresh_token: tokenData.refreshToken,
      });

      try {
        const { credentials } = await oauth2Client.refreshAccessToken();

        // Update tokens in Firestore
        await db.collection('users').doc(userId).collection('oauth').doc('google').update({
          accessToken: credentials.access_token,
          expiryDate: credentials.expiry_date,
          updatedAt: admin.firestore.Timestamp.now(),
        });

        return res.json({
          success: true,
          accessToken: credentials.access_token,
          expiryDate: credentials.expiry_date,
          message: 'Token refreshed',
        });
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return res.status(401).json({
          error: 'Token refresh failed',
          message: 'Please re-authenticate with Google.',
        });
      }
    }

    res.json({
      success: true,
      accessToken: tokenData.accessToken,
      expiryDate: tokenData.expiryDate,
    });
  } catch (error) {
    console.error('Get tokens error:', error);
    res.status(500).json({
      error: 'Failed to get tokens',
      message: error.message,
    });
  }
};

/**
 * Check if user has Google OAuth connected
 */
export const checkGoogleConnection = async (req, res) => {
  try {
    const { userId } = req;

    const tokenDoc = await db
      .collection('users')
      .doc(userId)
      .collection('oauth')
      .doc('google')
      .get();

    res.json({
      connected: tokenDoc.exists,
      hasRefreshToken: tokenDoc.exists && !!tokenDoc.data().refreshToken,
    });
  } catch (error) {
    console.error('Check connection error:', error);
    res.status(500).json({
      error: 'Failed to check connection',
      message: error.message,
    });
  }
};
