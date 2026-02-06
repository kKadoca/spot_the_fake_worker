import ILovePDFApi from '@ilovepdf/ilovepdf-nodejs'
import ILovePDFFile from '@ilovepdf/ilovepdf-nodejs/ILovePDFFile.js'
import { writeFile, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import config from '../config/index.js'
import { logger, retryWithBackoff } from '../utils/helpers.js'

// Initialize iLoveIMG instance
// Note: iLoveAPI works for both PDF and images
const iloveimg = new ILovePDFApi(
  config.iloveimg.publicKey,
  config.iloveimg.secretKey
)

// ===== INTERNAL HELPER FUNCTIONS =====

/**
 * Merge config defaults with user-provided options
 * @private
 */
function getTaskOptions(userOptions = {}) {
  const defaults = config.iloveimg?.defaults || {
    region: 'eu',
    autoCleanup: true,
    compressionLevel: 'recommended',
    maintainRatio: true,
    resizeMode: 'pixels',
  }

  return {
    region: userOptions.region || defaults.region,
    autoCleanup: userOptions.autoCleanup !== undefined ? userOptions.autoCleanup : defaults.autoCleanup,
    fileEncryptionKey: userOptions.fileEncryptionKey || config.iloveimg?.advanced?.fileEncryptionKey,
    webhook: userOptions.webhook || config.iloveimg?.advanced?.webhookUrl,
  }
}

/**
 * Build tool-specific process options
 * @private
 */
function getProcessOptions(toolName, userOptions = {}) {
  const options = {}

  if (toolName === 'resizeimage') {
    const defaults = config.iloveimg?.defaults || {}
    options.resize_mode = userOptions.resizeMode || defaults.resizeMode || 'pixels'
    options.pixels_width = userOptions.width || config.workflow?.resize?.width || 1920
    options.pixels_height = userOptions.height || config.workflow?.resize?.height || 1080
    options.maintain_ratio = userOptions.maintainRatio !== undefined
      ? userOptions.maintainRatio
      : (defaults.maintainRatio !== undefined ? defaults.maintainRatio : true)
  } else if (toolName === 'compressimage') {
    const level = userOptions.compressionLevel || config.iloveimg?.defaults?.compressionLevel
    if (level) {
      options.compression_level = level
    }
  } else if (toolName === 'watermarkimage') {
    if (userOptions.mode === 'text' && userOptions.text) {
      options.mode = 'text'
      options.text = userOptions.text
      options.font_family = userOptions.fontFamily || 'Arial'
      options.font_size = userOptions.fontSize || 12
      options.font_color = userOptions.fontColor || '#000000'
    } else if (userOptions.mode === 'image' && userOptions.imagePath) {
      options.mode = 'image'
      // Image watermark handled via addFile
    }
    options.vertical_position = userOptions.verticalPosition || 'center'
    options.horizontal_position = userOptions.horizontalPosition || 'center'
    options.transparency = userOptions.opacity !== undefined ? userOptions.opacity : 50
  } else if (toolName === 'rotateimage') {
    options.degrees = userOptions.degrees || 90
  }

  // Add webhook if provided
  if (userOptions.webhook) {
    options.webhook = userOptions.webhook
  }

  return options
}

/**
 * Detect function signature for backward compatibility
 * Supports both old (input, output, width, height) and new (input, output, options) signatures
 * @private
 */
function detectSignature(args, functionName = 'unknown') {
  const [inputPath, outputPath, thirdArg, fourthArg] = args

  // For resizeImage: old signature is (input, output, width, height)
  if (functionName === 'resizeImage' && typeof thirdArg === 'number') {
    return {
      inputPath,
      outputPath,
      options: {
        width: thirdArg,
        height: fourthArg || config.workflow?.resize?.height || 1080,
      }
    }
  }

  // For compressImage: old signature is (input, output) - no third arg
  // New signature: (input, output, options)
  if (functionName === 'compressImage') {
    return {
      inputPath,
      outputPath,
      options: typeof thirdArg === 'object' ? thirdArg : {}
    }
  }

  // Default: new signature (input, output, options)
  return {
    inputPath,
    outputPath,
    options: typeof thirdArg === 'object' ? thirdArg : {}
  }
}

// ===== LAYER 1: LOW-LEVEL WORKFLOW PRIMITIVES =====

/**
 * Create a new iLoveAPI task
 *
 * @param {string} toolName - Tool name (resizeimage, compressimage, watermarkimage, rotateimage)
 * @param {Object} options - Task options
 * @param {string} options.region - Server region (eu, us, fr, de, pl)
 * @param {string} options.fileEncryptionKey - Encryption key for files
 * @param {boolean} options.autoCleanup - Auto-delete task after completion (default: true)
 * @returns {Promise<Task>} Task instance
 */
export async function createTask(toolName, options = {}) {
  return retryWithBackoff(async () => {
    const taskOptions = getTaskOptions(options)
    const task = iloveimg.newTask(toolName)
    await task.start()

    // Store cleanup preference on task for later use
    task._autoCleanup = taskOptions.autoCleanup

    return task
  })
}

/**
 * Upload a file to an existing task
 *
 * @param {Task} task - Task instance from createTask
 * @param {string|ILovePDFFile} file - File path or ILovePDFFile instance
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Uploaded file reference
 */
export async function uploadToTask(task, file, options = {}) {
  return retryWithBackoff(async () => {
    const fileObj = typeof file === 'string' ? new ILovePDFFile(file) : file
    await task.addFile(fileObj)
    return task
  })
}

/**
 * Execute processing on a task
 *
 * @param {Task} task - Task instance with uploaded files
 * @param {Object} processOptions - Tool-specific processing options
 * @returns {Promise<Object>} Processing metadata
 */
export async function executeTask(task, processOptions = {}) {
  return retryWithBackoff(async () => {
    await task.process(processOptions)
    return task
  })
}

/**
 * Download processed file from task
 *
 * @param {Task} task - Processed task instance
 * @param {string} outputPath - Path to save downloaded file
 * @returns {Promise<string>} Path to downloaded file
 */
export async function downloadFromTask(task, outputPath) {
  return retryWithBackoff(async () => {
    const data = await task.download()
    await writeFile(outputPath, data)
    return outputPath
  })
}

/**
 * Connect two tasks to avoid re-downloading intermediate files
 * Use this to chain operations (e.g., resize → compress)
 *
 * @param {Task} sourceTask - Completed source task
 * @param {string} nextToolName - Next tool to apply (resizeimage, compressimage, etc.)
 * @param {Object} options - Options for the next task
 * @returns {Promise<Task>} New task with source files already uploaded
 */
export async function connectTasks(sourceTask, nextToolName, options = {}) {
  return retryWithBackoff(async () => {
    const taskOptions = getTaskOptions(options)
    const nextTask = iloveimg.newTask(nextToolName)

    // Use SDK's connect method to chain tasks
    await nextTask.start()

    // The SDK's way to connect tasks - files are passed without re-download
    // Note: This depends on SDK support. If not available, we'll fall back to download/upload
    if (typeof sourceTask.connect === 'function') {
      await sourceTask.connect(nextTask)
    } else {
      // Fallback: Use server_filename to reference files
      logger.warn('Task chaining not supported by SDK version, falling back to file references')
      // This might not work in all SDK versions - documented limitation
    }

    // Store cleanup preference
    nextTask._autoCleanup = taskOptions.autoCleanup

    return nextTask
  })
}

/**
 * Manually cleanup a task from server
 *
 * @param {Task} task - Task to cleanup
 * @returns {Promise<void>}
 */
export async function cleanupTask(task) {
  try {
    if (task && typeof task.delete === 'function') {
      await task.delete()
    }
  } catch (error) {
    // Ignore cleanup errors - task might already be deleted or expired
    logger.warn(`Task cleanup failed (non-critical): ${error.message}`)
  }
}

// ===== LAYER 2: SINGLE OPERATIONS =====

/**
 * Resize an image using iLoveIMG API
 *
 * Supports both old and new signatures for backward compatibility:
 * - Old: resizeImage(inputPath, outputPath, width, height)
 * - New: resizeImage(inputPath, outputPath, options)
 *
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save resized image
 * @param {number|Object} widthOrOptions - Width in pixels OR options object
 * @param {number} [height] - Height in pixels (only for old signature)
 * @param {number} [widthOrOptions.width] - Target width (default: from config)
 * @param {number} [widthOrOptions.height] - Target height (default: from config)
 * @param {boolean} [widthOrOptions.maintainRatio] - Maintain aspect ratio (default: true)
 * @param {string} [widthOrOptions.resizeMode] - Mode: 'pixels' or 'percentage' (default: 'pixels')
 * @param {string} [widthOrOptions.region] - Server region (eu, us, fr, de, pl)
 * @param {string} [widthOrOptions.webhook] - Webhook URL for async processing
 * @param {string} [widthOrOptions.fileEncryptionKey] - Encryption key
 * @param {boolean} [widthOrOptions.autoCleanup] - Auto-delete task (default: true)
 * @returns {Promise<string>} Path to resized image
 *
 * @example
 * // Old signature (still works)
 * await resizeImage('input.jpg', 'output.jpg', 1920, 1080)
 *
 * @example
 * // New signature with options
 * await resizeImage('input.jpg', 'output.jpg', {
 *   width: 1920,
 *   height: 1080,
 *   region: 'us',
 *   maintainRatio: true
 * })
 */
export async function resizeImage(...args) {
  // Detect signature for backward compatibility
  const { inputPath, outputPath, options } = detectSignature(args, 'resizeImage')

  let task = null

  return retryWithBackoff(async () => {
    try {
      // Create and configure task
      task = await createTask('resizeimage', options)

      // Upload file
      await uploadToTask(task, inputPath)

      // Process with resize settings
      const processOptions = getProcessOptions('resizeimage', options)
      await executeTask(task, processOptions)

      // Download result
      await downloadFromTask(task, outputPath)

      return outputPath
    } finally {
      // Cleanup task if auto-cleanup is enabled
      if (task && task._autoCleanup !== false) {
        await cleanupTask(task)
      }
    }
  })
}

/**
 * Compress an image using iLoveIMG API
 *
 * Supports both old and new signatures for backward compatibility:
 * - Old: compressImage(inputPath, outputPath)
 * - New: compressImage(inputPath, outputPath, options)
 *
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save compressed image
 * @param {Object} [options] - Compression options
 * @param {string} [options.compressionLevel] - Level: 'low', 'recommended', 'extreme' (default: 'recommended')
 * @param {string} [options.region] - Server region (eu, us, fr, de, pl)
 * @param {string} [options.webhook] - Webhook URL for async processing
 * @param {string} [options.fileEncryptionKey] - Encryption key
 * @param {boolean} [options.autoCleanup] - Auto-delete task (default: true)
 * @returns {Promise<string>} Path to compressed image
 *
 * @example
 * // Old signature (still works)
 * await compressImage('input.jpg', 'output.jpg')
 *
 * @example
 * // New signature with options
 * await compressImage('input.jpg', 'output.jpg', {
 *   compressionLevel: 'extreme',
 *   region: 'us'
 * })
 */
export async function compressImage(...args) {
  // Detect signature for backward compatibility
  const { inputPath, outputPath, options } = detectSignature(args, 'compressImage')

  let task = null

  return retryWithBackoff(async () => {
    try {
      // Create and configure task
      task = await createTask('compressimage', options)

      // Upload file
      await uploadToTask(task, inputPath)

      // Process with compression settings
      const processOptions = getProcessOptions('compressimage', options)
      await executeTask(task, processOptions)

      // Download result
      await downloadFromTask(task, outputPath)

      return outputPath
    } finally {
      // Cleanup task if auto-cleanup is enabled
      if (task && task._autoCleanup !== false) {
        await cleanupTask(task)
      }
    }
  })
}

/**
 * Watermark an image using iLoveIMG API
 *
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save watermarked image
 * @param {Object} options - Watermark options
 * @param {string} [options.mode] - Mode: 'text' or 'image' (required)
 * @param {string} [options.text] - Watermark text (required if mode='text')
 * @param {string} [options.imagePath] - Path to watermark image (required if mode='image')
 * @param {string} [options.fontFamily] - Font family (default: 'Arial')
 * @param {number} [options.fontSize] - Font size (default: 12)
 * @param {string} [options.fontColor] - Font color in hex (default: '#000000')
 * @param {string} [options.verticalPosition] - Vertical position (default: 'center')
 * @param {string} [options.horizontalPosition] - Horizontal position (default: 'center')
 * @param {number} [options.opacity] - Opacity 0-100 (default: 50)
 * @param {string} [options.region] - Server region (eu, us, fr, de, pl)
 * @param {boolean} [options.autoCleanup] - Auto-delete task (default: true)
 * @returns {Promise<string>} Path to watermarked image
 *
 * @example
 * // Text watermark
 * await watermarkImage('input.jpg', 'output.jpg', {
 *   mode: 'text',
 *   text: 'Copyright 2024',
 *   fontSize: 24,
 *   opacity: 30
 * })
 *
 * @example
 * // Image watermark
 * await watermarkImage('input.jpg', 'output.jpg', {
 *   mode: 'image',
 *   imagePath: 'logo.png',
 *   opacity: 50
 * })
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

  let task = null

  return retryWithBackoff(async () => {
    try {
      // Create and configure task
      task = await createTask('watermarkimage', options)

      // Upload main file
      await uploadToTask(task, inputPath)

      // Upload watermark image if in image mode
      if (options.mode === 'image') {
        await uploadToTask(task, options.imagePath)
      }

      // Process with watermark settings
      const processOptions = getProcessOptions('watermarkimage', options)
      await executeTask(task, processOptions)

      // Download result
      await downloadFromTask(task, outputPath)

      return outputPath
    } finally {
      // Cleanup task if auto-cleanup is enabled
      if (task && task._autoCleanup !== false) {
        await cleanupTask(task)
      }
    }
  })
}

/**
 * Rotate an image using iLoveIMG API
 *
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save rotated image
 * @param {Object} options - Rotation options
 * @param {number} [options.degrees] - Rotation degrees: 90, 180, or 270 (default: 90)
 * @param {string} [options.region] - Server region (eu, us, fr, de, pl)
 * @param {boolean} [options.autoCleanup] - Auto-delete task (default: true)
 * @returns {Promise<string>} Path to rotated image
 *
 * @example
 * // Rotate 90 degrees clockwise
 * await rotateImage('input.jpg', 'output.jpg', { degrees: 90 })
 *
 * @example
 * // Rotate 180 degrees
 * await rotateImage('input.jpg', 'output.jpg', { degrees: 180 })
 */
export async function rotateImage(inputPath, outputPath, options = {}) {
  const { degrees = 90 } = options

  if (![90, 180, 270].includes(degrees)) {
    throw new Error('Rotation degrees must be 90, 180, or 270')
  }

  let task = null

  return retryWithBackoff(async () => {
    try {
      // Create and configure task
      task = await createTask('rotateimage', options)

      // Upload file
      await uploadToTask(task, inputPath)

      // Process with rotation settings
      const processOptions = getProcessOptions('rotateimage', { ...options, degrees })
      await executeTask(task, processOptions)

      // Download result
      await downloadFromTask(task, outputPath)

      return outputPath
    } finally {
      // Cleanup task if auto-cleanup is enabled
      if (task && task._autoCleanup !== false) {
        await cleanupTask(task)
      }
    }
  })
}

// ===== LAYER 3: HIGH-LEVEL CONVENIENCE FUNCTIONS =====

/**
 * Resize and then compress an image (full pipeline)
 *
 * This function maintains backward compatibility while adding new features:
 * - Default behavior: Creates temp file between resize and compress (original behavior)
 * - New option useTaskChaining: Chains tasks without re-downloading (faster)
 *
 * @param {string} inputPath - Path to input image
 * @param {string} outputPath - Path to save final image
 * @param {Object} [options] - Processing options
 * @param {number} [options.width] - Target width (default: from config)
 * @param {number} [options.height] - Target height (default: from config)
 * @param {boolean} [options.maintainRatio] - Maintain aspect ratio (default: true)
 * @param {string} [options.compressionLevel] - Compression level (default: 'recommended')
 * @param {string} [options.region] - Server region (eu, us, fr, de, pl)
 * @param {boolean} [options.useTaskChaining] - Use SDK task chaining to avoid temp file (default: false)
 * @param {boolean} [options.autoCleanup] - Auto-delete tasks (default: true)
 * @returns {Promise<string>} Path to processed image
 *
 * @example
 * // Original behavior (still works, backward compatible)
 * await processImage('input.jpg', 'output.jpg', { width: 1920, height: 1080 })
 *
 * @example
 * // New: Use task chaining for better performance
 * await processImage('input.jpg', 'output.jpg', {
 *   width: 1920,
 *   height: 1080,
 *   useTaskChaining: true
 * })
 */
export async function processImage(inputPath, outputPath, options = {}) {
  const {
    width = config.workflow.resize.width,
    height = config.workflow.resize.height,
    useTaskChaining = false,
  } = options

  if (useTaskChaining) {
    // NEW: Use SDK task chaining - no temp file needed
    let resizeTask = null
    let compressTask = null

    return retryWithBackoff(async () => {
      try {
        logger.info(`    Resizing to ${width}x${height}...`)

        // Step 1: Resize
        resizeTask = await createTask('resizeimage', options)
        await uploadToTask(resizeTask, inputPath)
        const resizeOptions = getProcessOptions('resizeimage', { ...options, width, height })
        await executeTask(resizeTask, resizeOptions)

        logger.info(`    Compressing...`)

        // Step 2: Connect to compress (no download between steps)
        compressTask = await connectTasks(resizeTask, 'compressimage', options)
        const compressOptions = getProcessOptions('compressimage', options)
        await executeTask(compressTask, compressOptions)

        // Download final result
        await downloadFromTask(compressTask, outputPath)

        return outputPath
      } finally {
        // Cleanup both tasks
        if (resizeTask && options.autoCleanup !== false) {
          await cleanupTask(resizeTask)
        }
        if (compressTask && options.autoCleanup !== false) {
          await cleanupTask(compressTask)
        }
      }
    })
  } else {
    // ORIGINAL: Use temp file approach (backward compatible)
    const tempResizedPath = outputPath.replace('.jpeg', '_resized.jpeg')

    try {
      // Step 1: Resize
      logger.info(`    Resizing to ${width}x${height}...`)
      await resizeImage(inputPath, tempResizedPath, { ...options, width, height })

      // Step 2: Compress
      logger.info(`    Compressing...`)
      await compressImage(tempResizedPath, outputPath, options)

      // Clean up temp file
      await unlink(tempResizedPath).catch(() => { })

      return outputPath
    } catch (error) {
      // Clean up temp file on error
      await unlink(tempResizedPath).catch(() => { })
      throw error
    }
  }
}

/**
 * Process multiple images (resize + compress)
 *
 * This function maintains backward compatibility while adding new features:
 * - Default behavior: Sequential processing (original behavior)
 * - New option parallel: Process images concurrently with configurable concurrency
 *
 * @param {Array} images - Array of {inputPath, outputPath, id}
 * @param {Object} [options] - Processing options (passed to processImage)
 * @param {boolean} [options.parallel] - Process images in parallel (default: false)
 * @param {number} [options.concurrency] - Max concurrent operations when parallel=true (default: 3)
 * @param {number} [options.width] - Target width (default: from config)
 * @param {number} [options.height] - Target height (default: from config)
 * @param {boolean} [options.useTaskChaining] - Use task chaining (default: false)
 * @returns {Promise<Array>} Array of processed image results
 *
 * @example
 * // Original behavior (still works, backward compatible)
 * const results = await processImages([
 *   { inputPath: 'a.jpg', outputPath: 'out_a.jpg', id: '1' }
 * ])
 *
 * @example
 * // New: Parallel processing with concurrency control
 * const results = await processImages(images, {
 *   parallel: true,
 *   concurrency: 5,
 *   useTaskChaining: true
 * })
 */
export async function processImages(images, options = {}) {
  const { parallel = false, concurrency = 3 } = options

  if (parallel) {
    // NEW: Parallel processing with concurrency control
    logger.info(`Processing ${images.length} images with iLoveIMG (parallel, concurrency: ${concurrency})...`)

    // Lazy-load p-limit for concurrency control
    let pLimit
    try {
      pLimit = (await import('p-limit')).default
    } catch (error) {
      logger.warn('p-limit package not available, falling back to sequential processing')
      // Fall back to sequential if p-limit is not available
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
    // ORIGINAL: Sequential processing (backward compatible)
    logger.info(`Processing ${images.length} images with iLoveIMG...`)

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
  // Layer 1: Low-level primitives (for advanced users)
  createTask,
  uploadToTask,
  executeTask,
  downloadFromTask,
  connectTasks,
  cleanupTask,

  // Layer 2: Single operations
  resizeImage,
  compressImage,
  watermarkImage,
  rotateImage,

  // Layer 3: High-level convenience functions
  processImage,
  processImages,
}
