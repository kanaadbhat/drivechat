import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { cleanupUserSession } from '../utils/sessionCleanup';
import {
  MessageSquare,
  Star,
  Upload,
  Shield,
  Zap,
  Cloud,
  Lock,
  HardDrive,
  Smartphone,
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const features = [
    {
      icon: <Smartphone className="w-8 h-8 text-[#1a73e8]" />,
      wrapperClasses: 'bg-[#1a73e8]/10 text-[#1a73e8] group-hover:bg-[#1a73e8]/20',
      borderClass: 'hover:border-[#1a73e8]/40',
      title: 'No Phone Required',
      description:
        'Forget phone numbers and SMS verification. Sign in with your Google account and start syncing instantly.',
    },
    {
      icon: <Lock className="w-8 h-8 text-[#34a853]" />,
      wrapperClasses: 'bg-[#34a853]/10 text-[#34a853] group-hover:bg-[#34a853]/20',
      borderClass: 'hover:border-[#34a853]/40',
      title: 'End-to-End Encrypted',
      description:
        'Your messages and files are encrypted before they leave your device. Only you hold the keys.',
    },
    {
      icon: <HardDrive className="w-8 h-8 text-[#f9ab00]" />,
      wrapperClasses: 'bg-[#f9ab00]/10 text-[#f9ab00] group-hover:bg-[#f9ab00]/20',
      borderClass: 'hover:border-[#f9ab00]/40',
      title: 'Your Drive, Your Data',
      description:
        'All files are stored directly in your own Google Drive. We never host your data—you maintain full control.',
    },
    {
      icon: <MessageSquare className="w-8 h-8 text-[#7c3aed]" />,
      wrapperClasses: 'bg-[#7c3aed]/10 text-[#7c3aed] group-hover:bg-[#7c3aed]/20',
      borderClass: 'hover:border-[#7c3aed]/40',
      title: 'Personal Workspace',
      description:
        'A private chat-like space designed for you to share notes, links, and files between your own devices.',
    },
    {
      icon: <Zap className="w-8 h-8 text-[#06b6d4]" />,
      wrapperClasses: 'bg-[#06b6d4]/10 text-[#06b6d4] group-hover:bg-[#06b6d4]/20',
      borderClass: 'hover:border-[#06b6d4]/40',
      title: 'Instant Sync',
      description:
        'Real-time updates across all your logged-in devices. Copy on your phone, paste on your laptop.',
    },
    {
      icon: <Shield className="w-8 h-8 text-[#ea4335]" />,
      wrapperClasses: 'bg-[#ea4335]/10 text-[#ea4335] group-hover:bg-[#ea4335]/20',
      borderClass: 'hover:border-[#ea4335]/40',
      title: 'Privacy First',
      description:
        'No social features, no public profiles, no tracking. Just a secure bridge for your personal data.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0b1224] text-white flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="w-full max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="DriveChat" className="w-11 h-11 rounded-lg shadow-lg" />
              <span className="text-2xl font-bold font-display">DriveChat</span>
            </div>
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
                      onClick={async () => {
                        setShowProfileMenu(false);
                        await cleanupUserSession(user?.id, { preserveLastSeen: true });
                        await signOut();
                        navigate('/');
                      }}
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

      {/* Main Content */}
      <main className="flex-1 w-full">
        {/* Hero Section */}
        <section className="w-full pt-28 pb-20 relative overflow-hidden min-h-[600px] flex items-center justify-center">
          {/* Full background image */}
          <img
            src="/background.jpg"
            alt="Hero background"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-linear-to-b from-[#0b1224]/90 via-[#0b1224]/80 to-[#0f1a33]/85 pointer-events-none" />

          <div className="w-full max-w-7xl mx-auto px-4 relative z-10">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-block px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white text-sm font-semibold mb-6">
                ✨ The “Me” chat, re-engineered
              </div>
              <h1
                className="relative z-10 transform-gpu text-5xl md:text-6xl font-display font-bold leading-tight pb-4 mb-8 bg-linear-to-r from-[#1a73e8] via-[#f9ab00] to-[#ea4335] bg-clip-text text-transparent drop-shadow-[0_10px_30px_rgba(26,115,232,0.25)]"
                style={{ transform: 'translateZ(0)' }}
              >
                Sync with Yourself.Securely.
              </h1>
              <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
                A private, encrypted space to move messages and files across your devices. Stored in
                your Google Drive. Locked with your own keys.
              </p>
              <div className="flex gap-4 justify-center flex-wrap">
                {isSignedIn ? (
                  <>
                    <button
                      onClick={() => navigate('/prechat')}
                      className="px-8 py-4 bg-linear-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
                    >
                      Go to Chat
                    </button>
                    <button
                      onClick={() => navigate('/learn-more')}
                      className="px-8 py-4 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold text-lg transition-all duration-200 border border-gray-700"
                    >
                      Learn More
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => navigate('/signin')}
                      className="px-8 py-4 bg-linear-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
                    >
                      Get Started Free
                    </button>
                    <button
                      onClick={() => navigate('/learn-more')}
                      className="px-8 py-4 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold text-lg transition-all duration-200 border border-gray-700"
                    >
                      Learn More
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="w-full py-20 bg-gray-900/20">
          <div className="w-full max-w-7xl mx-auto px-4">
            <div>
              <div className="text-center mb-16">
                <h2 className="text-4xl font-bold mb-4">Built for Privacy</h2>
                <p className="text-gray-400 text-lg">
                  A secure bridge for your personal data across all your devices
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {features.map((feature, index) => (
                  <div
                    key={index}
                    className={`p-6 bg-gray-900 border border-gray-800 rounded-xl transition-all duration-200 group ${feature.borderClass || ''}`}
                  >
                    <div
                      className={`w-14 h-14 ${feature.wrapperClasses} rounded-lg flex items-center justify-center mb-4 transition-colors group`}
                    >
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                    <p className="text-gray-400">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="w-full py-20">
          <div className="w-full max-w-7xl mx-auto px-4">
            <div className="max-w-4xl mx-auto bg-linear-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-12 text-center">
              <h2 className="text-4xl font-bold mb-4">Ready to sync?</h2>
              <p className="text-gray-400 text-lg mb-8">
                Start your private workspace today. No phone number, no hassle—just secure personal
                sync.
              </p>
              {isSignedIn ? (
                <button
                  onClick={() => navigate('/prechat')}
                  className="px-8 py-4 bg-linear-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
                >
                  Go to Chat
                </button>
              ) : (
                <button
                  onClick={() => navigate('/signin')}
                  className="px-8 py-4 bg-linear-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
                >
                  Sign In Now
                </button>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-gray-800 bg-gray-900/50">
        <div className="w-full max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-gray-400">
            <p>&copy; 2025 DriveChat. All rights reserved.</p>
            <p className="mt-2 text-sm text-gray-300">
              Made with <span className="text-rose-400">❤️</span> by{' '}
              <span className="font-display font-semibold">Kanaad Bhat</span>
            </p>
            <p className="mt-2 text-sm">
              <a href="mailto:kanaad@kanaad.in" className="text-blue-400 hover:underline">
                Contact: kanaad@kanaad.in
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
