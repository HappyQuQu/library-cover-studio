import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderTemplate, renderLibraryCover } from '../backend/src/services/renderer.service.ts';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const sharp = require('sharp');
const dimensions = { width: 80, height: 40 };
const metadata = { title: 'Test library' };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><defs><linearGradient id="bg"><stop stop-color="#2040e0"/><stop offset="1" stop-color="#e02080"/></linearGradient></defs><rect width="80" height="40" fill="url(#bg)"/></svg>';
async function pixel(image: Buffer, x: number, y: number): Promise<number[]> {
  const { data } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * dimensions.width + x) * 4;
  return [...data.subarray(offset, offset + 4)];
}

for (const kind of ['single', 'library'] as const) test(`${kind} cover retains URI/base64 SVG background beneath foreground layers`, async () => {
  for (const src of ['data:image/svg+xml,' + encodeURIComponent(svg), 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')]) {
    const template = JSON.stringify({ ...dimensions, backgroundImage: { type: 'Image', src, ...dimensions, left: 0, top: 0 },
      objects: [{ type: 'rect', left: 30, top: 10, width: 20, height: 20, fill: '#00ff00' }] });
    const image = kind === 'single' ? await renderTemplate(template, metadata, undefined, dimensions)
      : await renderLibraryCover(template, metadata, [], dimensions);
    const left = await pixel(image, 5, 5), right = await pixel(image, 75, 5);
    assert.ok(left[2] > left[0] + 100, 'left edge keeps the blue gradient');
    assert.ok(right[0] > right[2] + 50, 'right edge keeps the pink gradient');
    assert.deepEqual(await pixel(image, 40, 20), [0, 255, 0, 255], 'foreground is rendered above the background');
  }
});

test('saved JPEG/PNG mesh backgrounds preserve scale and opacity over the canvas fill', async () => {
  for (const format of ['png', 'jpeg']) {
    const raster = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ff0000' } })[format]().toBuffer();
    const image = await renderLibraryCover(JSON.stringify({ ...dimensions, background: '#0000ff', objects: [],
      backgroundImage: { type: 'Image', src: `data:image/${format};base64,${raster.toString('base64')}`, width: 20, height: 10, scaleX: 4, scaleY: 4, opacity: 0.5 } }), metadata, [], dimensions);
    for (const [x, y] of [[0, 0], [79, 39]]) {
      const color = await pixel(image, x, y);
      assert.ok(color[0] >= 125 && color[0] <= 130);
      assert.ok(color[2] >= 125 && color[2] <= 130);
      assert.equal(color[3], 255);
    }
  }
});

test('backgrounds honor visibility and are clipped to the canvas instead of failing on larger images', async () => {
  const raster = await sharp({ create: { width: 100, height: 60, channels: 3, background: '#00ff00' } }).png().toBuffer();
  const backgroundImage = { type: 'Image', src: `data:image/png;base64,${raster.toString('base64')}`, width: 100, height: 60, left: -10, top: -10 };
  const template = { ...dimensions, background: '#ff0000', objects: [], backgroundImage };
  const image = await renderLibraryCover(JSON.stringify(template), metadata, [], dimensions);
  assert.deepEqual(await pixel(image, 79, 39), [0, 255, 0, 255]);
  for (const updates of [{ visible: false }, { opacity: 0 }]) {
    const hidden = await renderLibraryCover(JSON.stringify({ ...template, backgroundImage: { ...backgroundImage, ...updates } }), metadata, [], dimensions);
    assert.deepEqual(await pixel(hidden, 40, 20), [255, 0, 0, 255]);
  }
});

test('linear and radial Fabric background colors retain their distinct coordinates', async () => {
  const stops = [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }];
  const linear = await renderLibraryCover(JSON.stringify({ ...dimensions, objects: [], background: {
    type: 'linear', gradientUnits: 'percentage', coords: { x1: 0, y1: 0, x2: 1, y2: 0 }, colorStops: stops
  } }), metadata, [], dimensions);
  assert.ok((await pixel(linear, 0, 20))[0] > 240);
  assert.ok((await pixel(linear, 79, 20))[2] > 240);
  const radial = await renderLibraryCover(JSON.stringify({ ...dimensions, objects: [], background: {
    type: 'radial', gradientUnits: 'pixels', coords: { x1: 40, y1: 20, x2: 40, y2: 20, r1: 0, r2: 20 }, colorStops: stops
  } }), metadata, [], dimensions);
  assert.ok((await pixel(radial, 40, 20))[0] > 240, 'radial center is red');
  assert.ok((await pixel(radial, 0, 20))[2] > 240, 'outside the radius is blue');
});

test('invalid required background assets fail explicitly instead of silently producing a black cover', async () => {
  await assert.rejects(renderLibraryCover(JSON.stringify({ ...dimensions, objects: [], backgroundImage: {
    type: 'Image', ...dimensions, src: 'data:image/svg+xml,%3Csvg-broken'
  } }), metadata, [], dimensions), /背景图片无法渲染/);
});

