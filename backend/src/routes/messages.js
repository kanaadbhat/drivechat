import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  messageFetchLimiter,
  messageSendLimiter,
  sensitiveActionLimiter,
} from '../middleware/rateLimiter.js';
import * as messageController from '../controllers/messageController.js';

const router = express.Router();

// All message routes require authentication
router.use(requireAuth);

// Get all messages
router.get('/', messageFetchLimiter, asyncHandler(messageController.getMessages));

// Pending Drive deletions (offline sync)
router.get(
  '/pending-deletions',
  messageFetchLimiter,
  asyncHandler(messageController.listPendingDeletions)
);
router.post(
  '/pending-deletions/ack',
  messageSendLimiter,
  asyncHandler(messageController.ackPendingDeletions)
);

// Get messages by category
router.get(
  '/category/:category',
  messageFetchLimiter,
  asyncHandler(messageController.getMessagesByCategory)
);

// Delete all messages (must be before /:id route)
router.delete(
  '/all',
  sensitiveActionLimiter,
  messageSendLimiter,
  asyncHandler(messageController.deleteAllMessages)
);

// Unstar all starred messages
router.patch('/unstar-all', messageSendLimiter, asyncHandler(messageController.unstarAllMessages));

// Get single message
router.get('/:id', messageFetchLimiter, asyncHandler(messageController.getMessage));

// Create message
router.post('/', messageSendLimiter, asyncHandler(messageController.createMessage));

// Update message (star/unstar, edit)
router.patch('/:id', messageSendLimiter, asyncHandler(messageController.updateMessage));

// Ack client Drive executor status
router.post('/:id/drive-ack', messageSendLimiter, asyncHandler(messageController.ackDriveExecutor));

// Delete message
router.delete('/:id', messageSendLimiter, asyncHandler(messageController.deleteMessage));

export default router;
