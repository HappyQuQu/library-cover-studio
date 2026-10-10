import { db } from '../config/database.js';
import { taskLogs, taskLogCovers } from '../config/schema.js';
import { inArray, desc, sql } from 'drizzle-orm';
import { readRuntimeSettings } from './runtimeSettings.service.js';
import { removeHistoryImages } from './taskHistory.service.js';

export async function pruneTaskHistory(now = Date.now()) {
  const settings = readRuntimeSettings();
  const maxRuns = Math.max(1, Math.min(500, Number(settings['history.maxRuns']) || 50));
  const maxDays = Math.max(1, Math.min(365, Number(settings['history.maxDays']) || 30));
  const counts = new Map<string, number>();
  // Running records and their snapshots are never candidates, including during a concurrent cleanup.
  const expired = db.select().from(taskLogs).orderBy(desc(sql`julianday(${taskLogs.startedAt})`), desc(taskLogs.id)).all().filter(log => {
    if (log.status === 'running') return false;
    const count = (counts.get(log.taskId) || 0) + 1;
    counts.set(log.taskId, count);
    return count > maxRuns || Date.parse(log.completedAt || log.startedAt || '') < now - maxDays * 86400000;
  });
  let removed = 0;
  // Bounded batches keep SQLite's parameter count below its limit.
  for (let start = 0; start < expired.length; start += 100) {
    const ids = expired.slice(start, start + 100).map(log => log.id);
    const covers = db.select().from(taskLogCovers).where(inArray(taskLogCovers.logId, ids)).all();
    db.delete(taskLogs).where(inArray(taskLogs.id, ids)).run();
    await removeHistoryImages(covers.flatMap(cover => [cover.imageName, cover.thumbnailName]));
    removed += ids.length;
  }
  return removed;
}
