import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('seamless wall fills the right two-thirds without gaps or leaking into the large-title column', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url)), sharp = require('sharp');
  const directory = mkdtempSync(join(tmpdir(), 'lcs-wall-layout-')), original = process.cwd();
  let buildDefaultTemplates: any, database: any, renderLibraryCover: any;
  process.chdir(directory);
  try {
    ({ buildDefaultTemplates } = await import('../backend/src/services/defaultTemplates.service.ts'));
    ({ renderLibraryCover } = await import('../backend/src/services/renderer.service.ts'));
    database = await import('../backend/src/config/database.ts');
  } finally { process.chdir(original); }
  t.after(() => { database.db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const definitions = await buildDefaultTemplates();
  const reference = definitions.find((template: any) => template.name === '倾斜圆角海报墙')!;
  const cards = reference.canvas.objects.filter((object: any) => object.posterVar);
  assert.equal(cards.length, 9);
  assert.equal(new Set(cards.map((object: any) => object.id)).size, 9);
  assert.equal(new Set(cards.map((object: any) => object.posterVar)).size, 9);
  assert.ok(cards.every((object: any) => object.angle === 15 && object.clipPath.rx > 0 && !object.clipPath.absolutePositioned && object.shadow));
  assert.ok(cards.every((object: any) => Math.abs(object.width * object.scaleX - 420) < 1 && Math.abs(object.height * object.scaleY - 630) < 1));
  assert.equal(reference.canvas.randomOnGeneration, true);
  assert.equal(reference.canvas.randomBackgroundStyle, 'muted-wall');
  const wall = definitions.find((template: any) => template.name === '直列海报墙')!;
  const posters = wall.canvas.objects.filter((object: any) => object.posterVar) as any[];
  assert.equal(posters.length, 12);
  assert.equal(new Set(posters.map(poster => poster.posterVar)).size, 9, 'edge tiles reuse available artwork');
  for (const poster of posters) {
    assert.equal(poster.angle, 0);
    assert.equal(poster.clipPath.absolutePositioned, true);
    assert.equal(poster.clipPath.left, 640); assert.equal(poster.clipPath.width, 1280);
    assert.equal(poster.clipPath.rx, 0); assert.equal(poster.shadow, undefined);
  }
  const title = wall.canvas.objects.find((object: any) => object.id === 'primary-title');
  const subtitle = wall.canvas.objects.find((object: any) => object.id === 'secondary-title');
  assert.equal(title.fontSize, 200); assert.equal(subtitle.fontSize, 80);
  assert.ok(title.left + title.width <= 608); assert.ok(subtitle.left + subtitle.width <= 608);
  assert.equal(title.fitText, true); assert.equal(subtitle.fitText, true);
  assert.equal(wall.canvas.randomOnGeneration, true); assert.equal(wall.canvas.randomBackgroundStyle, 'muted-wall');

  // Contrasting solid artwork exposes any uncovered pixels, including rotated seams and frame edges.
  const green = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#00ff00' } }).png().toBuffer();
  const image = await renderLibraryCover(JSON.stringify({ ...wall.canvas, background: '#ff00ff', randomOnGeneration: false, objects: posters }),
    { title: 'Test' }, Array(9).fill(green), { width: 1920, height: 1080 });
  const pixels = await sharp(image).removeAlpha().raw().toBuffer();
  let gaps = 0, leakage = 0;
  for (let y = 0; y < 1080; y++) for (let x = 0; x < 1920; x++) {
    const offset = (y * 1920 + x) * 3, [r, g, b] = pixels.subarray(offset, offset + 3);
    if (x >= 640 && (r > 5 || g < 250 || b > 5)) gaps++;
    if (x < 640 && (r < 250 || g > 5 || b < 250)) leakage++;
  }
  assert.equal(gaps, 0, 'right two-thirds stays filled through every seam and edge');
  assert.equal(leakage, 0, 'poster wall never covers the left title column');
});
