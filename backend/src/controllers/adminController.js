import { triggerImmediateCleanup } from '../queues/cleanupQueue.js';
import { cleanupQueue, fileQueue, aiQueue } from '../queues/index.js';

/**
 * Manually trigger cleanup of expired messages
 */
export const triggerCleanup = async (req, res) => {
  try {
    console.log('🧹 Manual cleanup triggered');
    const job = await triggerImmediateCleanup();

    res.json({
      success: true,
      message: 'Cleanup job queued',
      jobId: job.id,
      queuedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cleanup trigger error:', error);
    res.status(500).json({
      error: 'Cleanup failed',
      message: error.message,
    });
  }
};

/**
 * Get cleanup statistics
 */
export const getCleanupStats = async (req, res) => {
  try {
    // Get queue stats
    const [cleanupCounts, fileCounts, aiCounts] = await Promise.all([
      cleanupQueue.getJobCounts(),
      fileQueue.getJobCounts(),
      aiQueue.getJobCounts(),
    ]);

    // Get completed jobs from last 24 hours
    const [completedCleanup, completedFile, completedAI] = await Promise.all([
      cleanupQueue.getCompleted(0, 100),
      fileQueue.getCompleted(0, 100),
      aiQueue.getCompleted(0, 100),
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      status: 'operational',
      queues: {
        cleanup: {
          ...cleanupCounts,
          recentCompleted: completedCleanup.length,
        },
        fileOperations: {
          ...fileCounts,
          recentCompleted: completedFile.length,
        },
        aiOperations: {
          ...aiCounts,
          recentCompleted: completedAI.length,
        },
      },
    });
  } catch (error) {
    console.error('Get cleanup stats error:', error);
    res.status(500).json({
      error: 'Failed to get cleanup stats',
      message: error.message,
    });
  }
};

/**
 * Get system statistics
 */
export const getSystemStats = async (req, res) => {
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
};
