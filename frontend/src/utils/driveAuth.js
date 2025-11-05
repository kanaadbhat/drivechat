import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

/**
 * Check if user has authorized Google Drive and prompt if needed
 */
export const ensureDriveAuth = async (getToken) => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    // Try to get auth URL - this will work if user hasn't authorized yet
    const response = await axios.get(`${API_URL}/api/files/auth/google`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.data.authUrl) {
      // User needs to authorize
      const authWindow = window.open(
        response.data.authUrl,
        'Google Drive Authorization',
        'width=600,height=700,scrollbars=yes'
      );

      // Wait for the auth window to close
      return new Promise((resolve, reject) => {
        const checkClosed = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(checkClosed);
            // Give a moment for the callback to complete
            setTimeout(() => resolve(true), 1000);
          }
        }, 500);

        // Timeout after 5 minutes
        setTimeout(
          () => {
            clearInterval(checkClosed);
            if (!authWindow.closed) {
              authWindow.close();
            }
            reject(new Error('Authorization timeout'));
          },
          5 * 60 * 1000
        );
      });
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
