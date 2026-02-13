import Replicate from "replicate";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import config from "../config/index.js";
import { logger, retryWithBackoff } from "../utils/helpers.js";
import axios from "axios";

// Initialize Replicate client
const replicate = new Replicate({
  auth: config.replicate.apiKey,
});

/**
 * The master prompt for generating "spot the fake" images
 * This prompt instructs Stable Diffusion to create a near-replica with subtle AI differences
 */
const FAKE_GENERATION_PROMPT = `Create a pixel-perfect replica of the reference image. Match the original framing, composition, perspective, and proportions exactly. Precisely mimic the lighting direction, intensity, and color temperature as seen in the image. Reproduce all visible camera characteristics (lens distortion, depth of field, exposure) based on the source. Preserve all micro-textures: skin pores, fabric weave, wood grain, natural noise, scratches, reflections, and imperfections. Remember, this is for a game where the player needs to guess which image is real and which is AI, so just make minor changes.`;

const NEGATIVE_PROMPT = `Adding elements, CGI, text, watermarks, smoothing, digital artifacts, illustration, cartoon, stylization, CGI/plastic skin, added text, visible artifacts, low quality, blurry, distorted`;

/**
 * Convert image file to base64 data URI
 *
 * @param {string} imagePath - Path to image file
 * @returns {Promise<string>} Base64 data URI
 */
async function imageToDataUri(imagePath) {
  const imageBuffer = await readFile(imagePath);
  const base64 = imageBuffer.toString("base64");
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
  const response = await axios.get(url, { responseType: "arraybuffer" });
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
export async function generateFakeImage(
  originalImagePath,
  outputPath,
  options = {},
) {
  return retryWithBackoff(
    async () => {
      const imageDataUri = await imageToDataUri(originalImagePath);

      // Use Stable Diffusion XL with img2img
      // Model: stability-ai/sdxl
      const output = await replicate.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            image: imageDataUri,
            prompt: FAKE_GENERATION_PROMPT,
            negative_prompt: NEGATIVE_PROMPT,
            width: 780,
            height: 530,
            // num_inference_steps = (20-100)
            // 100 = High Quality = SLOW
            num_inference_steps: 70,
            // guidance_scale = how strongly follow prompt (1-10)
            guidance_scale: 10,
            // Lower prompt_strength = keep more of original image
            // 0.3 = 70% original, 30% AI changes (subtle differences)
            // 0.5 = 50% original, 50% AI changes (moderate differences)
            // 0.8 = 20% original, 80% AI changes (major differences)
            prompt_strength: 0.25,
            // refine = adds detail
            // "expert_ensemble_refiner"
            // "no_refiner"
            refine: "no_refiner",
            // scheduler = sampling algorithm
            // "DPMSolverMultistep" = High Quality = SLOW
            // "PNDM" = Stable = MEDIUM
            scheduler: "DPMSolverMultistep",
            num_outputs: 1,
          },
        },
      );

      // Output is an array of URLs
      const imageUrl = Array.isArray(output) ? output[0] : output;

      logger.info(`  Downloading generated image...`);
      await downloadImage(imageUrl, outputPath);

      return outputPath;
    },
    3,
    10000,
  ); // 3 retries, 2 second base delay
}

/**
 * Generate fake images for a batch of originals
 *
 * @param {Array} originals - Array of {id, localPath}
 * @param {string} outputDir - Directory to save fake images
 * @returns {Promise<Array>} Array of {id, originalPath, fakePath}
 */
export async function generateFakeImages(originals, outputDir) {
  const results = [];

  for (let i = 0; i < originals.length; i++) {
    const original = originals[i];
    const fakeFilename = `fake_${original.id}_raw.jpeg`;
    const fakePath = join(outputDir, fakeFilename);

    logger.info(
      `  Generating fake ${i + 1}/${originals.length}: ${original.id}...`,
    );

    try {
      await generateFakeImage(original.localPath, fakePath);

      results.push({
        id: original.id,
        originalPath: original.localPath,
        fakePath,
        success: true,
      });

      logger.success(`Generated fake for ${original.id}`);
    } catch (error) {
      logger.error(
        `Failed to generate fake for ${original.id}: ${error.message}`,
      );

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
      logger.info(`  Waiting 10 seconds before next generation...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  return results;
}

export default {
  generateFakeImage,
  generateFakeImages,
  FAKE_GENERATION_PROMPT,
};
