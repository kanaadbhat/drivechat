import { google } from 'googleapis';
import { getOAuthClientForUser } from '../utils/googleAuth.js';
import { firestoreHelpers } from '../config/firebase.js';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import logger from '../utils/logger.js';
import { publishUserEvent } from '../realtime/realtimeHub.js';

const execPromise = promisify(exec);

// Set ffmpeg binary path
ffmpeg.setFfmpegPath(ffmpegStatic);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main function to generate all previews for a file
 */
export async function generatePreviewsForFile({
  userId,
  messageId,
  fileId,
  parentFolderId,
  mimeType,
  fileName,
}) {
  logger.info(`[PreviewService] Starting preview generation for ${fileId}`, {
    userId,
    messageId,
    mimeType,
    fileName,
  });

  // messageId should always be provided now (queued after message creation)
  if (!messageId) {
    throw new Error('[PreviewService] messageId is required for preview generation');
  }

  // Update thumbStatus to generating
  try {
    await firestoreHelpers.updateMessage(userId, messageId, {
      thumbStatus: 'generating',
    });
  } catch (error) {
    logger.error(`[PreviewService] Could not update message ${messageId} status:`, error.message);
    throw error; // Fail the job if we can't update Firestore
  }

  try {
    // Get OAuth client
    const oauth2Client = await getOAuthClientForUser(userId);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Create a dedicated folder for this file and its previews
    const fileFolderName = `${fileName.replace(/\.[^/.]+$/, '')}_${fileId.slice(-8)}`;
    const fileFolderId = await createFileFolder(drive, fileFolderName, parentFolderId);

    logger.info(`[PreviewService] Created file folder: ${fileFolderName} (${fileFolderId})`);

    // Move the original file to this folder
    await drive.files.update({
      fileId: fileId,
      addParents: fileFolderId,
      removeParents: parentFolderId,
      fields: 'id, parents',
    });

    logger.info(`[PreviewService] Moved original file to dedicated folder`);

    // Create temp directory for this job
    const tempDir = path.join(os.tmpdir(), `preview-${fileId}-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    logger.info(`[PreviewService] Created temp directory: ${tempDir}`);

    try {
      // Download original file
      const originalFilePath = path.join(tempDir, fileName);
      await downloadFileFromDrive(drive, fileId, originalFilePath);

      logger.info(`[PreviewService] Downloaded original file: ${originalFilePath}`);

      // Generate previews based on mime type
      let previewData = {};

      if (mimeType.startsWith('image/')) {
        previewData = await generateImagePreviews(
          drive,
          originalFilePath,
          fileName,
          fileFolderId,
          tempDir
        );
      } else if (mimeType.startsWith('video/')) {
        previewData = await generateVideoPreviews(
          drive,
          originalFilePath,
          fileName,
          fileFolderId,
          tempDir
        );
      } else if (mimeType.startsWith('audio/')) {
        previewData = await generateAudioPreviews(
          drive,
          originalFilePath,
          fileName,
          fileFolderId,
          tempDir
        );
      } else if (mimeType === 'application/pdf') {
        previewData = await generatePDFPreviews(
          drive,
          originalFilePath,
          fileName,
          fileFolderId,
          tempDir
        );
      } else if (isOfficeDocument(mimeType)) {
        previewData = await generateOfficePreviews(drive, fileId, fileName, fileFolderId, tempDir);
      } else {
        logger.info(`[PreviewService] No preview generation for mime type: ${mimeType}`);
        previewData = {
          thumbStatus: 'ready',
          thumbGeneratedAt: new Date().toISOString(),
        };
      }

      // Update Firestore message with preview data (messageId is guaranteed to exist now)
      try {
        const updateData = {
          ...previewData,
          thumbStatus: 'ready',
          thumbGeneratedAt: new Date().toISOString(),
          fileFolderId, // Store folder ID for easy deletion later
        };

        logger.info(
          `[PreviewService] Updating Firestore message ${messageId} with preview data:`,
          JSON.stringify(updateData, null, 2)
        );

        await firestoreHelpers.updateMessage(userId, messageId, updateData);

        logger.info(`[PreviewService] ✅ Successfully updated Firestore message ${messageId}`);

        // Publish realtime patch so clients update previews without polling
        try {
          await publishUserEvent(userId, {
            type: 'preview.ready',
            messageId,
            firestorePath: `users/${userId}/messages/${messageId}`,
            patch: updateData,
          });
        } catch {
          // non-fatal
        }
      } catch (error) {
        logger.error(`[PreviewService] ❌ Could not update message ${messageId}:`, error.message);
        logger.error(`[PreviewService] Full error:`, error);
        throw error; // Fail the job if Firestore update fails
      }

      logger.info(`[PreviewService] Successfully generated previews for ${fileId}`);

      return {
        success: true,
        fileId,
        fileFolderId,
        previewData,
      };
    } finally {
      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true });
      logger.info(`[PreviewService] Cleaned up temp directory: ${tempDir}`);
    }
  } catch (error) {
    logger.error(`[PreviewService] Error generating previews for ${fileId}:`, error);

    // Update status to failed (messageId is guaranteed to exist)
    try {
      await firestoreHelpers.updateMessage(userId, messageId, {
        thumbStatus: 'failed',
        thumbGeneratedAt: new Date().toISOString(),
        thumbError: error.message,
      });
    } catch (updateError) {
      logger.error(`[PreviewService] Could not update failed status:`, updateError.message);
    }

    throw error;
  }
}

/**
 * Create a dedicated folder for this file and its previews
 */
async function createFileFolder(drive, folderName, parentFolderId) {
  try {
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    };

    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id',
    });

    logger.info(`[PreviewService] Created folder: ${folderName} (${folder.data.id})`);
    return folder.data.id;
  } catch (error) {
    logger.error(`[PreviewService] Error creating folder:`, error);
    throw error;
  }
}

/**
 * Download file from Google Drive
 */
async function downloadFileFromDrive(drive, fileId, destPath) {
  const dest = await fs.open(destPath, 'w');

  try {
    const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

    await new Promise((resolve, reject) => {
      response.data
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .pipe(dest.createWriteStream());
    });
  } finally {
    await dest.close();
  }
}

/**
 * Upload file to Google Drive
 */
async function uploadFileToDrive(drive, filePath, fileName, parentFolderId) {
  const fileMetadata = {
    name: fileName,
    parents: [parentFolderId],
  };

  const media = {
    mimeType: getMimeTypeFromExtension(fileName),
    body: (await fs.open(filePath, 'r')).createReadStream(),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, name, webViewLink, webContentLink, size',
  });

  // Set file permissions - make it accessible to the user
  try {
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone', // Anyone with the link can view
      },
    });
    logger.debug(`[PreviewService] Set permissions for preview file: ${response.data.id}`);
  } catch (permError) {
    logger.warn(
      `[PreviewService] Could not set permissions for ${response.data.id}:`,
      permError.message
    );
  }

  return response.data;
}

/**
 * Generate image previews (thumbnails in multiple sizes)
 */
async function generateImagePreviews(drive, originalPath, fileName, previewFolderId, tempDir) {
  const baseName = path.parse(fileName).name;
  const sizes = [
    { name: 'small', width: 320 },
    { name: 'medium', width: 640 },
    { name: 'large', width: 1280 },
  ];

  const thumbnailSizes = {};

  for (const size of sizes) {
    const outputPath = path.join(tempDir, `${baseName}-${size.name}.jpg`);

    await sharp(originalPath)
      .resize(size.width, null, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    const uploadedFile = await uploadFileToDrive(
      drive,
      outputPath,
      `${baseName}-${size.name}.jpg`,
      previewFolderId
    );

    thumbnailSizes[size.name] = {
      id: uploadedFile.id,
      webContentLink: uploadedFile.webContentLink,
      width: size.width,
    };
  }

  return {
    thumbnailDriveFileId: thumbnailSizes.small.id,
    thumbnailDriveWebContentLink: thumbnailSizes.small.webContentLink,
    thumbnailSizes,
  };
}

/**
 * Generate video previews (poster, low-res preview, duration)
 */
async function generateVideoPreviews(drive, originalPath, fileName, previewFolderId, tempDir) {
  const baseName = path.parse(fileName).name;

  // Get video duration
  const durationMs = await getVideoDuration(originalPath);

  // Generate poster image (frame at 1 second)
  const posterPath = path.join(tempDir, `${baseName}-poster.jpg`);
  await generateVideoPoster(originalPath, posterPath);

  const posterFile = await uploadFileToDrive(
    drive,
    posterPath,
    `${baseName}-poster.jpg`,
    previewFolderId
  );

  // Optionally generate low-res preview video
  // const lowResPath = path.join(tempDir, `${baseName}-preview.mp4`);
  // await generateLowResVideo(originalPath, lowResPath);
  // const lowResFile = await uploadFileToDrive(drive, lowResPath, `${baseName}-preview.mp4`, previewFolderId);

  return {
    thumbnailDriveFileId: posterFile.id,
    thumbnailDriveWebContentLink: posterFile.webContentLink,
    posterDriveFileId: posterFile.id,
    posterDriveWebContentLink: posterFile.webContentLink,
    durationMs,
    // lowResPreviewDriveFileId: lowResFile.id,
    // lowResPreviewWebContentLink: lowResFile.webContentLink,
  };
}

/**
 * Generate audio previews (waveform, duration)
 */
async function generateAudioPreviews(drive, originalPath, fileName, previewFolderId, tempDir) {
  const baseName = path.parse(fileName).name;

  // Get audio duration
  const durationMs = await getAudioDuration(originalPath);

  // Generate waveform image
  const waveformPath = path.join(tempDir, `${baseName}-waveform.png`);
  await generateWaveform(originalPath, waveformPath);

  const waveformFile = await uploadFileToDrive(
    drive,
    waveformPath,
    `${baseName}-waveform.png`,
    previewFolderId
  );

  return {
    thumbnailDriveFileId: waveformFile.id,
    thumbnailDriveWebContentLink: waveformFile.webContentLink,
    waveformDriveFileId: waveformFile.id,
    waveformDriveWebContentLink: waveformFile.webContentLink,
    durationMs,
  };
}

/**
 * Generate PDF previews (first page as image)
 */
async function generatePDFPreviews(drive, originalPath, fileName, previewFolderId, tempDir) {
  const baseName = path.parse(fileName).name;
  const firstPagePath = path.join(tempDir, `${baseName}-page-1.png`);

  await generatePDFFirstPage(originalPath, firstPagePath);

  const firstPageFile = await uploadFileToDrive(
    drive,
    firstPagePath,
    `${baseName}-page-1.png`,
    previewFolderId
  );

  return {
    thumbnailDriveFileId: firstPageFile.id,
    thumbnailDriveWebContentLink: firstPageFile.webContentLink,
    pdfFirstPageDriveFileId: firstPageFile.id,
    pdfFirstPageDriveWebContentLink: firstPageFile.webContentLink,
  };
}

/**
 * Generate Office document previews (export to PDF then get first page)
 */
async function generateOfficePreviews(drive, fileId, fileName, previewFolderId, tempDir) {
  const baseName = path.parse(fileName).name;

  // Export to PDF using Drive API
  const pdfPath = path.join(tempDir, `${baseName}.pdf`);
  await exportOfficeToPDF(drive, fileId, pdfPath);

  // Generate first page from PDF
  const firstPagePath = path.join(tempDir, `${baseName}-page-1.png`);
  await generatePDFFirstPage(pdfPath, firstPagePath);

  const firstPageFile = await uploadFileToDrive(
    drive,
    firstPagePath,
    `${baseName}-page-1.png`,
    previewFolderId
  );

  return {
    thumbnailDriveFileId: firstPageFile.id,
    thumbnailDriveWebContentLink: firstPageFile.webContentLink,
    pdfFirstPageDriveFileId: firstPageFile.id,
    pdfFirstPageDriveWebContentLink: firstPageFile.webContentLink,
  };
}

/**
 * Get video duration in milliseconds
 */
function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const duration = metadata.format.duration;
        resolve(Math.floor(duration * 1000));
      }
    });
  });
}

/**
 * Get audio duration in milliseconds
 */
function getAudioDuration(filePath) {
  return getVideoDuration(filePath); // ffprobe works for audio too
}

/**
 * Generate video poster image
 */
function generateVideoPoster(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: ['00:00:01'],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '640x?',
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err));
  });
}

/**
 * Generate low-res preview video
 */
function generateLowResVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .addOptions([
        '-preset veryfast',
        '-crf 28',
        '-maxrate 500k',
        '-bufsize 1000k',
        '-vf scale=640:-2',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Generate waveform image
 */
function generateWaveform(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputFormat('mp3')
      .audioFilters('showwaves=s=640x120:mode=line:colors=blue')
      .frames(1)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => {
        logger.error(
          '[PreviewService] Waveform generation failed, creating placeholder:',
          err.message
        );
        // Create a simple placeholder image
        sharp({
          create: {
            width: 640,
            height: 120,
            channels: 4,
            background: { r: 30, g: 41, b: 59, alpha: 1 },
          },
        })
          .png()
          .toFile(outputPath)
          .then(() => resolve())
          .catch((err) => reject(err));
      })
      .run();
  });
}

/**
 * Generate PDF first page as PNG using pdftoppm
 */
async function generatePDFFirstPage(pdfPath, outputPath) {
  try {
    // Check if pdftoppm is available
    try {
      await execPromise('pdftoppm -v');
    } catch (checkError) {
      logger.warn(
        '[PreviewService] pdftoppm not found. Install poppler-utils: https://github.com/oschwartz10612/poppler-windows/releases/'
      );
      throw new Error('pdftoppm not installed');
    }

    const outputDir = path.dirname(outputPath);
    const baseName = path.parse(outputPath).name;

    // Use pdftoppm to convert first page to PNG
    const command = `pdftoppm -f 1 -l 1 -png -scale-to 1280 "${pdfPath}" "${path.join(outputDir, baseName)}"`;

    await execPromise(command);

    // pdftoppm creates file with -1.png suffix
    const generatedFile = `${path.join(outputDir, baseName)}-1.png`;
    await fs.rename(generatedFile, outputPath);
    logger.info('[PreviewService] PDF first page generated successfully');
  } catch (error) {
    logger.error('[PreviewService] Error generating PDF first page:', error.message);

    // Fallback: create a placeholder with PDF icon text
    const svg = Buffer.from(
      `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
        <rect width="640" height="480" fill="#1e293b"/>
        <text x="50%" y="50%" font-family="Arial" font-size="24" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle">PDF Preview Unavailable</text>
        <text x="50%" y="60%" font-family="Arial" font-size="14" fill="#64748b" text-anchor="middle" dominant-baseline="middle">Install poppler-utils for PDF previews</text>
      </svg>`
    );
    await sharp(svg).png().toFile(outputPath);
  }
}

/**
 * Export Office document to PDF using Drive API
 */
async function exportOfficeToPDF(drive, fileId, outputPath) {
  const dest = await fs.open(outputPath, 'w');

  try {
    const response = await drive.files.export(
      {
        fileId,
        mimeType: 'application/pdf',
      },
      { responseType: 'stream' }
    );

    await new Promise((resolve, reject) => {
      response.data
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .pipe(dest.createWriteStream());
    });
  } finally {
    await dest.close();
  }
}

/**
 * Check if mime type is an Office document
 */
function isOfficeDocument(mimeType) {
  const officeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
    'application/vnd.google-apps.document', // Google Docs
    'application/vnd.google-apps.spreadsheet', // Google Sheets
    'application/vnd.google-apps.presentation', // Google Slides
    'application/msword', // doc
    'application/vnd.ms-excel', // xls
    'application/vnd.ms-powerpoint', // ppt
  ];

  return officeTypes.includes(mimeType);
}

/**
 * Get MIME type from file extension
 */
function getMimeTypeFromExtension(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}
