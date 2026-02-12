import { HfInference } from '@huggingface/inference';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import config from '../config/index.js';
import { logger, retryWithBackoff } from '../utils/helpers.js';

// Initialize Hugging Face client
const hf = new HfInference(config.huggingface.apiKey);

/**
 * The master prompt for generating "spot the fake" images
 * This prompt instructs Stable Diffusion to create realistic nature scenes with subtle AI characteristics
 */
const FAKE_GENERATION_PROMPT = `photorealistic nature landscape, high quality photograph, 16:9 aspect ratio, natural lighting, realistic textures, subtle imperfections, outdoor scene, detailed environment, professional photography`;

const NEGATIVE_PROMPT = `cartoon, illustration, drawing, painting, sketch, artificial, synthetic, CGI, 3D render, anime, text, watermark, signature, border, frame, low quality, blurry, distorted`;

/**
 * Convert image file to base64
 *
 * @param {string} imagePath - Path to image file
 * @returns {Promise<Buffer>} Image buffer
 */
async function loadImageBuffer(imagePath) {
  return await readFile(imagePath);
}

/**
 * Generate a fake image using Hugging Face Stable Diffusion
 *
 * Since Stable Diffusion is text-to-image (not image-to-image in the free API),
 * we'll use a prompt that generates similar nature/landscape scenes
 *
 * @param {string} originalImagePath - Path to the original image (for reference)
 * @param {string} outputPath - Path to save the generated fake
 * @param {string} customPrompt - Optional custom prompt override
 * @returns {Promise<string>} Path to generated fake image
 */
export async function generateFakeImage(originalImagePath, outputPath, customPrompt = null) {
  return retryWithBackoff(async () => {
    // Use the default prompt or custom one
    const prompt = customPrompt || FAKE_GENERATION_PROMPT;

    logger.info(`    Using prompt: "${prompt.substring(0, 50)}..."`);

    // Generate image with Stable Diffusion
    const response = await hf.textToImage({
      model: config.huggingface.model,
      inputs: prompt,
      parameters: {
        negative_prompt: NEGATIVE_PROMPT,
        width: 1024,
        height: 576, // 16:9 aspect ratio (1024/576 ≈ 1.78)
        num_inference_steps: 50, // Higher = better quality but slower
        guidance_scale: 7.5, // How closely to follow the prompt
      },
    });

    // Convert blob response to buffer and save
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(outputPath, buffer);

    return outputPath;
  }, 3, 2000); // 3 retries, 2 second base delay
}

/**
 * Generate a fake image with a custom scene description
 * This allows for more variety in the generated images
 *
 * @param {string} originalImagePath - Path to the original image
 * @param {string} outputPath - Path to save the generated fake
 * @param {string} sceneType - Type of scene (e.g., "forest", "mountain", "beach", "desert")
 * @returns {Promise<string>} Path to generated fake image
 */
export async function generateFakeImageWithScene(originalImagePath, outputPath, sceneType = 'landscape') {
  const scenePrompts = {
    forest: 'dense forest with tall trees, dappled sunlight through canopy, moss covered ground, natural woodland scene, photorealistic, 16:9',
    mountain: 'majestic mountain landscape, rocky peaks, clear sky, distant valleys, alpine environment, photorealistic, 16:9',
    beach: 'serene beach scene, ocean waves, sandy shore, coastal landscape, natural lighting, photorealistic, 16:9',
    desert: 'vast desert landscape, sand dunes, arid environment, warm tones, clear sky, photorealistic, 16:9',
    lake: 'tranquil lake surrounded by nature, reflections on water, peaceful scenery, photorealistic, 16:9',
    sunset: 'beautiful sunset landscape, golden hour lighting, warm colors, natural scene, photorealistic, 16:9',
    landscape: 'beautiful natural landscape, outdoor scenery, realistic environment, professional photography, 16:9',
  };

  const prompt = scenePrompts[sceneType] || scenePrompts.landscape;
  return generateFakeImage(originalImagePath, outputPath, prompt);
}

/**
 * Generate fake images for a batch of originals
 * Cycles through different scene types for variety
 *
 * @param {Array} originals - Array of {id, localPath}
 * @param {string} outputDir - Directory to save fake images
 * @returns {Promise<Array>} Array of {id, originalPath, fakePath}
 */
export async function generateFakeImages(originals, outputDir) {
  logger.info(`Generating ${originals.length} fake images with Hugging Face...`);

  const results = [];
  const sceneTypes = ['landscape', 'forest', 'mountain', 'beach', 'lake', 'sunset', 'desert'];

  for (let i = 0; i < originals.length; i++) {
    const original = originals[i];
    const fakeFilename = `fake_${original.id}_raw.jpeg`;
    const fakePath = join(outputDir, fakeFilename);

    // Rotate through scene types for variety
    const sceneType = sceneTypes[i % sceneTypes.length];

    logger.info(`  Generating fake ${i + 1}/${originals.length}: ${original.id} (${sceneType})`);

    try {
      await generateFakeImageWithScene(original.localPath, fakePath, sceneType);

      results.push({
        id: original.id,
        originalPath: original.localPath,
        fakePath,
        success: true,
        sceneType,
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

    // Rate limiting between generations (be nice to free API)
    if (i < originals.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    }
  }

  return results;
}

export default {
  generateFakeImage,
  generateFakeImageWithScene,
  generateFakeImages,
  FAKE_GENERATION_PROMPT,
};
