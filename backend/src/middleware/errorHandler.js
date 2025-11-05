/**
 * Global error handler middleware
 */
export const errorHandler = (err, req, res) => {
  console.error('❌ Error:', err);

  // Default error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Clerk errors
  if (err.clerkError) {
    statusCode = 401;
    message = 'Authentication error';
  }

  // Firebase errors
  if (err.code && err.code.startsWith('firestore/')) {
    statusCode = 400;
    message = `Firestore error: ${err.message}`;
  }

  // Google API errors
  if (err.code && typeof err.code === 'number') {
    statusCode = err.code;
    message = err.message || 'Google API error';
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  }

  // Send error response
  res.status(statusCode).json({
    error: err.name || 'Error',
    message: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err.details,
    }),
  });
};

/**
 * Async handler wrapper to catch errors in async routes
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default errorHandler;
