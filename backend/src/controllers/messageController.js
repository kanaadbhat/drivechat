import { firestoreHelpers, admin } from '../config/firebase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { scheduleMessageDeletion, cancelMessageDeletion } from '../queues/cleanupQueue.js';
import { publishUserEvent } from '../realtime/realtimeHub.js';

/**
 * Get all messages for the authenticated user
 */
export const getMessages = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { limit = 100 } = req.query;

  const messages = await firestoreHelpers.getUserMessages(userId, parseInt(limit));

  res.json({
    messages,
    count: messages.length,
  });
});

/**
 * Get a single message
 */
export const getMessage = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { id } = req.params;

  const message = await firestoreHelpers.getMessage(userId, id);

  if (!message) {
    return res.status(404).json({
      error: 'Message not found',
    });
  }

  res.json({ message });
});

/**
 * Create a new message
 */
export const createMessage = asyncHandler(async (req, res) => {
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
    sender,
    linkUrl,
    linkTitle,
    linkDescription,
    linkImage,
    // Legacy support for old client versions
    deviceId,
    deviceName,
  } = req.body;

  const hasCiphertext = Boolean(req.body.ciphertext);
  const hasFileCiphertext = Boolean(req.body.fileCiphertext);

  // Use sender object if provided, otherwise fallback to legacy deviceId/deviceName
  const senderData = sender || {
    deviceId: deviceId,
    deviceName: deviceName,
    deviceType: 'guest',
  };

  // Validate required fields
  if (!type || !senderData.deviceId || !senderData.deviceName) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['type', 'sender.deviceId', 'sender.deviceName'],
    });
  }

  if (type === 'text' && !text && !hasCiphertext) {
    return res.status(400).json({
      error: 'Text message requires text or ciphertext field',
    });
  }

  if (type === 'file' && !hasFileCiphertext && (!fileId || !fileName)) {
    return res.status(400).json({
      error: 'File message requires fileId and fileName',
    });
  }

  if (type === 'link' && !linkUrl && !hasCiphertext) {
    return res.status(400).json({
      error: 'Link message requires linkUrl or ciphertext field',
    });
  }

  // Create message data
  const messageData = {
    type,
    sender: {
      deviceId: senderData.deviceId,
      deviceName: senderData.deviceName,
      deviceType: senderData.deviceType || 'guest',
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
    messageData.text = hasCiphertext ? null : text;
    if (hasCiphertext) {
      messageData.ciphertext = req.body.ciphertext;
      messageData.encryption = req.body.encryption || null;
    }
  } else if (type === 'file') {
    messageData.fileId = fileId || null;
    messageData.fileName = hasFileCiphertext ? null : fileName;
    messageData.fileSize = fileSize || 0;
    messageData.mimeType = mimeType || 'application/octet-stream';
    messageData.fileCategory = fileCategory || 'others';
    messageData.filePreviewUrl = hasFileCiphertext ? null : filePreviewUrl || null;
    messageData.fileCiphertext = req.body.fileCiphertext || null;
    messageData.encryption = req.body.encryption || null;
    messageData.filePreview = req.body.filePreview || null;
  } else if (type === 'link') {
    messageData.text = hasCiphertext ? null : text || null;
    messageData.linkUrl = hasCiphertext ? null : linkUrl;
    messageData.linkTitle = hasCiphertext ? null : linkTitle || null;
    messageData.linkDescription = hasCiphertext ? null : linkDescription || null;
    messageData.linkImage = hasCiphertext ? null : linkImage || null;
    if (hasCiphertext) {
      messageData.ciphertext = req.body.ciphertext;
      messageData.encryption = req.body.encryption || null;
    }
  }

  // Create message in Firestore
  const message = await firestoreHelpers.createMessage(userId, messageData);

  // Publish realtime event for multi-device delivery
  try {
    await publishUserEvent(userId, {
      type: 'message.created',
      messageId: message.id,
      firestorePath: `users/${userId}/messages/${message.id}`,
      message,
    });
  } catch {
    // non-fatal
  }

  // File previews are now client-managed; no server-side queueing

  // Schedule auto-deletion if message has expiry (disabled for now)
  // if (messageData.expiresAt && !messageData.starred) {
  //   try {
  //     await scheduleMessageDeletion(userId, message.id, messageData.expiresAt);
  //   } catch (error) {
  //     console.error('Failed to schedule message deletion:', error);
  //   }
  // }

  // Ensure user document exists before updating analytics
  await firestoreHelpers.setUserDoc(userId, {
    lastActive: new Date().toISOString(),
  });

  // Update user analytics
  try {
    await firestoreHelpers.updateUserAnalytics(userId, {
      totalMessagesCount: admin.firestore.FieldValue.increment(1),
    });
  } catch (analyticsError) {
    console.error('Failed to update analytics:', analyticsError.message);
    // Attempt to create user doc and retry once
    await firestoreHelpers.setUserDoc(userId, {
      lastActive: new Date().toISOString(),
      totalMessagesCount: 0,
      totalFilesCount: 0,
      storageUsedBytes: 0,
    });
    await firestoreHelpers.updateUserAnalytics(userId, {
      totalMessagesCount: admin.firestore.FieldValue.increment(1),
    });
  }

  res.status(201).json({
    message,
    success: true,
  });
});

