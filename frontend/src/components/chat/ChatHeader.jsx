import { Menu, Filter, Search, Clock } from 'lucide-react';

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
          <div className="w-8 h-8 bg-linear-to-br from-blue-500 via-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg shrink-0">
            <span className="text-lg">💬</span>
          </div>
          {!showSearch ? (
            <div className="flex flex-col min-w-0 flex-1">
              <h2 className="font-bold text-lg bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent truncate">
                DriveChat
              </h2>
              <p className="text-xs text-gray-400 truncate">
                {showStarredOnly ? 'Starred Messages' : `${messagesCount} messages`}
              </p>
            </div>
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
