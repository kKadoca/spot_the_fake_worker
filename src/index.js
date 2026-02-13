#!/usr/bin/env node

/**
 * Spot the Fake - Automated Image Pipeline
 *
 * This script orchestrates the full workflow:
 * 1. Fetch nature images from Unsplash
 * 2. Save to local raw folder
 * 3. Resize + Compress via Sharp
 * 4. Save to local to_replicate and ready folders
 * 5. Generate fake images with Replicate (Stable Diffusion img2img)
 * 6. Process fakes via Sharp
 * 7. Save fakes to local ready folder
 */

import { config, validateConfig } from "./config/index.js";
import unsplash from "./services/unsplash.js";
// import gdrive from './services/gdrive.js' // No longer needed - using local storage
import sharp from "./services/sharp.js";
import replicate from "./services/replicate.js";
import {
  generateBatchId,
  generateSequentialIds,
  ensureTempDir,
  createTempSubdir,
  cleanupTemp,
  ensureStorageDirs,
  copyToStorage,
  logger,
} from "./utils/helpers.js";
import { join } from "path";

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    step: null, // Run specific step: fetch, process, generate, or null for all
    count: config.workflow.batchSize,
    cleanup: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--step":
        options.step = args[++i];
        break;
      case "--count":
      case "-n":
        options.count = parseInt(args[++i], 10);
        break;
      case "--no-cleanup":
        options.cleanup = false;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Spot the Fake - Automated Image Pipeline

Usage: npm start [options]

Options:
  --step <step>     Run specific step only (fetch, process, generate)
  --count, -n <n>   Number of images to process (default: ${config.workflow.batchSize})
  --no-cleanup      Keep temporary files after completion
  --help, -h        Show this help message

Steps:
  fetch     - Download images from Unsplash
  process   - Resize and compress images
  generate  - Generate fake images with AI

Examples:
  npm start                    # Run full pipeline
  npm start --count 3          # Process 3 images
  npm start --step fetch       # Only fetch images
  npm run fetch                # Shortcut for fetch step
`);
}

/**
 * Step 1 & 2: Fetch images from Unsplash and save to Raw folder
 */
async function stepFetch(count, tempDir, batchId) {
  logger.step(1, "Fetching images from Unsplash...");

  // Generate IDs for this batch
  const ids = generateSequentialIds(count, batchId);

  // Fetch image metadata
  const images = await unsplash.fetchImages(count);

  // Create temp directory for downloads
  const downloadDir = await createTempSubdir("raw");

  // Download images
  const downloaded = await unsplash.downloadImages(images, downloadDir, ids);

  // Save to local Raw folder
  for (const image of downloaded) {
    await copyToStorage(image.localPath, config.paths.raw, image.filename);
  }

  logger.success(`Fetched ${downloaded.length} images`);
  return downloaded;
}

/**
 * Step 3 & 4: Process images with sharp and upload to folders
 */
async function stepProcess(images) {
  logger.step(2, "Processing images with sharp...");

  // Create temp directory for processed images
  const processedDir = await createTempSubdir("processed");

  // Prepare processing tasks
  const processingTasks = images.map(img => ({
    id: img.id,
    inputPath: img.localPath,
    outputPath: join(processedDir, `original_${img.id}.jpeg`),
  }));

  // Process all images (resize + compress)
  const processed = await sharp.processImages(processingTasks);

  // Save to local To_Replicate and Ready folders
  for (const img of processed) {
    const filename = `original_${img.id}.jpeg`;
    // Save to to_replicate folder (for AI reference)
    await copyToStorage(img.processedPath, config.paths.toReplicate, filename);
    // Save to ready folder (game-ready)
    await copyToStorage(img.processedPath, config.paths.ready, filename);
  }

  logger.success(`Processed ${processed.length} originals`);
  return processed;
}

/**
 * Step 5, 6 & 7: Generate fakes, process, and upload
 */
async function stepGenerate(originals) {
  logger.step(3, "Generating fake images with Replicate...");

  // Create temp directory for fakes
  const fakesRawDir = await createTempSubdir("fakes_raw");
  const fakesProcessedDir = await createTempSubdir("fakes_processed");

  // Generate fakes
  const fakes = await replicate.generateFakeImages(originals, fakesRawDir);

  // Filter successful generations
  const successfulFakes = fakes.filter(f => f.success);

  if (successfulFakes.length === 0) {
    logger.warn("No fake images were generated successfully");
    return [];
  } else {
    logger.success(`Generated ${processedFakes.length} fakes`);
  }

  // Process fakes with sharp
  logger.step(4, "Processing fake images with sharp...");

  const fakeProcessingTasks = successfulFakes.map(fake => ({
    id: fake.id,
    inputPath: fake.fakePath,
    outputPath: join(fakesProcessedDir, `fake_${fake.id}.jpeg`),
  }));

  const processedFakes = await sharp.processImages(fakeProcessingTasks);
  logger.success(`Processed ${processedFakes.length} fakes`);

  // Save fakes to local Ready folder
  for (const fake of processedFakes) {
    const filename = `fake_${fake.id}.jpeg`;
    await copyToStorage(fake.processedPath, config.paths.ready, filename);
  }

  return processedFakes;
}

/**
 * Main entry point
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           SPOT THE FAKE - Automated Pipeline              ║
╚═══════════════════════════════════════════════════════════╝
`);

  const options = parseArgs();

  try {
    // Validate configuration
    logger.info("Validating configuration...");
    validateConfig();
    logger.success("Configuration valid");

    // Setup
    const batchId = generateBatchId();
    const tempDir = await ensureTempDir();
    const storageDirs = await ensureStorageDirs();
    logger.info(`Batch ID: ${batchId}`);
    logger.info(`Temp directory: ${tempDir}`);
    logger.info(`Processing ${options.count} images`);

    let images = [];
    let processedImages = [];

    // Run steps based on options
    if (!options.step || options.step === "fetch") {
      images = await stepFetch(options.count, tempDir, batchId);

      if (options.step === "fetch") {
        logger.success("Fetch step completed");
        return;
      }
    }

    if (!options.step || options.step === "process") {
      // If running process step alone, we need to load images from temp
      if (options.step === "process" && images.length === 0) {
        logger.error("No images to process. Run fetch step first.");
        process.exit(1);
      }

      processedImages = await stepProcess(images);

      if (options.step === "process") {
        logger.success("Process step completed");
        return;
      }
    }

    if (!options.step || options.step === "generate") {
      // Prepare originals for fake generation
      const originalsForFakes = processedImages.map(img => ({
        id: img.id,
        localPath: img.processedPath,
      }));

      if (originalsForFakes.length === 0) {
        logger.error(
          "No processed images for fake generation. Run previous steps first.",
        );
        process.exit(1);
      }

      await stepGenerate(originalsForFakes);
    }

    // Cleanup
    if (options.cleanup) {
      logger.info("Cleaning up temporary files...");
      await cleanupTemp();
    }

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    PIPELINE COMPLETE                      ║
║                                                           ║
║  ✅ ${options.count} original images fetched and processed
║  ✅ ${options.count} fake images generated and processed
║  ✅ All images saved to local storage                     ║
╚═══════════════════════════════════════════════════════════╝
`);
    logger.success(`Files saved to: ${config.paths.ready}`);
  } catch (error) {
    logger.error(`Pipeline failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run
main();
