import sharp from 'sharp'
import { writeFile, readFile, unlink } from 'fs/promises'
import { join, dirname } from 'path'
import config from '../config/index.js'
import { logger, retryWithBackoff } from '../utils/helpers.js'

/**
 * Resize an image using Sharp
 *
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save resized image
 * @param {number|Object} widthOrOptions - Width in pixels OR options object
 * @param {number} [height] - Height in pixels (only for old signature)
 * @returns {Promise<string>} Path to resized image
 */
export async function resizeImage(inputPath, outputPath, widthOrOptions, height) {
  return retryWithBackoff(async () => {
    // Support both old and new signatures
    let options = {}
    if (typeof widthOrOptions === 'number') {
      // Old signature: resizeImage(input, output, width, height)
      options = {
        width: widthOrOptions,
        height: height || config.workflow?.resize?.height || 1080,
      }
    } else {
      // New signature: resizeImage(input, output, options)
      options = widthOrOptions || {}
    }

    const width = options.width || config.workflow?.resize?.width || 1920
    const targetHeight = options.height || config.workflow?.resize?.height || 1080
    const maintainRatio = options.maintainRatio !== undefined ? options.maintainRatio : true

    const resizeOptions = {
      width,
      height: targetHeight,
      fit: maintainRatio ? 'inside' : 'fill',
    }

    await sharp(inputPath)
      .resize(resizeOptions)
      .jpeg({ quality: 90 })
      .toFile(outputPath)

    return outputPath
  })
}

/**
 * Compress an image using Sharp
 *
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save compressed image
 * @param {Object} [options] - Compression options
 * @returns {Promise<string>} Path to compressed image
 */
export async function compressImage(inputPath, outputPath, options = {}) {
  return retryWithBackoff(async () => {
    // Map compression levels to quality values
    const compressionLevelMap = {
      low: 90,
      recommended: 85,
      extreme: 70,
    }

    const compressionLevel = options.compressionLevel || config.iloveimg?.defaults?.compressionLevel || 'recommended'
    const quality = compressionLevelMap[compressionLevel] || 85

    await sharp(inputPath)
      .jpeg({ quality })
      .toFile(outputPath)

    return outputPath
  })
}

/**
 * Watermark an image using Sharp
 *
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save watermarked image
 * @param {Object} options - Watermark options
 * @returns {Promise<string>} Path to watermarked image
 */
export async function watermarkImage(inputPath, outputPath, options = {}) {
  if (!options.mode || (options.mode !== 'text' && options.mode !== 'image')) {
    throw new Error('Watermark mode must be either "text" or "image"')
  }

  if (options.mode === 'text' && !options.text) {
    throw new Error('Text is required when mode is "text"')
  }

  if (options.mode === 'image' && !options.imagePath) {
    throw new Error('imagePath is required when mode is "image"')
  }

  return retryWithBackoff(async () => {
    if (options.mode === 'image') {
      // Image watermark using composite
      const watermark = await sharp(options.imagePath)
        .resize({ width: 200 }) // Resize watermark if needed
        .toBuffer()

      await sharp(inputPath)
        .composite([{
          input: watermark,
          gravity: 'southeast', // Position watermark in bottom-right
          blend: 'over',
        }])
        .toFile(outputPath)
    } else {
      // Text watermark - Sharp doesn't natively support text
      // For now, just copy the file
      logger.warn('Text watermark not fully supported with Sharp, copying file')
      await sharp(inputPath).toFile(outputPath)
    }

    return outputPath
  })
}

/**
 * Rotate an image using Sharp
 *
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save rotated image
 * @param {Object} options - Rotation options
 * @returns {Promise<string>} Path to rotated image
 */
export async function rotateImage(inputPath, outputPath, options = {}) {
  const { degrees = 90 } = options

  if (![90, 180, 270, 360].includes(degrees)) {
    throw new Error('Rotation degrees must be 90, 180, 270, or 360')
  }

  return retryWithBackoff(async () => {
    await sharp(inputPath)
      .rotate(degrees)
      .toFile(outputPath)

    return outputPath
  })
}

/**
 * Resize and then compress an image (full pipeline)
 *
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save final image
 * @param {Object} [options] - Processing options
 * @returns {Promise<string>} Path to processed image
 */
export async function processImage(inputPath, outputPath, options = {}) {
  const {
    width = config.workflow.resize.width,
    height = config.workflow.resize.height,
    maintainRatio = false,
  } = options

  return retryWithBackoff(async () => {
    // Get compression quality
    const compressionLevelMap = {
      low: 90,
      recommended: 85,
      extreme: 70,
    }

    const compressionLevel = options.compressionLevel || config.iloveimg?.defaults?.compressionLevel || 'recommended'
    const quality = compressionLevelMap[compressionLevel] || 85

    const resizeOptions = {
      width,
      height,
      fit: maintainRatio ? 'inside' : 'fill',
    }

    // Perform resize and compress in one operation for efficiency
    await sharp(inputPath)
      .resize(resizeOptions)
      .jpeg({ quality })
      .toFile(outputPath)

    return outputPath
  })
}

/**
 * Process multiple images (resize + compress)
 *
 * @param {Array} images - Array of {inputPath, outputPath, id}
 * @param {Object} [options] - Processing options
 * @returns {Promise<Array>} Array of processed image results
 */
export async function processImages(images, options = {}) {
  const { parallel = false, concurrency = 3 } = options

  if (parallel) {
    logger.info(`Processing ${images.length} images with Sharp (parallel, concurrency: ${concurrency})...`)

    // Lazy-load p-limit for concurrency control
    let pLimit
    try {
      pLimit = (await import('p-limit')).default
    } catch (error) {
      logger.warn('p-limit package not available, falling back to sequential processing')
      return processImages(images, { ...options, parallel: false })
    }

    const limit = pLimit(concurrency)

    const promises = images.map((image, i) =>
      limit(async () => {
        logger.info(`  Processing image ${i + 1}/${images.length}: ${image.id}`)
        try {
          const outputPath = await processImage(image.inputPath, image.outputPath, options)
          return {
            ...image,
            processedPath: outputPath,
            success: true,
          }
        } catch (error) {
          logger.error(`  Failed to process image ${image.id}: ${error.message}`)
          return {
            ...image,
            success: false,
            error: error.message,
          }
        }
      })
    )

    return Promise.all(promises)
  } else {
    logger.info(`Processing ${images.length} images with Sharp...`)

    const results = []

    for (let i = 0; i < images.length; i++) {
      const image = images[i]
      logger.info(`  Processing image ${i + 1}/${images.length}: ${image.id}`)

      const outputPath = await processImage(image.inputPath, image.outputPath, options)
      results.push({
        ...image,
        processedPath: outputPath,
      })
    }

    return results
  }
}

export default {
  resizeImage,
  compressImage,
  watermarkImage,
  rotateImage,
  processImage,
  processImages,
}
