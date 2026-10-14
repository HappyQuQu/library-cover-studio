import { githubGet, githubNetworkRevision } from './githubNetwork.service.js';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { systemSettings } from '../config/schema.js';
import { STORE_REPOSITORY, type StoreEntry } from './templateStore.service.js';

const CACHE_MS = 120000;
const releases = new Map<number, { at: number; counts: Map<string, number> }>();
const loading = new Map<number, Promise<Map<string, number>>>();
const failures = new Map<number, number>();
const lastCounts = new Map<string, number>();
const prefix = 'templates.store.download-floor.';
let networkRevision = githubNetworkRevision();
function floor(id: string) {
  return Number(db.select().from(systemSettings).where(eq(systemSettings.key, prefix + id)).get()?.value) || 0;
}

async function releaseCounts(id: number) {
  if (Date.now() - (failures.get(id) || 0) < CACHE_MS) throw new Error('GitHub counts temporarily unavailable');
  const cached = releases.get(id);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.counts;
  if (!loading.has(id)) {
    const requestRevision = networkRevision;
    const request = (async () => {
    const counts = new Map<string, number>();
    for (let page = 1; ; page++) {
      const { data } = await githubGet(`https://api.github.com/repos/${STORE_REPOSITORY}/releases/${id}/assets`, {
        params: { per_page: 100, page }, timeout: 8000, maxContentLength: 4 * 1024 * 1024,
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
      });
      if (!Array.isArray(data)) throw new Error('Invalid release assets');
      for (const asset of data) {
        const match = typeof asset.name === 'string' && asset.name.match(/^([a-f0-9]{64})--[a-f0-9]{64}\.zip$/);
        if (match && asset.state === 'uploaded' && Number.isSafeInteger(asset.download_count) && asset.download_count >= 0)
          counts.set(match[1], (counts.get(match[1]) || 0) + asset.download_count);
      }
      if (data.length < 100) break;
      if (page >= 20) throw new Error('Release asset limit exceeded');
    }
    if (requestRevision === githubNetworkRevision()) releases.set(id, { at: Date.now(), counts });
    return counts;
    })().finally(() => { if (loading.get(id) === request) loading.delete(id); });
    loading.set(id, request);
  }
  return loading.get(id)!;
}

/** Batch public API reads by release; outages/rate limits fall back to the hourly catalog. */
export async function storeDownloadCounts(entries: StoreEntry[]) {
  if (networkRevision !== githubNetworkRevision()) {
    networkRevision = githubNetworkRevision(); releases.clear(); loading.clear(); failures.clear();
  }
  const ids = [...new Set(entries.flatMap(entry => entry.downloadSources?.map(source => source.releaseId) || []))];
  const observed = new Map<number, Map<string, number>>();
  const requestRevision = networkRevision;
  await Promise.all(ids.map(async id => { try { observed.set(id, await releaseCounts(id)); } catch {
    // Briefly cache failures too, so an outage cannot create a request storm.
    if (requestRevision === githubNetworkRevision()) failures.set(id, Date.now());
  } }));
  return new Map(entries.map(entry => {
    const sources = entry.downloadSources || [];
    const live = sources.length > 0 && sources.every(source => observed.has(source.releaseId));
    const official = Math.max(lastCounts.get(entry.id) || 0, entry.downloadCount, entry.downloadCount + sources.reduce((delta, source) =>
      delta + (observed.has(source.releaseId) ? (observed.get(source.releaseId)!.get(entry.id) || 0) - source.downloadCount : 0), 0));
    lastCounts.set(entry.id, Math.max(lastCounts.get(entry.id) || 0, official));
    const pending = floor(entry.id);
    return [entry.id, { downloadCount: Math.max(official, pending), countPending: pending > official, countLive: live }] as const;
  }));
}

/** A verified successful ZIP fetch is a lower bound, not a second counter added to GitHub. */
export function storeDownloadBaseline(entry: StoreEntry) {
  return Math.max(floor(entry.id), lastCounts.get(entry.id) || 0, entry.downloadCount);
}
export function recordStoreDownload(entry: StoreEntry, baseline = storeDownloadBaseline(entry)) {
  const value = Math.max(floor(entry.id), baseline) + 1;
  db.insert(systemSettings).values({ key: prefix + entry.id, value: String(value), updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: String(value), updatedAt: new Date().toISOString() } }).run();
  for (const source of entry.downloadSources || []) releases.delete(source.releaseId);
}