/**
 * Update a message (star/unstar, edit text)
 */
export const updateMessage = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { id } = req.params;
  const { starred, text, ciphertext, encryption } = req.body;

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
      try {
        await cancelMessageDeletion(userId, id);
      } catch (error) {
        console.error('Failed to cancel message deletion:', error);
      }
    } else {
      // If unstarred, set expiry to 24 hours from now and schedule deletion via cleanup queue
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      updates.expiresAt = expiresAt;
      try {
        await scheduleMessageDeletion(userId, id, expiresAt);
      } catch (error) {
        console.error('Failed to schedule message deletion:', error);
      }
    }
  }

  // Handle text editing (only for text messages)
  if (ciphertext && (existingMessage.type === 'text' || existingMessage.type === 'link')) {
    updates.ciphertext = ciphertext;
    updates.encryption = encryption || existingMessage.encryption || null;
    updates.text = null;
    updates.linkUrl = null;
    updates.linkTitle = null;
    updates.linkDescription = null;
    updates.linkImage = null;
    updates.edited = true;
    updates.editedAt = new Date().toISOString();
  } else if (text && (existingMessage.type === 'text' || existingMessage.type === 'link')) {
    updates.text = text;
    updates.edited = true;
    updates.editedAt = new Date().toISOString();
  }

  // Update message
  await firestoreHelpers.updateMessage(userId, id, updates);

  const updatedMessage = await firestoreHelpers.getMessage(userId, id);

  // Publish realtime event
  try {
    await publishUserEvent(userId, {
      type: 'message.updated',
      messageId: id,
      firestorePath: `users/${userId}/messages/${id}`,
      message: updatedMessage,
    });
  } catch {
    // non-fatal
  }

  res.json({
    message: updatedMessage,
    success: true,
  });
});

/**
 * Delete a message
 */
export const deleteMessage = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { id } = req.params;

  // Get message to check if it's a file message
  const message = await firestoreHelpers.getMessage(userId, id);

  if (!message) {
    return res.status(404).json({
      error: 'Message not found',
    });
  }

  // If it's a file message, request client-side Drive cleanup via realtime
  if (message.type === 'file') {
    const deletionPayload = {
      messageId: id,
      fileId: message.fileId || null,
      fileFolderId: message.fileFolderId || null,
      mimeType: message.mimeType,
      fileName: message.fileName,
      fileCiphertext: message.fileCiphertext || null,
      encryption: message.encryption || null,
      reason: 'user-delete',
    };

    try {
      if (deletionPayload.fileId || deletionPayload.fileCiphertext) {
        await firestoreHelpers.addPendingDeletion(userId, deletionPayload);
      }

      await publishUserEvent(userId, {
        type: 'drive.delete.request',
        messageId: id,
        payload: {
          fileId: deletionPayload.fileId,
          fileCiphertext: deletionPayload.fileCiphertext,
          encryption: deletionPayload.encryption,
          fileFolderId: deletionPayload.fileFolderId,
          mimeType: deletionPayload.mimeType,
          fileName: deletionPayload.fileName,
        },
      });
    } catch {
      // non-fatal
    }
  }

  // Delete from Firestore
  await firestoreHelpers.deleteMessage(userId, id);

  // Publish realtime event
  try {
    await publishUserEvent(userId, {
      type: 'message.deleted',
      messageId: id,
      firestorePath: `users/${userId}/messages/${id}`,
    });
  } catch {
    // non-fatal
  }

  res.json({
    success: true,
    message: 'Message deleted',
    fileDeleted: message.type === 'file' ? true : false,
  });
});

/**
 * List pending Drive deletions (for offline sync)
 */
export const listPendingDeletions = asyncHandler(async (req, res) => {
  const { userId } = req;
  const pending = await firestoreHelpers.listPendingDeletions(userId);
  res.json({ pending });
});

/**
 * Acknowledge completed Drive deletions and clear pending records
 */
