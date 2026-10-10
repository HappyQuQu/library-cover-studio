import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFitZoom } from '../web/src/lib/editorLayout.ts';

test('small editor viewports retain a positive zoom and fit the landscape canvas', () => {
  for (const [viewWidth, viewHeight] of [[320, 440], [390, 560], [816, 580], [88, 500]]) {
    const zoom = calculateFitZoom(viewWidth, viewHeight, 1920, 1080);
    assert.ok(zoom > 0);
    assert.ok(1920 * zoom <= viewWidth - 48);
    assert.ok(1080 * zoom <= viewHeight - 48);
  }
});
test('fit handles portrait templates and does not enlarge canvases above native resolution', () => {
  const zoom = calculateFitZoom(390, 480, 600, 900);
  assert.ok(600 * zoom <= 342);
  assert.ok(900 * zoom <= 432);
  assert.equal(calculateFitZoom(3000, 2000, 1920, 1080), 1);
});
