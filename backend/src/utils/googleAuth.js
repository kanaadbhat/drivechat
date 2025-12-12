// src/utils/googleAuth.js
import { google } from 'googleapis';
import admin from 'firebase-admin';
import clerk from '../config/clerk.js';

const db = admin.firestore();

export async function persistTokensForUser(userId, tokens) {
  const update = {};

  const a = tokens.access_token || tokens.accessToken || tokens.token;
  const r = tokens.refresh_token || tokens.refreshToken || tokens.refreshTokenValue;
  const e = tokens.expiry_date || tokens.expiryDate || tokens.expires_at || tokens.expiresAt;

  if (a) update.accessToken = a;
  if (r) update.refreshToken = r;
  if (e) update.expiryDate = e;
  update.needsReconsent = !r; // Mark for re-consent if no refresh token

  update.updatedAt = admin.firestore.Timestamp.now();
  await db
    .collection('users')
    .doc(userId)
    .collection('oauth')
    .doc('google')
    .set(update, { merge: true });

  console.info(
    `[googleAuth] persisted tokens for ${userId} (needsReconsent=${update.needsReconsent})`
  );
  try {
    await db.collection('users').doc(userId).set(
      {
        driveConnected: true,
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.debug('[googleAuth] updated user driveConnected flag');
  } catch (err) {
    console.warn('[googleAuth] failed to update user driveConnected flag:', err.message);
  }
}

export async function getStoredTokens(userId) {
  const doc = await db.collection('users').doc(userId).collection('oauth').doc('google').get();

  if (doc.exists) {
    const data = doc.data();
    console.info('[googleAuth] tokens found', {
      userId,
      hasAccessToken: Boolean(data.accessToken),
      hasRefreshToken: Boolean(data.refreshToken),
      needsReconsent: Boolean(data.needsReconsent),
    });
    return data;
  }

  console.info('[googleAuth] no tokens found', { userId });
  return null;
}

export async function clearStoredTokens(userId) {
  console.log(`[DEBUG] [clearStoredTokens] START - userId: ${userId}`);
  await db.collection('users').doc(userId).collection('oauth').doc('google').delete();
  console.log(`[DEBUG]   ✅ Tokens cleared from Firestore`);
}

export async function tryFetchClerkProviderTokens(userId) {
  if (!clerk || !clerk.users) {
    console.debug('[googleAuth] Clerk SDK not available');
    return null;
  }

  // Discover actual provider ID from user's external accounts
  let providerId = 'oauth_google'; // Default fallback
  try {
    const user = await clerk.users.getUser(userId);
    const ext = user?.externalAccounts || user?.external_accounts || [];
    if (Array.isArray(ext) && ext.length > 0) {
      const googleAccount = ext.find((x) => x.provider && x.provider.includes('google'));
      if (googleAccount) {
        providerId = googleAccount.provider;
      }
    }
  } catch (e) {
    console.debug('[googleAuth] provider discovery error, using default providerId', {
      userId,
      err: e?.message,
    });
  }

  try {
    console.debug('[googleAuth] calling Clerk API for oauth token', { userId, providerId });

    // Clerk API call - the method signature is: getUserOauthAccessToken(userId, provider)
    // NOT getUserOauthAccessToken({ userId, provider })
    const resp = await clerk.users.getUserOauthAccessToken(userId, providerId);

    if (!resp) {
      console.debug('[googleAuth] clerk returned no response', { userId, providerId });
      return null;
    }

    // Handle ARRAY response: [ { provider: "oauth_google", token: "..." } ]
    if (Array.isArray(resp) && resp.length > 0) {
      console.log(`[DEBUG]     Processing array response (${resp.length} items)`);
      const item = resp.find((x) => x.token || x.access_token || x.accessToken);
      if (item) {
        const result = {
          access_token: item.token || item.access_token || item.accessToken,
          refresh_token: item.refresh_token || item.refreshToken || null,
          expires_at: item.expires_at || item.expiry_date || item.expiryDate || null,
        };
        console.debug('[googleAuth] extracted tokens from clerk array response', { userId });
        return result;
      }
    }

    // Handle OBJECT response: { token: "...", access_token: "...", ... }
    if (typeof resp === 'object' && !Array.isArray(resp)) {
      console.log(`[DEBUG]     Processing object response`);
      console.log(`[DEBUG]     Available fields: ${Object.keys(resp).join(', ')}`);

      const accessToken = resp.token || resp.access_token || resp.accessToken;
      if (accessToken) {
        const result = {
          access_token: accessToken,
          refresh_token: resp.refresh_token || resp.refreshToken || null,
          expires_at: resp.expires_at || resp.expiry_date || resp.expiryDate || null,
        };
        console.debug('[googleAuth] extracted tokens from clerk object response', {
          userId,
          hasRefresh: Boolean(result.refresh_token),
        });
        return result;
      }
    }

    console.debug('[googleAuth] no access token in clerk response', {
      userId,
      raw: typeof resp === 'object' ? Object.keys(resp) : typeof resp,
    });
    return null;
  } catch (err) {
    console.warn('[googleAuth] clerk api error', { userId, message: err?.message });
    // Clerk API call failed
    return null;
  }
}

export async function getOAuthClientForUser(userId) {
  let tokenData = await getStoredTokens(userId);

  if (!tokenData) {
    console.log(`[DEBUG]   No stored tokens, trying Clerk...`);
    const t = await tryFetchClerkProviderTokens(userId);
    if (t) {
      console.log(`[DEBUG]   ✅ Got tokens from Clerk, persisting...`);
      await persistTokensForUser(userId, t);
      tokenData = await getStoredTokens(userId);
    }
  }

  if (!tokenData || !tokenData.accessToken) {
    console.info('[googleAuth] no access token available for user', { userId });
    throw new Error('No Google tokens for user. Please connect Google Drive.');
  }

  console.debug('[googleAuth] creating OAuth2 client', { userId });
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.BACKEND_URL}/api/oauth/google/callback`
  );

  // Set credentials - Google expects snake_case but Firestore stores camelCase
  oauth2Client.setCredentials({
    access_token: tokenData.accessToken,
    refresh_token: tokenData.refreshToken,
    expiry_date: tokenData.expiryDate,
  });

  console.info('[googleAuth] oauth client configured', {
    userId,
    hasRefreshToken: Boolean(tokenData.refreshToken),
  });

  // Auto-persist refreshed tokens
  oauth2Client.on('tokens', async (tokens) => {
    try {
      await persistTokensForUser(userId, tokens);
      console.info('[googleAuth] auto-refreshed tokens persisted', { userId });
    } catch (e) {
      console.warn('[googleAuth] failed to persist refreshed tokens', {
        userId,
        message: e?.message,
      });
    }
  });

  return oauth2Client;
}
