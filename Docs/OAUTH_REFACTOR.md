# OAuth Architecture Refactor Summary

## Overview

Separated authentication (Clerk) from authorization (Google Drive OAuth) into two distinct flows with dedicated controllers, routes, and UI.

## Key Changes

### Backend Structure

#### 1. **New Controllers**

- **`authenticationController.js`** - Clerk authentication operations
  - `saveClerkProviderTokens()` - Try to get tokens from Clerk
  - `checkGoogleConnection()` - Check if user has valid tokens (returns `needsAuthorization` flag)
  - `getStoredGoogleTokens()` - Retrieve token metadata
  - `revokeGoogleTokens()` - Clear tokens from Firestore
- **`authorizationController.js`** - Google Drive OAuth with proper parameters
  - `startGoogleDriveAuth()` - Start OAuth with `access_type=offline` and `prompt=consent`
  - `handleGoogleDriveCallback()` - Process Google's callback and persist tokens
  - `startReauthorization()` - Force re-consent when refresh token missing
  - `handleReauthorizationCallback()` - Process re-auth callback

#### 2. **New Routes**

- **`/api/authentication`** - Clerk-related endpoints
  - `POST /clerk/save-tokens` - Save tokens from Clerk (if available)
  - `GET /google/check` - Check connection status
  - `GET /google/tokens` - Get stored token metadata
  - `DELETE /google/revoke` - Revoke tokens

- **`/api/authorization`** - Google Drive OAuth flow
  - `GET /google/start` - Start OAuth (requires JWT in query or header)
  - `GET /google/callback` - Google callback handler (public)
  - `GET /google/reauth` - Start re-authorization
  - `GET /google/reauth/callback` - Re-auth callback handler (public)

#### 3. **Updated Files**

- `backend/src/index.js` - Mounted new route modules
- Removed old `auth.js` and `oauth.js` routes (now split into authentication/authorization)

### Frontend Structure

#### 1. **New Component: AuthorizationPage**

- **Location**: `frontend/src/components/AuthorizationPage.jsx`
- **Purpose**: Dedicated page for Google Drive authorization
- **Features**:
  - Checks if user already has refresh token
  - Shows clear consent screen with permissions list
  - Handles OAuth callbacks (success/error)
  - Button to trigger Google OAuth flow
  - Option to skip (can authorize later)
  - Auto-redirects to chat once authorized

#### 2. **Updated Components**

**SignInPage.jsx**:

- Removed complex token-fetching logic
- Now simply redirects to `/authorize` after sign-in
- Clean separation of concerns

**ChatInterface.jsx**:

- Removed `needsReconsent` state and OAuth buttons from sidebar
- Updated `checkGoogleConnection()` to redirect to `/authorize` if `needsAuthorization` is true
- Removed `startGoogleOAuth()` and `startGoogleReconsent()` functions
- Removed `ensureDriveConnection()` auto-save logic
- Updated API endpoint calls to `/api/authentication/*`

**App.jsx**:

- Added `/authorize` route between sign-in and chat
- Protected route requiring authentication

## User Flow

### Initial Signup/Sign-in

1. User signs in with Clerk → **SignInPage**
2. Auto-redirects to `/authorize` → **AuthorizationPage**
3. Page checks if user has refresh token
4. If no refresh token:
   - Shows consent screen with "Authorize with Google" button
   - User clicks button
   - Redirects to backend `/api/authorization/google/start?token=XXX`
   - Backend redirects to Google OAuth with proper parameters
   - User grants permission
   - Google redirects to `/api/authorization/google/callback`
   - Backend persists tokens (including refresh token)
   - Redirects to `/authorize?success=true`
   - Shows success message, then redirects to `/chat`
5. If refresh token exists: Auto-redirects to `/chat`

### When Refresh Token Missing/Expired

1. ChatInterface calls `checkGoogleConnection()`
2. Backend returns `needsAuthorization: true`
3. Frontend redirects to `/authorize?reauth=true`
4. Same flow as initial signup (shows consent screen)

### During Chat

1. User uploads file
2. If tokens are invalid/expired, backend returns 401
3. ChatInterface detects 401, redirects to `/authorize`

## Why This Architecture?

### Problem with Clerk

- Clerk provides OAuth integration but doesn't expose tokens with `access_type=offline` and `prompt=consent`
- Without these parameters, Google won't provide refresh tokens
- Without refresh tokens, access tokens expire and users need to re-authenticate

