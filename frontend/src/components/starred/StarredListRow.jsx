import dayjs from 'dayjs';
import { extractFirstUrl, containsUrl, getHostname, formatBytes } from '../../utils/messageUtils';
import FilePreview from '../FilePreview';
import { getDriveContentUrl, getDriveThumbnailUrl } from '../../utils/gisClient';

const getFileExtension = (filename) => filename?.split('.').pop()?.toLowerCase() || '';

export default function StarredListRow({ message, onUnstar }) {
  return (
    <div
      key={message.id}
      className="grid grid-cols-12 gap-3 items-center px-3 py-2 hover:bg-gray-900/70 rounded-lg border border-transparent hover:border-gray-800 transition-colors text-sm"
      onDoubleClick={() =>
        message.fileId &&
        window.open(`https://drive.google.com/file/d/${message.fileId}/view`, '_blank')
      }
    >
      <div className="col-span-5 flex items-center gap-3">
        <div className="w-16 h-16 bg-gray-900 border border-gray-800 rounded-lg flex items-center justify-center overflow-hidden">
          {message.type === 'file' ? (
            <FilePreview
              message={message}
              getFileUrl={(fileId) => getDriveContentUrl(fileId)}
              getThumbnailUrl={(fileId, size = 120) => getDriveThumbnailUrl(fileId, size)}
              variant="compact"
            />
          ) : message.type === 'link' || (message.type === 'text' && containsUrl(message.text)) ? (
            (() => {
              const linkForRow = message.linkUrl || extractFirstUrl(message.text);
              return (
                <a
                  href={linkForRow}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-300 px-2 text-center underline truncate"
                >
                  {linkForRow}
                </a>
              );
            })()
          ) : (
            <div className="text-xs text-gray-400 px-2 text-center">Text</div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-white font-medium truncate leading-tight">
            {message.fileName || message.text}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {dayjs(message.timestamp).format('MMM D, YYYY h:mm A')}
          </p>
        </div>
      </div>
      <div className="col-span-2 text-gray-300 truncate">
        {message.type === 'file'
          ? getFileExtension(message.fileName) || 'file'
          : message.type === 'link'
            ? 'link'
            : 'text'}
      </div>
      <div className="col-span-2 text-gray-300 truncate">
        {message.type === 'file'
          ? message.fileSize
            ? formatBytes(message.fileSize)
            : 'Unknown'
          : message.type === 'link' || (message.type === 'text' && containsUrl(message.text))
            ? getHostname(message.linkUrl || extractFirstUrl(message.text))
            : '—'}
      </div>
      <div className="col-span-3 flex justify-end gap-2 text-sm">
        {(message.type === 'file' ||
          message.type === 'link' ||
          (message.type === 'text' && containsUrl(message.text))) && (
          <a
            href={
              message.type === 'file'
                ? message.filePreviewUrl || getDriveContentUrl(message.fileId)
                : message.linkUrl || extractFirstUrl(message.text)
            }
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors"
            title="Open"
          >
            Open
          </a>
        )}
        <button
          onClick={() => onUnstar(message.id)}
          className="px-2 py-1 rounded bg-gray-800 text-red-300 hover:bg-gray-700 transition-colors"
          title="Unstar"
        >
          Unstar
        </button>
      </div>
    </div>
  );
}
