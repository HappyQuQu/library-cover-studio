import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A real task runner against a disposable media API; never uploads to a configured media server.
test('history retains distinct images per run, including upload failures, with authenticated previews and downloads', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express'), sharp = require('sharp');
  const root = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), 'lcs-history-test-'));
  process.env.JWT_SECRET = 'history-fixture-jwt-secret';
  process.env.ENCRYPTION_KEY = 'history-fixture-encryption-key';
  process.env.ENCRYPTION_SALT = 'history-fixture-salt';
  let database: any, runner: any, router: any, auth: any, encrypt: any, errorHandler: any, history: any;
  process.chdir(directory);
  try {
    database = await import('../backend/src/config/database.ts');
    await database.initDatabase();
    runner = await import('../backend/src/services/taskRunner.service.ts');
    ({ taskRouter: router } = await import('../backend/src/routes/task.routes.ts'));
    auth = await import('../backend/src/middleware/auth.ts');
    ({ encrypt } = await import('../backend/src/utils/crypto.ts'));
    ({ errorHandler } = await import('../backend/src/middleware/errorHandler.ts'));
    history = await import('../backend/src/services/taskHistory.service.ts');
  } finally { process.chdir(root); }
  t.after(() => { database.db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const sqlite = database.db.$client;
  const poster = readFileSync(new URL('../backend/src/template/poster/1.jpg', import.meta.url));
  let uploadFails = false, uploaded: Buffer[] = [];
  const media = express();
  media.get('/System/Info', (_: any, res: any) => res.json({ Version: '12.1.0', ServerName: 'Fixture' }));
  media.get('/Items', (_: any, res: any) => res.json({ Items: [{ Id: 'movie', Name: 'Test poster', ImageTags: { Primary: 'fixture' } }], TotalRecordCount: 1 }));
  media.get('/Items/movie/Images/Primary', (_: any, res: any) => res.type('image/jpeg').send(poster));
  media.post('/Items/:id/Images/Primary', express.text({ type: '*/*', limit: '10mb' }), (req: any, res: any) => {
    if (uploadFails) return res.sendStatus(403);
    uploaded.push(Buffer.from(req.body, 'base64')); res.sendStatus(204);
  });
  const mediaServer = media.listen(0, '127.0.0.1');
  await new Promise<void>(r => mediaServer.on('listening', r));
  t.after(() => new Promise<void>(r => { mediaServer.closeAllConnections(); mediaServer.close(() => r()); }));
  for (const [id, role] of [['owner', 'user'], ['other', 'user'], ['admin', 'admin']]) sqlite.prepare('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run(id, id, 'fixture', role);
  sqlite.prepare('INSERT INTO media_servers (id,name,type,url,api_key_encrypted,user_id) VALUES (?,?,?,?,?,?)').run('server', '本地测试服务器', 'jellyfin', `http://127.0.0.1:${mediaServer.address().port}`, encrypt('fixture-key'), 'owner');
  const canvas = (start: string) => JSON.stringify({ width: 960, height: 540, background: { type: 'linear', gradientUnits: 'pixels', coords: { x1: 0, y1: 0, x2: 960, y2: 540 }, colorStops: [{ offset: 0, color: start }, { offset: 1, color: '#ae297e' }] }, objects: [
    ...Array.from({ length: 5 }, (_, i) => ({ type: 'image', posterVar: `post${i + 1}`, width: 140, height: 210, left: 100 + i * 155, top: 120 - Math.sin(i / 4 * Math.PI) * 45 })),
    { type: 'textbox', text: '{{primaryTitle}}', left: 55, top: 425, width: 700, height: 50, fontSize: 34, fill: '#ffffff' }
  ] });
  sqlite.prepare('INSERT INTO templates (id,name,canvas_json,width,height,user_id) VALUES (?,?,?,?,?,?)').run('template', '紫蓝精选', canvas('#182d72'), 960, 540, 'owner');
  let configs = [{ libraryId: 'anime', libraryName: 'Anime', templateId: 'template', primaryTitle: '动漫', sortBy: 'DateCreated', enabled: true }];
  sqlite.prepare('INSERT INTO tasks (id,name,type,server_id,user_id,library_configs,is_enabled) VALUES (?,?,?,?,?,?,?)').run('history-task', '执行历史 · 测试任务', 'manual', 'server', 'owner', JSON.stringify(configs), 0);
  sqlite.prepare('INSERT INTO tasks (id,name,type,user_id) VALUES (?,?,?,?)').run('another-task', 'Other task', 'manual', 'owner');
  const run = async (id: string, time: string) => {
    sqlite.prepare('INSERT INTO task_logs (id,task_id,status,started_at) VALUES (?,?,?,?)').run(id, 'history-task', 'running', time);
    await runner.runTask('history-task', id);
    sqlite.prepare('UPDATE task_logs SET completed_at = ? WHERE id = ?').run(new Date(Date.parse(time) + 2000).toISOString(), id);
    return sqlite.prepare('SELECT * FROM task_log_covers WHERE log_id = ?').all(id);
  };
  const first = (await run('run-1', '2026-10-09T05:00:00Z'))[0];
  assert.equal(first.status, 'uploaded');
  assert.equal(readdirSync(join(directory, 'data/covers')).length, 0, 'history works when optional cover saving is disabled');
  const original = readFileSync(join(directory, 'data/task-history', first.image_name));
  assert.deepEqual(original, uploaded[0]);
  sqlite.prepare('UPDATE templates SET canvas_json = ? WHERE id = ?').run(canvas('#cc7832'), 'template');
  const second = (await run('run-2', '2026-10-09T05:10:00Z'))[0];
  assert.notEqual(first.image_name, second.image_name);
  assert.deepEqual(readFileSync(join(directory, 'data/task-history', first.image_name)), original);
  assert.notDeepEqual(readFileSync(join(directory, 'data/task-history', second.image_name)), original);
  uploadFails = true;
  const third = (await run('run-3', '2026-10-09T05:20:00Z'))[0];
  assert.equal(third.status, 'failed');
  assert.ok(third.image_name); assert.ok(third.error_message);
  assert.equal(sqlite.prepare('SELECT status FROM task_logs WHERE id = ?').get('run-3').status, 'failed');
  uploadFails = false;
  configs.push({ libraryId: 'tv', libraryName: 'TV', templateId: 'missing', primaryTitle: 'TV', sortBy: 'DateCreated', enabled: true });
  sqlite.prepare('UPDATE tasks SET library_configs = ? WHERE id = ?').run(JSON.stringify(configs), 'history-task');
  const fourth = await run('run-4', '2026-10-09T05:30:00Z');
  assert.equal(fourth.filter((c: any) => c.status === 'uploaded').length, 1);
  assert.equal(fourth.find((c: any) => c.library_id === 'tv').image_name, null);
  sqlite.prepare('INSERT INTO task_logs (id,task_id,status,started_at,items_processed) VALUES (?,?,?,?,?)').run('legacy', 'history-task', 'completed', '2026-10-09T04:00:00Z', 1);
  const app = express(); app.use(express.json());
  const token = (id: string) => auth.generateToken({ userId: id, username: id, role: id === 'admin' ? 'admin' : 'user' });
  // Only used for visual QA on the disposable fixture, never mounted by the application.
  if (process.env.LCS_HISTORY_VISUAL_FIXTURE === '1') {
    app.post('/api/auth/login', (_: any, res: any) => res.json({ user: { id: 'owner', username: '测试用户', role: 'user' }, token: token('owner'), refreshToken: 'fixture' }));
    app.get('/api/servers', (_: any, res: any) => res.json([{ id: 'server', name: '本地测试服务器', type: 'jellyfin' }]));
    app.get('/api/templates', (_: any, res: any) => res.json([{ id: 'template', name: '紫蓝精选', width: 960, height: 540 }]));
  }
  app.use('/api/tasks', router); app.use(errorHandler);
  if (process.env.LCS_HISTORY_VISUAL_FIXTURE === '1') {
    app.use(express.static(fileURLToPath(new URL('../web/dist', import.meta.url))));
    app.get('*', (_: any, res: any) => res.sendFile(fileURLToPath(new URL('../web/dist/index.html', import.meta.url))));
  }
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.on('listening', r));
  t.after(() => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }));
  const base = `http://127.0.0.1:${server.address().port}/api/tasks`;
  const headers = (id: string) => ({ Authorization: `Bearer ${token(id)}` });
  const imageUrl = `${base}/history-task/logs/run-1/covers/${first.id}/image`;
  assert.equal((await fetch(imageUrl)).status, 401);
  assert.equal((await fetch(imageUrl, { headers: headers('other') })).status, 403);
  assert.equal((await fetch(`${base}/history-task/logs`, { headers: headers('other') })).status, 403);
  for (const viewer of ['owner', 'admin']) {
    const response = await fetch(imageUrl, { headers: headers(viewer) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), original);
  }
  const thumbnail = await fetch(imageUrl + '?size=thumbnail', { headers: headers('owner') });
  assert.match(thumbnail.headers.get('content-type')!, /^image\/jpeg/);
  const info = await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata();
  assert.ok(info.width <= 480 && info.height <= 300);
  const download = await fetch(imageUrl + '?download=1', { headers: headers('owner') });
  assert.match(download.headers.get('content-disposition')!, /attachment/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), original);
  assert.equal((await fetch(imageUrl.replace('/run-1/', '/run-2/'), { headers: headers('owner') })).status, 404);
  assert.equal((await fetch(imageUrl.replace('/history-task/', '/another-task/'), { headers: headers('owner') })).status, 404);
  const logs = await (await fetch(`${base}/history-task/logs`, { headers: headers('owner') })).json() as any[];
  assert.equal(logs.find(log => log.id === 'legacy').covers.length, 0);
  assert.equal(logs.find(log => log.id === 'run-3').covers[0].status, 'failed');
  assert.ok(!JSON.stringify(logs).includes(directory));
  assert.ok(!JSON.stringify(logs).includes('image_name'));
  assert.equal(history.historyImagePath('../../private.png'), undefined);
  if (process.env.LCS_HISTORY_VISUAL_FIXTURE === '1') {
    console.log(`VISUAL_FIXTURE_URL=http://127.0.0.1:${server.address().port}`);
    await new Promise<void>(r => process.once('SIGTERM', r));
  }
  rmSync(join(directory, 'data/task-history', first.image_name));
  assert.equal((await fetch(imageUrl, { headers: headers('owner') })).status, 404);
  const refreshed = await (await fetch(`${base}/history-task/logs`, { headers: headers('owner') })).json() as any[];
  assert.equal(refreshed.find(log => log.id === 'run-1').covers[0].imageUrl, null);
  const deletion = await fetch(`${base}/history-task`, { method: 'DELETE', headers: headers('owner') });
  assert.equal(deletion.status, 200);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM task_log_covers').get().count, 0);
  assert.equal(readdirSync(join(directory, 'data/task-history')).length, 0);
});
