import { useState } from 'react';
import { Play, Pause, FileText, Download } from 'lucide-react';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

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
      <div className="bg-gray-700 rounded"></div>
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

// Image preview with responsive sizes
export function ImagePreview({ message, authenticatedUrls }) {
  const { thumbStatus, thumbnailSizes, fileId, fileName } = message;

  if (thumbStatus === 'generating') {
    return <PreviewSkeleton className="w-64 h-64" />;
  }

  if (thumbStatus === 'failed') {
    return <PreviewError fileName={fileName} error={message.thumbError} />;
  }

  // Use medium thumbnail by default
  const thumbnailId = thumbnailSizes?.medium?.id || fileId;
  const imageUrl = authenticatedUrls[thumbnailId] || authenticatedUrls[fileId];

  if (!imageUrl) {
    return <PreviewSkeleton className="w-32 h-32" />;
  }

  return (
    <img
      src={imageUrl}
      alt={fileName}
      className="max-w-xs max-h-64 rounded cursor-pointer object-cover"
      onClick={() => window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank')}
      onError={(e) => {
        console.error('Image load error for thumbnail:', thumbnailId, 'original file:', fileId);
        console.error('Failed URL:', imageUrl);
        e.target.style.display = 'none';
      }}
      loading="lazy"
    />
  );
}

// Video preview with poster and duration
export function VideoPreview({ message, authenticatedUrls }) {
  const { thumbStatus, posterDriveFileId, fileId, fileName, durationMs } = message;

  if (thumbStatus === 'generating') {
    return (
      <div className="relative">
        <PreviewSkeleton className="w-64 h-48" />
        <p className="text-xs text-gray-400 mt-2">Generating preview...</p>
      </div>
    );
  }

  if (thumbStatus === 'failed') {
    return <PreviewError fileName={fileName} error={message.thumbError} />;
  }

  const videoUrl = authenticatedUrls[fileId];
  const posterUrl = posterDriveFileId ? authenticatedUrls[posterDriveFileId] : null;

  if (!videoUrl) {
    return (
      <div className="flex items-center justify-center w-64 h-48 bg-gray-700 rounded">
        <span className="text-gray-400 text-xs">Loading video...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <video
        controls
        controlsList="nodownload"
        poster={posterUrl || undefined}
        className="max-w-xs max-h-64 rounded"
        preload="metadata"
        onError={(e) => {
          console.error('Video load error for', fileId);
          e.target.style.display = 'none';
        }}
      >
        <source src={videoUrl} type={message.mimeType} />
        Your browser does not support the video tag.
      </video>
      {durationMs && (
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
          {formatDuration(durationMs)}
        </div>
      )}
    </div>
  );
}

// Audio preview with waveform
export function AudioPreview({ message, authenticatedUrls }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { thumbStatus, waveformDriveFileId, fileId, fileName, durationMs } = message;

  if (thumbStatus === 'generating') {
    return (
      <div className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg w-full max-w-xs">
        <PreviewSkeleton className="w-10 h-10 rounded-full" />
        <PreviewSkeleton className="flex-1 h-12" />
      </div>
    );
  }

  if (thumbStatus === 'failed') {
    return <PreviewError fileName={fileName} error={message.thumbError} />;
  }

  const audioUrl = authenticatedUrls[fileId];
  const waveformUrl = waveformDriveFileId ? authenticatedUrls[waveformDriveFileId] : null;

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

        {waveformUrl ? (
          <div className="flex-1">
            <img
              src={waveformUrl}
              alt="Waveform"
              className="w-full h-12 object-cover"
              onError={(e) => {
                console.error('Waveform load error');
                e.target.style.display = 'none';
              }}
            />
          </div>
        ) : (
          <div className="flex-1 h-12 bg-gray-600 rounded"></div>
        )}

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

// PDF preview with first page thumbnail
export function PDFPreview({ message, authenticatedUrls }) {
  const { thumbStatus, pdfFirstPageDriveFileId, fileId, fileName } = message;

  if (thumbStatus === 'generating') {
    return (
      <div className="px-4 py-3 bg-gray-700/50 rounded">
        <PreviewSkeleton className="w-48 h-64 mb-2" />
        <p className="text-xs text-gray-400">Generating PDF preview...</p>
      </div>
    );
  }

  if (thumbStatus === 'failed') {
    return <PreviewError fileName={fileName} error={message.thumbError} />;
  }

  const firstPageUrl = pdfFirstPageDriveFileId ? authenticatedUrls[pdfFirstPageDriveFileId] : null;

  return (
    <div className="px-4 py-3 bg-gray-700/50 rounded">
      {firstPageUrl && (
        <img
          src={firstPageUrl}
          alt={`${fileName} - First Page`}
          className="max-w-xs max-h-64 rounded mb-3 cursor-pointer"
          onClick={() => window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank')}
          onError={(e) => {
            console.error('PDF preview load error');
            e.target.style.display = 'none';
          }}
        />
      )}
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

// Office document preview (uses PDF export first page)
export function OfficePreview({ message, authenticatedUrls }) {
  const { thumbStatus, pdfFirstPageDriveFileId, fileId, fileName } = message;

  if (thumbStatus === 'generating') {
    return (
      <div className="px-4 py-3 bg-gray-700/50 rounded">
        <PreviewSkeleton className="w-48 h-64 mb-2" />
        <p className="text-xs text-gray-400">Generating preview...</p>
      </div>
    );
  }

  if (thumbStatus === 'failed') {
    return <PreviewError fileName={fileName} error={message.thumbError} />;
  }

  const firstPageUrl = pdfFirstPageDriveFileId ? authenticatedUrls[pdfFirstPageDriveFileId] : null;

  return (
    <div className="px-4 py-3 bg-gray-700/50 rounded">
      {firstPageUrl && (
        <img
          src={firstPageUrl}
          alt={`${fileName} - Preview`}
          className="max-w-xs max-h-64 rounded mb-3 cursor-pointer"
          onClick={() => window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank')}
          onError={(e) => {
            console.error('Office preview load error');
            e.target.style.display = 'none';
          }}
        />
      )}
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
  const ext = fileName.split('.').pop()?.toLowerCase();
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

// Main FilePreview component that routes to appropriate preview type
export default function FilePreview({ message, authenticatedUrls }) {
  const { mimeType, fileName } = message;

  // Determine file category
  if (mimeType?.startsWith('image/')) {
    return <ImagePreview message={message} authenticatedUrls={authenticatedUrls} />;
  }

  if (mimeType?.startsWith('video/')) {
    return <VideoPreview message={message} authenticatedUrls={authenticatedUrls} />;
  }

  if (mimeType?.startsWith('audio/')) {
    return <AudioPreview message={message} authenticatedUrls={authenticatedUrls} />;
  }

  if (mimeType === 'application/pdf') {
    return <PDFPreview message={message} authenticatedUrls={authenticatedUrls} />;
  }

  // Office documents
  if (
    mimeType?.includes('officedocument') ||
    mimeType?.includes('msword') ||
    mimeType?.includes('ms-excel') ||
    mimeType?.includes('ms-powerpoint')
  ) {
    return <OfficePreview message={message} authenticatedUrls={authenticatedUrls} />;
  }

  // Generic file preview for unsupported types
  return <GenericFilePreview message={message} />;
}
