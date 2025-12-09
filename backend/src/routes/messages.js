import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as messageController from '../controllers/messageController.js';

const router = express.Router();

// All message routes require authentication
router.use(requireAuth);

// Get all messages
router.get('/', asyncHandler(messageController.getMessages));

// Search messages
router.get('/search', asyncHandler(messageController.searchMessages));

// Get messages by category
router.get('/category/:category', asyncHandler(messageController.getMessagesByCategory));

// Delete all messages (must be before /:id route)
router.delete('/all', asyncHandler(messageController.deleteAllMessages));

// Unstar all starred messages
router.patch('/unstar-all', asyncHandler(messageController.unstarAllMessages));

// Get single message
router.get('/:id', asyncHandler(messageController.getMessage));

// Create message
router.post('/', asyncHandler(messageController.createMessage));

// Update message (star/unstar, edit)
router.patch('/:id', asyncHandler(messageController.updateMessage));

// Delete message
router.delete('/:id', asyncHandler(messageController.deleteMessage));

export default router;
