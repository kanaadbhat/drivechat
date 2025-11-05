import { google } from 'googleapis';
import { setCredentials } from '../config/google-oauth.js';
import { getFileCategory } from '../utils/fileUtils.js';
import logger from '../utils/logger.js';

/**
 * Process file upload (for queue worker)
 * @param {Object} data - Upload data including tokens, file info, etc.
 */
export const processFileUpload = async (data) => {
  try {
    const { accessToken, refreshToken, userId, fileName, fileData, mimeType } = data;

    logger.info(`Processing file upload: ${fileName} for user ${userId}`);

    // Set up OAuth client with user's tokens
    const auth = setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth });

    // Create DriveChat folder if it doesn't exist
    const folderName = `DriveChat/${userId}`;
    let folderId;

    // Search for existing folder
    const folderQuery = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (folderQuery.data.files.length > 0) {
      folderId = folderQuery.data.files[0].id;
    } else {
      // Create folder
      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      };
      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id',
      });
      folderId = folder.data.id;
    }

    // Upload file
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    // Convert base64 to buffer if needed
    const buffer = Buffer.from(fileData, 'base64');

    const media = {
      mimeType: mimeType || 'application/octet-stream',
      body: buffer,
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, mimeType, size, webViewLink, thumbnailLink',
    });

    const fileCategory = getFileCategory(file.data.mimeType);

    logger.success(`✅ File uploaded: ${fileName} (${file.data.id})`);

    return {
      fileId: file.data.id,
      fileName: file.data.name,
      mimeType: file.data.mimeType,
      fileSize: parseInt(file.data.size || 0),
      fileCategory,
      webViewLink: file.data.webViewLink,
      thumbnailLink: file.data.thumbnailLink,
      uploadedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('File upload processing error:', error);
    throw error;
  }
};

/**
 * Process file deletion (for queue worker)
 * @param {Object} data - Deletion data including tokens, fileId, etc.
 */
export const processFileDelete = async (data) => {
  try {
    const { accessToken, refreshToken, fileId, userId } = data;

    logger.info(`Processing file deletion: ${fileId} for user ${userId}`);

    // Set up OAuth client with user's tokens
    const auth = setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth });

    // Delete file from Drive
    await drive.files.delete({ fileId });

    logger.success(`✅ File deleted: ${fileId}`);

    return {
      fileId,
      deletedAt: new Date().toISOString(),
      success: true,
    };
  } catch (error) {
    logger.error('File deletion processing error:', error);
    throw error;
  }
};
