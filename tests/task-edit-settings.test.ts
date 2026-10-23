import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLibraryConfigs, readBatchSettings, reconcileLibraries, type LibraryConfig } from '../web/src/lib/taskConfig.ts';

const target = (overrides: Partial<LibraryConfig> = {}): LibraryConfig => ({
  libraryId: 'movies', libraryName: '电影', libraryType: 'movies', templateId: 'second-template',
  primaryTitle: '电影', secondaryTitle: '', sortBy: 'CommunityRating', enabled: true, ...overrides
});
const reopen = (configs: LibraryConfig[]) => parseLibraryConfigs(JSON.stringify(configs));

test('editing a saved legacy task restores its non-default fixed template and artwork order', () => {
  const configs = reopen([target(), target({ libraryId: 'disabled', templateId: 'first-template', sortBy: 'Random', enabled: false })]);
  const refreshed = reconcileLibraries(configs, [{ id: 'movies', name: '电影', type: 'movies' }, { id: 'disabled', name: '未选', type: 'movies' }], 'first-template');
  assert.deepEqual(readBatchSettings(refreshed), {
    selection: { templateId: 'second-template', templateMode: 'fixed', templateIds: [], avoidRepeat: true }, sortBy: 'CommunityRating'
  });
  assert.deepEqual(refreshed, configs, 'restoring batch controls must not overwrite saved target settings');
});

test('editing restores a random pool, its repeat setting and independent candidate arrays', () => {
  for (const avoidRepeat of [false, true]) {
    const configs = reopen([target({ templateMode: 'random', templateIds: ['second-template', 'first-template'], avoidRepeat, sortBy: 'Random' })]);
    const restored = readBatchSettings(configs);
    assert.equal(restored.selection?.templateMode, 'random');
    assert.deepEqual(restored.selection?.templateIds, ['second-template', 'first-template']);
    assert.equal(restored.selection?.avoidRepeat, avoidRepeat);
    assert.equal(restored.sortBy, 'Random');
    restored.selection!.templateIds!.push('draft');
    assert.equal(configs[0].templateIds!.length, 2, 'batch drafts must not mutate a saved pool');
  }
});

test('mixed target overrides remain distinct rather than showing an arbitrary default', () => {
  const configs = reopen([target(), target({ libraryId: 'collection', libraryType: 'collection', templateId: 'first-template', sortBy: 'Random' })]);
  assert.deepEqual(readBatchSettings(configs), { selection: null, sortBy: null });
  assert.equal(configs[0].templateId, 'second-template');
  assert.equal(configs[1].templateId, 'first-template');
  assert.equal(readBatchSettings([target(), target({ libraryId: 'other', sortBy: 'Random' })]).selection?.templateId, 'second-template');
  assert.equal(readBatchSettings([target(), target({ libraryId: 'other', templateId: 'other' })]).sortBy, 'CommunityRating');
});

test('equivalent pools share batch settings regardless of candidate order or inactive fixed template', () => {
  const first = target({ templateMode: 'random', templateIds: ['a', 'b'] });
  const second = target({ libraryId: 'collection', templateId: 'unused', templateMode: 'random', templateIds: ['b', 'a'], avoidRepeat: true });
  assert.equal(readBatchSettings([first, second]).selection?.templateMode, 'random');
  assert.equal(readBatchSettings([first, { ...second, avoidRepeat: false }]).selection, null);
  assert.equal(readBatchSettings([first, { ...second, templateIds: ['b'] }]).selection, null);
  assert.equal(readBatchSettings([first, target()]).selection, null);
  assert.deepEqual(readBatchSettings([]), { selection: null, sortBy: null });
  assert.deepEqual(readBatchSettings([target({ enabled: false })]), { selection: null, sortBy: null });
});
