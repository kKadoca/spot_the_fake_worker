import Replicate from 'replicate';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import config from '../config/index.js';
import { logger, retryWithBackoff } from '../utils/helpers.js';
import axios from 'axios';

// Initialize Replicate client
const replicate = new Replicate({
  auth: config.replicate.apiKey,
});

/**
 * The master prompt for generating "spot the fake" images
 * This prompt instructs Stable Diffusion to create a near-replica with subtle AI differences
 */
const FAKE_GENERATION_PROMPT = `Create a pixel-perfect replica of the reference image. Match the original framing, composition, perspective, and proportions exactly. Precisely mimic the lighting direction, intensity, and color temperature as seen in the image. Reproduce all visible camera characteristics (lens distortion, depth of field, exposure) based on the source. Preserve all micro-textures: skin pores, fabric weave, wood grain, natural noise, scratches, reflections, and imperfections. Remember, this is for a game where the player needs to guess which image is real and which is AI, so just make minor changes.`;

const NEGATIVE_PROMPT = `Any added elements, CGI, text, watermarks, smoothing, digital artifacts, illustration, cartoon, stylization, CGI/plastic skin, added text, visible artifacts, low quality, blurry, distorted`;

/**
 * Convert image file to base64 data URI
 *
 * @param {string} imagePath - Path to image file
 * @returns {Promise<string>} Base64 data URI
 */
async function imageToDataUri(imagePath) {
  const imageBuffer = await readFile(imagePath);
  const base64 = imageBuffer.toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

/**
 * Download image from URL and save to file
 *
 * @param {string} url - URL of the image
 * @param {string} outputPath - Path to save the image
 * @returns {Promise<string>} Path to saved image
 */
async function downloadImage(url, outputPath) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  await writeFile(outputPath, buffer);
  return outputPath;
}

/**
 * Generate a fake image using Replicate's Stable Diffusion img2img
 *
 * Uses the original image as a reference and generates a similar image with subtle AI differences
 *
 * @param {string} originalImagePath - Path to the original image
 * @param {string} outputPath - Path to save the generated fake
 * @param {Object} options - Generation options
 * @returns {Promise<string>} Path to generated fake image
 */
export async function generateFakeImage(originalImagePath, outputPath, options = {}) {
  return retryWithBackoff(async () => {
    logger.info(`    Converting image to data URI...`);
    const imageDataUri = await imageToDataUri(originalImagePath);

    logger.info(`    Sending to Replicate (this may take 10-30 seconds)...`);

    // Use Stable Diffusion XL with img2img
    // Model: stability-ai/sdxl
    const output = await replicate.run(
      "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      {
        input: {
          image: imageDataUri,
          prompt: options.prompt || FAKE_GENERATION_PROMPT,
          negative_prompt: options.negativePrompt || NEGATIVE_PROMPT,
          width: 1024,
          height: 576, // 16:9 aspect ratio
          num_inference_steps: 50,
          guidance_scale: 7.5,
          prompt_strength: 0.8, // How much to transform the image (0.8 = 80% original, 20% new)
          refine: "expert_ensemble_refiner",
          scheduler: "K_EULER",
          num_outputs: 1,
        },
      }
    );

    // Output is an array of URLs
    const imageUrl = Array.isArray(output) ? output[0] : output;

    logger.info(`    Downloading generated image...`);
    await downloadImage(imageUrl, outputPath);

    return outputPath;
  }, 3, 2000); // 3 retries, 2 second base delay
}

/**
 * Generate fake images for a batch of originals
 *
 * @param {Array} originals - Array of {id, localPath}
 * @param {string} outputDir - Directory to save fake images
 * @returns {Promise<Array>} Array of {id, originalPath, fakePath}
 */
export async function generateFakeImages(originals, outputDir) {
  logger.info(`Generating ${originals.length} fake images with Replicate...`);

  const results = [];

  for (let i = 0; i < originals.length; i++) {
    const original = originals[i];
    const fakeFilename = `fake_${original.id}_raw.jpeg`;
    const fakePath = join(outputDir, fakeFilename);

    logger.info(`  Generating fake ${i + 1}/${originals.length}: ${original.id}`);

    try {
      await generateFakeImage(original.localPath, fakePath);

      results.push({
        id: original.id,
        originalPath: original.localPath,
        fakePath,
        success: true,
      });

      logger.success(`    Generated fake for ${original.id}`);
    } catch (error) {
      logger.error(`    Failed to generate fake for ${original.id}: ${error.message}`);

      results.push({
        id: original.id,
        originalPath: original.localPath,
        fakePath: null,
        success: false,
        error: error.message,
      });
    }

    // Rate limiting between generations (be nice to the API)
    if (i < originals.length - 1) {
      logger.info(`    Waiting 3 seconds before next generation...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  return results;
}

export default {
  generateFakeImage,
  generateFakeImages,
  FAKE_GENERATION_PROMPT,
};
