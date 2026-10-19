import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredPosterCount } from '../backend/src/services/libraryCover.service.ts';
import { requiredArtworkSources, resolveArtworkSource } from '../backend/src/services/artworkSource.service.ts';

test('text-only and static-image layouts need no media artwork; stacked layers share one fetched poster', () => {
  const count = (objects: any[]) => requiredPosterCount(JSON.stringify({ objects }));
  assert.equal(count([{ type: 'Textbox', textVar: '{{primary_title}}' }, { type: 'Textbox', wrapText: true }]), 0);
  assert.equal(count([{ type: 'Image', src: 'data:image/png;base64,fixture' }]), 0);
  assert.equal(count(Array(3).fill({ type: 'Image', posterVar: 'post1' })), 1);
  assert.equal(count([{ type: 'Image', posterVar: 'post5' }]), 5);
  assert.equal(count([{ type: 'Image', posterVar: 'post9', visible: false }, { type: 'Image', posterVar: 'post1' }]), 1);
  assert.equal(count([{ type: 'Image', src: '/api/templates/posters/3.jpg' }]), 3);
  assert.equal(count([{ type: 'Image', src: '/api/templates/posters/backdrops/5.jpg' }]), 5);
  assert.equal(count([{ type: 'Image', src: '{{poster4}}' }]), 4);
});

test('per-slot artwork overrides inherit defaults and only request sources used by visible slots and backgrounds', () => {
  const canvas = { posterSource: 'backdrop', objects: [
    { posterVar: 'post1' }, { posterVar: 'post1', artworkSource: 'poster' },
    { posterVar: 'post2', artworkSource: 'unsupported' }
  ] };
  assert.equal(resolveArtworkSource(canvas.objects[0], canvas), 'backdrop');
  assert.equal(resolveArtworkSource(canvas.objects[1], canvas), 'poster');
  assert.equal(resolveArtworkSource(canvas.objects[2], canvas), 'backdrop');
  assert.deepEqual(requiredArtworkSources(JSON.stringify(canvas)), ['backdrop', 'poster']);
  assert.deepEqual(requiredArtworkSources(JSON.stringify({ posterSource: 'backdrop', objects: [
    { posterVar: 'post1', artworkSource: 'poster', visible: false }, { src: 'decoration.jpg', artworkSource: 'poster' }
  ] })), ['backdrop']);
  assert.deepEqual(requiredArtworkSources(JSON.stringify({ posterSource: 'backdrop', posterBackground: { source: 'poster' } })), ['backdrop', 'poster']);
});

test('a blurred poster background alone requests artwork even when there are no poster layers', () => {
  assert.equal(requiredPosterCount(JSON.stringify({ posterBackground: { blur: 60, dim: .35 }, objects: [{ type: 'Textbox' }] })), 1);
  assert.equal(requiredPosterCount(JSON.stringify({ posterBackground: { blur: 60, dim: .35 }, objects: [{ type: 'Image', posterVar: 'post9' }] })), 9);
});
