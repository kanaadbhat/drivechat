import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { initGisClient, getAccessToken, hasValidToken } from '../utils/gisClient';

/**
 * Authorization page for Google Drive access.
 * Uses Google Identity Services (GIS) for client-side OAuth.
 */
export default function AuthorizationPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState(null);
  const [error, setError] = useState(null);

  // Initialize GIS and check if already authorized
  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      navigate('/');
      return;
    }

    // Initialize GIS client
    const initSuccess = initGisClient();
    if (!initSuccess) {
      // GIS script might not be loaded yet, wait a bit
      const timer = setTimeout(() => {
        initGisClient();
        setLoading(false);
        setAuthStatus(hasValidToken() ? 'authorized' : 'needs_auth');
      }, 1000);
      return () => clearTimeout(timer);
    }

    // Check if already authorized
    if (hasValidToken()) {
      setAuthStatus('authorized');
      setTimeout(() => navigate('/chat'), 1000);
    } else {
      setAuthStatus('needs_auth');
    }
    setLoading(false);
  }, [isLoaded, isSignedIn, navigate]);

  const handleAuthorize = async () => {
    try {
      setLoading(true);
      setError(null);

      // Request access token - GIS will show consent popup
      const loginHint = user?.primaryEmailAddress?.emailAddress;
      await getAccessToken({ prompt: 'consent', login_hint: loginHint });

      setAuthStatus('authorized');
      setTimeout(() => navigate('/chat'), 1000);
    } catch (err) {
      console.error('Authorization error:', err);
      setError(err.message || 'Failed to authorize Google Drive');
      setAuthStatus('error');
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-xl shadow-lg p-8">
        <div className="text-center">
          {/* Logo/Icon */}
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Connect Google Drive</h1>

          {authStatus === 'authorized' && (
            <div className="mb-6">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-white"
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
              <p className="text-green-400">Google Drive connected!</p>
              <p className="text-gray-400 text-sm mt-2">Redirecting to chat...</p>
            </div>
          )}

          {authStatus === 'needs_auth' && (
            <div className="mb-6">
              <p className="text-gray-400 mb-6">
                DriveChat needs access to your Google Drive to store and share files. Your files are
                stored in your own Drive, not on our servers.
              </p>

              <div className="bg-gray-700/50 rounded-lg p-4 mb-6 text-left">
                <h3 className="text-white font-medium mb-2">What we access:</h3>
                <ul className="text-gray-400 text-sm space-y-1">
                  <li>• Create and manage files in a &quot;DriveChat&quot; folder</li>
                  <li>• Upload files you share in chat</li>
                  <li>• Delete files when you remove them</li>
                </ul>
              </div>

              <button
                onClick={handleAuthorize}
                disabled={loading}
                className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
                      />
                    </svg>
                    Connect Google Drive
                  </>
                )}
              </button>
            </div>
          )}

          {authStatus === 'error' && (
            <div className="mb-6">
              <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-white"
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
              <p className="text-red-400 mb-4">{error || 'Authorization failed'}</p>
              <button
                onClick={handleAuthorize}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          <button
            onClick={() => navigate('/chat')}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
