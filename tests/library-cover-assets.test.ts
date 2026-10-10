import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredPosterCount } from '../backend/src/services/libraryCover.service.ts';

test('text-only and static-image layouts need no media artwork; stacked layers share one fetched poster', () => {
  const count = (objects: any[]) => requiredPosterCount(JSON.stringify({ objects }));
  assert.equal(count([{ type: 'Textbox', textVar: '{{primary_title}}' }, { type: 'Textbox', wrapText: true }]), 0);
  assert.equal(count([{ type: 'Image', src: 'data:image/png;base64,fixture' }]), 0);
  assert.equal(count(Array(3).fill({ type: 'Image', posterVar: 'post1' })), 1);
  assert.equal(count([{ type: 'Image', posterVar: 'post5' }]), 5);
  assert.equal(count([{ type: 'Image', posterVar: 'post9', visible: false }, { type: 'Image', posterVar: 'post1' }]), 1);
  assert.equal(count([{ type: 'Image', src: '/api/templates/posters/3.jpg' }]), 3);
  assert.equal(count([{ type: 'Image', src: '{{poster4}}' }]), 4);
});
