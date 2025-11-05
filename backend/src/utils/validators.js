/**
 * Validate email format
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate message text (not empty, max length)
 */
export const isValidMessageText = (text, maxLength = 10000) => {
  return text && typeof text === 'string' && text.trim().length > 0 && text.length <= maxLength;
};

/**
 * Validate device name
 */
export const isValidDeviceName = (name) => {
  return name && typeof name === 'string' && name.trim().length > 0 && name.length <= 50;
};

/**
 * Validate device type
 */
export const isValidDeviceType = (type) => {
  const validTypes = ['desktop', 'mobile', 'tablet', 'other'];
  return validTypes.includes(type);
};

/**
 * Validate file ID (Google Drive file ID format)
 */
export const isValidFileId = (fileId) => {
  return fileId && typeof fileId === 'string' && fileId.length > 0;
};

/**
 * Validate ISO date string
 */
export const isValidISODate = (dateString) => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

/**
 * Sanitize user input (remove potentially dangerous characters)
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;

  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim();
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (limit, offset) => {
  const validLimit = Math.max(1, Math.min(parseInt(limit) || 50, 100));
  const validOffset = Math.max(0, parseInt(offset) || 0);

  return { limit: validLimit, offset: validOffset };
};
