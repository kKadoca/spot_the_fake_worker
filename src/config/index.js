import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT_DIR = join(__dirname, '..', '..')

export const config = {
  // Unsplash
  unsplash: {
    accessKey: process.env.UNSPLASH_ACCESS_KEY,
    secretKey: process.env.UNSPLASH_SECRET_KEY,
    baseUrl: 'https://api.unsplash.com',
  },

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  // iLoveIMG
  iloveimg: {
    publicKey: process.env.ILOVEIMG_PUBLIC_KEY,
    secretKey: process.env.ILOVEIMG_SECRET_KEY,

    // Default options for image processing
    defaults: {
      region: process.env.ILOVEIMG_REGION || 'eu', // Server region: eu, us, fr, de, pl
      autoCleanup: true, // Auto-delete tasks after completion
      compressionLevel: 'recommended', // Compression level: low, recommended, extreme
      maintainRatio: false, // Maintain aspect ratio when resizing
      resizeMode: 'pixels', // Resize mode: pixels or percentage
    },

    // Advanced options
    advanced: {
      webhookUrl: process.env.ILOVEIMG_WEBHOOK_URL, // Optional webhook for async processing
      fileEncryptionKey: process.env.ILOVEIMG_ENCRYPTION_KEY, // Optional file encryption
      taskTimeout: 300000, // Task timeout in ms (5 minutes)
    },
  },

  // Workflow settings
  workflow: {
    batchSize: parseInt(process.env.BATCH_SIZE, 10) || 5,
    resize: {
      width: parseInt(process.env.RESIZE_WIDTH, 10) || 1920,
      height: parseInt(process.env.RESIZE_HEIGHT, 10) || 1080,
    },
    compressionQuality: parseInt(process.env.COMPRESSION_QUALITY, 10) || 85,
  },

  // Paths
  paths: {
    root: ROOT_DIR,
    temp: join(ROOT_DIR, 'temp'),
    credentials: join(ROOT_DIR, 'credentials'),
  },
}

/**
 * Validate that all required environment variables are set
 */
export function validateConfig() {
  const required = [
    ['UNSPLASH_ACCESS_KEY', config.unsplash.accessKey],
    ['OPENAI_API_KEY', config.openai.apiKey],
    ['ILOVEIMG_PUBLIC_KEY', config.iloveimg.publicKey],
    ['ILOVEIMG_SECRET_KEY', config.iloveimg.secretKey],
  ]

  const missing = required.filter(([name, value]) => !value).map(([name]) => name)

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables:\n  - ${missing.join('\n  - ')}\n\nPlease check your .env file.`)
  }

  return true
}

export default config
