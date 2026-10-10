import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { constrainDesign, summarizeCanvas, describeChanges } from '../web/src/lib/aiDesign.ts';
import { readSSE } from '../web/src/lib/sse.ts';
import { reconcileLibraries, buildSchedule, readSchedule } from '../web/src/lib/taskConfig.ts';
import { getUpcomingExecutions } from '../backend/src/utils/schedulePreview.ts';

const baseline = { background: '#111', objects: [
  { id: 'title', type: 'IText', text: '标题', fontSize: 40, left: 100, textVar: '{{primary_title}}' },
  { id: 'poster', type: 'Image', src: 'data:image/png;base64,original', posterVar: 'post1', left: 600 },
  { id: 'locked', type: 'Rect', fill: '#111', left: 20, lockMovementX: true }
] };
const generated = { background: '#fff', objects: [
  { id: 'locked', fill: '#fff', left: 800 }, { id: 'title', text: '新标题', fontSize: 70 },
  { id: 'poster', src: '[original-asset]', posterVar: 'post9', left: 400 }
] };
test('selected edits preserve background, other layers, asset and variable bindings', () => {
  const result = constrainDesign(generated, baseline, 'selection', ['title']);
  assert.equal(result.background, '#111');
  assert.deepEqual(result.objects[1], baseline.objects[1]);
  assert.deepEqual(result.objects[2], baseline.objects[2]);
  assert.equal(result.objects[0].fontSize, 70);
  assert.equal(result.objects[0].textVar, '{{primary_title}}');
  assert.throws(() => constrainDesign({ objects: [] }, baseline, 'selection', ['title']));
  assert.throws(() => constrainDesign({ objects: [generated.objects[1], generated.objects[1]] }, baseline, 'canvas', []));
});
test('whole-canvas edits retain locked stacking positions and omitted layers', () => {
  const result = constrainDesign(generated, baseline, 'canvas', []);
  assert.deepEqual(result.objects[2], baseline.objects[2]);
  assert.equal(result.objects[1].src, baseline.objects[1].src);
  assert.equal(result.objects[1].posterVar, 'post1');
  const omitted = constrainDesign({ objects: [generated.objects[1]] }, baseline, 'canvas', []);
  assert.equal(omitted.objects.length, 3);
  assert.deepEqual(omitted.objects[2], baseline.objects[2]);
  assert.ok(describeChanges(baseline, result, 'canvas').includes('调整文字与标题排版'));
  assert.equal(summarizeCanvas(baseline).objects[1].src, '[original-asset]');
});
test('AI edits cannot replace original image assets with invented or malformed URLs', () => {
  const original = { ...baseline, backgroundImage: { type:'Image', src:'data:image/svg+xml,original', opacity:1 } };
  const result = constrainDesign({ ...generated, objects: [{ id:'poster', src:'https://invented.invalid/poster.jpg', left:300 }],
    backgroundImage: { type:'Image', src:'data:image/svg+xml,broken', opacity:0.5 } }, original, 'canvas', []);
  assert.equal(result.objects.find(object => object.id === 'poster')?.src, baseline.objects[1].src);
  assert.equal(result.backgroundImage.src, original.backgroundImage.src);
  assert.equal(result.backgroundImage.opacity, 0.5);
});
test('SSE accepts fragmented UTF-8, JSON and CRLF boundaries', async () => {
  const data = new TextEncoder().encode('data: {"text":"中文方案"}\r\n\r\ndata: {"complete":true}\n\n');
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    for (let index = 0; index < data.length; index += 2) controller.enqueue(data.slice(index, index + 2));
    controller.close();
  } });
  const result = [];
  for await (const event of readSSE(body)) result.push(event);
  assert.deepEqual(result, [{ text: '中文方案' }, { complete: true }]);
});
test('library refresh retains custom template, titles and disabled selections', () => {
  const config = { libraryId: 'movie', libraryName: '电影', libraryType: 'movies', templateId: 'custom', primaryTitle: '自定义标题', secondaryTitle: '副标题', sortBy: 'Random', enabled: false };
  const result = reconcileLibraries([config], [{ id: 'movie', name: '电影', type: 'movies' }, { id: 'tv', name: '剧集', type: 'tvshows' }], 'default');
  assert.deepEqual(result[0], config);
  assert.equal(result[1].enabled, false);
  assert.equal(result[1].templateId, 'default');
});
test('simple schedules round-trip and custom expressions stay advanced', () => {
  for (const expression of ['0 4 * * *', '7 4 * * 1', '30 23 31 * *', '15 * * * *']) {
    assert.equal(buildSchedule(readSchedule(expression)!), expression);
  }
  assert.equal(readSchedule('0 */6 * * *'), null);
});
test('execution preview uses the scheduler timezone and begins in the future', () => {
  const dates = getUpcomingExecutions('0 4 * * *', 'Asia/Shanghai', 3, new Date('2026-10-08T20:00:00Z'));
  assert.deepEqual(dates, ['2026-10-09T20:00:00.000Z', '2026-10-10T20:00:00.000Z', '2026-10-11T20:00:00.000Z']);
  assert.throws(() => getUpcomingExecutions('*/0 * * * *', 'Asia/Shanghai'));
  assert.throws(() => getUpcomingExecutions('99 4 * * *', 'Asia/Shanghai'));
});
test('custom day, step and range previews match node-cron scheduling semantics', () => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const TimeMatcher = require('node-cron/src/time-matcher');
  for (const expression of ['0 4 13 * 1', '0 4 */2 * *', '0 1-7/2 * * *', '*/15 * * * 0,7', '0 4 1-5/2 * *', '30 0 4 * * 1']) {
    const matcher = new TimeMatcher(expression, 'Asia/Shanghai');
    const dates = getUpcomingExecutions(expression, 'Asia/Shanghai', 3, new Date('2026-10-08T00:00:00Z'));
    dates.forEach(date => assert.ok(matcher.match(new Date(date)), `${expression}: ${date}`));
  }
});
