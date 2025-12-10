import { triggerImmediateCleanup } from '../queues/cleanupQueue.js';
import { cleanupQueue, fileQueue, previewQueue } from '../queues/index.js';

import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Manually trigger cleanup of expired messages
 */
export const triggerCleanup = asyncHandler(async (req, res) => {
  const job = await triggerImmediateCleanup();

  res.json({
    success: true,
    message: 'Cleanup job triggered',
    jobId: job.id,
  });
});

/**
 * Get cleanup statistics
 */
export const getCleanupStats = asyncHandler(async (req, res) => {
  const [cleanupCounts, fileCounts, previewCounts] = await Promise.all([
    cleanupQueue.getJobCounts(),
    fileQueue.getJobCounts(),
    previewQueue.getJobCounts(),
  ]);

  res.json({
    stats: {
      cleanup: cleanupCounts,
      file: fileCounts,
      preview: previewCounts,
    },
  });
});

/**
 * Get system statistics
 */
export const getSystemStats = asyncHandler(async (req, res) => {
  const { userId } = req;

  // Get basic system stats
  const stats = {
    server: {
      uptime: process.uptime(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
    user: {
      userId,
      authenticated: true,
    },
  };

  res.json({ stats });
});
