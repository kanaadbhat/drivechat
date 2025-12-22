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

  const prechatOk = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(localStorage.getItem(buildPrechatKey(user?.id)));
  }, [location.key, user?.id]);

  const isOnPrechat = location.pathname === '/prechat';

  useEffect(() => {
    if (!isLoaded || !isUserLoaded) return;

    if (!isSignedIn) {
      navigate('/signin', { replace: true });
      return;
    }

    if (!prechatOk && !isOnPrechat) {
      navigate('/prechat', {
        replace: true,
        state: { redirect: location.pathname + location.search },
      });
    }
  }, [
    isSignedIn,
    isLoaded,
    isUserLoaded,
    navigate,
    prechatOk,
    isOnPrechat,
    location.pathname,
    location.search,
    user?.id,
  ]);

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

  if (!prechatOk && !isOnPrechat) {
    return null;
  }

  return children;
}
