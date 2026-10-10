import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { applyRandomBackground } from '../backend/src/services/templateBackground.service.ts';
import { renderLibraryCover, renderTemplate } from '../backend/src/services/renderer.service.ts';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const sharp = require('sharp');
const dimensions = { width: 80, height: 40 };
const objects = [{ id: 'poster-1', type: 'rect', left: 30, top: 10, width: 20, height: 20, fill: '#00ff00', angle: 0 },
  { id: 'accent', type: 'rect', left: 5, top: 32, width: 2, height: 5, fill: '#ff0000' }];

for (const style of ['soft-mesh', 'muted-wall']) {
  test(`${style} changes palette while preserving layout and the saved template`, () => {
    const template = { ...dimensions, background: '#112233', backgroundColor: '#112233', randomOnGeneration: true, randomBackgroundStyle: style,
      backgroundImage: { type: 'Image', name: '背景', left: 0, top: 0, opacity: 1 }, objects };
    const snapshot = structuredClone(template);
    const a = applyRandomBackground(template, () => .1), b = applyRandomBackground(template, () => .8);
    assert.deepEqual(template, snapshot);
    assert.notDeepEqual(a.background, b.background);
    assert.deepEqual(a.backgroundColor, a.background);
    assert.deepEqual(a.objects[0], objects[0]);
    assert.deepEqual({ ...a.objects[1], fill: objects[1].fill }, objects[1]);
    assert.equal(a.randomBackgroundStyle, style);
    if (style === 'soft-mesh') {
      assert.ok(a.backgroundImage);
      const svg = Buffer.from(a.backgroundImage.src.split(',')[1], 'base64').toString();
      assert.match(svg, /radialGradient/); assert.match(svg, /stop-opacity=".92"/);
      assert.equal(a.backgroundImage.opacity, 1);
      assert.notEqual(a.backgroundImage.src, b.backgroundImage.src);
    } else {
      assert.equal(a.backgroundImage, undefined);
      assert.equal(a.background.type, 'linear');
      assert.deepEqual(a.background.coords, { x1: 0, y1: 0, x2: 1, y2: 0 });
      assert.notEqual(a.objects[1].fill, b.objects[1].fill);
    }
  });

  test(`${style} generates fresh visible backgrounds in both rendering paths beneath unchanged foregrounds`, async () => {
    const json = JSON.stringify({ ...dimensions, background: '#000000', randomOnGeneration: true, randomBackgroundStyle: style, objects });
    for (const kind of ['library', 'single']) {
      const render = () => kind === 'library' ? renderLibraryCover(json, { title: 'Test' }, [], dimensions)
        : renderTemplate(json, { title: 'Test' }, undefined, dimensions);
      const a = await render(), b = await render();
      assert.notDeepEqual(a, b);
      for (const image of [a, b]) {
        const pixels = await sharp(image).ensureAlpha().raw().toBuffer();
        const center = (20 * 80 + 40) * 4;
        assert.deepEqual([...pixels.subarray(center, center + 4)], [0, 255, 0, 255]);
        assert.equal(pixels[3], 255);
        assert.ok(pixels[0] + pixels[1] + pixels[2] > 100, 'background remains visible');
        const right = (5 * 80 + 75) * 4;
        assert.notDeepEqual([...pixels.subarray(0, 3)], [...pixels.subarray(right, right + 3)], 'style retains its gradient');
      }
    }
  });
}

test('randomization off preserves the chosen background; legacy templates keep generic random gradients', () => {
  const template = { ...dimensions, background: '#123456', backgroundImage: { src: 'existing' }, objects, randomOnGeneration: false };
  assert.equal(applyRandomBackground(template), template);
  const legacy = applyRandomBackground({ ...template, randomOnGeneration: true }, () => .5);
  assert.equal(legacy.backgroundImage, undefined);
  assert.equal(legacy.background.gradientUnits, 'percentage');
  assert.equal(legacy.background.colorStops.length, 2);
});

test('styled backgrounds use the requested dimensions when Fabric saves omit canvas dimensions', async () => {
  const json = JSON.stringify({ randomOnGeneration: true, randomBackgroundStyle: 'soft-mesh', objects: [] });
  const image = await renderLibraryCover(json, { title: 'Test' }, [], dimensions);
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.width, 80); assert.equal(metadata.height, 40);
  const pixels = await sharp(image).raw().toBuffer();
  assert.notDeepEqual([...pixels.subarray(0, 3)], [...pixels.subarray((5 * 80 + 75) * 4, (5 * 80 + 75) * 4 + 3)]);
});

test('cinematic palettes preserve layered foregrounds and generate a dark soft background without changing the saved design', () => {
  const template = { width: 1920, height: 1080, randomOnGeneration: true, randomBackgroundStyle: 'cinema-mesh',
    background: '#593468', objects: [{ type: 'Image', posterVar: 'post1', opacity: .2, left: 100 }] };
  const original = structuredClone(template);
  const a = applyRandomBackground(template, () => .1), b = applyRandomBackground(template, () => .7);
  assert.deepEqual(template, original);
  assert.deepEqual(a.objects, template.objects);
  assert.notDeepEqual(a.background, b.background);
  assert.notEqual((a as any).backgroundImage.src, (b as any).backgroundImage.src);
  const svg = Buffer.from((a as any).backgroundImage.src.split(',')[1], 'base64').toString();
  assert.match(svg, /feGaussianBlur/); assert.match(svg, /width="1920"/);
});
