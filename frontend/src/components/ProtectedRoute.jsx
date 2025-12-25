import { useEffect, useMemo } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate, useLocation } from 'react-router-dom';

const PRECHAT_KEY_BASE = 'drivechat_prechat_passed';
const buildPrechatKey = (userId) => `${PRECHAT_KEY_BASE}_${userId || 'anon'}`;

export default function ProtectedRoute({ children }) {
  const { isSignedIn, isLoaded } = useAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const isOnPrechat = location.pathname === '/prechat';

  const prechatOk =
    typeof window === 'undefined'
      ? false
      : Boolean(localStorage.getItem(buildPrechatKey(user?.id)));

  useEffect(() => {
    if (!isLoaded || !isUserLoaded) return;

    if (!isSignedIn) {
      navigate('/signin', { replace: true });
      return;
    }

    if (isOnPrechat) return;

    if (!prechatOk) {
      navigate('/prechat', {
        replace: true,
        state: { redirect: location.pathname + location.search },
      });
    }
  }, [
    isSignedIn,
    isLoaded,
    isUserLoaded,
    prechatOk,
    isOnPrechat,
    location.pathname,
    location.search,
    navigate,
  ]);

  // Loading state
  if (!isLoaded || !isUserLoaded) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  // Don't render children while redirecting to prechat
  if (!prechatOk && !isOnPrechat) {
    return null;
  }

  return children;
}
