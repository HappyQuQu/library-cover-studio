import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('live store counts include every revision and page, fall back on rate limits, and reconcile confirmed downloads without double counting', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'lcs-counts-'));
  process.env.LCS_DATA_DIR = directory;
  const database = await import('../backend/src/config/database.ts');
  await database.initDatabase();
  t.after(() => { database.db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const axios = (await import(require.resolve('axios/package.json').replace(/package\.json$/, 'index.js'))).default;
  const original = axios.defaults.adapter;
  t.after(() => { axios.defaults.adapter = original; });
  let reads = 0, count = 12, fail = false, clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  const id = 'a'.repeat(64);
  const filler = Array.from({ length: 99 }, (_, index) => ({ name: `${'b'.repeat(64)}--${index.toString(16).padStart(64, '0')}.zip`, download_count: 1, state: 'uploaded' }));
  axios.defaults.adapter = async (config: any) => {
    assert.equal(config.headers?.Authorization, undefined);
    assert.match(config.url, /\/releases\/42\/assets$/);
    reads++;
    if (fail) throw new Error('Rate limit');
    return { config, status: 200, headers: {}, statusText: 'OK', data: config.params.page === 1
      ? [{ name: `${id}--${'c'.repeat(64)}.zip`, download_count: count, state: 'uploaded' }, ...filler]
      : [{ name: `${id}--${'d'.repeat(64)}.zip`, download_count: 1, state: 'uploaded' }] };
  };
  const entry = { id, downloadCount: 10, downloadSources: [{ releaseId: 42, downloadCount: 10 }] } as any;
  const { storeDownloadCounts, recordStoreDownload } = await import('../backend/src/services/templateStoreCounts.service.ts');
  let result = (await storeDownloadCounts([entry])).get(id)!;
  assert.equal(result.downloadCount, 13); assert.equal(result.countLive, true); assert.equal(reads, 2);
  await storeDownloadCounts([entry]); assert.equal(reads, 2);
  recordStoreDownload(entry);
  result = (await storeDownloadCounts([entry])).get(id)!;
  assert.equal(result.downloadCount, 14); assert.equal(result.countPending, true);
  count = 13; clock += 121000;
  result = (await storeDownloadCounts([entry])).get(id)!;
  assert.equal(result.downloadCount, 14); assert.equal(result.countPending, false);
  count = 16; clock += 121000;
  assert.equal((await storeDownloadCounts([entry])).get(id)!.downloadCount, 17);
  fail = true; clock += 121000;
  result = (await storeDownloadCounts([entry])).get(id)!;
  assert.equal(result.countLive, false); assert.equal(result.downloadCount, 17);
  const failedReads = reads;
  await storeDownloadCounts([entry]); assert.equal(reads, failedReads, 'Rate-limited API is not repeatedly retried');
  fail = false; clock += 121000;
  assert.equal((await storeDownloadCounts([entry])).get(id)!.downloadCount, 17);
});
