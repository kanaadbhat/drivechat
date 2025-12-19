import { firestoreHelpers } from '../config/firebase.js';
import logger from '../utils/logger.js';
import { publishUserEvent } from '../realtime/realtimeHub.js';

/**
 * Cleanup expired messages and their associated files
 * @param {Object} options - Optional filters (uid, messageId for specific cleanup)
 */
export const cleanupExpiredMessages = async (options = {}) => {
  try {
    logger.info('🧹 Starting cleanup of expired messages...', options);

    let expiredMessages;

    // If specific message is provided, only clean that one
    if (options.uid && options.messageId) {
      const message = await firestoreHelpers.getMessage(options.uid, options.messageId);

      if (!message) {
        logger.warn(`Message ${options.messageId} not found`);
        return {
          totalExpired: 0,
          deletedCount: 0,
          errorCount: 0,
          driveFilesDeleted: 0,
          timestamp: new Date().toISOString(),
        };
      }

      // Check if message is actually expired and not starred
      const now = new Date().toISOString();
      if (message.expiresAt && message.expiresAt <= now && !message.starred) {
        expiredMessages = [
          {
            uid: options.uid,
            messageId: options.messageId,
            ...message,
          },
        ];
      } else {
        logger.info(`Message ${options.messageId} is not expired or is starred`);
        return {
          totalExpired: 0,
          deletedCount: 0,
          errorCount: 0,
          driveFilesDeleted: 0,
          timestamp: new Date().toISOString(),
        };
      }
    } else {
      // Get all expired messages
      expiredMessages = await firestoreHelpers.getExpiredMessages();
    }

    logger.info(`Found ${expiredMessages.length} expired messages`);

    let deletedCount = 0;
    let errorCount = 0;
    let driveFilesDeleted = 0;
    const errors = [];
    const deletedFileIds = [];

    for (const msg of expiredMessages) {
      try {
        // Drive deletion is now client-side; request via realtime
        if (msg.type === 'file' && msg.fileId) {
          try {
            // Record pending deletion so offline clients can reconcile on next load
            await firestoreHelpers.addPendingDeletion(msg.uid, {
              messageId: msg.messageId,
              fileId: msg.fileId,
              fileFolderId: msg.fileFolderId || null,
              mimeType: msg.mimeType,
              fileName: msg.fileName,
              reason: 'expired',
            });

            await publishUserEvent(msg.uid, {
              type: 'drive.delete.request',
              messageId: msg.messageId,
              payload: {
                fileId: msg.fileId,
                fileFolderId: msg.fileFolderId || null,
                mimeType: msg.mimeType,
                fileName: msg.fileName,
              },
            });
            driveFilesDeleted++;
          } catch {
            // non-fatal
          }
        }

        // Delete message from Firestore
        await firestoreHelpers.deleteMessage(msg.uid, msg.messageId);

        deletedCount++;
        logger.success(`✅ Deleted message ${msg.messageId} for user ${msg.uid}`);

        if (msg.type === 'file' && msg.fileId) {
          deletedFileIds.push({
            uid: msg.uid,
            fileId: msg.fileId,
            fileFolderId: msg.fileFolderId,
            messageId: msg.messageId,
          });
        }
      } catch (error) {
        errorCount++;
        errors.push({
          messageId: msg.messageId,
          error: error.message,
        });
        logger.error(`❌ Failed to delete message ${msg.messageId}:`, error);
      }
    }

    const result = {
      totalExpired: expiredMessages.length,
      deletedCount,
      errorCount,
      driveFilesDeleted,
      deletedFileIds,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    };

    logger.info(
      `🧹 Cleanup completed: ${deletedCount} messages deleted, ${driveFilesDeleted} drive files/folders deleted, ${errorCount} errors`
    );

    return result;
  } catch (error) {
    logger.error('❌ Cleanup service error:', error);
    throw error;
  }
};

/**
 * Cleanup temporary files that are no longer needed
 */
export const cleanupTempFiles = async () => {
  try {
    logger.info('🧹 Starting cleanup of temporary files...');

    // Placeholder for temp file cleanup logic
    // This would typically:
    // 1. Check for orphaned files in storage
    // 2. Remove files older than X days
    // 3. Clear cache files

    const result = {
      cleanedCount: 0,
      timestamp: new Date().toISOString(),
      message: 'Temp file cleanup placeholder - to be implemented',
    };

    logger.info('🧹 Temp file cleanup completed');

    return result;
  } catch (error) {
    logger.error('❌ Temp file cleanup error:', error);
    throw error;
  }
};
