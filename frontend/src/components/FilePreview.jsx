import { useState } from 'react';
import { Play, Pause, FileText, Download } from 'lucide-react';

// Format duration from milliseconds to MM:SS or HH:MM:SS
export function formatDuration(ms) {
  if (!ms) return '0:00';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Loading skeleton component
function PreviewSkeleton({ className = '' }) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-gray-700 rounded w-full h-full"></div>
    </div>
  );
}

// Error state component
function PreviewError({ fileName, error }) {
  return (
    <div className="px-4 py-3 bg-red-900/20 border border-red-700/50 rounded">
      <p className="text-sm text-red-400 mb-1">Preview generation failed</p>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// Image preview - uses Drive direct URLs (files are public via "anyone with link")
export function ImagePreview({ message, getFileUrl, getThumbnailUrl }) {
  const { fileId, fileName } = message;

  // Use Drive thumbnail URL for preview (faster loading)
  const thumbnailUrl = getThumbnailUrl?.(fileId, 400) || getFileUrl?.(fileId);
  const fullUrl = getFileUrl?.(fileId);

  if (!thumbnailUrl) {
    return <PreviewSkeleton className="w-32 h-32" />;
  }

  return (
    <img
      src={thumbnailUrl}
      alt={fileName}
      className="max-w-xs max-h-64 rounded cursor-pointer object-cover"
      onClick={() => window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank')}
      onError={(e) => {
        console.error('Image load error for:', fileId);
        // Fallback to full URL if thumbnail fails
        if (fullUrl && e.target.src !== fullUrl) {
          e.target.src = fullUrl;
        } else {
          e.target.style.display = 'none';
        }
      }}
      loading="lazy"
    />
  );
}

// Video preview - embeds Drive player
export function VideoPreview({ message, getFileUrl }) {
  const { fileId, fileName, durationMs } = message;

  // Use Google Drive embed for video playback
  const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;

  return (
    <div className="relative max-w-xs">
      <iframe
        src={embedUrl}
        className="w-64 h-48 rounded"
        allow="autoplay; encrypted-media"
        allowFullScreen
        title={fileName}
      />
      {durationMs && (
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
          {formatDuration(durationMs)}
        </div>
      )}
    </div>
  );
}

// Audio preview - simple audio player
export function AudioPreview({ message, getFileUrl }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { fileId, fileName, durationMs } = message;

  const audioUrl = getFileUrl?.(fileId);

  if (!audioUrl) {
    return (
      <div className="flex items-center justify-center w-64 h-12 bg-gray-700 rounded">
        <span className="text-gray-400 text-xs">Loading audio...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-700/50 rounded-lg w-full max-w-xs">
      <div className="flex items-center gap-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            const audio = e.currentTarget.parentElement.parentElement.querySelector('audio');
            if (audio) {
              if (isPlaying) {
                audio.pause();
              } else {
                audio.play();
              }
              setIsPlaying(!isPlaying);
            }
          }}
          className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors flex-shrink-0"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <div className="flex-1 h-12 bg-gray-600 rounded"></div>

        {durationMs && (
          <span className="text-xs text-gray-400 flex-shrink-0">{formatDuration(durationMs)}</span>
        )}
      </div>

      <audio
        src={audioUrl}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </div>
  );
}

// PDF preview - uses Drive embed
export function PDFPreview({ message }) {
  const { fileId, fileName } = message;

  return (
    <div className="px-4 py-3 bg-gray-700/50 rounded">
      <iframe
        src={`https://drive.google.com/file/d/${fileId}/preview`}
        className="w-64 h-80 rounded mb-3"
        title={fileName}
      />
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-red-400" />
        <div>
          <p className="text-sm text-gray-300 font-medium">PDF Document</p>
          <button
            onClick={() => window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank')}
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            Open in Google Drive
          </button>
        </div>
      </div>
    </div>
  );
}

// Office document preview - uses Drive embed
export function OfficePreview({ message }) {
  const { fileId, fileName } = message;

  return (
    <div className="px-4 py-3 bg-gray-700/50 rounded">
      <iframe
        src={`https://drive.google.com/file/d/${fileId}/preview`}
        className="w-64 h-80 rounded mb-3"
        title={fileName}
      />
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-blue-400" />
        <div>
          <p className="text-sm text-gray-300 font-medium">{getOfficeFileType(fileName)}</p>
          <button
            onClick={() => window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank')}
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            Open in Google Drive
          </button>
        </div>
      </div>
    </div>
  );
}

// Generic file preview for unsupported types
export function GenericFilePreview({ message }) {
  const { fileId, fileName, fileSize } = message;

  return (
    <div className="px-4 py-3 bg-gray-700/50 rounded flex items-center gap-3">
      <Download className="w-8 h-8 text-gray-400" />
      <div className="flex-1">
        <p className="text-sm text-gray-300 font-medium truncate">{fileName}</p>
        {fileSize && <p className="text-xs text-gray-400">{(fileSize / 1024).toFixed(2)} KB</p>}
      </div>
      <button
        onClick={() => window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank')}
        className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
      >
        Open
      </button>
    </div>
  );
}

// Helper to determine Office file type
function getOfficeFileType(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'docx':
    case 'doc':
      return 'Word Document';
    case 'xlsx':
    case 'xls':
      return 'Excel Spreadsheet';
    case 'pptx':
    case 'ppt':
      return 'PowerPoint Presentation';
    default:
      return 'Office Document';
  }
}

/**
 * Main FilePreview component that routes to appropriate preview type
 *
 * Props:
 * - message: Message object with file metadata
 * - getFileUrl: Function to get Drive content URL for a file ID
 * - getThumbnailUrl: Function to get Drive thumbnail URL for a file ID
 */
export default function FilePreview({ message, getFileUrl, getThumbnailUrl }) {
  const { mimeType, fileName } = message;

  // Determine file category and render appropriate preview
  if (mimeType?.startsWith('image/')) {
    return (
      <ImagePreview message={message} getFileUrl={getFileUrl} getThumbnailUrl={getThumbnailUrl} />
    );
  }

  if (mimeType?.startsWith('video/')) {
    return <VideoPreview message={message} getFileUrl={getFileUrl} />;
  }

  if (mimeType?.startsWith('audio/')) {
    return <AudioPreview message={message} getFileUrl={getFileUrl} />;
  }

  if (mimeType === 'application/pdf') {
    return <PDFPreview message={message} />;
  }

  // Office documents
  if (
    mimeType?.includes('officedocument') ||
    mimeType?.includes('msword') ||
    mimeType?.includes('ms-excel') ||
    mimeType?.includes('ms-powerpoint')
  ) {
    return <OfficePreview message={message} />;
  }

  // Generic file preview for unsupported types
  return <GenericFilePreview message={message} />;
}
