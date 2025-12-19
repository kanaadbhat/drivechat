import { Star, Settings, LogOut, X } from 'lucide-react';

export default function ChatSidebar({
  user,
  session,
  driveAuthorized,
  showSidebar,
  setShowSidebar,
  navigate,
  onSignOut,
}) {
  return (
    <div
      className={`${
        showSidebar ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 fixed lg:relative z-40 w-72 bg-gray-900 border-r border-gray-800 transition-transform duration-200 h-full flex flex-col`}
    >
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-xl">💬</span>
          </div>
          <span className="font-bold text-white">DriveChat</span>
        </div>
        <button
          onClick={() => setShowSidebar(false)}
          className="lg:hidden text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-3 mb-4">
          <img
            src={user?.imageUrl || 'https://via.placeholder.com/40'}
            alt={user?.fullName || user?.firstName || 'User'}
            className="w-10 h-10 rounded-full object-cover"
          />
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">
              {user?.fullName || user?.firstName || 'User'}
            </p>
            <p className="text-gray-400 text-sm truncate">
              {user?.primaryEmailAddress?.emailAddress || 'user@email.com'}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/starred')}
          className="w-full px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
        >
          <Star className="w-4 h-4" />
          View Starred Messages
        </button>
      </div>

      <div className="flex-1 p-4">
        <div className="space-y-2">
          <button
            onClick={() => navigate('/settings')}
            className="w-full px-4 py-2 text-left text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-3"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={() => {
              console.log('=== FULL DEBUG INFO ===');
              console.log('User object:', JSON.stringify(user, null, 2));
              console.log('External accounts:', user?.externalAccounts);
              console.log('Session object:', JSON.stringify(session, null, 2));
              console.log('Drive authorized state:', driveAuthorized);

              const statusMsg = driveAuthorized
                ? '✅ Google Drive is connected for file uploads'
                : "⚠️ Google Drive authorization needed.\n\nWhen you upload a file, you'll be prompted to sign in.";

              alert(
                `User: ${user?.firstName || 'Unknown'}\nEmail: ${
                  user?.primaryEmailAddress?.emailAddress || 'N/A'
                }\n\n${statusMsg}\n\nCheck browser console for full details!`
              );
            }}
            className="w-full px-4 py-2 text-left text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-3 text-xs"
          >
            Debug User Data
          </button>
        </div>
      </div>

      <div className="p-4 border-t border-gray-800">
        <button
          onClick={onSignOut}
          className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
