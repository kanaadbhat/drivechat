import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, FileText, Download } from 'lucide-react';
import { downloadFileFromDrive, hasValidToken } from '../utils/gisClient';

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

// Image preview - uses Drive direct URLs (files are public via "anyone with link")
export function ImagePreview({
  message,
  getFileUrl,
  getThumbnailUrl,
  variant = 'default',
  onFallback,
}) {
  const { fileId, fileName } = message;

  // Use Drive thumbnail URL for preview (faster loading)
  const thumbnailUrl = getThumbnailUrl?.(fileId, 400) || getFileUrl?.(fileId);
  const fullUrl = getFileUrl?.(fileId);
  const [downloadAttempted, setDownloadAttempted] = useState(false);
  const [blobUrl, setBlobUrl] = useState('');
  const blobRef = useRef('');

  const releaseBlob = useCallback(() => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = '';
    }
  }, []);

  useEffect(() => {
    return () => releaseBlob();
  }, [releaseBlob]);

  useEffect(() => {
    releaseBlob();
    // Defer state updates to avoid synchronous setState inside effect
    const t = setTimeout(() => {
      setBlobUrl('');
      setDownloadAttempted(false);
    }, 0);
    return () => clearTimeout(t);
  }, [fileId, releaseBlob]);

  const setBlob = (url) => {
    releaseBlob();
    blobRef.current = url;
    setBlobUrl(url);
  };

  const downloadFallback = useCallback(async () => {
    if (!hasValidToken()) {
      console.info('[ImagePreview] Skipping fallback download; Drive token missing');
      onFallback?.();
      return;
    }
    setDownloadAttempted(true);
    try {
      const blob = await downloadFileFromDrive(fileId, message.mimeType);
      const url = URL.createObjectURL(blob);
      setBlob(url);
    } catch (err) {
      console.warn('[ImagePreview] fallback download failed', err?.message);
      onFallback?.();
    }
  }, [fileId, message.mimeType, onFallback]);

  useEffect(() => {
    if (!thumbnailUrl && !fullUrl && !downloadAttempted) {
      // Defer fallback invocation to avoid synchronous setState in effect
      const t = setTimeout(() => {
        downloadFallback();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [thumbnailUrl, fullUrl, downloadAttempted, downloadFallback]);

  const sizeClass = variant === 'compact' ? 'max-h-48' : 'max-h-64';

  const src = blobUrl || thumbnailUrl || fullUrl;

  const handleError = () => {
    if (!downloadAttempted) {
      downloadFallback();
    } else {
      onFallback?.();
    }
  };

  if (!src) {
    return <PreviewSkeleton className={`w-full ${sizeClass}`} />;
  }

  return (
    <img
      src={src}
      alt={fileName}
      className={`max-w-full ${sizeClass} rounded cursor-pointer object-cover`}
      onClick={() => window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank')}
      onError={handleError}
      loading="lazy"
    />
  );
}

// Video preview - embeds Drive player
export function VideoPreview({ message, getFileUrl, variant = 'default', onFallback, shouldLoad }) {
  const { fileId, fileName, durationMs, mimeType } = message;
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    let revokedUrl = '';
    let cancelled = false;
    if (!shouldLoad) {
      const resetId = setTimeout(() => setPreviewUrl(''), 0);
      return () => clearTimeout(resetId);
    }
    const load = async () => {
      if (!hasValidToken()) {
        console.info('[VideoPreview] Skipping preview; Drive token missing');
        onFallback?.();
        return;
      }
      try {
        const blob = await downloadFileFromDrive(fileId, mimeType);
        if (cancelled) return;
        revokedUrl = URL.createObjectURL(blob);
        setPreviewUrl(revokedUrl);
      } catch (err) {
        if (cancelled) return;
        console.warn('Video preview failed', err?.message);
        onFallback?.();
      }
    };
    load();
    return () => {
      cancelled = true;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [fileId, mimeType, shouldLoad]);

  const sizeClass = variant === 'compact' ? 'w-56 h-40' : 'w-64 h-48';

  return (
    <div className="relative max-w-xs">
      {previewUrl ? (
        <video src={previewUrl} className={`${sizeClass} rounded bg-black`} controls />
      ) : (
        <div
          className={`${sizeClass} rounded bg-gray-800 flex items-center justify-center text-gray-400 text-xs`}
        >
          Loading preview...
        </div>
      )}
      {durationMs && (
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
          {formatDuration(durationMs)}
        </div>
      )}
      <div className="mt-2 text-xs text-gray-300">
        <button
          onClick={() => window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank')}
          className="text-blue-400 hover:text-blue-300 underline"
        >
          Open in Google Drive
        </button>
      </div>
    </div>
  );
}

// Audio preview - simple audio player
export function AudioPreview({ message, getFileUrl, variant = 'default', onFallback }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { fileId, fileName, durationMs } = message;

  const audioUrl = getFileUrl?.(fileId);

  if (!audioUrl) {
    onFallback?.();
    return null;
  }

  const pad = variant === 'compact' ? 'p-2' : 'p-3';

  return (
    <div className={`flex flex-col gap-2 ${pad} bg-gray-700/50 rounded-lg w-full max-w-xs`}>
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
          className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors shrink-0"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <div className="flex-1 h-12 bg-gray-600 rounded"></div>

        {durationMs && (
          <span className="text-xs text-gray-400 shrink-0">{formatDuration(durationMs)}</span>
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
export function PDFPreview({ message, variant = 'default', onFallback, shouldLoad }) {
  const { fileId, fileName, mimeType } = message;
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    let revokedUrl = '';
    let cancelled = false;
    if (!shouldLoad) {
      const resetId = setTimeout(() => setPreviewUrl(''), 0);
      return () => clearTimeout(resetId);
    }
    const load = async () => {
      if (!hasValidToken()) {
        console.info('[PDFPreview] Skipping preview; Drive token missing');
        onFallback?.();
        return;
      }
      try {
        const blob = await downloadFileFromDrive(fileId, mimeType || 'application/pdf');
        if (cancelled) return;
        revokedUrl = URL.createObjectURL(blob);
        setPreviewUrl(revokedUrl);
      } catch (err) {
        if (cancelled) return;
        console.warn('PDF preview failed', err?.message);
        onFallback?.();
      }
    };
    load();
    return () => {
      cancelled = true;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [fileId, mimeType, shouldLoad]);

  const sizeClass = variant === 'compact' ? 'w-full h-64' : 'w-64 h-80';

  return (
    <div className="px-4 py-3 bg-gray-700/50 rounded">
      {previewUrl ? (
        <iframe src={previewUrl} className={`${sizeClass} rounded mb-3`} title={fileName} />
      ) : (
        <div
          className={`${sizeClass} rounded mb-3 bg-gray-800 flex items-center justify-center text-gray-400 text-sm`}
        >
          Loading preview...
        </div>
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

// Office document preview - uses Drive embed
// Office previews defer to generic card to avoid large placeholders

// Generic file preview for unsupported types
export function GenericFilePreview({ message, variant = 'default' }) {
  const { fileId, fileName, fileSize } = message;

  const pad = variant === 'compact' ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className={`${pad} bg-gray-700/50 rounded flex items-center gap-3`}>
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

/**
 * Main FilePreview component that routes to appropriate preview type
 *
 * Props:
 * - message: Message object with file metadata
 * - getFileUrl: Function to get Drive content URL for a file ID
 * - getThumbnailUrl: Function to get Drive thumbnail URL for a file ID
 */
export default function FilePreview({ message, getFileUrl, getThumbnailUrl, variant = 'default' }) {
  const { mimeType, fileName } = message;
  const [useFallback, setUseFallback] = useState(false);
  const isHeavyType =
    mimeType?.startsWith('video/') ||
    mimeType === 'application/pdf' ||
    mimeType?.startsWith('audio/');
  const [shouldLoad, setShouldLoad] = useState(!isHeavyType);

  const fallback = () => setUseFallback(true);

  if (isHeavyType && !shouldLoad) {
    return (
      <div className="relative overflow-hidden rounded-lg bg-gray-800/70 border border-gray-700 p-4 space-y-3">
        <div className="relative h-32 w-full overflow-hidden rounded-lg bg-gradient-to-br from-gray-800 via-gray-850 to-gray-900">
          <div className="absolute inset-0 backdrop-blur-lg bg-white/5" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-gray-900/60 border border-white/15 shadow-lg shadow-black/30">
              <button
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full"
                onClick={() => setShouldLoad(true)}
              >
                Load preview
              </button>
              <span className="text-[11px] text-gray-200">
                Preview on demand to save bandwidth.
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-gray-100 font-semibold truncate" title={fileName}>
            {fileName}
          </p>
        </div>
      </div>
    );
  }

  if (useFallback) {
    return <GenericFilePreview message={message} variant={variant} />;
  }

  // Determine file category and render appropriate preview
  if (mimeType?.startsWith('image/')) {
    return (
      <ImagePreview
        message={message}
        getFileUrl={getFileUrl}
        getThumbnailUrl={getThumbnailUrl}
        variant={variant}
        onFallback={fallback}
      />
    );
  }

  if (mimeType?.startsWith('video/')) {
    return (
      <VideoPreview
        message={message}
        getFileUrl={getFileUrl}
        variant={variant}
        onFallback={fallback}
        shouldLoad={shouldLoad}
      />
    );
  }

  if (mimeType?.startsWith('audio/')) {
    return (
      <AudioPreview
        message={message}
        getFileUrl={getFileUrl}
        variant={variant}
        onFallback={fallback}
        shouldLoad={shouldLoad}
      />
    );
  }

  if (mimeType === 'application/pdf') {
    return (
      <PDFPreview
        message={message}
        variant={variant}
        onFallback={fallback}
        shouldLoad={shouldLoad}
      />
    );
  }

  // Office documents
  if (
    mimeType?.includes('officedocument') ||
    mimeType?.includes('msword') ||
    mimeType?.includes('ms-excel') ||
    mimeType?.includes('ms-powerpoint')
  ) {
    return <GenericFilePreview message={message} variant={variant} />;
  }

  // Generic file preview for unsupported types
  return <GenericFilePreview message={message} variant={variant} />;
}
