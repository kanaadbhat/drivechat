import logger from '../utils/logger.js';

// Import cleanup queue only
import { cleanupQueue, cleanupWorker, setupPeriodicCleanup } from './cleanupQueue.js';

// Export active queues and functions
export { cleanupQueue, cleanupWorker };
export {
  scheduleMessageDeletion,
  cancelMessageDeletion,
  triggerImmediateCleanup,
} from './cleanupQueue.js';

/**
 * Initialize all queues and workers
 */
export async function initializeQueues() {
  try {
    logger.info('🚀 Initializing queue system...');

    // All queue workers are automatically started when imported
    logger.info('✅ Cleanup queue worker initialized');

    // Setup periodic cleanup tasks
    if (String(process.env.SKIP_PERIODIC_CLEANUP || '').toLowerCase() === 'true') {
      logger.warn('⚠️  SKIP_PERIODIC_CLEANUP=true; skipping periodic cleanup scheduling');
    } else {
      await setupPeriodicCleanup();
    }

    logger.success('✅ Queue system initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize queue system:', error);
    throw error;
  }
}

/**
 * Gracefully shutdown all queues and workers
 */
export async function shutdownQueues() {
  logger.info('Shutting down queue system...');
  const shutdownPromises = [];

  // Only cleanup queue remains - Drive/file queues retired
  if (cleanupWorker) shutdownPromises.push(cleanupWorker.close());
  if (cleanupQueue) shutdownPromises.push(cleanupQueue.close());

  await Promise.all(shutdownPromises);
  logger.success('✅ Queue system shutdown complete');
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: shutting down queues');
  await shutdownQueues();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: shutting down queues');
  await shutdownQueues();
  process.exit(0);
});

export default {
  initializeQueues,
  shutdownQueues,
};
