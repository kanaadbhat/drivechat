import { Menu, Filter, Search, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ChatHeader({
  messagesCount,
  showStarredOnly,
  setShowStarredOnly,
  showSearch,
  setShowSearch,
  searchQuery,
  setSearchQuery,
  setShowSidebar,
}) {
  return (
    <div className="bg-gray-900 border-b border-gray-800 p-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowSidebar(true)}
          className="lg:hidden text-gray-400 hover:text-white"
        >
          <Menu className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          {!showSearch ? (
            <Link to="/" className="flex items-center gap-2 flex-1 min-w-0 text-white">
              <img
                src="/logo.png"
                alt="DriveChat"
                className="w-9 h-9 rounded-md shadow-md shrink-0"
              />
              <div className="flex flex-col min-w-0 flex-1">
                <h2 className="font-display font-semibold text-lg text-white truncate">
                  DriveChat
                </h2>
                <p className="text-xs text-gray-400 truncate">
                  {showStarredOnly ? 'Starred Messages' : `${messagesCount} messages`}
                </p>
              </div>
            </Link>
          ) : (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="flex-1 px-3 py-1.5 bg-gray-800 text-white text-sm rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none min-w-0"
              autoFocus
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowStarredOnly(!showStarredOnly);
              if (!showStarredOnly) {
                setShowSearch(false);
                setSearchQuery('');
              }
            }}
            className={`p-2 ${
              showStarredOnly
                ? 'text-yellow-400 bg-yellow-400/10'
                : 'text-gray-400 hover:bg-gray-800'
            } hover:text-yellow-300 rounded-lg transition-colors`}
            title={showStarredOnly ? 'Show all messages' : 'Show only starred messages'}
          >
            <Filter className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              setShowSearch(!showSearch);
              if (!showSearch) setSearchQuery('');
            }}
            className={`p-2 ${
              showSearch ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400 hover:bg-gray-800'
            } hover:text-blue-300 rounded-lg transition-colors`}
          >
            <Search className="w-5 h-5" />
          </button>
          <div className="hidden md:flex items-center gap-2 text-sm text-gray-400 px-3 py-1.5 bg-gray-800/50 rounded-lg">
            <Clock className="w-4 h-4" />
            <span>24h</span>
          </div>
        </div>
      </div>
    </div>
  );
}
