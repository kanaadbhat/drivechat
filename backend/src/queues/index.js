import logger from '../utils/logger.js';

// Import preview queue system
import { previewQueue, previewWorker } from './previewQueue.js';

// Export preview queue and related functions
export { previewQueue, previewWorker };
export { queuePreviewGeneration, getPreviewJobStatus } from './previewQueue.js';

// Queue system imports and exports are disabled due to Redis connection issues
// import { cleanupQueue, cleanupWorker, setupPeriodicCleanup } from './cleanupQueue.js';
// import { fileQueue, fileWorker } from './fileQueue.js';
// import { aiQueue, aiWorker } from './aiQueue.js';
// export { cleanupQueue, cleanupWorker, fileQueue, fileWorker, aiQueue, aiWorker };
// export {
//   scheduleMessageDeletion,
//   cancelMessageDeletion,
//   triggerImmediateCleanup,
// } from './cleanupQueue.js';
// export { queueFileUpload, queueFileDelete, queueBatchFileDelete } from './fileQueue.js';
// export { queueAISummarization, queueAIAnalysis } from './aiQueue.js';

/**
 * Initialize all queues and workers
 */
export async function initializeQueues() {
  try {
    logger.info('🚀 Initializing queue system...');

    // Preview queue worker is automatically started when imported
    logger.info('✅ Preview queue worker initialized');
    logger.info('Active queues: preview-generation');

    // Other queues disabled due to Redis connection issues
    // await setupPeriodicCleanup();

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

  if (previewWorker) shutdownPromises.push(previewWorker.close());

  // Other workers disabled
  // if (cleanupWorker) shutdownPromises.push(cleanupWorker.close());
  // if (fileWorker) shutdownPromises.push(fileWorker.close());
  // if (aiWorker) shutdownPromises.push(aiWorker.close());

  if (previewQueue) shutdownPromises.push(previewQueue.close());

  // Other queues disabled
  // if (cleanupQueue) shutdownPromises.push(cleanupQueue.close());
  // if (fileQueue) shutdownPromises.push(fileQueue.close());
  // if (aiQueue) shutdownPromises.push(aiQueue.close());

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
