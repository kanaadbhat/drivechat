import { Paperclip } from 'lucide-react';

export default function PendingUploadBanner({ pendingUpload, formatBytes }) {
  if (!pendingUpload) return null;

  return (
    <div className="flex gap-3 justify-end opacity-90">
      <div className="flex flex-col max-w-md">
        <div className="px-4 py-3 rounded-lg bg-blue-900/60 text-white relative">
          <div className="flex items-center gap-2 text-sm mb-1">
            <Paperclip className="w-4 h-4" />
            <span className="truncate font-semibold">{pendingUpload.fileName}</span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-blue-400"
              style={{ width: `${pendingUpload.progress || 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-200">
            <span>
              {pendingUpload.status === 'uploading'
                ? `${pendingUpload.progress || 0}%`
                : pendingUpload.status === 'error'
                  ? 'Failed'
                  : 'Done'}
            </span>
            <span>{pendingUpload.speed ? `${formatBytes(pendingUpload.speed)}/s` : ''}</span>
          </div>
          {pendingUpload.error && (
            <p className="text-xs text-red-200 mt-2">{pendingUpload.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
