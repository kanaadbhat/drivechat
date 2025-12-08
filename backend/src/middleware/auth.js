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

    // Verify token with Clerk with clock skew tolerance
    const payload = await clerk.verifyToken(token, {
      clockSkewInMs: 10000, // Allow 10 seconds clock skew
    });

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
 * Middleware for OAuth flows - accepts token from query string OR header
 * Use this for OAuth redirect endpoints where we can't send headers
 */
export const requireAuthFlexible = async (req, res, next) => {
  try {
    console.log('[DEBUG] [requireAuthFlexible] Checking authentication...');
    let token;

    // Try to get token from Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      console.log('[DEBUG]   ✅ Token found in Authorization header');
    }
    // Fallback: get token from query string (for OAuth redirects)
    else if (req.query.token) {
      token = req.query.token;
      console.log('[DEBUG]   ✅ Token found in query string');
    }

    if (!token) {
      console.log('[DEBUG]   ❌ No token provided');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
    }

    // Verify token with Clerk with clock skew tolerance
    const payload = await clerk.verifyToken(token, {
      clockSkewInMs: 10000, // Allow 10 seconds clock skew
    });

    if (!payload || !payload.sub) {
      console.log('[DEBUG]   ❌ Invalid token');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authentication token',
      });
    }

    // Attach user ID to request
    req.userId = payload.sub;
    req.user = payload;

    console.log('[DEBUG]   ✅ Authenticated user:', req.userId);
    next();
  } catch (error) {
    console.error('[DEBUG]   ❌ Auth error:', error.message);
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
