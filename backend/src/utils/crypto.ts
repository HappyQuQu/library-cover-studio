import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, ensureDataDirs } from '../config/paths.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_FILE = path.join(DATA_DIR, '.encryption-salt');
const LEGACY_SALT = 'salt';

const keyCache = new Map<string, Buffer>();

function loadOrCreateSalt(): string {
  if (process.env.ENCRYPTION_SALT) {
    return process.env.ENCRYPTION_SALT;
  }
  ensureDataDirs();
  if (fs.existsSync(SALT_FILE)) {
    const s = fs.readFileSync(SALT_FILE, 'utf8').trim();
    if (s) return s;
  }
  const fresh = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SALT_FILE, fresh, { mode: 0o600 });
  return fresh;
}

let currentSalt: string | null = null;
function getCurrentSalt(): string {
  if (currentSalt === null) currentSalt = loadOrCreateSalt();
  return currentSalt;
}

function deriveKey(salt: string): Buffer {
  const cached = keyCache.get(salt);
  if (cached) return cached;
  const masterKey = process.env.ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  const derived = crypto.scryptSync(masterKey, salt, 32);
  keyCache.set(salt, derived);
  return derived;
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(getCurrentSalt()), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

function decryptWith(encryptedText: string, salt: string): string {
  const [ivHex, tagHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(salt), iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function decrypt(encryptedText: string): string {
  const salt = getCurrentSalt();
  try {
    return decryptWith(encryptedText, salt);
  } catch (err) {
    if (salt !== LEGACY_SALT) {
      // Fallback for data encrypted before per-deployment salt was introduced
      return decryptWith(encryptedText, LEGACY_SALT);
    }
    throw err;
  }
}

/**
 * Re-encrypts data that was encrypted with the legacy hardcoded salt.
 * Returns null if the input was already encrypted with the current salt
 * (no migration needed), or the new ciphertext if migrated.
 */
export function migrateIfLegacy(encryptedText: string): string | null {
  const salt = getCurrentSalt();
  if (salt === LEGACY_SALT) return null;
  try {
    decryptWith(encryptedText, salt);
    return null;
  } catch {
    const plain = decryptWith(encryptedText, LEGACY_SALT);
    return encrypt(plain);
  }
}
