import OpenAI from 'openai';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import config from '../config/index.js';
import { logger, retryWithBackoff } from '../utils/helpers.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

/**
 * The master prompt for generating "spot the fake" images
 * This prompt instructs DALL-E to create a near-replica with subtle differences
 */
const FAKE_GENERATION_PROMPT = `Create a pixel-perfect, 16:9 replica of the reference image. Match the original framing, composition, perspective, and proportions exactly. — Precisely mimic the lighting direction, intensity, and color temperature as seen in the image. — Reproduce all visible camera characteristics (lens distortion, depth of field, exposure) based on the source. — Preserve all micro-textures: skin pores, fabric weave, wood grain, natural noise, scratches, reflections, and imperfections. — No added elements, stylization, illustration, CGI, text, watermarks, smoothing, or digital artifacts. Negative prompt: illustration, cartoon, stylization, CGI/plastic skin, added text, visible artifacts, smoothing, watermark. Remember, this is for a game where the player needs to guess which image is real and which is AI, so just make minor changes.`;

/**
 * Convert image file to base64
 * 
 * @param {string} imagePath - Path to image file
 * @returns {Promise<string>} Base64 encoded image
 */
async function imageToBase64(imagePath) {
  const imageBuffer = await readFile(imagePath);
  return imageBuffer.toString('base64');
}

/**
 * Generate a fake image using OpenAI's GPT-4o + DALL-E
 * 
 * @param {string} originalImagePath - Path to the original image
 * @param {string} outputPath - Path to save the generated fake
 * @returns {Promise<string>} Path to generated fake image
 */
export async function generateFakeImage(originalImagePath, outputPath) {
  return retryWithBackoff(async () => {
    // Read and encode the original image
    const base64Image = await imageToBase64(originalImagePath);
    const mimeType = 'image/jpeg';

    // Use GPT-4o with vision to analyze and generate via DALL-E
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
            {
              type: 'text',
              text: FAKE_GENERATION_PROMPT,
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    // Extract the generated image description for DALL-E
    const analysisText = response.choices[0].message.content;

    // Now generate with DALL-E 3 using the analysis
    const imageResponse = await openai.images.generate({
      model: 'dall-e-3',
      prompt: `${FAKE_GENERATION_PROMPT}\n\nBased on this analysis of the original: ${analysisText}`,
      n: 1,
      size: '1792x1024', // Closest to 16:9 in DALL-E 3
      quality: 'hd',
      response_format: 'b64_json',
    });

    // Save the generated image
    const imageData = imageResponse.data[0].b64_json;
    const imageBuffer = Buffer.from(imageData, 'base64');
    await writeFile(outputPath, imageBuffer);

    return outputPath;
  }, 3, 2000); // 3 retries, 2 second base delay (DALL-E can be slow)
}

/**
 * Alternative method: Direct image editing approach
 * Uses the images.edit endpoint for more faithful reproduction
 * Note: Requires PNG with alpha channel for mask, so this is a simplified version
 * 
 * @param {string} originalImagePath - Path to the original image
 * @param {string} outputPath - Path to save the generated fake
 * @returns {Promise<string>} Path to generated fake image
 */
export async function generateFakeImageDirect(originalImagePath, outputPath) {
  return retryWithBackoff(async () => {
    // For direct generation, we first describe the image in detail
    const base64Image = await imageToBase64(originalImagePath);

    // Get detailed description from GPT-4o
    const descriptionResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
            {
              type: 'text',
              text: 'Describe this image in extreme detail. Include: exact composition, all objects and their positions, lighting direction and quality, colors, textures, atmosphere, camera angle, depth of field, and any other visual elements. Be as precise as possible - this description will be used to recreate the image.',
            },
          ],
        },
      ],
      max_tokens: 2000,
    });

    const detailedDescription = descriptionResponse.choices[0].message.content;

    // Generate with DALL-E 3
    const imageResponse = await openai.images.generate({
      model: 'dall-e-3',
      prompt: `${FAKE_GENERATION_PROMPT}\n\nRecreate this exact scene with only very minor, subtle differences: ${detailedDescription}`,
      n: 1,
      size: '1792x1024',
      quality: 'hd',
      response_format: 'b64_json',
    });

    const imageData = imageResponse.data[0].b64_json;
    const imageBuffer = Buffer.from(imageData, 'base64');
    await writeFile(outputPath, imageBuffer);

    return outputPath;
  }, 3, 2000);
}

/**
 * Generate fake images for a batch of originals
 * 
 * @param {Array} originals - Array of {id, localPath}
 * @param {string} outputDir - Directory to save fake images
 * @returns {Promise<Array>} Array of {id, originalPath, fakePath}
 */
export async function generateFakeImages(originals, outputDir) {
  logger.info(`Generating ${originals.length} fake images with OpenAI...`);

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

    // Rate limiting between generations
    if (i < originals.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

export default {
  generateFakeImage,
  generateFakeImageDirect,
  generateFakeImages,
  FAKE_GENERATION_PROMPT,
};
