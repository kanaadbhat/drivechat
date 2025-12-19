import { useEffect, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate, useLocation } from 'react-router-dom';

const PRECHAT_KEY = 'drivechat_prechat_passed';

export default function ProtectedRoute({ children }) {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const prechatOk = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(localStorage.getItem(PRECHAT_KEY));
  }, [location.key]);

  const isOnPrechat = location.pathname === '/prechat';

  useEffect(() => {
    if (!isLoaded) return;

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
  }, [isSignedIn, isLoaded, navigate, prechatOk, isOnPrechat, location.pathname, location.search]);

  if (!isLoaded) {
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
