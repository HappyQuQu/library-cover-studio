import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { requiredPosterCount } from '../backend/src/services/libraryCover.service.ts';
import { renderLibraryCover } from '../backend/src/services/renderer.service.ts';
import { parseStoreCatalog, STORE_REPOSITORY } from '../backend/src/services/templateStore.service.ts';

const sharp = createRequire(new URL('../backend/package.json', import.meta.url))('sharp');

test('cover generation loads the tenth through twenty-fourth ordered artwork slots', async () => {
  const width = 240;
  const tileSize = 10;
  const canvas = JSON.stringify({ width, height: tileSize, objects: Array.from({ length: 24 }, (_, index) => ({
    type: 'image', src: `/api/templates/posters/${index + 1}.jpg`,
    width: tileSize, height: tileSize, left: index * tileSize, top: 0
  })) });
  const count = requiredPosterCount(canvas);
  assert.equal(count, 24);
  const posters = await Promise.all(Array.from({ length: count }, (_, index) => sharp({ create: {
    width: tileSize, height: tileSize, channels: 3, background: { r: 10 + index * 9, g: 30, b: 80 }
  } }).png().toBuffer()));
  const render = await renderLibraryCover(canvas, { title: 'Fixture' }, posters, { width, height: tileSize });
  const pixels = await sharp(render).removeAlpha().raw().toBuffer();
  for (let index = 0; index < 24; index++) {
    const center = (5 * width + index * tileSize + 5) * 3;
    assert.deepEqual([...pixels.subarray(center, center + 3)], [10 + index * 9, 30, 80], `slot ${index + 1}`);
  }
});

test('the store reads extended artwork counts and existing classification records', () => {
  const repository = STORE_REPOSITORY;
  const entry = {
    id: 'a'.repeat(64), revision: 'b'.repeat(64), packageSha256: 'c'.repeat(64),
    name: 'Fixture', downloadCount: 0, folder: 'fixture', width: 600, height: 600,
    previewUrl: `https://raw.githubusercontent.com/${repository}/main/fixture/preview.jpg`,
    packageUrl: `https://github.com/${repository}/releases/download/store-00001/fixture.zip`
  };
  const classification = { recommendedUses: ['collection'], artworkType: 'poster', artworkCount: 9, tags: [] };
  const catalog = parseStoreCatalog({
    version: 1, repository, generatedAt: '2026-11-17T00:00:00Z',
    templates: [
      { ...entry, classification },
      { ...entry, id: 'd'.repeat(64), classification: { ...classification, extendedArtworkCount: 24 } }
    ]
  });
  assert.deepEqual(catalog.templates.map(template => template.classification?.artworkCount), [9, 24]);
});
