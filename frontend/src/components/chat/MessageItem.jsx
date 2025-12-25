import { useMemo } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);
import { Star, StarOff, Trash2, ExternalLink } from 'lucide-react';
import FilePreview from '../FilePreview';
import { DEVICE_TYPES, getDeviceIcon } from '../../utils/deviceManager';

const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;

const renderTextWithLinks = (text = '') => {
  const parts = text.split(urlRegex);
  return parts.map((part, idx) => {
    if (!part) return null;
    const isUrl = urlRegex.test(part);
    urlRegex.lastIndex = 0;
    if (isUrl) {
      const href = part.startsWith('http') ? part : `https://${part}`;
      return (
        <a
          key={`link-${idx}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-blue-200 hover:text-white break-words"
        >
          {part}
        </a>
      );
    }
    return (
      <span key={`text-${idx}`} className="break-words">
        {part}
      </span>
    );
  });
};

const getHostname = (url = '') => {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export default function MessageItem({
  message,
  currentDevice,
  editingMessage,
  editText,
  setEditText,
  setEditingMessage,
  handleEditMessage,
  handleContextMenu,
  handleDownloadFile,
  toggleStar,
  setConfirmDelete,
  closeContextMenu,
  formatBytes,
  downloadState,
  deleteError,
  getFileDisplayUrl,
  getThumbnailUrl,
  getFileIcon,
}) {
  const isSentByMe = message.sender?.deviceId === currentDevice?.deviceId;
  const isEditing = editingMessage === message.id;
  const deviceType = message.sender?.deviceType || DEVICE_TYPES.GUEST;
  const deviceName = message.sender?.deviceName || 'Guest Device';
  const deviceIcon = useMemo(() => getDeviceIcon(deviceType), [deviceType]);

  return (
    <div className={`flex gap-3 ${isSentByMe ? 'justify-end' : 'justify-start'}`}>
      {!isSentByMe && (
        <div className="flex flex-col items-center gap-1 mt-1">
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center border-2 border-gray-600 shrink-0">
            <img src={deviceIcon} alt={deviceType} className="w-5 h-5 text-gray-300" />
          </div>
        </div>
      )}

      <div className="flex flex-col max-w-md">
        <div
          className={`text-xs text-gray-400 mb-1 px-1 ${isSentByMe ? 'text-right' : 'text-left'}`}
        >
          {deviceName}
        </div>

        <div
          className={`px-4 py-3 rounded-lg ${isSentByMe ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'} relative group`}
          onContextMenu={(e) => handleContextMenu(e, message)}
        >
          {message.type === 'text' && message.text && (
            <>
              {isEditing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditMessage();
                      if (e.key === 'Escape') {
                        setEditingMessage(null);
                        setEditText('');
                      }
                    }}
                    className="w-full px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleEditMessage}
                      className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingMessage(null);
                        setEditText('');
                      }}
                      className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="wrap-break-word space-y-1">
                  <span className="leading-relaxed break-words">
                    {renderTextWithLinks(message.text)}
                  </span>
                  {message.edited && <span className="text-xs opacity-60 ml-2">(edited)</span>}
                </p>
              )}
            </>
          )}

          {message.type === 'link' && message.linkUrl && (
            <div className="space-y-2">
              {message.text && (
                <p className="wrap-break-word space-y-1 text-sm">
                  <span className="leading-relaxed break-words">
                    {renderTextWithLinks(message.text)}
                  </span>
                  {message.edited && <span className="text-xs opacity-60 ml-2">(edited)</span>}
                </p>
              )}
              <a
                href={message.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border border-gray-700 bg-black/20 hover:border-gray-500 transition-colors"
              >
                <div className="flex items-stretch">
                  {message.linkImage || getHostname(message.linkUrl) ? (
                    <img
                      src={
                        message.linkImage ||
                        `https://www.google.com/s2/favicons?sz=128&domain=${getHostname(message.linkUrl)}`
                      }
                      alt={message.linkTitle || message.linkUrl}
                      className="w-28 h-28 object-cover flex-shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-28 h-28 flex-shrink-0 bg-gray-800 flex items-center justify-center text-gray-400">
                      <ExternalLink className="w-5 h-5" />
                    </div>
                  )}
                  <div className="p-3 space-y-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {message.linkTitle || getHostname(message.linkUrl)}
                    </p>
                    {message.linkDescription && (
                      <p className="text-xs text-gray-300 line-clamp-2 leading-snug">
                        {message.linkDescription}
                      </p>
                    )}
                    <p className="text-xs text-blue-200 truncate underline">{message.linkUrl}</p>
                  </div>
                </div>
              </a>
            </div>
          )}

          {message.type === 'file' && message.fileName && (
            <div
              className="flex flex-col gap-2"
              onDoubleClick={() =>
                message.fileId &&
                window.open(`https://drive.google.com/file/d/${message.fileId}/view`, '_blank')
              }
            >
              <FilePreview
                message={message}
                getFileUrl={getFileDisplayUrl}
                getThumbnailUrl={getThumbnailUrl}
              />

              <div className="flex items-center gap-2 text-sm">
                {getFileIcon(message.fileName)}
                <span className="truncate font-medium">{message.fileName}</span>
              </div>
              {message.fileSize && (
                <p className="text-xs opacity-75">{formatBytes(message.fileSize)}</p>
              )}

              {downloadState && (
                <div className="mt-1 text-xs">
                  {downloadState.status === 'downloading' && (
                    <div className="space-y-1">
                      <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-400"
                          style={{ width: `${downloadState.progress || 0}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-gray-200">
                        <span>{downloadState.progress ? `${downloadState.progress}%` : '...'}</span>
                        <span>
                          {downloadState.speed ? `${formatBytes(downloadState.speed)}/s` : ''}
                        </span>
                      </div>
                    </div>
                  )}
                  {downloadState.status === 'error' && (
                    <div className="text-red-300 flex items-center justify-between gap-2">
                      <span>{downloadState.error || 'Download failed'}</span>
                      <button
                        onClick={() => handleDownloadFile(message)}
                        className="px-2 py-1 bg-red-500/20 rounded text-white text-[11px]"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {downloadState.status === 'done' && (
                    <span className="text-green-300">Downloaded</span>
                  )}
                </div>
              )}

              {deleteError && <div className="text-xs text-red-300 mt-1">{deleteError}</div>}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 mt-2 text-xs opacity-75">
            <span>{dayjs(message.timestamp).fromNow()}</span>
            <div className="flex gap-1">
              <button
                onClick={() => toggleStar(message.id, message.starred)}
                className="hover:scale-110 transition-transform"
              >
                {message.starred ? (
                  <Star className="w-3 h-3 fill-current" />
                ) : (
                  <StarOff className="w-3 h-3" />
                )}
              </button>
              {isSentByMe && (
                <button
                  onClick={() => {
                    setConfirmDelete(message);
                    closeContextMenu();
                  }}
                  className="hover:scale-110 transition-transform text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
            {deleteError && <div className="text-xs text-red-300 mt-1">{deleteError}</div>}
          </div>
        </div>
      </div>

      {isSentByMe && (
        <div className="flex flex-col items-center gap-1 mt-1">
          <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center border-2 border-blue-500 shrink-0">
            <img src={deviceIcon} alt={deviceType} className="w-5 h-5 text-white" />
          </div>
        </div>
      )}
    </div>
  );
}
