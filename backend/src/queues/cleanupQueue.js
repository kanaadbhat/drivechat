import { createQueue, createWorker } from './config.js';
import { cleanupExpiredMessages, cleanupTempFiles } from '../services/cleanupService.js';
import logger from '../utils/logger.js';

// Queue name
const QUEUE_NAME = 'cleanup';

// Queue system is disabled
// export const cleanupQueue = createQueue(QUEUE_NAME);
export const cleanupQueue = null;

/**
 * Job processor for cleanup tasks
 */
async function processCleanupJob(job) {
  const { type, data } = job.data;

  logger.info(`Processing cleanup job: ${type}`, data);

  switch (type) {
    case 'expired-messages':
      return await cleanupExpiredMessages();

    case 'temp-files':
      return await cleanupTempFiles();

    case 'specific-message': {
      // Delete a specific message after its expiration time
      const { uid, messageId } = data;
      return await cleanupExpiredMessages({ uid, messageId });
    }

    default:
      throw new Error(`Unknown cleanup job type: ${type}`);
  }
}

// Queue system is disabled
// export const cleanupWorker = createWorker(QUEUE_NAME, processCleanupJob, {
//   concurrency: 2, // Process 2 cleanup jobs at a time
// });
export const cleanupWorker = null;

/**
 * Schedule a message for auto-deletion
 * @param {string} uid - User ID
 * @param {string} messageId - Message ID
 * @param {Date} expiresAt - When the message should be deleted
 */
export async function scheduleMessageDeletion(uid, messageId, expiresAt) {
  try {
    const delay = new Date(expiresAt).getTime() - Date.now();

    if (delay <= 0) {
      logger.warn(`Message ${messageId} already expired, deleting immediately`);
      await cleanupQueue.add(
        'specific-message',
        {
          type: 'specific-message',
          data: { uid, messageId },
        },
        { priority: 10 }
      );
      return;
    }

    await cleanupQueue.add(
      'specific-message',
      {
        type: 'specific-message',
        data: { uid, messageId },
      },
      {
        delay,
        jobId: `delete-${uid}-${messageId}`,
        removeOnComplete: true,
      }
    );

    logger.info(`Scheduled deletion for message ${messageId} in ${delay}ms`);
  } catch (error) {
    logger.error('Error scheduling message deletion:', error);
    throw error;
  }
}

/**
 * Cancel scheduled message deletion (e.g., when starred)
 * @param {string} uid - User ID
 * @param {string} messageId - Message ID
 */
export async function cancelMessageDeletion(uid, messageId) {
  try {
    const jobId = `delete-${uid}-${messageId}`;
    const job = await cleanupQueue.getJob(jobId);

    if (job) {
      await job.remove();
      logger.info(`Cancelled deletion for message ${messageId}`);
    }
  } catch (error) {
    logger.error('Error cancelling message deletion:', error);
    throw error;
  }
}

/**
 * Setup periodic cleanup jobs
 */
export async function setupPeriodicCleanup() {
  try {
    // Clean up expired messages every 6 hours
    await cleanupQueue.add(
      'expired-messages',
      {
        type: 'expired-messages',
      },
      {
        repeat: {
          pattern: '0 */1 * * *',
        },
        jobId: 'periodic-expired-messages-cleanup',
      }
    );

    // Clean up temp files every 24 hours
    await cleanupQueue.add(
      'temp-files',
      {
        type: 'temp-files',
      },
      {
        repeat: {
          pattern: '0 2 * * *', // Daily at 2 AM
        },
        jobId: 'periodic-temp-files-cleanup',
      }
    );

    logger.success('✅ Periodic cleanup jobs scheduled');
  } catch (error) {
    logger.error('Error setting up periodic cleanup:', error);
    throw error;
  }
}

/**
 * Trigger immediate cleanup of expired messages
 */
export async function triggerImmediateCleanup() {
  try {
    const job = await cleanupQueue.add(
      'expired-messages',
      {
        type: 'expired-messages',
      },
      {
        priority: 1,
      }
    );

    logger.info(`Immediate cleanup job queued: ${job.id}`);
    return job;
  } catch (error) {
    logger.error('Error triggering immediate cleanup:', error);
    throw error;
  }
}

export default cleanupQueue;
