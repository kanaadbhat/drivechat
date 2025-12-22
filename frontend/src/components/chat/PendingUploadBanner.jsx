import { Paperclip } from 'lucide-react';

export default function PendingUploadBanner({ pendingUpload, formatBytes, onPause, onCancel }) {
  if (!pendingUpload) return null;

  const statusLabel =
    pendingUpload.status === 'uploading'
      ? 'Uploading…'
      : pendingUpload.status === 'error'
        ? 'Failed'
        : pendingUpload.status === 'cancelled'
          ? 'Cancelled'
          : 'Processing';

  return (
    <div className="flex gap-3 items-start justify-end">
      <div className="flex-1" />
      <div className="max-w-xl w-full bg-blue-900/60 border border-blue-800 rounded-lg p-3 text-white shadow-sm">
        <div className="flex items-center justify-between mb-2 text-sm font-semibold truncate">
          <span className="truncate">Uploading {pendingUpload.fileName}</span>
          <span className="text-xs text-gray-200">{pendingUpload.progress || 0}%</span>
        </div>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-blue-400 transition-all"
            style={{ width: `${pendingUpload.progress || 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-200">
          <span>{statusLabel}</span>
          <span>{pendingUpload.speed ? `${formatBytes(pendingUpload.speed)}/s` : ''}</span>
        </div>
        {pendingUpload.error && <p className="text-xs text-red-200 mt-2">{pendingUpload.error}</p>}
        <div className="flex gap-2 mt-3 text-xs">
          <button
            className="px-3 py-1 rounded bg-gray-800 border border-gray-700 hover:bg-gray-700"
            onClick={onPause}
            disabled={pendingUpload.status !== 'uploading'}
          >
            Pause
          </button>
          <button
            className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
