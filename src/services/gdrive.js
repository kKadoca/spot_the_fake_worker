import { google } from 'googleapis';
import { createReadStream } from 'fs';
import { writeFile } from 'fs/promises';
import { basename } from 'path';
import config from '../config/index.js';
import { logger, retryWithBackoff } from '../utils/helpers.js';

let driveClient = null;

/**
 * Initialize Google Drive client with service account
 */
async function getClient() {
  if (driveClient) return driveClient;

  const auth = new google.auth.GoogleAuth({
    keyFile: config.gdrive.serviceAccountPath,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

/**
 * Upload a file to Google Drive
 * 
 * @param {string} localPath - Local file path
 * @param {string} folderId - Google Drive folder ID
 * @param {string} filename - Name for the file in Drive (optional, uses local filename if not provided)
 * @returns {Promise<Object>} Google Drive file metadata
 */
export async function uploadFile(localPath, folderId, filename = null) {
  const drive = await getClient();
  const name = filename || basename(localPath);

  const response = await retryWithBackoff(async () => {
    return drive.files.create({
      requestBody: {
        name,
        parents: [folderId],
      },
      media: {
        mimeType: 'image/jpeg',
        body: createReadStream(localPath),
      },
      fields: 'id, name, webViewLink, size',
    });
  });

  logger.info(`  Uploaded to Drive: ${name}`);
  return response.data;
}

/**
 * Upload a file to the Raw folder
 */
export async function uploadToRaw(localPath, filename = null) {
  return uploadFile(localPath, config.gdrive.folders.raw, filename);
}

/**
 * Upload a file to the To_Replicate folder
 */
export async function uploadToReplicate(localPath, filename = null) {
  return uploadFile(localPath, config.gdrive.folders.toReplicate, filename);
}

/**
 * Upload a file to the Ready folder
 */
export async function uploadToReady(localPath, filename = null) {
  return uploadFile(localPath, config.gdrive.folders.ready, filename);
}

/**
 * Download a file from Google Drive
 * 
 * @param {string} fileId - Google Drive file ID
 * @param {string} outputPath - Local path to save
 * @returns {Promise<string>} Path to downloaded file
 */
export async function downloadFile(fileId, outputPath) {
  const drive = await getClient();

  const response = await retryWithBackoff(async () => {
    return drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
  });

  await writeFile(outputPath, Buffer.from(response.data));
  return outputPath;
}

/**
 * List files in a folder
 * 
 * @param {string} folderId - Google Drive folder ID
 * @returns {Promise<Array>} Array of file metadata
 */
export async function listFiles(folderId) {
  const drive = await getClient();

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, size, createdTime)',
    orderBy: 'createdTime desc',
  });

  return response.data.files;
}

/**
 * List files in To_Replicate folder
 */
export async function listReplicateFiles() {
  return listFiles(config.gdrive.folders.toReplicate);
}

/**
 * Upload multiple files to a folder
 * 
 * @param {Array} files - Array of {localPath, filename}
 * @param {string} folderId - Google Drive folder ID
 * @returns {Promise<Array>} Array of uploaded file metadata
 */
export async function uploadMultiple(files, folderId) {
  const results = [];

  for (const file of files) {
    const result = await uploadFile(file.localPath, folderId, file.filename);
    results.push(result);
  }

  return results;
}

/**
 * Upload original images to both To_Replicate and Ready folders
 * 
 * @param {Array} images - Array of image objects with localPath and id
 * @returns {Promise<Array>} Array of upload results
 */
export async function uploadOriginals(images) {
  logger.info(`Uploading ${images.length} originals to Drive...`);

  const results = [];

  for (const image of images) {
    const filename = `original_${image.id}.jpeg`;

    // Upload to To_Replicate
    const replicateResult = await uploadFile(
      image.localPath,
      config.gdrive.folders.toReplicate,
      filename
    );

    // Upload to Ready
    const readyResult = await uploadFile(
      image.localPath,
      config.gdrive.folders.ready,
      filename
    );

    results.push({
      id: image.id,
      filename,
      toReplicate: replicateResult,
      ready: readyResult,
    });
  }

  return results;
}

/**
 * Upload fake images to Ready folder
 * 
 * @param {Array} fakes - Array of {id, localPath}
 * @returns {Promise<Array>} Array of upload results
 */
export async function uploadFakes(fakes) {
  logger.info(`Uploading ${fakes.length} fakes to Drive...`);

  const results = [];

  for (const fake of fakes) {
    const filename = `fake_${fake.id}.jpeg`;
    const result = await uploadFile(
      fake.localPath,
      config.gdrive.folders.ready,
      filename
    );
    results.push({ id: fake.id, filename, drive: result });
  }

  return results;
}

export default {
  uploadFile,
  uploadToRaw,
  uploadToReplicate,
  uploadToReady,
  downloadFile,
  listFiles,
  listReplicateFiles,
  uploadMultiple,
  uploadOriginals,
  uploadFakes,
};
