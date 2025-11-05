import { createQueue, createWorker } from './config.js';
import logger from '../utils/logger.js';

// Queue name
const QUEUE_NAME = 'ai-operations';

// Create AI operations queue
export const aiQueue = createQueue(QUEUE_NAME);

/**
 * Job processor for AI operations
 */
async function processAIJob(job) {
  const { type, data } = job.data;

  logger.info(`Processing AI job: ${type}`);

  switch (type) {
    case 'summarize':
      // Placeholder for AI summarization
      // This will be implemented when Gemini integration is added
      logger.info('AI summarization job - placeholder', data);
      return { summary: 'AI summarization not yet implemented', messageIds: data.messageIds };

    case 'analyze':
      // Placeholder for AI analysis
      logger.info('AI analysis job - placeholder', data);
      return { analysis: 'AI analysis not yet implemented' };

    case 'extract':
      // Placeholder for AI extraction (e.g., extract text from images)
      logger.info('AI extraction job - placeholder', data);
      return { extracted: 'AI extraction not yet implemented' };

    default:
      throw new Error(`Unknown AI job type: ${type}`);
  }
}

// Create worker for AI operations queue
export const aiWorker = createWorker(QUEUE_NAME, processAIJob, {
  concurrency: 1, // Process AI jobs one at a time (can be expensive)
});

/**
 * Queue an AI summarization job
 * @param {string} uid - User ID
 * @param {Array} messageIds - Array of message IDs to summarize
 */
export async function queueAISummarization(uid, messageIds) {
  try {
    const job = await aiQueue.add(
      'summarize',
      {
        type: 'summarize',
        data: { uid, messageIds },
      },
      {
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 30000, // 30 seconds between retries
        },
      }
    );

    logger.info(`AI summarization job queued: ${job.id}`);
    return job;
  } catch (error) {
    logger.error('Error queueing AI summarization:', error);
    throw error;
  }
}

/**
 * Queue an AI analysis job
 * @param {string} uid - User ID
 * @param {Object} analysisData - Data to analyze
 */
export async function queueAIAnalysis(uid, analysisData) {
  try {
    const job = await aiQueue.add(
      'analyze',
      {
        type: 'analyze',
        data: { uid, ...analysisData },
      },
      {
        attempts: 2,
      }
    );

    logger.info(`AI analysis job queued: ${job.id}`);
    return job;
  } catch (error) {
    logger.error('Error queueing AI analysis:', error);
    throw error;
  }
}

export default aiQueue;
