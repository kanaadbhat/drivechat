import clerk from '../config/clerk.js';

/**
 * Middleware to verify Clerk authentication token
 */
export const requireAuth = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Clerk
    const payload = await clerk.verifyToken(token);

    if (!payload || !payload.sub) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authentication token',
      });
    }

    // Attach user ID to request
    req.userId = payload.sub;
    req.user = payload;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication failed',
    });
  }
};

/**
 * Optional auth - doesn't fail if no token provided
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await clerk.verifyToken(token);

      if (payload && payload.sub) {
        req.userId = payload.sub;
        req.user = payload;
      }
    }

    next();
  } catch (error) {
    // Just log and continue
    console.warn('Optional auth failed:', error.message);
    next();
  }
};

export default requireAuth;
