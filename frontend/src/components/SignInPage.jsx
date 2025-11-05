import { SignIn } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';

export default function SignInPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to DriveChat</h1>
          <p className="text-gray-400">Sign in to start chatting</p>
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
          redirectUrl="/chat"
          afterSignInUrl="/chat"
        />
      </div>
    </div>
  );
}
