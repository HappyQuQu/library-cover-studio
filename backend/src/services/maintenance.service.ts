import fs from 'node:fs/promises';
import path from 'node:path';
import { TEMP_DIR, TASK_HISTORY_DIR } from '../config/paths.js';
import { db } from '../config/database.js';
import { taskLogCovers } from '../config/schema.js';
import { historyImagePath } from './taskHistory.service.js';

/** A 24-hour grace period protects files being written before their DB reference is committed. */
export async function cacheCandidates(now = Date.now()) {
  const referenced = new Set(db.select().from(taskLogCovers).all().flatMap(c => [c.imageName, c.thumbnailName]));
  const files: { path: string; bytes: number }[] = [];
  for (const dir of [TEMP_DIR, path.join(TEMP_DIR, 'imports'), TASK_HISTORY_DIR]) {
    const directoryStat = await fs.lstat(dir).catch(() => undefined);
    if (!directoryStat?.isDirectory() || directoryStat.isSymbolicLink()) continue;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile() || (dir === TASK_HISTORY_DIR && (!historyImagePath(entry.name) || referenced.has(entry.name)))) continue;
      const file = path.join(dir, entry.name), stat = await fs.lstat(file);
      if (stat.isFile() && stat.mtimeMs < now - 86400000) files.push({ path: file, bytes: stat.size });
    }
  }
  return files;
}

export async function cleanCache() {
  const candidates = await cacheCandidates();
  let files = 0, bytes = 0;
  for (const candidate of candidates) {
    // Recheck references after every asynchronous step; recently referenced history stays intact.
    const name = path.basename(candidate.path);
    if (path.dirname(candidate.path) === TASK_HISTORY_DIR && db.select().from(taskLogCovers).all().some(c => c.imageName === name || c.thumbnailName === name)) continue;
    await fs.rm(candidate.path, { force: true }); files++; bytes += candidate.bytes;
  }
  return { files, bytes };
}
