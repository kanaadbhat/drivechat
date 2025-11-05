import { useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { MessageSquare, Star, Upload, Shield, Zap, Cloud } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  const features = [
    {
      icon: <MessageSquare className="w-8 h-8" />,
      title: 'Instant Messaging',
      description:
        'Send messages that auto-delete after a set time. Your conversations, your control.',
    },
    {
      icon: <Upload className="w-8 h-8" />,
      title: 'File Sharing',
      description: 'Share files directly to Google Drive with automatic organization and cleanup.',
    },
    {
      icon: <Star className="w-8 h-8" />,
      title: 'Star Important Messages',
      description:
        'Mark important messages and files to keep them accessible even after auto-deletion.',
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: 'Privacy First',
      description: 'End-to-end encryption and automatic cleanup ensure your data stays private.',
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: 'Lightning Fast',
      description:
        'Built with modern tech stack for blazing fast performance and real-time updates.',
    },
    {
      icon: <Cloud className="w-8 h-8" />,
      title: 'Cloud Storage',
      description: 'Seamlessly integrated with Google Drive for reliable and accessible storage.',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="w-full border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="w-full max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-6 h-6" />
              </div>
              <span className="text-2xl font-bold">DriveChat</span>
            </div>
            {isSignedIn ? (
              <button onClick={() => navigate('/chat')} className="flex items-center gap-2">
                <img
                  src={user?.imageUrl || 'https://via.placeholder.com/40'}
                  alt={user?.fullName || 'User'}
                  className="w-10 h-10 rounded-full object-cover border-2 border-blue-500 hover:border-purple-500 transition-colors cursor-pointer"
                />
              </button>
            ) : (
              <button
                onClick={() => navigate('/signin')}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
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
        <section className="w-full py-20">
          <div className="w-full max-w-7xl mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-block px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm font-medium mb-6">
                ✨ Chat with Auto-Delete & Drive Integration
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Your Messages, Your Control
              </h1>
              <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
                Chat freely with automatic message deletion, seamless Google Drive integration, and
                star your important conversations to keep them forever.
              </p>
              <div className="flex gap-4 justify-center flex-wrap">
                {isSignedIn ? (
                  <button
                    onClick={() => navigate('/chat')}
                    className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
                  >
                    Go to Chat
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => navigate('/signin')}
                      className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
                    >
                      Get Started Free
                    </button>
                    <button className="px-8 py-4 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold text-lg transition-all duration-200 border border-gray-700">
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
                <h2 className="text-4xl font-bold mb-4">Powerful Features</h2>
                <p className="text-gray-400 text-lg">
                  Everything you need for secure, temporary messaging
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {features.map((feature, index) => (
                  <div
                    key={index}
                    className="p-6 bg-gray-900 border border-gray-800 rounded-xl hover:border-blue-500/50 transition-all duration-200 group"
                  >
                    <div className="w-14 h-14 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
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
            <div className="max-w-4xl mx-auto bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-12 text-center">
              <h2 className="text-4xl font-bold mb-4">Ready to get started?</h2>
              <p className="text-gray-400 text-lg mb-8">
                Join thousands of users who trust DriveChat for secure, temporary messaging.
              </p>
              {isSignedIn ? (
                <button
                  onClick={() => navigate('/chat')}
                  className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
                >
                  Go to Chat
                </button>
              ) : (
                <button
                  onClick={() => navigate('/signin')}
                  className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-lg font-semibold text-lg transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
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
          </div>
        </div>
      </footer>
    </div>
  );
}
