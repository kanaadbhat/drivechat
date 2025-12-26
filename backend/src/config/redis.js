import Redis from 'ioredis';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

/**
 * Single source of truth:
 * REDIS_URL
 *
 * Examples:
 *  - Local dev:     redis://localhost:6379
 *  - Docker:        redis://drivechat-redis-test:6379
 *  - Render:        redis://red-xxxxx:6379
 */
if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required');
}

// Create Redis connection
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

redis.on('connect', () => {
  logger.success('✅ Redis connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis client ready');
});

redis.on('error', (err) => {
  logger.error('❌ Redis connection error:', err);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing Redis connection');
  await redis.quit();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing Redis connection');
  await redis.quit();
});

export default redis;
