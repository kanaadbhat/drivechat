import { ArrowLeft, LayoutGrid, List } from 'lucide-react';

export default function StarredHeader({ count, syncing, viewMode, onViewChange, onBack }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <button
        onClick={onBack}
        className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold text-white">Starred Messages</h1>
        <p className="text-sm text-gray-400">
          {count} items{syncing ? ' · refreshing…' : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onViewChange('grid')}
          className={`p-2 rounded-lg border ${
            viewMode === 'grid'
              ? 'border-blue-500 text-blue-400 bg-blue-500/10'
              : 'border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
          }`}
          title="Grid view"
        >
          <LayoutGrid className="w-5 h-5" />
        </button>
        <button
          onClick={() => onViewChange('list')}
          className={`p-2 rounded-lg border ${
            viewMode === 'list'
              ? 'border-blue-500 text-blue-400 bg-blue-500/10'
              : 'border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
          }`}
          title="List view"
        >
          <List className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
