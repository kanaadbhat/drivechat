// src/utils/googleAuth.js
import { google } from 'googleapis';
import admin from 'firebase-admin';
import clerk from '../config/clerk.js';

const db = admin.firestore();

export async function persistTokensForUser(userId, tokens) {
  console.log(`\n[DEBUG] [persistTokensForUser] START - userId: ${userId}`);
  const update = {};

  const a = tokens.access_token || tokens.accessToken || tokens.token;
  const r = tokens.refresh_token || tokens.refreshToken || tokens.refreshTokenValue;
  const e = tokens.expiry_date || tokens.expiryDate || tokens.expires_at || tokens.expiresAt;

  console.log(`[DEBUG]   💾 Saving tokens:`);
  console.log(
    `[DEBUG]     - Access token: ${a ? '✅ Present (' + a.substring(0, 20) + '...)' : '❌ Missing'}`
  );
  console.log(`[DEBUG]     - Refresh token: ${r ? '✅ Present' : '❌ Missing'}`);
  console.log(`[DEBUG]     - Expiry: ${e ? '✅ ' + new Date(e).toISOString() : '❌ Missing'}`);

  if (a) update.accessToken = a;
  if (r) update.refreshToken = r;
  if (e) update.expiryDate = e;
  update.needsReconsent = !r; // Mark for re-consent if no refresh token

  console.log(`[DEBUG]     - Needs Reconsent: ${update.needsReconsent ? '⚠️ YES' : '❌ NO'}`);

  update.updatedAt = admin.firestore.Timestamp.now();

  console.log(`[DEBUG]   Persisting to Firestore: users/${userId}/oauth/google`);
  await db
    .collection('users')
    .doc(userId)
    .collection('oauth')
    .doc('google')
    .set(update, { merge: true });

  console.log(`[DEBUG]   ✅ Firestore save complete`);
}

export async function getStoredTokens(userId) {
  console.log(`[DEBUG] [getStoredTokens] START - userId: ${userId}`);
  const doc = await db.collection('users').doc(userId).collection('oauth').doc('google').get();

  if (doc.exists) {
    const data = doc.data();
    console.log(`[DEBUG]   ✅ Tokens found in Firestore`);
    console.log(`[DEBUG]     - Access token: ${data.accessToken ? '✅' : '❌'}`);
    console.log(`[DEBUG]     - Refresh token: ${data.refreshToken ? '✅' : '❌'}`);
    console.log(`[DEBUG]     - Needs reconsent: ${data.needsReconsent ? '⚠️ YES' : '❌ NO'}`);
    return data;
  }

  console.log(`[DEBUG]   ❌ No tokens found in Firestore`);
  return null;
}

export async function clearStoredTokens(userId) {
  console.log(`[DEBUG] [clearStoredTokens] START - userId: ${userId}`);
  await db.collection('users').doc(userId).collection('oauth').doc('google').delete();
  console.log(`[DEBUG]   ✅ Tokens cleared from Firestore`);
}

export async function tryFetchClerkProviderTokens(userId) {
  console.log(`[DEBUG] [tryFetchClerkProviderTokens] START - userId: ${userId}`);
  if (!clerk || !clerk.users) {
    console.log(`[DEBUG]   ❌ Clerk SDK not available`);
    return null;
  }

  // Discover actual provider ID from user's external accounts
  let providerId = 'oauth_google'; // Default fallback
  try {
    console.log(`[DEBUG]   Discovering provider ID from Clerk...`);
    const user = await clerk.users.getUser(userId);
    const ext = user?.externalAccounts || user?.external_accounts || [];
    if (Array.isArray(ext) && ext.length > 0) {
      const googleAccount = ext.find((x) => x.provider && x.provider.includes('google'));
      if (googleAccount) {
        providerId = googleAccount.provider;
        console.log(`[DEBUG]     ✅ Found Google provider: ${providerId}`);
      }
    }
  } catch (e) {
    console.log(`[DEBUG]     ⚠️  Provider discovery error: ${e.message}`);
    // Ignore discovery errors, use fallback
  }

  // Try canonical Clerk API call
  try {
    console.log(
      `[DEBUG]   Calling Clerk.users.getUserOauthAccessToken with provider: ${providerId}`
    );

    // Clerk API call - the method signature is: getUserOauthAccessToken(userId, provider)
    // NOT getUserOauthAccessToken({ userId, provider })
    const resp = await clerk.users.getUserOauthAccessToken(userId, providerId);

    if (!resp) {
      console.log(`[DEBUG]   ❌ Clerk returned no response`);
      return null;
    }

    console.log(`[DEBUG]   ✅ Clerk response received`);
    console.log(`[DEBUG]     Response type: ${Array.isArray(resp) ? 'array' : typeof resp}`);
    console.log(
      `[DEBUG]     Response keys: ${typeof resp === 'object' ? Object.keys(resp).join(', ') : 'N/A'}`
    );

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
        console.log(`[DEBUG]     ✅ Extracted tokens from array item`);
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
        console.log(`[DEBUG]     ✅ Extracted tokens from object`);
        console.log(`[DEBUG]       - Access token: ${result.access_token ? '✅' : '❌'}`);
        console.log(`[DEBUG]       - Refresh token: ${result.refresh_token ? '✅' : '❌'}`);
        return result;
      }
    }

    console.log(`[DEBUG]   ❌ No access token found in response`);
    console.log(`[DEBUG]   Raw response:`, JSON.stringify(resp, null, 2));
    return null;
  } catch (err) {
    console.log(`[DEBUG]   ❌ Clerk API error: ${err.message}`);
    console.log(`[DEBUG]   Error details:`, err);
    // Clerk API call failed
    return null;
  }
}

export async function getOAuthClientForUser(userId) {
  console.log(`\n[DEBUG] [getOAuthClientForUser] START - userId: ${userId}`);
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
    console.log(`[DEBUG]   ❌ No access token available`);
    throw new Error('No Google tokens for user. Please connect Google Drive.');
  }

  console.log(`[DEBUG]   Creating OAuth2 client...`);
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

  console.log(`[DEBUG]   ✅ OAuth client configured`);
  console.log(`[DEBUG]     - Access token: ${tokenData.accessToken ? '✅' : '❌'}`);
  console.log(`[DEBUG]     - Refresh token: ${tokenData.refreshToken ? '✅' : '❌'}`);
  console.log(
    `[DEBUG]     - Expiry: ${tokenData.expiryDate ? new Date(tokenData.expiryDate).toISOString() : '❌'}`
  );

  // Auto-persist refreshed tokens
  oauth2Client.on('tokens', async (tokens) => {
    try {
      await persistTokensForUser(userId, tokens);
      console.log('✅ Auto-refreshed tokens persisted for user:', userId);
    } catch (e) {
      console.error('Failed to persist refreshed tokens:', e);
    }
  });

  return oauth2Client;
}
