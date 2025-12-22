import dayjs from 'dayjs';
import { Star, ExternalLink, Trash2 } from 'lucide-react';
import FilePreview from '../FilePreview';
import { getDriveContentUrl, getDriveThumbnailUrl } from '../../utils/gisClient';
import { containsUrl, extractFirstUrl, getHostname, formatBytes } from '../../utils/messageUtils';

const getFileExtension = (filename) => filename?.split('.').pop()?.toLowerCase() || '';

const getFileIcon = (filename, fileTypes) => {
  if (!filename) return null;
  const ext = getFileExtension(filename);
  const type = fileTypes.find((t) => t.extensions?.includes(ext));
  const Icon = type?.icon || null;
  return Icon ? <Icon className="w-5 h-5" /> : null;
};

const getFileColor = (filename) => {
  const ext = getFileExtension(filename);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'text-green-400';
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) return 'text-blue-400';
  if (['mp4', 'mov', 'avi'].includes(ext)) return 'text-purple-400';
  if (['mp3', 'wav'].includes(ext)) return 'text-pink-400';
  if (['zip', 'rar', '7z'].includes(ext)) return 'text-yellow-400';
  return 'text-gray-400';
};

const renderTextWithLinks = (text = '') => {
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
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

export default function StarredCard({ message, fileTypes, onUnstar }) {
  return (
    <div
      className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition-colors group shadow-sm"
      onDoubleClick={() =>
        message.fileId &&
        window.open(`https://drive.google.com/file/d/${message.fileId}/view`, '_blank')
      }
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`${getFileColor(message.fileName)}`}>
          {getFileIcon(message.fileName, fileTypes)}
        </div>
        <button
          onClick={() => onUnstar(message.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-yellow-400 hover:text-yellow-500"
          title="Unstar"
        >
          <Star className="w-4 h-4 fill-current" />
        </button>
      </div>

      {message.type === 'file' && (
        <div className="w-full rounded-md overflow-hidden bg-gray-900/60 border border-gray-800">
          <FilePreview
            message={message}
            getFileUrl={(fileId) => getDriveContentUrl(fileId)}
            getThumbnailUrl={(fileId, size = 400) => getDriveThumbnailUrl(fileId, size)}
            variant="compact"
          />
        </div>
      )}

      {(message.type === 'link' || (message.type === 'text' && containsUrl(message.text))) &&
        (message.linkUrl || extractFirstUrl(message.text)) &&
        (() => {
          const link = message.linkUrl || extractFirstUrl(message.text);
          const hostname = getHostname(link || '');
          return (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden border border-gray-800 hover:border-gray-700 transition-colors bg-black/20"
            >
              <div className="flex items-stretch">
                {message.linkImage || hostname ? (
                  <img
                    src={
                      message.linkImage ||
                      `https://www.google.com/s2/favicons?sz=128&domain=${hostname}`
                    }
                    alt={message.linkTitle || link}
                    className="w-36 h-24 object-cover flex-shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-36 h-24 flex-shrink-0 bg-gray-800 flex items-center justify-center text-gray-400">
                    <ExternalLink className="w-5 h-5" />
                  </div>
                )}
                <div className="p-3 space-y-1 min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white line-clamp-2 break-words">
                    {message.linkTitle || hostname}
                  </p>
                  {message.linkDescription && (
                    <p className="text-xs text-gray-300 line-clamp-2 leading-snug">
                      {message.linkDescription}
                    </p>
                  )}
                  <p className="text-xs text-blue-200 underline break-all leading-snug">{link}</p>
                </div>
              </div>
            </a>
          );
        })()}

      {message.type === 'text' && message.text && (
        <p className="text-gray-300 text-sm mb-2 line-clamp-3 leading-snug">
          {renderTextWithLinks(message.text)}
        </p>
      )}

      {message.type === 'file' && message.fileName && (
        <div className="mt-2 space-y-1">
          <p className="text-white font-medium text-sm truncate">{message.fileName}</p>
          <p className="text-gray-500 text-xs">
            {message.fileSize ? formatBytes(message.fileSize) : 'Unknown size'}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-800 text-xs text-gray-500">
        <span>{dayjs(message.timestamp).fromNow()}</span>
        <div className="flex gap-2">
          {message.type === 'file' && (
            <a
              href={message.filePreviewUrl || getDriveContentUrl(message.fileId)}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
              title="Open"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => onUnstar(message.id)}
            className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-red-400 transition-colors"
            title="Unstar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
