import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

/**
 * Save Clerk provider tokens from backend (recommended)
 * This calls the backend which fetches tokens from Clerk
 */
export const saveClerkProviderTokens = async (getToken) => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await axios.post(
      `${API_URL}/api/authentication/clerk/save-tokens`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error saving Clerk provider tokens:', error);
    throw error;
  }
};

/**
 * Save provider tokens from client (fallback)
 * Use this if Clerk doesn't expose tokens in your plan
 */
export const saveProviderTokensFromClient = async (
  getToken,
  accessToken,
  refreshToken,
  expiryDate
) => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await axios.post(
      `${API_URL}/api/authentication/save-tokens`,
      {
        accessToken,
        refreshToken,
        expiryDate,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error saving provider tokens:', error);
    throw error;
  }
};

/**
 * Check if user has Google Drive connected
 */
export const checkGoogleConnection = async (getToken) => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await axios.get(`${API_URL}/api/authentication/google/check`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  } catch (error) {
    console.error('Error checking Google connection:', error);
    throw error;
  }
};

/**
 * Get stored Google tokens metadata
 */
export const getStoredGoogleTokens = async (getToken) => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await axios.get(`${API_URL}/api/authentication/google/tokens`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  } catch (error) {
    console.error('Error getting stored tokens:', error);
    throw error;
  }
};

/**
 * Revoke Google OAuth tokens
 */
export const revokeGoogleTokens = async (getToken) => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await axios.delete(`${API_URL}/api/authentication/google/revoke`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  } catch (error) {
    console.error('Error revoking tokens:', error);
    throw error;
  }
};

/**
 * Fallback OAuth flow - start Google OAuth (if Clerk doesn't handle Drive scopes)
 */
export const startGoogleOAuth = async (getToken) => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    // Redirect to backend OAuth start endpoint (note: uses /oauth route)
    window.location.href = `${API_URL}/api/oauth/google/auth?token=${encodeURIComponent(token)}`;
  } catch (error) {
    console.error('Error starting OAuth:', error);
    throw error;
  }
};

/**
 * Check if user has authorized Google Drive and prompt if needed
 */
export const ensureDriveAuth = async (getToken) => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    // Check connection status
    const connection = await checkGoogleConnection(getToken);

    if (!connection.connected) {
      // User needs to authorize - use Clerk-based flow or fallback
      // First, try to save Clerk tokens
      try {
        await saveClerkProviderTokens(getToken);
        return true;
      } catch (clerkError) {
        console.warn('Clerk token retrieval failed, using fallback OAuth:', clerkError.message);
        // Fall back to OAuth flow
        await startGoogleOAuth(getToken);
        return new Promise((resolve) => {
          const checkInterval = setInterval(async () => {
            try {
              const updated = await checkGoogleConnection(getToken);
              if (updated.connected) {
                clearInterval(checkInterval);
                resolve(true);
              }
            } catch {
              // continue checking
            }
          }, 1000);

          // Timeout after 5 minutes
          setTimeout(
            () => {
              clearInterval(checkInterval);
              resolve(false);
            },
            5 * 60 * 1000
          );
        });
      }
    }

    return true;
  } catch (error) {
    console.error('Drive auth check error:', error);
    throw error;
  }
};

/**
 * Handle file upload with automatic auth handling
 */
export const uploadFileWithAuth = async (file, getToken) => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post(`${API_URL}/api/files/upload`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  } catch (error) {
    // Check if it's an auth error
    if (error.response?.data?.needsAuth) {
      // Prompt for authorization
      await ensureDriveAuth(getToken);

      // Retry upload
      return uploadFileWithAuth(file, getToken);
    }

    throw error;
  }
};
