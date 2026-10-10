import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';

test('admin reset restores edited/deleted defaults atomically, preserves custom designs and recoverable previews, and caps history at 50', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express'), sharp = require('sharp');
  const directory = mkdtempSync(join(tmpdir(), 'lcs-default-reset-')), original = process.cwd();
  process.env.JWT_SECRET = 'default-reset-fixture-secret';
  let database: any, defaults: any, history: any, routes: any, auth: any, errorHandler: any, paths: any, schema: any, templateRoutes: any;
  process.chdir(directory);
  try {
    database = await import('../backend/src/config/database.ts'); await database.initDatabase();
    defaults = await import('../backend/src/services/defaultTemplates.service.ts');
    history = await import('../backend/src/services/templateHistory.service.ts');
    ({ settingsRouter: routes } = await import('../backend/src/routes/settings.routes.ts'));
    ({ templateRouter: templateRoutes } = await import('../backend/src/routes/template.routes.ts'));
    auth = await import('../backend/src/middleware/auth.ts');
    ({ errorHandler } = await import('../backend/src/middleware/errorHandler.ts'));
    paths = await import('../backend/src/config/paths.ts'); schema = await import('../backend/src/config/schema.ts');
  } finally { process.chdir(original); }
  t.after(() => { database.db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const sqlite = database.db.$client;
  for (const [id, role] of [['admin', 'admin'], ['user', 'user']]) sqlite.prepare('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run(id, id, 'fixture', role);
  await defaults.seedDefaultTemplates(); await history.initializeTemplateHistory();
  // Simulate an older installation's constrained history table and a high-water sequence.
  const previousHistory = sqlite.prepare('SELECT * FROM template_revisions ORDER BY sequence').all();
  const oldSql = sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'template_revisions'").get().sql
    .replace("'baseline', 'default-reset', 'before-default-reset'", "'baseline'")
    .replace('template_revisions', 'template_revisions_old_history');
  sqlite.transaction(() => {
    sqlite.exec(oldSql);
    sqlite.exec(`INSERT INTO template_revisions_old_history SELECT * FROM template_revisions;
      DROP TABLE template_revisions;
      ALTER TABLE template_revisions_old_history RENAME TO template_revisions;
      CREATE INDEX idx_template_revisions_template ON template_revisions(template_id, sequence DESC);`);
    sqlite.prepare("UPDATE sqlite_sequence SET seq = 700 WHERE name = 'template_revisions'").run();
  })();
  await database.initDatabase();
  assert.deepEqual(sqlite.prepare('SELECT * FROM template_revisions ORDER BY sequence').all(), previousHistory);
  assert.equal(sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'template_revisions'").get().seq, 700);
  assert.ok(sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'template_revisions'").get().sql.includes("'default-reset'"));
  const definitions = await defaults.buildDefaultTemplates(), total = definitions.length;
  const app = express(); app.use(express.json()); app.use('/settings', routes); app.use('/templates', templateRoutes); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.on('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const base = `http://127.0.0.1:${server.address().port}/settings/default-templates`;
  const request = (method = 'GET', user = 'admin', body?: object) => fetch(base + (method === 'POST' ? '/restore' : ''), {
    method, headers: { ...(user ? { Authorization: `Bearer ${auth.generateToken({ userId: user, username: user, role: user === 'admin' ? 'admin' : 'user' })}` } : {}), 'Content-Type': 'application/json' },
    ...(method === 'POST' && body ? { body: JSON.stringify(body) } : {})
  });
  const rows = () => sqlite.prepare('SELECT * FROM templates ORDER BY id').all();
  // Serialization key order alone is not a template modification.
  const reorderedId = definitions[4].id;
  sqlite.prepare('UPDATE templates SET canvas_json = ? WHERE id = ?').run(
    JSON.stringify(Object.fromEntries(Object.entries(definitions[4].canvas).reverse())), reorderedId);
  const initialRows = rows();
  for (const method of ['GET', 'POST']) {
    assert.equal((await request(method, '', { confirm: true })).status, 401);
    assert.equal((await request(method, 'user', { confirm: true })).status, 403);
  }
  assert.equal((await request('POST', 'admin', {})).status, 400);
  assert.deepEqual(rows(), initialRows);
  assert.deepEqual({ ...(await (await request()).json() as any), templates: undefined }, { total, modified: 0, missing: 0, templates: undefined });

  const id = definitions[0].id, deletedId = definitions.at(-1).id, brokenId = definitions[1].id;
  sqlite.prepare('UPDATE templates SET is_locked = 0 WHERE id = ?').run(id);
  const existing = database.db.select().from(schema.templates).all().find((row: any) => row.id === id);
  const canvasJson = JSON.stringify({ width: 320, height: 180, background: '#0000ff', objects: [] });
  const blue = 'data:image/png;base64,' + (await sharp({ create: { width: 320, height: 180, channels: 3, background: '#0000ff' } }).png().toBuffer()).toString('base64');
  await history.saveTemplateVersion(existing, { ...existing, name: '用户改乱的模板', description: '用户说明', canvasJson, width: 320, height: 180, isPublic: 0 }, 'admin', 'save', blue);
  const edited = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(id);
  // A custom copy shares the original image; reset cleanup must not remove its assets.
  sqlite.prepare('INSERT INTO templates (id,name,canvas_json,width,height,user_id,is_default,is_locked,thumbnail_path) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('custom-copy', '用户复制模板', canvasJson, 320, 180, 'user', 0, 0, edited.thumbnail_path);
  const custom = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get('custom-copy');
  await history.initializeTemplateHistory();
  sqlite.prepare("INSERT INTO tasks (id,name,type,template_id,user_id,library_configs,is_enabled) VALUES (?,?,'manual',?,?,?,0)")
    .run('existing-task', 'Existing assignment', id, 'admin', JSON.stringify([{ libraryId: 'lib', templateId: id }]));
  const taskBefore = sqlite.prepare('SELECT * FROM tasks WHERE id = ?').get('existing-task');
  // Bring the retained history to the limit before adding the before/reset pair.
  for (let index = 0; index < 48; index++) sqlite.prepare('INSERT INTO template_revisions (id,template_id,name,canvas_json,width,height,thumbnail_path,kind,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(randomUUID(), id, `旧记录 ${index}`, canvasJson, 320, 180, edited.thumbnail_path, 'save', new Date().toISOString());
  sqlite.prepare('UPDATE templates SET is_locked = 1 WHERE id = ?').run(id);
  sqlite.prepare('UPDATE templates SET canvas_json = ?, thumbnail_path = NULL WHERE id = ?').run('{broken-json', brokenId);
  sqlite.prepare('DELETE FROM templates WHERE id = ?').run(deletedId);
  const status = await (await request()).json() as any;
  assert.equal(status.modified, 2); assert.equal(status.missing, 1);
  const result = await request('POST', 'admin', { confirm: true }); assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { total, restored: 2, recreated: 1, unchanged: total - 3 });
  for (const definition of definitions) {
    const row = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(definition.id);
    assert.deepEqual(JSON.parse(row.canvas_json), definition.canvas);
    assert.equal(row.name, definition.name); assert.equal(row.description, definition.description);
    assert.equal(row.width, 1920); assert.equal(row.height, 1080);
    assert.equal(row.is_locked, 1); assert.equal(row.is_default, 1); assert.equal(row.is_public, 1);
    assert.equal(row.user_id, null);
    assert.ok(existsSync(join(paths.THUMBNAILS_DIR, basename(row.thumbnail_path))));
  }
  assert.deepEqual(sqlite.prepare('SELECT * FROM templates WHERE id = ?').get('custom-copy'), custom);
  assert.ok(existsSync(join(paths.THUMBNAILS_DIR, basename(custom.thumbnail_path))));
  assert.deepEqual(sqlite.prepare('SELECT * FROM tasks WHERE id = ?').get('existing-task'), taskBefore);
  const revisions = history.getTemplateRevisions(id);
  assert.equal(revisions.length, 50); assert.equal(revisions[0].kind, 'default-reset');
  assert.equal(revisions[1].kind, 'before-default-reset'); assert.equal(revisions[1].canvasJson, canvasJson);
  assert.equal(revisions[1].name, '用户改乱的模板');
  const oldPixel = await sharp(readFileSync(join(paths.THUMBNAILS_DIR, basename(revisions[1].thumbnailPath)))).resize(1, 1).raw().toBuffer();
  assert.ok(oldPixel[2] > 240 && oldPixel[0] < 20 && oldPixel[1] < 20, 'the archived preview represents the previous design');
  const brokenArchive = history.getTemplateRevisions(brokenId).find((revision: any) => revision.kind === 'before-default-reset');
  assert.equal(brokenArchive.canvasJson, '{broken-json');
  assert.equal((await sharp(readFileSync(join(paths.THUMBNAILS_DIR, basename(brokenArchive.thumbnailPath)))).metadata()).width, 480);
  assert.equal(history.getTemplateRevisions(deletedId).length, 1);
  const restoredRows = rows(), restoredHistory = sqlite.prepare('SELECT * FROM template_revisions ORDER BY sequence').all();
  assert.deepEqual(await (await request('POST', 'admin', { confirm: true })).json(), { total, restored: 0, recreated: 0, unchanged: total });
  await defaults.seedDefaultTemplates(); await history.initializeTemplateHistory();
  assert.deepEqual(rows(), restoredRows);
  assert.deepEqual(sqlite.prepare('SELECT * FROM template_revisions ORDER BY sequence').all(), restoredHistory);

  // The archived design can be recovered through the normal history UI/API after unlocking.
  const token = auth.generateToken({ userId: 'admin', username: 'admin', role: 'admin' });
  const templateRequest = (endpoint: string, body = {}) => fetch(base.replace('/settings/default-templates', '/templates/') + id + endpoint,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await templateRequest('/lock', { isLocked: false })).status, 200);
  assert.equal((await templateRequest(`/history/${revisions[1].id}/restore`)).status, 200);
  assert.equal(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get(id).canvas_json, canvasJson);
  assert.deepEqual(await (await request('POST', 'admin', { confirm: true })).json(), { total, restored: 1, recreated: 0, unchanged: total - 1 });
  assert.equal(history.getTemplateRevisions(id).length, 50);

  // An ID collision aborts the entire action rather than overwriting a custom template.
  sqlite.prepare('UPDATE templates SET name = ? WHERE id = ?').run('待恢复', id);
  sqlite.prepare('UPDATE templates SET is_default = 0 WHERE id = ?').run(brokenId);
  const beforeConflict = rows(), beforeFiles = readdirSync(paths.THUMBNAILS_DIR).sort();
  assert.equal((await request('POST', 'admin', { confirm: true })).status, 409);
  assert.deepEqual(rows(), beforeConflict); assert.deepEqual(readdirSync(paths.THUMBNAILS_DIR).sort(), beforeFiles);
  sqlite.prepare('UPDATE templates SET is_default = 1 WHERE id = ?').run(brokenId);

  // A row changed after preparation fails the CAS check and removes all uncommitted previews.
  const expected = database.db.select().from(schema.templates).all().filter((row: any) => [id, brokenId].includes(row.id));
  sqlite.prepare('UPDATE templates SET name = ? WHERE id = ?').run('并发修改', brokenId);
  const beforeRace = rows(), beforeRaceHistory = sqlite.prepare('SELECT * FROM template_revisions ORDER BY sequence').all();
  const raceFiles = readdirSync(paths.THUMBNAILS_DIR).sort();
  await assert.rejects(history.resetDefaultTemplateVersions(expected.map((row: any) => ({ existing: row, next: { ...row, name: '不应写入' },
    preview: readFileSync(definitions[0].previewPath) })), 'admin'), { code: 'TEMPLATE_CHANGED' });
  assert.deepEqual(rows(), beforeRace);
  assert.deepEqual(sqlite.prepare('SELECT * FROM template_revisions ORDER BY sequence').all(), beforeRaceHistory);
  assert.deepEqual(readdirSync(paths.THUMBNAILS_DIR).sort(), raceFiles);
});
