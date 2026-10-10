import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderTemplate, renderLibraryCover } from '../backend/src/services/renderer.service.ts';
import { resolveApiUrl } from '../web/src/lib/apiUrl.ts';
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const webRequire = createRequire(new URL('../web/package.json', import.meta.url));
const sharp = backendRequire('sharp'), fabric = webRequire('fabric');
const dimensions = { width: 160, height: 120 };
const base = { left: 80, top: 60, originX: 'center', originY: 'center', fill: '#ff0000', strokeWidth: 0 };
const fixtures = [
  new fabric.Circle({ ...base, radius: 25 }),
  new fabric.Triangle({ ...base, width: 60, height: 50 }),
  new fabric.Line([-30, 0, 30, 0], { ...base, stroke: '#ff0000', strokeWidth: 6 }),
  new fabric.Path('M 0 0 L 40 0 L 40 -15 L 65 0 L 40 15 L 40 0 Z', base),
  new fabric.Polygon([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 50 }], base)
];
async function pixels(buffer: Buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, at: (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)] };
}
for (const [index, object] of fixtures.entries()) test(`Fabric ${object.type} renders in single and library output`, async () => {
  const json = JSON.stringify({ ...dimensions, background: '#ffffff', objects: [object.toObject()] });
  const single = await renderTemplate(json, { title: 'fixture' }, undefined, dimensions);
  const library = await renderLibraryCover(json, { title: 'fixture' }, [], dimensions);
  assert.deepEqual(single, library);
  const result = await pixels(single);
  const colored = [...result.data].filter((_, i) => i % 4 === 1 && result.data[i] < 150).length;
  assert.ok(colored > 150, `primitive ${index} must be visible`);
  assert.deepEqual(result.at(5, 5), [255, 255, 255, 255]);
  if (object.type.toLowerCase() !== 'path') assert.ok(result.at(80, 60)[1] < 100);
});

test('rounded, rotated and outlined rectangles preserve geometry and alpha', async () => {
  const render = async (overrides: object) => pixels(await renderLibraryCover(JSON.stringify({ ...dimensions, background: '#ffffff', objects: [new fabric.Rect({ ...base, width: 60, height: 40, ...overrides }).toObject()] }), { title: 'fixture' }, [], dimensions));
  const rounded = await render({ rx: 18, ry: 18 });
  assert.deepEqual(rounded.at(51, 41), [255, 255, 255, 255]);
  assert.deepEqual(rounded.at(80, 60), [255, 0, 0, 255]);
  const rotated = await render({ angle: 90 });
  assert.deepEqual(rotated.at(80, 35), [255, 0, 0, 255]);
  assert.deepEqual(rotated.at(55, 60), [255, 255, 255, 255]);
  const outlined = await render({ stroke: '#0000ff', strokeWidth: 8, opacity: 0.5 });
  assert.ok(outlined.at(48, 60)[2] > 240 && outlined.at(48, 60)[0] < 160, 'blue outline remains visible');
  assert.ok(outlined.at(80, 60)[1] >= 125 && outlined.at(80, 60)[1] <= 130, 'opacity is composited');
});

test('rotation uses the serialized Fabric origin instead of the unrotated top-left', async () => {
  const object = new fabric.Rect({ width: 40, height: 20, left: 100, top: 20, angle: 90, fill: '#ff0000', strokeWidth: 0 });
  const result = await pixels(await renderLibraryCover(JSON.stringify({ ...dimensions, background: '#ffffff', objects: [object.toObject()] }), { title: 'fixture' }, [], dimensions));
  assert.deepEqual(result.at(90, 40), [255, 0, 0, 255]);
  assert.deepEqual(result.at(120, 30), [255, 255, 255, 255]);
});

test('API file URLs work with Docker, local proxies and remote API bases', () => {
  for (const base of ['/api', '/api/', 'http://localhost:3000/api', 'https://example.com/service/api/']) {
    assert.equal(resolveApiUrl('/api/uploads/fonts/test.woff2', base), base.replace(/\/$/, '') + '/uploads/fonts/test.woff2');
  }
  assert.equal(resolveApiUrl('https://cdn.example.com/font.woff2', '/api'), 'https://cdn.example.com/font.woff2');
});
