import { db } from '../config/database.js';
import { mediaServers, aiProviders } from '../config/schema.js';
import { eq } from 'drizzle-orm';
import { migrateIfLegacy } from './crypto.js';
import { logger } from './logger.js';

/**
 * Re-encrypts any rows that still use the legacy hardcoded salt.
 * Safe to call on every startup — no-op once data is up to date.
 */
export function migrateLegacyEncryption() {
  let migrated = 0;

  try {
    const servers = db.select().from(mediaServers).all();
    for (const s of servers) {
      if (!s.apiKeyEncrypted) continue;
      const next = migrateIfLegacy(s.apiKeyEncrypted);
      if (next) {
        db.update(mediaServers).set({ apiKeyEncrypted: next }).where(eq(mediaServers.id, s.id)).run();
        migrated++;
      }
    }
  } catch (err) {
    logger.warn('Encryption migration (mediaServers) failed:', err);
  }

  try {
    const providers = db.select().from(aiProviders).all();
    for (const p of providers) {
      if (!p.apiKeyEncrypted) continue;
      const next = migrateIfLegacy(p.apiKeyEncrypted);
      if (next) {
        db.update(aiProviders).set({ apiKeyEncrypted: next }).where(eq(aiProviders.id, p.id)).run();
        migrated++;
      }
    }
  } catch (err) {
    logger.warn('Encryption migration (aiProviders) failed:', err);
  }

  if (migrated > 0) {
    logger.info(`🔐 Re-encrypted ${migrated} record(s) with per-deployment salt`);
  }
}
