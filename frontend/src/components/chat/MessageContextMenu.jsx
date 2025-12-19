import { Star, StarOff, Edit, Copy, Eye, Trash2 } from 'lucide-react';

export default function MessageContextMenu({
  contextMenu,
  onToggleStar,
  onEdit,
  onCopy,
  onView,
  onDownload,
  onDelete,
}) {
  if (!contextMenu) return null;

  const { x, y, message } = contextMenu;

  return (
    <div
      className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => onToggleStar(message.id, message.starred)}
        className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
      >
        {message.starred ? (
          <>
            <StarOff className="w-4 h-4" /> Unstar
          </>
        ) : (
          <>
            <Star className="w-4 h-4" /> Star
          </>
        )}
      </button>
      {message.type === 'text' && (
        <button
          onClick={() => onEdit(message)}
          className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
        >
          <Edit className="w-4 h-4" /> Edit
        </button>
      )}
      <button
        onClick={() => onCopy(message)}
        className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
      >
        <Copy className="w-4 h-4" /> Copy
      </button>
      {message.type === 'file' && message.fileId && (
        <>
          <button
            onClick={() => onView(message)}
            className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
          >
            <Eye className="w-4 h-4" /> View
          </button>
          <button
            onClick={() => onDownload(message)}
            className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download
          </button>
        </>
      )}
      <button
        onClick={() => onDelete(message)}
        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
      >
        <Trash2 className="w-4 h-4" /> Delete
      </button>
    </div>
  );
}
