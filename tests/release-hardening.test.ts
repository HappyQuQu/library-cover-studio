import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, existsSync, symlinkSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('release permission boundaries, atomic settings, restart recovery and maintenance use disposable storage', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url)), express = require('express'), sharp = require('sharp');
  const root = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'lcs-hardening-'));
  process.env.JWT_SECRET = 'disposable-hardening-jwt'; process.env.ENCRYPTION_KEY = 'disposable-hardening-encryption';
  let database: any, router: any, errorHandler: any, scheduler: any, retention: any, history: any;
  process.chdir(directory);
  try {
    database = await import('../backend/src/config/database.ts'); await database.initDatabase();
    ({ router } = await import('../backend/src/routes/index.ts'));
    ({ errorHandler } = await import('../backend/src/middleware/errorHandler.ts'));
    scheduler = await import('../backend/src/services/scheduler.service.ts');
    retention = await import('../backend/src/services/historyRetention.service.ts');
    history = await import('../backend/src/services/taskHistory.service.ts');
  } finally { process.chdir(root); }
  const sqlite = database.db.$client;
  const app = express(); app.use(express.json()); app.use('/api', router); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.on('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(resolve)); sqlite.close(); rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (route: string, method = 'GET', body?: object, token?: string) => fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const registrations = await Promise.all(['first-user', 'second-user'].map(username => request('/auth/register', 'POST', { username, password: 'fixture-password' })));
  assert.deepEqual(registrations.map(response => response.status), [201, 201]);
  const accounts = await Promise.all(registrations.map(response => response.json()));
  const admin = accounts.find(account => account.user.role === 'admin'), user = accounts.find(account => account.user.role === 'user');
  assert.ok(admin && user, 'only one concurrent first registration becomes admin');
  const duplicates = await Promise.all([1, 2].map(() => request('/auth/register', 'POST', { username: 'duplicate-user', password: 'fixture-password' })));
  assert.deepEqual(duplicates.map(r => r.status).sort(), [201, 400]);
  assert.equal((await request('/settings', 'POST', { 'ai.systemPrompt': 'forged' }, user.token)).status, 403);
  assert.equal((await request('/settings', 'POST', { 'ai.systemPrompt': 'should-not-save', 'scheduler.timezone': 'Mars/Unknown' }, admin.token)).status, 400);
  assert.equal((await (await request('/settings', 'GET', undefined, user.token)).json())['ai.systemPrompt'], '');
  for (const body of [{ constructor: 'x' }, { 'ai.systemPrompt': false }, { 'unsupported.setting': 'x' }, { 'rendering.concurrency': 0 }, { 'rendering.outputQuality': 101 }, { 'storage.saveCovers': {} }, { 'history.maxRuns': -1 }]) {
    assert.equal((await request('/settings', 'POST', body, admin.token)).status, 400);
  }
  assert.equal((await request('/settings', 'POST', { 'rendering.outputFormat': 'WebP', 'rendering.outputQuality': 75, 'rendering.concurrency': 2 }, admin.token)).status, 200);
  const runtime = await import('../backend/src/services/runtimeSettings.service.ts');
  assert.deepEqual(runtime.getRenderSettings(), { format: 'webp', quality: 75 });

  const sentinel = join(directory, 'sentinel.ttf'); writeFileSync(sentinel, 'keep');
  const fontsDir = join(directory, 'data/uploads/fonts');
  writeFileSync(join(fontsDir, 'valid.ttf'), 'fixture-font'); symlinkSync(sentinel, join(fontsDir, 'linked.ttf'));
  for (const filename of ['../../../sentinel.ttf', '..\\sentinel.ttf', 'linked.ttf', 'bad.txt']) assert.equal((await request('/fonts/' + encodeURIComponent(filename), 'DELETE', undefined, user.token)).status, 400);
  assert.ok(existsSync(sentinel));
  assert.equal((await request('/fonts/valid.ttf', 'DELETE', undefined, user.token)).status, 200);

  sqlite.prepare('INSERT INTO templates (id,name,canvas_json,user_id) VALUES (?,?,?,?)').run('template', 'Referenced', '{"objects":[]}', admin.user.id);
  sqlite.prepare('INSERT INTO tasks (id,name,type,user_id,library_configs) VALUES (?,?,?,?,?)').run('task', 'Private task', 'manual', admin.user.id, JSON.stringify([{ libraryId: 'library', templateId: 'template', enabled: true }]));
  assert.equal((await request('/tasks/task', 'GET', undefined, user.token)).status, 403);
  assert.equal((await request('/tasks/task', 'GET', undefined, admin.token)).status, 200);
  const remove = await request('/templates/template', 'DELETE', undefined, admin.token);
  assert.equal(remove.status, 409); assert.match(await remove.text(), /Private task/);
  sqlite.prepare('UPDATE templates SET user_id = ?, is_public = 1 WHERE id = ?').run(user.user.id, 'template');
  const ownerRemove = await request('/templates/template', 'DELETE', undefined, user.token);
  assert.equal(ownerRemove.status, 409);
  const ownerMessage = await ownerRemove.text();
  assert.doesNotMatch(ownerMessage, /Private task/);
  assert.match(ownerMessage, /其他用户的任务/);
  sqlite.prepare('UPDATE tasks SET library_configs = ? WHERE id = ?').run('[]', 'task');
  assert.equal((await request('/templates/template', 'DELETE', undefined, admin.token)).status, 200);
  sqlite.prepare('INSERT INTO task_logs (id,task_id,status,started_at) VALUES (?,?,?,?)').run('interrupted', 'task', 'running', new Date().toISOString());
  scheduler.initScheduler();
  assert.equal(sqlite.prepare('SELECT status FROM task_logs WHERE id=?').get('interrupted').status, 'running', 'rescheduling must not interrupt a live run');
  scheduler.recoverInterruptedRuns();
  assert.equal(sqlite.prepare('SELECT status FROM task_logs WHERE id=?').get('interrupted').status, 'failed');
  sqlite.prepare('UPDATE task_logs SET status=?,completed_at=? WHERE id=?').run('running', null, 'interrupted');

  const image = await sharp({ create: { width: 32, height: 20, channels: 3, background: '#ff0000' } }).webp().toBuffer();
  const snapshotId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const snapshot = await history.saveHistoryCover(snapshotId, image);
  assert.equal(snapshot.imageName, snapshotId + '.webp');
  sqlite.prepare('INSERT INTO task_logs (id,task_id,status,started_at,completed_at) VALUES (?,?,?,?,?)').run('expired', 'task', 'completed', '2020-01-01', '2020-01-01');
  sqlite.prepare('INSERT INTO task_log_covers (id,log_id,library_id,library_name,status,image_name,thumbnail_name) VALUES (?,?,?,?,?,?,?)').run(snapshotId, 'expired', 'lib', 'Library', 'uploaded', snapshot.imageName, snapshot.thumbnailName);
  assert.equal(await retention.pruneTaskHistory(), 1);
  assert.ok(!existsSync(history.historyImagePath(snapshot.imageName)));
  assert.equal(sqlite.prepare('SELECT status FROM task_logs WHERE id=?').get('interrupted').status, 'running');
  assert.equal((await request('/settings', 'POST', { 'history.maxRuns': 2 }, admin.token)).status, 200);
  for (let index = 1; index <= 3; index++) {
    sqlite.prepare('INSERT INTO task_logs (id,task_id,status,started_at,completed_at) VALUES (?,?,?,?,?)').run(`retained-${index}`, 'task', 'completed', new Date(Date.now() - index * 1000).toISOString(), new Date().toISOString());
  }
  assert.equal(await retention.pruneTaskHistory(), 1);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM task_logs WHERE status=?').get('completed').count, 2);
  assert.ok(sqlite.prepare('SELECT id FROM task_logs WHERE id=?').get('interrupted'), 'count cap also retains active execution');
  const recentId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const activeSnapshot = await history.saveHistoryCover(recentId, image);
  sqlite.prepare('INSERT INTO task_log_covers (id,log_id,library_id,library_name,status,image_name,thumbnail_name) VALUES (?,?,?,?,?,?,?)').run(recentId, 'interrupted', 'lib', 'Active', 'generated', activeSnapshot.imageName, activeSnapshot.thumbnailName);
  const activeFile = history.historyImagePath(activeSnapshot.imageName), orphan = history.historyImagePath('cccccccc-cccc-cccc-cccc-cccccccccccc.png');
  const stale = join(directory, 'data/temp/stale.txt'), fresh = join(directory, 'data/temp/fresh.txt');
  writeFileSync(orphan, 'orphan'); writeFileSync(stale, 'stale'); writeFileSync(fresh, 'fresh');
  for (const file of [activeFile, orphan, stale]) utimesSync(file, new Date('2020-01-01'), new Date('2020-01-01'));
  assert.equal((await request('/settings/cache', 'GET', undefined, user.token)).status, 403);
  assert.equal((await (await request('/settings/cache', 'GET', undefined, admin.token)).json()).files, 2);
  assert.equal((await (await request('/settings/cache/clear', 'POST', {}, admin.token)).json()).files, 2);
  assert.ok(existsSync(activeFile) && existsSync(fresh) && !existsSync(orphan) && !existsSync(stale));
  sqlite.prepare('INSERT INTO media_servers (id,name,type,url,api_key_encrypted) VALUES (?,?,?,?,?)').run('server', 'fixture', 'jellyfin', 'https://username:secret@example.com/?api_key=hidden', 'encrypted-secret');
  sqlite.prepare('INSERT INTO system_settings (key,value) VALUES (?,?)').run('legacy.secret', 'hidden-secret');
  const exported = await (await request('/settings/export', 'GET', undefined, admin.token)).text();
  assert.ok(!/encrypted-secret|hidden-secret|passwordHash|password_hash|api_key=hidden|username:secret/.test(exported));
  assert.equal((await request('/settings/export', 'GET', undefined, user.token)).status, 403);
});
