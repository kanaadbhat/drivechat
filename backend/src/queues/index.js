import logger from '../utils/logger.js';

// Import all queue systems
import { previewQueue, previewWorker } from './previewQueue.js';
import { cleanupQueue, cleanupWorker, setupPeriodicCleanup } from './cleanupQueue.js';
import { fileQueue, fileWorker } from './fileQueue.js';

// Export all queues and workers
export { previewQueue, previewWorker };
export { cleanupQueue, cleanupWorker };
export { fileQueue, fileWorker };

// Export queue functions
export { queuePreviewGeneration, getPreviewJobStatus } from './previewQueue.js';
export {
  scheduleMessageDeletion,
  cancelMessageDeletion,
  triggerImmediateCleanup,
} from './cleanupQueue.js';
export { queueFileUpload, queueFileDelete, queueBatchFileDelete } from './fileQueue.js';

/**
 * Initialize all queues and workers
 */
export async function initializeQueues() {
  try {
    logger.info('🚀 Initializing queue system...');

    // All queue workers are automatically started when imported
    logger.info('✅ Preview queue worker initialized');
    logger.info('✅ Cleanup queue worker initialized');
    logger.info('✅ File queue worker initialized');

    // Setup periodic cleanup tasks
    if (String(process.env.SKIP_PERIODIC_CLEANUP || '').toLowerCase() === 'true') {
      logger.warn('⚠️  SKIP_PERIODIC_CLEANUP=true; skipping periodic cleanup scheduling');
    } else {
      await setupPeriodicCleanup();
    }

    logger.info('Active queues: preview-generation, cleanup, file-operations');
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

  // Close all workers
  if (previewWorker) shutdownPromises.push(previewWorker.close());
  if (cleanupWorker) shutdownPromises.push(cleanupWorker.close());
  if (fileWorker) shutdownPromises.push(fileWorker.close());

  // Close all queues
  if (previewQueue) shutdownPromises.push(previewQueue.close());
  if (cleanupQueue) shutdownPromises.push(cleanupQueue.close());
  if (fileQueue) shutdownPromises.push(fileQueue.close());

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