test('rotated poster cards extending beyond the canvas are cropped without losing foreground or background', async () => {
  const poster = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const template = { ...dimensions, background: '#0000ff', objects: [{ type: 'Image', posterVar: 'post1', width: 40, height: 60,
    originX: 'center', originY: 'center', left: 65, top: 25, angle: 17 }] };
  const image = await renderLibraryCover(JSON.stringify(template), metadata, [poster], dimensions);
  assert.deepEqual(await pixel(image, 0, 20), [0, 0, 255, 255]);
  assert.deepEqual(await pixel(image, 65, 25), [255, 0, 0, 255]);
  assert.deepEqual(await pixel(image, 79, 39), [255, 0, 0, 255]);
});

test('center/right aligned variable titles retain their text box alignment after transparent trimming', async () => {
  const size = { width: 300, height: 100 };
  for (const alignment of ['center', 'right']) {
    const image = await renderLibraryCover(JSON.stringify({ ...size, background: '#000000', objects: [{ type: 'Textbox',
      text: 'Sample', textVar: '{{primary_title}}', left: 20, top: 20, width: 240, height: 40, fontSize: 32, fontFamily: 'sans-serif', fill: '#ffffff', textAlign: alignment, charSpacing: 120 }] }),
      { title: 'Library', primaryTitle: 'ABCD' }, [], size);
    const { data } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let min = size.width, max = 0;
    for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) if (data[(y * size.width + x) * 3] > 180) { min = Math.min(min, x); max = Math.max(max, x); }
    if (alignment === 'center') assert.ok(Math.abs((min + max) / 2 - 140) < 3);
    else assert.ok(Math.abs(max - 259) < 3);
  }
});

test('large fitted variable titles remain inside their column for short and long library names', async () => {
  const size = { width: 900, height: 350 };
  for (const [value, fontSize, boxWidth, spacing] of [['动漫', 200, 544, 0], ['华语电影精选', 200, 544, 0], ['ANIMATION SERIES COLLECTION', 80, 494, 100]] as const) {
    const image = await renderLibraryCover(JSON.stringify({ ...size, background: '#000000', objects: [
      { type: 'Rect', left: 640, top: 0, width: 260, height: 350, fill: '#00ff00' },
      { type: 'Textbox', text: 'Sample', textVar: '{{primary_title}}', left: 64, top: 70, width: boxWidth, height: 240,
        fontSize, fitText: true, fontFamily: 'sans-serif', fontWeight: 'bold', fill: '#ffffff', charSpacing: spacing }
    ] }), { title: value, primaryTitle: value }, [], size);
    const { data } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let minX = size.width, maxX = 0, minY = size.height, maxY = 0;
    for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) {
      const offset = (y * size.width + x) * 3;
      if (data[offset] > 180 && data[offset + 1] > 180 && data[offset + 2] > 180) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    assert.ok(maxX > minX, 'title remains visible');
    assert.ok(maxX < 64 + boxWidth + 2, 'long titles do not extend into the poster region');
    if (value === '动漫') assert.ok(maxY - minY > 130, 'short titles retain their large size');
  }
});

test('absolute polygon masks preserve a slanted image boundary and poster opacity is respected', async () => {
  const artwork = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#00ff00' } }).png().toBuffer();
  const image = await renderLibraryCover(JSON.stringify({ width: 100, height: 100, background: '#ff0000', objects: [
    { type: 'Image', posterVar: 'post1', left: 0, top: 0, width: 100, height: 100, opacity: .5,
      clipPath: { type: 'Polygon', absolutePositioned: true, left: 20, top: 0, width: 80, height: 100,
        points: [{ x: 60, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 20, y: 100 }] } }
  ] }), { title: 'Test' }, [artwork], { width: 100, height: 100 });
  const pixels = await sharp(image).removeAlpha().raw().toBuffer();
  const pixel = (x: number, y: number) => [...pixels.subarray((y * 100 + x) * 3, (y * 100 + x) * 3 + 3)];
  assert.deepEqual(pixel(30, 10), [255, 0, 0]);
  assert.ok(pixel(30, 90)[0] >= 125 && pixel(30, 90)[0] <= 130);
  assert.ok(pixel(30, 90)[1] >= 125 && pixel(30, 90)[1] <= 130);
  assert.deepEqual(pixel(95, 50).slice(2), [0]);
});

test('variable subtitles wrap into centered lines with serif italic styling', async () => {
  const json = JSON.stringify({ width: 600, height: 300, background: '#000000', objects: [
    { type: 'Textbox', text: 'Sample', textVar: '{{secondary_title}}', left: 300, top: 30, width: 190,
      originX: 'center', fontSize: 44, fill: '#ffffff', textAlign: 'center', fontFamily: 'serif', fontStyle: 'italic', lineHeight: 1.5, wrapText: true }
  ] });
  const image = await renderLibraryCover(json, { title: 'Test', secondaryTitle: 'Animated Films' }, [], { width: 600, height: 300 });
  const pixels = await sharp(image).removeAlpha().raw().toBuffer();
  const occupied = [];
  for (let y = 0; y < 300; y++) {
    let ink = false;
    for (let x = 0; x < 600; x++) if (pixels[(y * 600 + x) * 3] > 80) { ink = true; break; }
    if (ink) occupied.push(y);
  }
  assert.ok(occupied.length > 35, 'both words are rendered');
  assert.ok(occupied.some((y, i) => i && y - occupied[i - 1] > 10), 'there is a visible gap between the two lines');
  assert.ok(occupied[occupied.length - 1] > 100, 'subtitle height includes the second line');
});
