import { google } from 'googleapis';
import { getFileCategory } from '../utils/fileUtils.js';
import { queueFileUpload, queueFileDelete } from '../queues/fileQueue.js';
import multer from 'multer';
import { Readable } from 'stream';
import admin from 'firebase-admin';

const db = admin.firestore();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

// Export multer middleware
export const fileUploadMiddleware = upload.single('file');

/**
 * Upload file to user's Google Drive using stored OAuth tokens
 */
export const uploadFile = async (req, res) => {
  try {
    const { userId } = req;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: 'No file provided',
      });
    }

    // Get stored Google OAuth tokens from Firestore
    const tokenDoc = await db
      .collection('users')
      .doc(userId)
      .collection('oauth')
      .doc('google')
      .get();

    if (!tokenDoc.exists) {
      return res.status(401).json({
        error: 'Google account not connected',
        message: 'Please authenticate with Google first',
      });
    }

    const tokenData = tokenDoc.data();
    const { accessToken, refreshToken } = tokenData;

    // Create OAuth2 client with stored tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Create DriveChat folder if it doesn't exist
    const folderName = 'DriveChat';
    let folderId;

    try {
      // Search for existing folder
      const folderQuery = await drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      if (folderQuery.data.files && folderQuery.data.files.length > 0) {
        folderId = folderQuery.data.files[0].id;
      } else {
        // Create folder
        const folderMetadata = {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        };
        const folder = await drive.files.create({
          requestBody: folderMetadata,
          fields: 'id',
        });
        folderId = folder.data.id;
      }
    } catch (folderError) {
      console.error('Folder creation/search error:', folderError);
      // Continue without folder
    }

    // Convert buffer to readable stream
    const bufferStream = new Readable();
    bufferStream.push(file.buffer);
    bufferStream.push(null);

    // Upload file to Drive
    const fileMetadata = {
      name: file.originalname,
      ...(folderId && { parents: [folderId] }),
    };

    const media = {
      mimeType: file.mimetype,
      body: bufferStream,
    };

    const driveFile = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, mimeType, size, webViewLink, webContentLink, thumbnailLink',
    });

    // Make file accessible with link
    try {
      await drive.permissions.create({
        fileId: driveFile.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    } catch (permError) {
      console.warn('Could not set file permissions:', permError.message);
    }

    const fileCategory = getFileCategory(file.mimetype);

    res.json({
      success: true,
      fileId: driveFile.data.id,
      fileName: driveFile.data.name,
      fileSize: parseInt(driveFile.data.size || file.size),
      mimeType: driveFile.data.mimeType,
      fileCategory,
      webViewLink: driveFile.data.webViewLink,
      webContentLink: driveFile.data.webContentLink,
      thumbnailLink: driveFile.data.thumbnailLink,
      message: 'File uploaded to Google Drive successfully',
    });
  } catch (error) {
    console.error('File upload error:', error);

    res.status(500).json({
      error: 'File upload failed',
      message: error.message,
      details: error.errors || [],
    });
  }
};

/**
 * Upload file to Google Drive (legacy - with user OAuth tokens)
 */
export const uploadFileWithOAuth = async (req, res) => {
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
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

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

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

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

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

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
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

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
    const { userId } = req;

    // Get stored Google OAuth tokens from Firestore
    const tokenDoc = await db
      .collection('users')
      .doc(userId)
      .collection('oauth')
      .doc('google')
      .get();

    if (!tokenDoc.exists) {
      return res.status(401).json({
        error: 'Google account not connected',
      });
    }

    const tokenData = tokenDoc.data();
    const { accessToken, refreshToken } = tokenData;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const file = await drive.files.get({
      fileId,
      fields: 'thumbnailLink, webViewLink, webContentLink, mimeType',
    });

    res.json({
      thumbnailLink: file.data.thumbnailLink,
      webViewLink: file.data.webViewLink,
      webContentLink: file.data.webContentLink,
      mimeType: file.data.mimeType,
    });
  } catch (error) {
    console.error('Get file preview error:', error);
    res.status(500).json({
      error: 'Failed to get file preview',
      message: error.message,
    });
  }
};

/**
 * Proxy file content from Google Drive (for direct preview)
 */
export const proxyFileContent = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { userId } = req;

    // Get stored Google OAuth tokens from Firestore
    const tokenDoc = await db
      .collection('users')
      .doc(userId)
      .collection('oauth')
      .doc('google')
      .get();

    if (!tokenDoc.exists) {
      return res.status(401).json({
        error: 'Google account not connected',
      });
    }

    const tokenData = tokenDoc.data();
    const { accessToken, refreshToken } = tokenData;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get file metadata first
    const fileMeta = await drive.files.get({
      fileId,
      fields: 'name, mimeType, size',
    });

    // Stream the file content
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

    // Set appropriate headers
    res.setHeader('Content-Type', fileMeta.data.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileMeta.data.name}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    if (fileMeta.data.size) {
      res.setHeader('Content-Length', fileMeta.data.size);
    }

    // Pipe the file stream to response
    response.data.pipe(res);
  } catch (error) {
    console.error('File proxy error:', error);
    res.status(500).json({
      error: 'Failed to proxy file',
      message: error.message,
    });
  }
};
