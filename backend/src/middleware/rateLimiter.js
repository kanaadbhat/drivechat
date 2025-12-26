import rateLimit from 'express-rate-limit';

/**
 * Hybrid key generator: uses user ID if authenticated, falls back to IP
 * This prevents NAT false positives while maintaining per-user limits
 */
const hybridKeyGenerator = (req) => {
  // Clerk provides auth via req.auth middleware
  if (req.auth?.userId) {
    return `user:${req.auth.userId}`;
  }
  // Fall back to IP for unauthenticated requests
  return `ip:${req.ip}`;
};

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: hybridKeyGenerator,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET', // Don't limit GET requests
});

export const messageSendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  keyGenerator: hybridKeyGenerator,
  message: { error: 'Message sending limit exceeded. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const messageFetchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 fetches per minute
  keyGenerator: hybridKeyGenerator,
  message: { error: 'Too many sync requests. Please wait before retrying.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'GET', // Only limit GET
});

export const deviceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 devices per hour
  keyGenerator: hybridKeyGenerator,
  message: { error: 'Device registration limit exceeded. Try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'POST', // Only limit device creation
});

export const sensitiveActionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 1, // 1 attempt per day
  keyGenerator: hybridKeyGenerator,
  message: { error: 'Sensitive operation limit reached. Please try again tomorrow.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const userProfileLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  keyGenerator: hybridKeyGenerator,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export default {
  authLimiter,
  messageSendLimiter,
  messageFetchLimiter,
  deviceLimiter,
  sensitiveActionLimiter,
  userProfileLimiter,
};
