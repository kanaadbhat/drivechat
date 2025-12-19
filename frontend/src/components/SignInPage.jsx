import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth, SignIn } from '@clerk/clerk-react';

export default function SignInPage() {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();

  useEffect(() => {
    // After successful sign-in, go straight to chat (Drive auth is client-side GIS)
    if (isSignedIn) {
      console.log('✅ [SignInPage] User signed in, redirecting to pre-chat...');
      navigate('/prechat');
    }
  }, [isSignedIn, navigate]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to DriveChat</h1>
          <p className="text-gray-400">Sign in with your Google account to get started</p>
          <p className="text-sm text-gray-500 mt-2">
            Google Drive permissions will be requested on first login
          </p>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: 'mx-auto',
              card: 'bg-gray-900 shadow-xl',
              headerTitle: 'text-white',
              headerSubtitle: 'text-gray-400',
              socialButtonsBlockButton: 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-white',
              formButtonPrimary:
                'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700',
              footerActionLink: 'text-blue-400 hover:text-blue-300',
              formFieldInput: 'bg-gray-800 border-gray-700 text-white',
              identityPreviewEditButton: 'text-blue-400',
            },
          }}
          redirectUrl="/prechat"
          afterSignInUrl="/prechat"
        />
      </div>
    </div>
  );
}
