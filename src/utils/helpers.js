import { mkdir, rm, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';

/**
 * Generate a unique ID for image pairs
 * Format: timestamp_shortUuid (e.g., "20240215_a1b2c3")
 */
export function generateBatchId() {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const shortUuid = uuidv4().slice(0, 6);
  return `${timestamp}_${shortUuid}`;
}

/**
 * Generate sequential IDs for a batch
 * @param {number} count - Number of IDs to generate
 * @param {string} batchId - Batch identifier
 * @returns {string[]} Array of IDs like ["20240215_a1b2c3_001", "20240215_a1b2c3_002", ...]
 */
export function generateSequentialIds(count, batchId = generateBatchId()) {
  return Array.from({ length: count }, (_, i) => 
    `${batchId}_${String(i + 1).padStart(3, '0')}`
  );
}

/**
 * Ensure temp directory exists and is clean
 */
export async function ensureTempDir() {
  const tempDir = config.paths.temp;
  
  if (existsSync(tempDir)) {
    await rm(tempDir, { recursive: true });
  }
  
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Create a subdirectory in temp
 */
export async function createTempSubdir(name) {
  const dir = join(config.paths.temp, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Clean up temp directory
 */
export async function cleanupTemp() {
  const tempDir = config.paths.temp;
  
  if (existsSync(tempDir)) {
    await rm(tempDir, { recursive: true });
  }
}

/**
 * Sleep for a specified duration (useful for rate limiting)
 * @param {number} ms - Milliseconds to sleep
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in ms (doubles each retry)
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`  ⚠️  Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Logger with timestamp
 */
export const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] ℹ️  ${msg}`),
  success: (msg) => console.log(`[${new Date().toISOString()}] ✅ ${msg}`),
  warn: (msg) => console.log(`[${new Date().toISOString()}] ⚠️  ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] ❌ ${msg}`),
  step: (step, msg) => console.log(`[${new Date().toISOString()}] [Step ${step}] ${msg}`),
};
