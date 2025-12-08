import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function AuthorizationPage() {
  const { getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState(null);
  const [error, setError] = useState(null);

  // Initialize from URL params to avoid setState in useEffect
  const isReauth = useMemo(() => searchParams.get('reauth') === 'true', [searchParams]);

  // Memoize checkAuthorizationStatus to avoid re-creating on every render
  const checkAuthorizationStatus = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await axios.get(`${API_URL}/api/authentication/google/check`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.hasRefreshToken) {
        // Already authorized, redirect to chat
        navigate('/chat');
      } else {
        // Need authorization
        setAuthStatus('needs_auth');
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to check authorization status:', err);
      setError('Failed to check authorization status');
      setAuthStatus('error');
      setLoading(false);
    }
  }, [getToken, navigate]);

  // Check if user is returning from OAuth callback
  useEffect(() => {
    const success = searchParams.get('success');
    const errorParam = searchParams.get('error');

    if (success === 'true') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthStatus('success');
      // Wait a moment then redirect to chat
      const timer = setTimeout(() => {
        navigate('/chat');
      }, 2000);
      return () => clearTimeout(timer);
    } else if (errorParam) {
      setError(errorParam);

      setAuthStatus('error');

      setLoading(false);
    } else {
      // Check if authorization is needed
      checkAuthorizationStatus();
    }
  }, [searchParams, checkAuthorizationStatus, navigate]);

  const handleAuthorize = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        setError('Authentication required');
        setLoading(false);
        return;
      }

      // Get user's email from Clerk to pass to backend
      // This ensures Google uses the correct account
      const userEmail = clerkUser?.primaryEmailAddress?.emailAddress;

      // Build query string with token and email
      const queryParams = new URLSearchParams({
        token: token,
        ...(userEmail && { email: userEmail }),
      });

      // Redirect to authorization endpoint
      const endpoint = isReauth
        ? `/api/authorization/google/reauth?${queryParams.toString()}`
        : `/api/authorization/google/start?${queryParams.toString()}`;

      window.location.href = `${API_URL}${endpoint}`;
    } catch (err) {
      console.error('Authorization error:', err);
      setError('Failed to start authorization');
      setLoading(false);
    }
  };

  const handleSkip = () => {
    navigate('/chat');
  };

  if (loading && !authStatus) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-gray-600">Checking authorization status...</p>
          </div>
        </div>
      </div>
    );
  }

  if (authStatus === 'success') {
    return (
      <div className="min-h-screen bg-linear-to-br from-green-50 to-emerald-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Authorization Successful!</h2>
            <p className="text-gray-600 text-center mb-4">
              Google Drive access has been granted. Redirecting to chat...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (authStatus === 'error') {
    return (
      <div className="min-h-screen bg-linear-to-br from-red-50 to-rose-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Authorization Failed</h2>
            <p className="text-gray-600 text-center mb-6">
              {error === 'access_denied'
                ? 'You denied access to Google Drive. Authorization is required to upload and manage files.'
                : `Error: ${error}`}
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={handleAuthorize}
                className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition"
              >
                Try Again
              </button>
              <button
                onClick={handleSkip}
                className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 transition"
              >
                Skip for Now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main authorization prompt
  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="flex flex-col items-center">
          {/* Google Drive Icon */}
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.01 1.485c-.234 0-.47.066-.673.204l-8.52 5.631c-.403.267-.646.737-.646 1.237v7.884c0 .5.243.97.646 1.237l8.52 5.631c.404.267.942.267 1.346 0l8.52-5.631c.403-.267.646-.737.646-1.237V8.557c0-.5-.243-.97-.646-1.237l-8.52-5.631c-.203-.138-.439-.204-.673-.204zm0 2.309l7.09 4.687-7.09 4.687-7.09-4.687 7.09-4.687zm-8.52 7.09l7.09 4.687v6.738l-7.09-4.687v-6.738zm10.52 0v6.738l7.09 4.687v-6.738l-7.09-4.687z" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {isReauth ? 'Re-authorize Google Drive' : 'Authorize Google Drive Access'}
          </h2>

          <p className="text-gray-600 text-center mb-6">
            {isReauth
              ? 'Your refresh token is missing or expired. Please re-authorize to continue uploading files to Google Drive.'
              : 'To upload and manage files, DriveChat needs access to your Google Drive. This is a one-time setup.'}
          </p>

          <div className="w-full bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">What we'll access:</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-500 mr-2 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Create and manage files in a dedicated DriveChat folder</span>
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-500 mr-2 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>View your basic profile information</span>
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-red-500 mr-2 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                <span>We will NOT access other files in your Drive</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={handleAuthorize}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg hover:bg-indigo-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Redirecting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0012.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z" />
                  </svg>
                  Authorize with Google
                </>
              )}
            </button>

            <button
              onClick={handleSkip}
              className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-lg hover:bg-gray-300 transition font-medium"
            >
              Skip for Now
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center mt-4">
            You can always authorize later from the settings
          </p>
        </div>
      </div>
    </div>
  );
}
