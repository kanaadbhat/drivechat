import { google } from 'googleapis';
import { setCredentials } from '../config/google-oauth.js';
import { getFileCategory } from '../utils/fileUtils.js';
import { queueFileUpload, queueFileDelete } from '../queues/fileQueue.js';

/**
 * Upload file to Google Drive (queued for async processing)
 */
export const uploadFile = async (req, res) => {
  try {
    const { userId } = req;
    const { accessToken, refreshToken, fileName, fileData, mimeType, async = false } = req.body;

    if (!accessToken || !fileName || !fileData) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['accessToken', 'fileName', 'fileData'],
      });
    }

    // If async flag is set, queue the upload
    if (async) {
      const job = await queueFileUpload({
        accessToken,
        refreshToken,
        userId,
        fileName,
        fileData,
        mimeType,
      });

      return res.json({
        success: true,
        queued: true,
        jobId: job.id,
        message: 'File upload queued for processing',
      });
    }

    // Otherwise, process synchronously (original behavior)

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

    res.json({
      success: true,
      file: {
        fileId: file.data.id,
        fileName: file.data.name,
        mimeType: file.data.mimeType,
        fileSize: parseInt(file.data.size || 0),
        fileCategory,
        webViewLink: file.data.webViewLink,
        thumbnailLink: file.data.thumbnailLink,
      },
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      error: 'File upload failed',
      message: error.message,
    });
  }
};

/**
 * Get file metadata from Drive
 */
export const getFileMetadata = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { accessToken, refreshToken } = req.query;

    if (!accessToken) {
      return res.status(400).json({
        error: 'Access token is required',
      });
    }

    const auth = setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth });

    const file = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, webViewLink, thumbnailLink, createdTime, modifiedTime',
    });

    res.json({ file: file.data });
  } catch (error) {
    console.error('Get file metadata error:', error);
    res.status(500).json({
      error: 'Failed to get file metadata',
      message: error.message,
    });
  }
};

/**
 * Download file from Drive
 */
export const downloadFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { accessToken, refreshToken } = req.query;

    if (!accessToken) {
      return res.status(400).json({
        error: 'Access token is required',
      });
    }

    const auth = setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth });

    // Get file metadata
    const fileMeta = await drive.files.get({
      fileId,
      fields: 'name, mimeType',
    });

    // Download file
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

    // Set response headers
    res.setHeader('Content-Type', fileMeta.data.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileMeta.data.name}"`);

    // Pipe file stream to response
    response.data.pipe(res);
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({
      error: 'File download failed',
      message: error.message,
    });
  }
};

/**
 * Delete file from Drive (queued for async processing)
 */
export const deleteFile = async (req, res) => {
  try {
    const { userId } = req;
    const { fileId } = req.params;
    const { accessToken, refreshToken, async = false } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        error: 'Access token is required',
      });
    }

    // If async flag is set, queue the deletion
    if (async) {
      const job = await queueFileDelete({
        accessToken,
        refreshToken,
        userId,
        fileId,
      });

      return res.json({
        success: true,
        queued: true,
        jobId: job.id,
        message: 'File deletion queued for processing',
      });
    }

    // Otherwise, process synchronously (original behavior)
    const auth = setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth });

    await drive.files.delete({ fileId });

    res.json({
      success: true,
      message: 'File deleted from Drive',
    });
  } catch (error) {
    console.error('File deletion error:', error);
    res.status(500).json({
      error: 'File deletion failed',
      message: error.message,
    });
  }
};

/**
 * Get file preview/thumbnail
 */
export const getFilePreview = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { accessToken, refreshToken } = req.query;

    if (!accessToken) {
      return res.status(400).json({
        error: 'Access token is required',
      });
    }

    const auth = setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth });

    const file = await drive.files.get({
      fileId,
      fields: 'thumbnailLink, webViewLink',
    });

    res.json({
      thumbnailLink: file.data.thumbnailLink,
      webViewLink: file.data.webViewLink,
    });
  } catch (error) {
    console.error('Get file preview error:', error);
    res.status(500).json({
      error: 'Failed to get file preview',
      message: error.message,
    });
  }
};
