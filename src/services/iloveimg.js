import ILovePDFApi from '@ilovepdf/ilovepdf-nodejs';
import ILovePDFFile from '@ilovepdf/ilovepdf-nodejs/ILovePDFFile.js';
import { writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import config from '../config/index.js';
import { logger, retryWithBackoff } from '../utils/helpers.js';

// Initialize iLoveIMG instance
// Note: iLoveAPI works for both PDF and images
const iloveimg = new ILovePDFApi(
  config.iloveimg.publicKey,
  config.iloveimg.secretKey
);

/**
 * Resize an image using iLoveIMG API
 * 
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save resized image
 * @param {number} width - Target width in pixels
 * @param {number} height - Target height in pixels
 * @returns {Promise<string>} Path to resized image
 */
export async function resizeImage(inputPath, outputPath, width = config.workflow.resize.width, height = config.workflow.resize.height) {
  return retryWithBackoff(async () => {
    // Create resize task
    const task = iloveimg.newTask('resizeimage');
    await task.start();

    // Add file
    const file = new ILovePDFFile(inputPath);
    await task.addFile(file);

    // Process with resize settings
    await task.process({
      resize_mode: 'pixels',
      pixels_width: width,
      pixels_height: height,
      maintain_ratio: true,
    });

    // Download result
    const data = await task.download();
    await writeFile(outputPath, data);

    return outputPath;
  });
}

/**
 * Compress an image using iLoveIMG API
 * 
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save compressed image
 * @returns {Promise<string>} Path to compressed image
 */
export async function compressImage(inputPath, outputPath) {
  return retryWithBackoff(async () => {
    // Create compress task
    const task = iloveimg.newTask('compressimage');
    await task.start();

    // Add file
    const file = new ILovePDFFile(inputPath);
    await task.addFile(file);

    // Process
    await task.process();

    // Download result
    const data = await task.download();
    await writeFile(outputPath, data);

    return outputPath;
  });
}

/**
 * Resize and then compress an image (full pipeline)
 * 
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save final image
 * @param {Object} options - Processing options
 * @returns {Promise<string>} Path to processed image
 */
export async function processImage(inputPath, outputPath, options = {}) {
  const {
    width = config.workflow.resize.width,
    height = config.workflow.resize.height,
  } = options;

  const tempResizedPath = outputPath.replace('.jpeg', '_resized.jpeg');

  try {
    // Step 1: Resize
    logger.info(`    Resizing to ${width}x${height}...`);
    await resizeImage(inputPath, tempResizedPath, width, height);

    // Step 2: Compress
    logger.info(`    Compressing...`);
    await compressImage(tempResizedPath, outputPath);

    // Clean up temp file
    const { unlink } = await import('fs/promises');
    await unlink(tempResizedPath).catch(() => {});

    return outputPath;
  } catch (error) {
    // Clean up temp file on error
    const { unlink } = await import('fs/promises');
    await unlink(tempResizedPath).catch(() => {});
    throw error;
  }
}

/**
 * Process multiple images (resize + compress)
 * 
 * @param {Array} images - Array of {inputPath, outputPath, id}
 * @returns {Promise<Array>} Array of processed image paths
 */
export async function processImages(images) {
  logger.info(`Processing ${images.length} images with iLoveIMG...`);

  const results = [];

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    logger.info(`  Processing image ${i + 1}/${images.length}: ${image.id}`);

    const outputPath = await processImage(image.inputPath, image.outputPath);
    results.push({
      ...image,
      processedPath: outputPath,
    });
  }

  return results;
}

export default {
  resizeImage,
  compressImage,
  processImage,
  processImages,
};
