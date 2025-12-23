import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { cleanupUserSession } from '../utils/sessionCleanup';

export default function AppHeader() {
  const navigate = useNavigate();
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const goHome = () => {
    setShowProfileMenu(false);
    navigate('/');
  };

  const handleSignOut = async () => {
    setShowProfileMenu(false);
    await cleanupUserSession(user?.id, { preserveLastSeen: true });
    await signOut();
    navigate('/');
  };

  return (
    <header className="w-full border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="w-full max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goHome}
            className="flex items-center gap-3 focus:outline-none"
            aria-label="Go to landing page"
          >
            <img src="/logo.png" alt="DriveChat" className="w-10 h-10 rounded-lg shadow-md" />
            <span className="text-2xl font-bold font-display text-white">DriveChat</span>
          </button>
          {isSignedIn ? (
            <div className="relative">
              <button
                onClick={() => navigate('/prechat')}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setShowProfileMenu((prev) => !prev);
                }}
                className="flex items-center gap-2"
              >
                <img
                  src={user?.imageUrl || 'https://via.placeholder.com/40'}
                  alt={user?.fullName || 'User'}
                  className="w-10 h-10 rounded-full object-cover border-2 border-blue-500 hover:border-purple-500 transition-colors cursor-pointer"
                />
              </button>
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-40 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-10">
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigate('/prechat');
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
                  >
                    Go to Chat
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => navigate('/signin')}
              className="px-6 py-2.5 bg-linear-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
