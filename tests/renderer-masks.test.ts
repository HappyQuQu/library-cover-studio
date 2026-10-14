import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderLibraryCover } from '../backend/src/services/renderer.service.ts';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const sharp = require('sharp');

test('relative circular and hexagonal poster masks follow position, scaling, rotation and artwork replacement', async () => {
  const artwork = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#00ff00' } }).png().toBuffer();
  const base = { type: 'Image', posterVar: 'post1', width: 120, height: 120, scaleX: 1, scaleY: 1,
    left: 80, top: 80, originX: 'center', originY: 'center' };
  const hex = [{ x: 30, y: 0 }, { x: 90, y: 0 }, { x: 120, y: 60 }, { x: 90, y: 120 }, { x: 30, y: 120 }, { x: 0, y: 60 }];
  const clips = [
    { type: 'Circle', originX: 'center', originY: 'center', left: 0, top: 0, radius: 60 },
    { type: 'Circle', originX: 'left', originY: 'top', left: -60, top: -60, radius: 60 },
    { type: 'Ellipse', originX: 'center', originY: 'center', left: 0, top: 0, rx: 50, ry: 36 },
    { type: 'Polygon', originX: 'center', originY: 'center', left: 0, top: 0, points: hex, pathOffset: { x: 60, y: 60 } },
  ];
  for (const clipPath of clips) for (const [left, top, scale, angle] of [[20, 20, 1, 0], [76, 42, .5, 0], [20, 20, 1, 90]]) {
    const canvas = { width: 180, height: 180, background: '#000000', objects: [{ ...base,
      left: left + 60 * scale, top: top + 60 * scale, scaleX: scale, scaleY: scale, angle, clipPath }] };
    const rendered = await renderLibraryCover(JSON.stringify(canvas), { title: 'Test' }, [artwork], { width: 180, height: 180 });
    const { data, info } = await sharp(rendered).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
    assert.deepEqual(pixel(left + 60 * scale, top + 60 * scale), [0, 255, 0], 'replacement artwork fills the aperture');
    assert.deepEqual(pixel(left + 2, top + 2), [0, 0, 0], 'corners remain cut out after moving/scaling');
    assert.deepEqual(pixel(10, 10), [0, 0, 0], 'mask does not leave artwork at the previous location');
  }
});
