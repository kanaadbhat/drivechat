import { google } from 'googleapis';
import { getFileCategory } from '../utils/fileUtils.js';
import { getOAuthClientForUser, clearStoredTokens } from '../utils/googleAuth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { queuePreviewGeneration } from '../queues/previewQueue.js';
import multer from 'multer';
import { Readable } from 'stream';

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
export const uploadFile = asyncHandler(async (req, res) => {
  try {
    const { userId } = req;
    const file = req.file;

    console.log(`\n[DEBUG] [uploadFile] START`);
    console.log(`[DEBUG]   userId: ${userId}`);
    console.log(`[DEBUG]   file: ${file?.originalname || 'NONE'}`);

    if (!file) {
      console.log(`[DEBUG]   ❌ No file in request`);
      return res.status(400).json({
        error: 'No file provided',
      });
    }

    console.log(
      `[DEBUG]   📤 Uploading file: ${file.originalname} (${file.size} bytes, ${file.mimetype})`
    );

    // Get OAuth client with auto token refresh
    console.log(`[DEBUG]   Getting OAuth client...`);
    const oauth2Client = await getOAuthClientForUser(userId);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    console.log(`[DEBUG]   ✅ OAuth client ready`);

    // Create DriveChat folder if it doesn't exist
    const folderName = 'DriveChat';
    let folderId;

    try {
      // Search for existing folder
      console.log(`[DEBUG]   Searching for existing '${folderName}' folder...`);
      const folderQuery = await drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      if (folderQuery.data.files && folderQuery.data.files.length > 0) {
        folderId = folderQuery.data.files[0].id;
        console.log(`[DEBUG]   ✅ Found existing folder: ${folderId}`);
      } else {
        // Create folder
        console.log(`[DEBUG]   Creating new '${folderName}' folder...`);
        const folderMetadata = {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        };
        const folder = await drive.files.create({
          requestBody: folderMetadata,
          fields: 'id',
        });
        folderId = folder.data.id;
        console.log(`[DEBUG]   ✅ Created new folder: ${folderId}`);
      }
    } catch (folderError) {
      console.error(`[DEBUG]   ❌ Folder error: ${folderError.message}`);
      console.error(`[DEBUG]     Code: ${folderError.code}, Status: ${folderError.status}`);

      // Check for invalid credentials (401)
      if (folderError.code === 401 || folderError.status === 401) {
        console.log(`[DEBUG]   🔄 Clearing tokens due to 401 error`);
        await clearStoredTokens(userId);
        return res.status(401).json({
          error: 'Google Drive authorization invalid or expired. Please reconnect your account.',
          code: 'TOKEN_INVALID',
        });
      }

      // Check for invalid_grant (revoked/expired refresh token)
      if (folderError.message?.includes('invalid_grant') || folderError.code === 400) {
        console.log(`[DEBUG]   🔄 Clearing tokens due to invalid_grant error`);
        await clearStoredTokens(userId);
        return res.status(401).json({
          error: 'Google Drive authorization expired or revoked. Please reconnect your account.',
          code: 'TOKEN_REVOKED',
        });
      }
      // Continue without folder for other errors
      console.log(`[DEBUG]   ⚠️  Continuing without folder...`);
    }

    // Convert buffer to readable stream
    console.log(`[DEBUG]   Converting file buffer to stream...`);
    const bufferStream = new Readable();
    bufferStream.push(file.buffer);
    bufferStream.push(null);

    // Upload file to Drive
    console.log(`[DEBUG]   Creating file metadata...`);
    const fileMetadata = {
      name: file.originalname,
      ...(folderId && { parents: [folderId] }),
    };

    const media = {
      mimeType: file.mimetype,
      body: bufferStream,
    };

    console.log(`[DEBUG]   Uploading to Google Drive API...`);
    const driveFile = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, mimeType, size, webViewLink, webContentLink, thumbnailLink',
    });

    console.log(`[DEBUG]   ✅ File uploaded: ${driveFile.data.id}`);

    // Make file accessible with link
    try {
      console.log(`[DEBUG]   Setting file permissions...`);
      await drive.permissions.create({
        fileId: driveFile.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
      console.log(`[DEBUG]   ✅ Permissions set`);
    } catch (permError) {
      console.warn(`[DEBUG]   ⚠️  Could not set file permissions: ${permError.message}`);
    }

    const fileCategory = getFileCategory(file.mimetype);

    console.log(`[DEBUG]   ✅ [uploadFile] SUCCESS`);
    console.log(`[DEBUG]   ℹ️  Preview generation will be queued when message is created`);

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
    console.error(`\n[DEBUG] [uploadFile] ERROR`);
    console.error(`[DEBUG]   Message: ${error.message}`);
    console.error(`[DEBUG]   Code: ${error.code}`);
    console.error(`[DEBUG]   Status: ${error.status}`);

    // Check for invalid credentials (401)
    if (error.code === 401 || error.status === 401) {
      console.log(`[DEBUG]   🔄 Clearing tokens due to 401 error`);
      await clearStoredTokens(req.userId);
      return res.status(401).json({
        error: 'Google Drive authorization invalid or expired. Please reconnect your account.',
        code: 'TOKEN_INVALID',
      });
    }

    // Check for invalid_grant (revoked/expired refresh token)
    if (error.message?.includes('invalid_grant') || error.code === 400) {
      console.log(`[DEBUG]   🔄 Clearing tokens due to invalid_grant error`);
      await clearStoredTokens(req.userId);
      return res.status(401).json({
        error: 'Google Drive authorization expired or revoked. Please reconnect your account.',
        code: 'TOKEN_REVOKED',
      });
    }

    res.status(500).json({
      error: 'File upload failed',
      message: error.message,
      details: error.errors || [],
    });
  }
});

