import axios from 'axios';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import config from '../config/index.js';
import { logger, retryWithBackoff } from '../utils/helpers.js';

const unsplashApi = axios.create({
  baseURL: config.unsplash.baseUrl,
  headers: {
    Authorization: `Client-ID ${config.unsplash.accessKey}`,
  },
});

/**
 * Fetch random nature/landscape images from Unsplash
 * Filters: horizontal orientation, nature, no people
 * 
 * @param {number} count - Number of images to fetch
 * @returns {Promise<Array>} Array of image metadata
 */
export async function fetchImages(count = config.workflow.batchSize) {
  logger.info(`Fetching ${count} images from Unsplash...`);

  const images = [];

  // Unsplash random endpoint returns max 30 at once
  // We fetch one by one to ensure quality and uniqueness
  for (let i = 0; i < count; i++) {
    const image = await retryWithBackoff(async () => {
      const response = await unsplashApi.get('/photos/random', {
        params: {
          query: 'nature landscape scenery',
          orientation: 'landscape',
          content_filter: 'high', // Safe content only
        },
      });

      return response.data;
    });

    images.push({
      id: image.id,
      unsplashId: image.id,
      downloadUrl: image.urls.raw, // Highest quality
      regularUrl: image.urls.regular,
      description: image.description || image.alt_description || 'Nature landscape',
      author: image.user.name,
      authorUrl: image.user.links.html,
      width: image.width,
      height: image.height,
    });

    logger.info(`  Fetched image ${i + 1}/${count}: ${image.id}`);

    // Rate limiting: Unsplash allows 50 requests/hour on free tier
    // Small delay between requests to be safe
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return images;
}

/**
 * Download an image to local filesystem
 * 
 * @param {string} url - Image URL
 * @param {string} outputPath - Local path to save
 * @returns {Promise<string>} Path to downloaded file
 */
export async function downloadImage(url, outputPath) {
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'arraybuffer',
    params: {
      // Request specific dimensions from Unsplash
      w: config.workflow.resize.width,
      q: 90, // High quality
      fm: 'jpg', // JPEG format
    },
  });

  await writeFile(outputPath, response.data);
  return outputPath;
}

/**
 * Download multiple images to a directory
 * 
 * @param {Array} images - Array of image metadata from fetchImages
 * @param {string} outputDir - Directory to save images
 * @param {Array} ids - Array of IDs to use for filenames
 * @returns {Promise<Array>} Array of {id, localPath, ...metadata}
 */
export async function downloadImages(images, outputDir, ids) {
  logger.info(`Downloading ${images.length} images...`);

  const results = [];

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const id = ids[i];
    const filename = `original_${id}.jpeg`;
    const localPath = join(outputDir, filename);

    await retryWithBackoff(async () => {
      await downloadImage(image.downloadUrl, localPath);
    });

    results.push({
      ...image,
      id,
      localPath,
      filename,
    });

    logger.info(`  Downloaded ${i + 1}/${images.length}: ${filename}`);
  }

  return results;
}

export default {
  fetchImages,
  downloadImage,
  downloadImages,
};
