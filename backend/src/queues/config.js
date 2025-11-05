import { Queue, Worker } from 'bullmq';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

// Redis connection options for BullMQ
const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// Default queue options
export const defaultQueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 100,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
};

// Default worker options
export const defaultWorkerOptions = {
  connection: redisConnection,
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
};

/**
 * Create a new queue with default options
 */
export function createQueue(name, options = {}) {
  const queue = new Queue(name, {
    ...defaultQueueOptions,
    ...options,
  });

  queue.on('error', (error) => {
    logger.error(`Queue ${name} error:`, error);
  });

  logger.info(`Queue ${name} created`);
  return queue;
}

/**
 * Create a worker with default options
 */
export function createWorker(name, processor, options = {}) {
  const worker = new Worker(name, processor, {
    ...defaultWorkerOptions,
    ...options,
  });

  worker.on('completed', (job) => {
    logger.success(`Job ${job.id} in queue ${name} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} in queue ${name} failed:`, err.message);
  });

  worker.on('error', (error) => {
    logger.error(`Worker ${name} error:`, error);
  });

  logger.info(`Worker ${name} started`);
  return worker;
}

export { redisConnection };
