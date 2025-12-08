import { firestoreHelpers, admin } from '../config/firebase.js';
// Queue system is disabled for now
// import { scheduleMessageDeletion, cancelMessageDeletion } from '../queues/cleanupQueue.js';

/**
 * Get all messages for the authenticated user
 */
export const getMessages = async (req, res) => {
  const { userId } = req;
  const { limit = 100 } = req.query;

  const messages = await firestoreHelpers.getUserMessages(userId, parseInt(limit));

  res.json({
    messages,
    count: messages.length,
  });
};

/**
 * Get a single message
 */
export const getMessage = async (req, res) => {
  const { userId } = req;
  const { id } = req.params;

  const message = await firestoreHelpers.getMessage(userId, id);

  if (!message) {
    return res.status(404).json({
      error: 'Message not found',
    });
  }

  res.json({ message });
};

/**
 * Create a new message
 */
export const createMessage = async (req, res) => {
  const { userId } = req;
  const {
    type,
    text,
    fileId,
    fileName,
    fileSize,
    mimeType,
    fileCategory,
    filePreviewUrl,
    deviceId,
    deviceName,
  } = req.body;

  // Validate required fields
  if (!type || !deviceId || !deviceName) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['type', 'deviceId', 'deviceName'],
    });
  }

  if (type === 'text' && !text) {
    return res.status(400).json({
      error: 'Text message requires text field',
    });
  }

  if (type === 'file' && (!fileId || !fileName)) {
    return res.status(400).json({
      error: 'File message requires fileId and fileName',
    });
  }

  // Create message data
  const messageData = {
    type,
    sender: {
      deviceId,
      deviceName,
    },
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    starred: false,
    readAt: null,
    edited: false,
    editedAt: null,
  };

  // Add type-specific fields
  if (type === 'text') {
    messageData.text = text;
  } else if (type === 'file') {
    messageData.fileId = fileId;
    messageData.fileName = fileName;
    messageData.fileSize = fileSize || 0;
    messageData.mimeType = mimeType || 'application/octet-stream';
    messageData.fileCategory = fileCategory || 'others';
    messageData.filePreviewUrl = filePreviewUrl || null;
  }

  // Create message in Firestore
  const message = await firestoreHelpers.createMessage(userId, messageData);

  // Schedule auto-deletion if message has expiry (disabled for now)
  // if (messageData.expiresAt && !messageData.starred) {
  //   try {
  //     await scheduleMessageDeletion(userId, message.id, messageData.expiresAt);
  //   } catch (error) {
  //     console.error('Failed to schedule message deletion:', error);
  //   }
  // }

  // Update user analytics
  await firestoreHelpers.updateUserAnalytics(userId, {
    totalMessagesCount: admin.firestore.FieldValue.increment(1),
  });

  res.status(201).json({
    message,
    success: true,
  });
};

/**
 * Update a message (star/unstar, edit text)
 */
export const updateMessage = async (req, res) => {
  const { userId } = req;
  const { id } = req.params;
  const { starred, text } = req.body;

  // Get existing message
  const existingMessage = await firestoreHelpers.getMessage(userId, id);

  if (!existingMessage) {
    return res.status(404).json({
      error: 'Message not found',
    });
  }

  const updates = {};

  // Handle starring/unstarring
  if (typeof starred === 'boolean') {
    updates.starred = starred;
    // If starred, remove expiry and cancel scheduled deletion (queue system disabled)
    if (starred) {
      updates.expiresAt = null;
      // try {
      //   await cancelMessageDeletion(userId, id);
      // } catch (error) {
      //   console.error('Failed to cancel message deletion:', error);
      // }
    } else {
      // If unstarred, set expiry to 24 hours from now and schedule deletion (queue system disabled)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      updates.expiresAt = expiresAt;
      // try {
      //   await scheduleMessageDeletion(userId, id, expiresAt);
      // } catch (error) {
      //   console.error('Failed to schedule message deletion:', error);
      // }
    }
  }

  // Handle text editing (only for text messages)
  if (text && existingMessage.type === 'text') {
    updates.text = text;
    updates.edited = true;
    updates.editedAt = new Date().toISOString();
  }

  // Update message
  await firestoreHelpers.updateMessage(userId, id, updates);

  const updatedMessage = await firestoreHelpers.getMessage(userId, id);

  res.json({
    message: updatedMessage,
    success: true,
  });
};

/**
 * Delete a message
 */
export const deleteMessage = async (req, res) => {
  const { userId } = req;
  const { id } = req.params;

  // Get message to check if it's a file message
  const message = await firestoreHelpers.getMessage(userId, id);

  if (!message) {
    return res.status(404).json({
      error: 'Message not found',
    });
  }

  // Delete from Firestore
  await firestoreHelpers.deleteMessage(userId, id);

  // Note: File deletion from Drive should be handled separately
  // via the files controller or cleanup service

  res.json({
    success: true,
    message: 'Message deleted',
    fileId: message.type === 'file' ? message.fileId : null,
  });
};

/**
 * Search messages
 */
export const searchMessages = async (req, res) => {
  const { userId } = req;
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({
      error: 'Search query is required',
    });
  }

  const messages = await firestoreHelpers.searchMessages(userId, q);

  res.json({
    messages,
    count: messages.length,
    query: q,
  });
};

/**
 * Get messages by file category
 */
export const getMessagesByCategory = async (req, res) => {
  const { userId } = req;
  const { category } = req.params;

  // Handle starred messages as a special category
  if (category === 'starred') {
    const messages = await firestoreHelpers.getStarredMessages(userId);
    return res.json({
      messages,
      count: messages.length,
      category: 'starred',
    });
  }

  const validCategories = ['docs', 'images', 'videos', 'others'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({
      error: 'Invalid category',
      validCategories: [...validCategories, 'starred'],
    });
  }

  const messages = await firestoreHelpers.getMessagesByCategory(userId, category);

  res.json({
    messages,
    count: messages.length,
    category,
  });
};
