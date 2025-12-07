// import { triggerImmediateCleanup } from '../queues/cleanupQueue.js';
// import { cleanupQueue, fileQueue, aiQueue } from '../queues/index.js';

/**
 * Manually trigger cleanup of expired messages
 */

/**
 * Disabled: Manually trigger cleanup of expired messages
 */
export const triggerCleanup = async (req, res) => {
  // Queue system is disabled
  res.status(503).json({
    error: 'Queue system is disabled',
    message: 'Manual cleanup is unavailable while queues are disabled.',
  });
};

/**
 * Get cleanup statistics
 */

/**
 * Disabled: Get cleanup statistics
 */
export const getCleanupStats = async (req, res) => {
  // Queue system is disabled
  res.status(503).json({
    error: 'Queue system is disabled',
    message: 'Cleanup stats are unavailable while queues are disabled.',
  });
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
