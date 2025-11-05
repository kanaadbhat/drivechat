/**
 * Determine file category based on MIME type
 */
export const getFileCategory = (mimeType) => {
  if (!mimeType) return 'others';

  const type = mimeType.toLowerCase();

  // Documents
  const docTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
  ];

  if (docTypes.some((docType) => type.includes(docType))) {
    return 'docs';
  }

  // Images
  if (type.startsWith('image/')) {
    return 'images';
  }

  // Videos
  if (type.startsWith('video/')) {
    return 'videos';
  }

  // Audio (could be added as a separate category if needed)
  if (type.startsWith('audio/')) {
    return 'others'; // or create 'audio' category
  }

  return 'others';
};

/**
 * Get human-readable file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Validate file size (max 100MB by default)
 */
export const validateFileSize = (bytes, maxBytes = 100 * 1024 * 1024) => {
  return bytes <= maxBytes;
};

/**
 * Get file extension from filename
 */
export const getFileExtension = (filename) => {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

/**
 * Sanitize filename (remove special characters)
 */
export const sanitizeFilename = (filename) => {
  if (!filename) return 'untitled';

  // Remove path separators and other dangerous characters
  return filename
    .replace(/[/\\]/g, '_')
    .replace(/[<>:"|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 255); // Limit length
};
