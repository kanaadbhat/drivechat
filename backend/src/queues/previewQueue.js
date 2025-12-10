import { createQueue, createWorker } from './config.js';
import { generatePreviewsForFile } from '../services/previewService.js';
import logger from '../utils/logger.js';

// Queue name
const QUEUE_NAME = 'preview-generation';

// Create the preview generation queue
export const previewQueue = createQueue(QUEUE_NAME);

/**
 * Job processor for preview generation
 */
async function processPreviewJob(job) {
  const { userId, messageId, fileId, parentFolderId, mimeType, fileName } = job.data;

  logger.info(`[PreviewQueue] Processing preview generation job`, {
    jobId: job.id,
    userId,
    messageId,
    fileId,
    mimeType,
  });

  try {
    // Generate all previews for the file
    const result = await generatePreviewsForFile({
      userId,
      messageId,
      fileId,
      parentFolderId,
      mimeType,
      fileName,
    });

    logger.info(`[PreviewQueue] Preview generation completed`, {
      jobId: job.id,
      fileId,
      result,
    });

    return result;
  } catch (error) {
    logger.error(`[PreviewQueue] Preview generation failed`, {
      jobId: job.id,
      fileId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

// Create the preview worker
export const previewWorker = createWorker(QUEUE_NAME, processPreviewJob, {
  concurrency: 2, // Process 2 preview jobs at a time (CPU intensive)
  limiter: {
    max: 5,
    duration: 1000, // Max 5 jobs per second
  },
});

// Worker event handlers
previewWorker.on('completed', (job) => {
  logger.info(`[PreviewWorker] Job completed: ${job.id}`);
});

previewWorker.on('failed', (job, err) => {
  logger.error(`[PreviewWorker] Job failed: ${job?.id}`, {
    error: err.message,
    stack: err.stack,
  });
});

previewWorker.on('error', (err) => {
  logger.error(`[PreviewWorker] Worker error:`, { error: err.message });
});

/**
 * Queue a preview generation job
 * @param {Object} jobData - Preview generation job data
 */
export async function queuePreviewGeneration(jobData) {
  try {
    const job = await previewQueue.add('generate-previews', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
      },
      removeOnFail: {
        age: 86400, // Keep failed jobs for 1 day
      },
    });

    logger.info(`[PreviewQueue] Preview generation job queued: ${job.id}`, {
      fileId: jobData.fileId,
      mimeType: jobData.mimeType,
    });

    return job;
  } catch (error) {
    logger.error('[PreviewQueue] Error queueing preview generation:', error);
    throw error;
  }
}

/**
 * Get job status
 */
export async function getPreviewJobStatus(jobId) {
  try {
    const job = await previewQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
      id: job.id,
      state,
      progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  } catch (error) {
    logger.error('[PreviewQueue] Error getting job status:', error);
    throw error;
  }
}

/**
 * Update a preview job with messageId after message creation
 */
export async function updatePreviewJobWithMessageId(fileId, messageId, userId) {
  try {
    // Get all waiting or active jobs
    const waitingJobs = await previewQueue.getWaiting();
    const activeJobs = await previewQueue.getActive();
    const allJobs = [...waitingJobs, ...activeJobs];

    // Find job for this fileId
    for (const job of allJobs) {
      if (job.data.fileId === fileId && job.data.userId === userId) {
        // Update job data with messageId
        await job.updateData({
          ...job.data,
          messageId,
        });

        logger.info(`[PreviewQueue] Updated job ${job.id} with messageId: ${messageId}`);
        return true;
      }
    }

    logger.warn(`[PreviewQueue] No pending preview job found for fileId: ${fileId}`);
    return false;
  } catch (error) {
    logger.error('[PreviewQueue] Error updating job with messageId:', error);
    throw error;
  }
}