export const ackPendingDeletions = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { messageIds = [] } = req.body || {};

  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return res.status(400).json({ error: 'messageIds array required' });
  }

  await firestoreHelpers.removePendingDeletions(userId, messageIds);

  res.json({ acknowledged: messageIds });
});

/**
 * Get messages by file category
 */
export const getMessagesByCategory = asyncHandler(async (req, res) => {
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
});

/**
 * Delete all messages for the authenticated user
 * Deletes files from Google Drive and all messages from Firestore
 */
export const deleteAllMessages = asyncHandler(async (req, res) => {
  const { userId } = req;

  console.log(`[deleteAllMessages] Starting bulk delete for user: ${userId}`);

  // Get all messages for the user
  const messages = await firestoreHelpers.getUserMessages(userId, 10000); // Get all messages

  let filesDeleted = 0;
  let filesFailed = 0;

  // Request client-side Drive cleanup via realtime events
  const fileMessages = messages.filter(
    (msg) => msg.type === 'file' && (msg.fileId || msg.fileCiphertext)
  );

  if (fileMessages.length > 0) {
    await Promise.all(
      fileMessages.map(async (msg) => {
        try {
          await firestoreHelpers.addPendingDeletion(userId, {
            messageId: msg.id,
            fileId: msg.fileId || null,
            fileFolderId: msg.fileFolderId || null,
            mimeType: msg.mimeType,
            fileName: msg.fileName,
            fileCiphertext: msg.fileCiphertext || null,
            encryption: msg.encryption || null,
            reason: 'bulk-delete',
          });

          await publishUserEvent(userId, {
            type: 'drive.delete.request',
            messageId: msg.id,
            payload: {
              fileId: msg.fileId || null,
              fileCiphertext: msg.fileCiphertext || null,
              encryption: msg.encryption || null,
              fileFolderId: msg.fileFolderId || null,
              mimeType: msg.mimeType,
              fileName: msg.fileName,
            },
          });
          filesDeleted++;
        } catch {
          // non-fatal
          filesFailed++;
        }
      })
    );
  }

  // Delete all messages from Firestore
  console.log(`[deleteAllMessages] Deleting ${messages.length} messages from Firestore...`);
  const deletePromises = messages.map((msg) => firestoreHelpers.deleteMessage(userId, msg.id));
  await Promise.all(deletePromises);

  // Reset user analytics
  await firestoreHelpers.updateUserAnalytics(userId, {
    totalMessagesCount: 0,
    totalFilesCount: 0,
    storageUsedBytes: 0,
  });

  console.log(`[deleteAllMessages] ✅ Bulk delete complete`);

  // Publish realtime event so other devices clear immediately
  try {
    await publishUserEvent(userId, {
      type: 'messages.cleared',
      ts: String(Date.now()),
    });
  } catch {
    // non-fatal
  }

  res.json({
    success: true,
    messagesDeleted: messages.length,
    filesDeleted,
    filesFailed,
  });
});

/**
 * Record client Drive executor status (best-effort, no plaintext IDs required)
 */
export const ackDriveExecutor = asyncHandler(async (req, res) => {
  const { userId } = req;
  const { id } = req.params;
  const { status = 'unknown', details = null } = req.body || {};

  const message = await firestoreHelpers.getMessage(userId, id);

  if (!message) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const update = {
    driveCleanupStatus: status,
    driveCleanupAt: new Date().toISOString(),
    ...(details ? { driveCleanupDetails: details } : {}),
  };

  await firestoreHelpers.updateMessage(userId, id, update);

  try {
    await publishUserEvent(userId, {
      type: 'drive.cleanup.ack',
      messageId: id,
      firestorePath: `users/${userId}/messages/${id}`,
      patch: update,
    });
  } catch {
    // non-fatal
  }

  res.json({ success: true });
});

/**
 * Unstar all starred messages for the authenticated user
 */
export const unstarAllMessages = asyncHandler(async (req, res) => {
  const { userId } = req;

  console.log(`[unstarAllMessages] Starting for user: ${userId}`);

  // Get all starred messages
  const starredMessages = await firestoreHelpers.getStarredMessages(userId);

  if (starredMessages.length === 0) {
    return res.json({
      success: true,
      messagesUnstarred: 0,
      message: 'No starred messages to unstar',
    });
  }

  console.log(`[unstarAllMessages] Unstarring ${starredMessages.length} messages...`);

  // Unstar all messages
  const updatePromises = starredMessages.map((msg) =>
    firestoreHelpers.updateMessage(userId, msg.id, {
      starred: false,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Set 24h expiry
    })
  );

  await Promise.all(updatePromises);

  console.log(`[unstarAllMessages] ✅ Complete`);

  res.json({
    success: true,
    messagesUnstarred: starredMessages.length,
  });
});
