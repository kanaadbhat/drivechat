import { createQueue, createWorker } from './config.js';
import { processFileUpload, processFileDelete } from '../services/fileService.js';
import logger from '../utils/logger.js';

// Queue name
const QUEUE_NAME = 'file-operations';

// Queue system is disabled
// export const fileQueue = createQueue(QUEUE_NAME);
export const fileQueue = null;

/**
 * Job processor for file operations
 */
async function processFileJob(job) {
  const { type, data } = job.data;

  logger.info(`Processing file job: ${type}`, { fileId: data.fileId });

  switch (type) {
    case 'upload':
      return await processFileUpload(data);

    case 'delete':
      return await processFileDelete(data);

    case 'batch-delete': {
      // Delete multiple files at once
      const results = [];
      for (const fileData of data.files) {
        try {
          const result = await processFileDelete(fileData);
          results.push({ success: true, fileId: fileData.fileId, result });
        } catch (error) {
          results.push({ success: false, fileId: fileData.fileId, error: error.message });
        }
      }
      return results;
    }

    default:
      throw new Error(`Unknown file job type: ${type}`);
  }
}

// Queue system is disabled
// export const fileWorker = createWorker(QUEUE_NAME, processFileJob, {
//   concurrency: 3, // Process 3 file operations at a time
// });
export const fileWorker = null;

/**
 * Queue a file upload job
 * @param {Object} uploadData - File upload data
 */
export async function queueFileUpload(uploadData) {
  try {
    const job = await fileQueue.add(
      'upload',
      {
        type: 'upload',
        data: uploadData,
      },
      {
        attempts: 5, // More retries for uploads
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
      }
    );

    logger.info(`File upload job queued: ${job.id}`);
    return job;
  } catch (error) {
    logger.error('Error queueing file upload:', error);
    throw error;
  }
}

/**
 * Queue a file deletion job
 * @param {Object} deleteData - File deletion data
 */
export async function queueFileDelete(deleteData) {
  try {
    const job = await fileQueue.add(
      'delete',
      {
        type: 'delete',
        data: deleteData,
      },
      {
        attempts: 3,
      }
    );

    logger.info(`File deletion job queued: ${job.id}`);
    return job;
  } catch (error) {
    logger.error('Error queueing file deletion:', error);
    throw error;
  }
}

/**
 * Queue batch file deletion
 * @param {Array} files - Array of file deletion data
 */
export async function queueBatchFileDelete(files) {
  try {
    const job = await fileQueue.add(
      'batch-delete',
      {
        type: 'batch-delete',
        data: { files },
      },
      {
        attempts: 2,
      }
    );

    logger.info(`Batch file deletion job queued: ${job.id} (${files.length} files)`);
    return job;
  } catch (error) {
    logger.error('Error queueing batch file deletion:', error);
    throw error;
  }
}

export default fileQueue;
