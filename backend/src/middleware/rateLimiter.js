import rateLimit from 'express-rate-limit';

function createLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down and try again later.' },
  });
}

// Defaults - can be overridden via environment variables
const DEFAULT_MESSAGES_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MESSAGES_MAX = 120; // 120 requests / 15 min

const DEFAULT_USERS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_USERS_MAX = 60; // 60 requests / 15 min

export const messagesRateLimiter = createLimiter({
  windowMs: DEFAULT_MESSAGES_WINDOW_MS,
  max: DEFAULT_MESSAGES_MAX,
});

export const usersRateLimiter = createLimiter({
  windowMs: DEFAULT_USERS_WINDOW_MS,
  max: DEFAULT_USERS_MAX,
});

export default { messagesRateLimiter, usersRateLimiter };