/**
 * Upload file to Google Drive (legacy - with user OAuth tokens)
 */
export const uploadFileWithOAuth = asyncHandler(async (req, res) => {
  try {
    const { userId } = req;
    const { accessToken, fileName, fileData, mimeType } = req.body;

    if (!accessToken || !fileName || !fileData) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['accessToken', 'fileName', 'fileData'],
      });
    }

    // ...existing code...

    // Otherwise, process synchronously (original behavior)

    // Set up OAuth client with user's tokens
    const oauth2Client = await getOAuthClientForUser(userId);
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
});

/**
 * Get file metadata from Drive
 */
export const getFileMetadata = asyncHandler(async (req, res) => {
  try {
    const { userId } = req;
    const { fileId } = req.params;

    const oauth2Client = await getOAuthClientForUser(userId);
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
});

/**
 * Download file from Drive
 */
export const downloadFile = asyncHandler(async (req, res) => {
  try {
    const { userId } = req;
    const { fileId } = req.params;

    const oauth2Client = await getOAuthClientForUser(userId);
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
});

/**
 * Delete file from Drive (queued for async processing)
 */
export const deleteFile = asyncHandler(async (req, res) => {
  try {
    const { userId } = req;
    const { fileId } = req.params;
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        error: 'Access token is required',
      });
    }

    // ...existing code...

    // Otherwise, process synchronously (original behavior)
    const oauth2Client = await getOAuthClientForUser(userId);
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
});

/**
 * Get file preview/thumbnail
 */
export const getFilePreview = asyncHandler(async (req, res) => {
  try {
    const { fileId } = req.params;
    const { userId } = req;

    const oauth2Client = await getOAuthClientForUser(userId);
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
});

/**
 * Proxy file content from Google Drive (for direct preview with Range support)
 */
export const proxyFileContent = asyncHandler(async (req, res) => {
  try {
    const { fileId } = req.params;
    const { userId } = req;

    const oauth2Client = await getOAuthClientForUser(userId);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get file metadata first
    const fileMeta = await drive.files.get({
      fileId,
      fields: 'name, mimeType, size',
    });

    const fileSize = parseInt(fileMeta.data.size || 0);
    const fileName = fileMeta.data.name;
    const mimeType = fileMeta.data.mimeType;

    // Parse Range header for video/audio seeking support
    const rangeHeader = req.headers.range;

    if (rangeHeader && fileSize > 0) {
      // Parse range: "bytes=start-end"
      const rangeParts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(rangeParts[0], 10);
      const end = rangeParts[1] ? parseInt(rangeParts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      // Validate range
      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.send('Range Not Satisfiable');
      }

      // Request partial content from Drive
      const response = await drive.files.get(
        { fileId, alt: 'media' },
        {
          responseType: 'stream',
          headers: {
            Range: `bytes=${start}-${end}`,
          },
        }
      );

      // Set partial content headers
      res.status(206); // Partial Content
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      // Pipe the partial stream to response
      response.data.pipe(res);
    } else {
      // No range requested, stream entire file
      const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

      // Set appropriate headers
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.setHeader('Accept-Ranges', 'bytes'); // Advertise Range support
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      if (fileSize > 0) {
        res.setHeader('Content-Length', fileSize);
      }

      // Pipe the file stream to response
      response.data.pipe(res);
    }
  } catch (error) {
    console.error('File proxy error:', error);
    res.status(500).json({
      error: 'Failed to proxy file',
      message: error.message,
    });
  }
});
