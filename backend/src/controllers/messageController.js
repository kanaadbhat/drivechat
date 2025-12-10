import { firestoreHelpers, admin } from '../config/firebase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getOAuthClientForUser } from '../utils/googleAuth.js';
import { google } from 'googleapis';
// Queue system is disabled for now
// import { scheduleMessageDeletion, cancelMessageDeletion } from '../queues/cleanupQueue.js';

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
    // Legacy support for old client versions
    deviceId,
    deviceName,
  } = req.body;

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

  // If this is a file message, queue preview generation NOW (with messageId)
  if (type === 'file' && fileId) {
    const { queuePreviewGeneration } = await import('../queues/previewQueue.js');

    try {
      console.log(
        `[messageController] 📋 Queueing preview generation for ${fileId} with messageId ${message.id}`
      );

      // Get the parent folder ID from the file metadata
      const oauth2Client = await import('../utils/googleAuth.js').then((m) =>
        m.getOAuthClientForUser(userId)
      );
      const { google } = await import('googleapis');
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      const fileMetadata = await drive.files.get({
        fileId,
        fields: 'parents',
      });

      const parentFolderId = fileMetadata.data.parents?.[0];

      await queuePreviewGeneration({
        userId,
        messageId: message.id, // ✅ messageId is now available!
        fileId,
        parentFolderId,
        mimeType: mimeType || 'application/octet-stream',
        fileName,
      });

      console.log(`[messageController] ✅ Preview generation queued successfully`);
    } catch (error) {
      console.error(`[messageController] ⚠️ Failed to queue preview generation:`, error.message);
      // Don't fail the message creation if preview queueing fails
    }
  }

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
});

/**
 * Update a message (star/unstar, edit text)
 */
export const updateMessage = asyncHandler(async (req, res) => {
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

  // If it's a file message, delete from Google Drive first
  if (message.type === 'file' && message.fileId) {
    try {
      const oauth2Client = await getOAuthClientForUser(userId);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // If message has fileFolderId, delete the entire folder (contains original + all previews)
      if (message.fileFolderId) {
        console.log(`[deleteMessage] Deleting folder ${message.fileFolderId} from Google Drive...`);
        await drive.files.delete({ fileId: message.fileFolderId });
        console.log(`[deleteMessage] ✅ Folder ${message.fileFolderId} deleted from Drive`);
      } else {
        // Fallback: delete just the original file if no folder ID
        console.log(`[deleteMessage] Deleting file ${message.fileId} from Google Drive...`);
        await drive.files.delete({ fileId: message.fileId });
        console.log(`[deleteMessage] ✅ File ${message.fileId} deleted from Drive`);
      }
    } catch (driveError) {
      console.error(`[deleteMessage] ⚠️ Failed to delete from Drive:`, driveError.message);
      // Continue with message deletion even if Drive deletion fails
      // The file might already be deleted or user lost access
    }
  }

  // Delete from Firestore
  await firestoreHelpers.deleteMessage(userId, id);

  res.json({
    success: true,
    message: 'Message deleted',
    fileDeleted: message.type === 'file' ? true : false,
  });
});

/**
 * Search messages
 */
export const searchMessages = asyncHandler(async (req, res) => {
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

  // Delete files from Google Drive first
  const fileMessages = messages.filter((msg) => msg.type === 'file' && msg.fileId);

  if (fileMessages.length > 0) {
    try {
      const oauth2Client = await getOAuthClientForUser(userId);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      console.log(
        `[deleteAllMessages] Deleting ${fileMessages.length} file folders from Google Drive...`
      );

      // Delete file folders (containing original + all previews) in parallel
      await Promise.allSettled(
        fileMessages.map(async (msg) => {
          try {
            // If message has fileFolderId, delete the entire folder (contains original + previews)
            if (msg.fileFolderId) {
              await drive.files.delete({ fileId: msg.fileFolderId });
              filesDeleted++;
              console.log(
                `[deleteAllMessages] ✅ Deleted folder: ${msg.fileFolderId} (${msg.fileName})`
              );
            } else {
              // Fallback: delete just the original file if no folder ID
              await drive.files.delete({ fileId: msg.fileId });
              filesDeleted++;
              console.log(`[deleteAllMessages] ✅ Deleted file: ${msg.fileId}`);
            }
          } catch (error) {
            filesFailed++;
            console.error(
              `[deleteAllMessages] ⚠️ Failed to delete ${msg.fileFolderId || msg.fileId}:`,
              error.message
            );
          }
        })
      );
    } catch (driveError) {
      console.error(`[deleteAllMessages] ⚠️ Drive API error:`, driveError.message);
      // Continue with Firestore deletion even if Drive fails
    }
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

  res.json({
    success: true,
    messagesDeleted: messages.length,
    filesDeleted,
    filesFailed,
  });
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
