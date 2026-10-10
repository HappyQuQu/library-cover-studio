import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a clean installation imports bundled designs, previews and history once without overwriting user changes', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'lcs-bundled-templates-'));
  const original = process.cwd();
  let database: any, defaults: any, history: any, paths: any;
  process.chdir(directory);
  try {
    database = await import('../backend/src/config/database.ts');
    await database.initDatabase();
    defaults = await import('../backend/src/services/defaultTemplates.service.ts');
    history = await import('../backend/src/services/templateHistory.service.ts');
    paths = await import('../backend/src/config/paths.ts');
  } finally { process.chdir(original); }
  t.after(() => { database.db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const sharp = createRequire(new URL('../backend/package.json', import.meta.url))('sharp');
  const sqlite = database.db.$client;
  const definitions = await defaults.buildDefaultTemplates();
  assert.equal(definitions.length, 6);
  await defaults.seedDefaultTemplates();
  await history.initializeTemplateHistory();
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM templates').get().count, 6);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM template_revisions').get().count, 6);
  for (const definition of definitions) {
    const row = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(definition.id);
    assert.deepEqual(JSON.parse(row.canvas_json), definition.canvas);
    assert.equal(row.name, definition.name);
    assert.equal(row.is_default, 1); assert.equal(row.is_public, 1); assert.equal(row.is_locked, 1);
    assert.equal(row.user_id, null);
    assert.equal(row.width, 1920); assert.equal(row.height, 1080);
    const expectedPreview = readFileSync(definition.previewPath);
    const preview = readFileSync(join(paths.THUMBNAILS_DIR, row.thumbnail_path.split('/').pop()));
    assert.deepEqual(preview, expectedPreview, 'first-run preview is the bundled image, with no random recoloring');
    const metadata = await sharp(preview).metadata();
    assert.equal(metadata.width, 480); assert.equal(metadata.height, 270);
    const baseline = sqlite.prepare('SELECT * FROM template_revisions WHERE template_id = ?').get(row.id);
    assert.equal(baseline.kind, 'baseline');
    assert.equal(baseline.canvas_json, row.canvas_json);
    assert.deepEqual(readFileSync(join(paths.THUMBNAILS_DIR, baseline.thumbnail_path.split('/').pop())), expectedPreview);
    const sources: string[] = [];
    const collectSources = (object: any) => {
      if (!object || typeof object !== 'object') return;
      if (typeof object.src === 'string') sources.push(object.src);
      for (const value of Object.values(object)) if (value && typeof value === 'object') collectSources(value);
    };
    collectSources(definition.canvas);
    assert.ok(sources.every(source => /^data:image\/svg\+xml;base64,/.test(source)
      || /^\/api\/templates\/posters\/[1-9]\.jpg$/.test(source)), 'designs only reference packaged assets');
  }
  // User changes, unlocks, and deliberate deletions remain intact after startup.
  const edited = definitions[0], deleted = definitions[1];
  const canvas = structuredClone(edited.canvas);
  canvas.randomOnGeneration = false;
  canvas.objects.find((object: any) => object.id === 'primary-title').text = '我的分类';
  sqlite.prepare('UPDATE templates SET name = ?, canvas_json = ?, is_locked = 0 WHERE id = ?')
    .run('我的扇形模板', JSON.stringify(canvas), edited.id);
  sqlite.prepare('DELETE FROM templates WHERE id = ?').run(deleted.id);
  const savedRows = sqlite.prepare('SELECT * FROM templates ORDER BY id').all();
  const savedHistory = sqlite.prepare('SELECT * FROM template_revisions ORDER BY sequence').all();
  await defaults.seedDefaultTemplates();
  await history.initializeTemplateHistory();
  assert.deepEqual(sqlite.prepare('SELECT * FROM templates ORDER BY id').all(), savedRows);
  assert.deepEqual(sqlite.prepare('SELECT * FROM template_revisions ORDER BY sequence').all(), savedHistory);
  // Even deleting every default does not make an existing installation look like a first run.
  sqlite.prepare('DELETE FROM templates').run();
  await defaults.seedDefaultTemplates();
  await history.initializeTemplateHistory();
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM templates').get().count, 0);
});
