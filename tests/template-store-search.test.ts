import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStoreSearch, storeSearchScore } from '../backend/src/services/templateStoreSearch.service.ts';
import { readStoreFilters, coverRatio } from '../web/src/lib/templateStore.ts';

test('store search combines classification aliases and keywords without changing source names', () => {
  const entry = { name: '三幕长廊', description: '深蓝展览设计', author: { name: 'Creator' }, width: 1200, height: 1800,
    classification: { recommendedUses: ['collection'] as 'collection'[], artworkType: 'backdrop' as const, artworkCount: 3, tags: ['电影', '光影'] } };
  assert.ok(storeSearchScore(entry, ['合集', '横图', '竖版'])! > 0);
  assert.ok(storeSearchScore(entry, ['collection', 'backdrop', 'portrait'])! > 0);
  assert.equal(storeSearchScore(entry, ['媒体库']), null);
  assert.equal(storeSearchScore(entry, ['横版']), null);
  assert.ok(storeSearchScore(entry, ['三幕'])! > storeSearchScore(entry, ['电影'])!);
  assert.equal(normalizeStoreSearch('  ＣＲＥＡＴＯＲ  '), 'creator');
  assert.equal(entry.name, '三幕长廊');
});

test('store URLs restore independent filters and validate pagination and legacy page-size preferences', () => {
  const url = new URLSearchParams('q=合集 横图&orientation=portrait&artwork=backdrop&use=collection&status=updates&page=3&pageSize=12');
  const restored = readStoreFilters(new URLSearchParams(url.toString()), 48);
  assert.deepEqual(restored, { q: '合集 横图', orientation: 'portrait', artwork: 'backdrop', use: 'collection', status: 'updates', sort: 'relevance', page: 3, pageSize: 12 });
  assert.equal(readStoreFilters(new URLSearchParams(), 48).pageSize, 48);
  assert.equal(readStoreFilters(new URLSearchParams('page=Infinity&pageSize=999&orientation=bad&artwork=bad&use=bad&status=bad'), 0).pageSize, 24);
  assert.equal(readStoreFilters(new URLSearchParams('page=-2')).page, 1);
  assert.equal(readStoreFilters(new URLSearchParams('sort=relevance')).sort, 'popular');
  for (const sort of ['newest', 'oldest']) {
    assert.equal(readStoreFilters(new URLSearchParams(`sort=${sort}&page=2`)).sort, sort);
    assert.equal(readStoreFilters(new URLSearchParams(`q=票根&sort=${sort}`)).sort, sort);
  }
  assert.equal(coverRatio(1920, 1080), '16:9');
  assert.equal(coverRatio(1200, 1800), '2:3');
});