### Solution

- **Authentication**: Let Clerk handle user sign-in (what it's good at)
- **Authorization**: Use server-side OAuth flow with proper Google parameters to get refresh tokens
- **Separation**: Clear boundary between "who you are" (auth) and "what you can access" (authz)

### Benefits

1. **One-time Setup**: Users authorize Google Drive once during signup
2. **Long-term Access**: Refresh tokens enable automatic token renewal
3. **Better UX**: Single authorization page instead of buttons scattered in UI
4. **Clear Flow**: Sign in → Authorize → Chat (linear progression)
5. **Automatic Re-auth**: If tokens missing, auto-redirects to authorization page
6. **Maintainable**: Clear separation of concerns in code

## Important OAuth Parameters

The key to getting refresh tokens from Google:

```javascript
oauth2Client.generateAuthUrl({
  access_type: 'offline',  // Required for refresh token
  prompt: 'consent',       // Force consent screen (ensures refresh token is returned)
  scope: [...],
  state: encodedState
})
```

## API Endpoint Migration

| Old Endpoint                                | New Endpoint                                    | Notes                            |
| ------------------------------------------- | ----------------------------------------------- | -------------------------------- |
| `POST /api/auth/clerk/save-provider-tokens` | `POST /api/authentication/clerk/save-tokens`    | Simplified name                  |
| `GET /api/auth/google/check`                | `GET /api/authentication/google/check`          | Now returns `needsAuthorization` |
| `GET /api/auth/google/tokens`               | `GET /api/authentication/google/tokens`         | No change in functionality       |
| `DELETE /api/auth/google/revoke`            | `DELETE /api/authentication/google/revoke`      | No change                        |
| `GET /api/oauth/google/auth`                | `GET /api/authorization/google/start`           | More descriptive name            |
| `GET /api/oauth/google/callback`            | `GET /api/authorization/google/callback`        | No change                        |
| `GET /api/oauth/google/reconsent`           | `GET /api/authorization/google/reauth`          | Renamed to "reauth"              |
| `GET /api/oauth/google/reconsent/callback`  | `GET /api/authorization/google/reauth/callback` | Matches reauth naming            |

## Files Modified

### Backend

- ✅ Created: `backend/src/controllers/authenticationController.js`
- ✅ Created: `backend/src/controllers/authorizationController.js`
- ✅ Created: `backend/src/routes/authentication.js`
- ✅ Created: `backend/src/routes/authorization.js`
- ✅ Updated: `backend/src/index.js`
- ❌ Deprecated: `backend/src/controllers/authController.js` (can be removed)
- ❌ Deprecated: `backend/src/routes/auth.js` (can be removed)
- ❌ Deprecated: `backend/src/routes/oauth.js` (can be removed)

### Frontend

- ✅ Created: `frontend/src/components/AuthorizationPage.jsx`
- ✅ Updated: `frontend/src/components/SignInPage.jsx`
- ✅ Updated: `frontend/src/components/ChatInterface.jsx`
- ✅ Updated: `frontend/src/App.jsx`

## Testing Checklist

- [ ] Sign up new user → Should redirect to /authorize
- [ ] Click "Authorize with Google" → Should show Google consent screen
- [ ] Grant permission → Should redirect back with success
- [ ] After authorization → Should auto-redirect to /chat
- [ ] Upload file in chat → Should work with persisted tokens
- [ ] Check connection status → Should show "Google Drive Connected"
- [ ] Delete tokens from Firestore → Next check should redirect to /authorize
- [ ] Click "Skip for Now" → Should go to chat (but uploads will fail)

## Next Steps

1. **Test the full flow** with a new user account
2. **Remove deprecated files** (old auth.js, oauth.js, authController.js)
3. **Update environment variables** if needed (BACKEND_URL, FRONTEND_URL)
4. **Monitor logs** for any [DEBUG] statements showing token flow
5. **Consider adding** "Settings" page with manual re-authorization option

## Notes

- The `/authorize` page is **reusable** for both initial setup and re-authorization
- Backend uses `requireAuthFlexible` middleware to accept JWT from query string (needed for browser redirects)
- Frontend checks authorization status on mount and redirects if needed
- All OAuth callbacks redirect to `/authorize` (not `/chat`) for consistent UX
- The architecture is extensible for other OAuth providers (Dropbox, OneDrive, etc.)
