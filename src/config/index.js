import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..", "..");

export const config = {
  // Unsplash
  unsplash: {
    accessKey: process.env.UNSPLASH_ACCESS_KEY,
    secretKey: process.env.UNSPLASH_SECRET_KEY,
    baseUrl: "https://api.unsplash.com",
  },

  // Replicate
  replicate: {
    apiKey: process.env.REPLICATE_API_KEY,
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
    temp: join(ROOT_DIR, "temp"),
    // Storage directories (persistent)
    raw: join(ROOT_DIR, "temp", "raw"),
    toReplicate: join(ROOT_DIR, "temp", "to_replicate"),
    ready: join(ROOT_DIR, "temp", "ready"),
  },
};

/**
 * Validate that all required environment variables are set
 */
export function validateConfig() {
  const required = [
    ["UNSPLASH_ACCESS_KEY", config.unsplash.accessKey],
    ["REPLICATE_API_KEY", config.replicate.apiKey],
  ];

  const missing = required
    .filter(([name, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  - ${missing.join("\n  - ")}\n\nPlease check your .env file.`,
    );
  }

  return true;
}

export default config;
