import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Real wall-clock cron triggers against a disposable database and media server.
test('scheduled tasks trigger without manual runs, pause, recover registrations, retain previews and skip overlapping ticks', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express'), sharp = require('sharp');
  const directory = mkdtempSync(join(tmpdir(), 'lcs-scheduler-test-'));
  const original = process.cwd();
  process.env.JWT_SECRET = 'scheduler-fixture-jwt-secret';
  process.env.ENCRYPTION_KEY = 'scheduler-fixture-encryption-key';
  process.env.ENCRYPTION_SALT = 'scheduler-fixture-salt';
  let database: any, scheduler: any, runner: any, router: any, auth: any, encrypt: any, errorHandler: any;
  process.chdir(directory);
  try {
    database = await import('../backend/src/config/database.ts');
    await database.initDatabase();
    scheduler = await import('../backend/src/services/scheduler.service.ts');
    runner = await import('../backend/src/services/taskRunner.service.ts');
    ({ taskRouter: router } = await import('../backend/src/routes/task.routes.ts'));
    auth = await import('../backend/src/middleware/auth.ts');
    ({ encrypt } = await import('../backend/src/utils/crypto.ts'));
    ({ errorHandler } = await import('../backend/src/middleware/errorHandler.ts'));
  } finally { process.chdir(original); }
  let uploadFails = false, holdUploads = false, releaseUpload: (() => void) | undefined;
  t.after(async () => {
    for (const id of scheduler.getActiveJobs()) scheduler.removeScheduledTask(id);
    holdUploads = false; releaseUpload?.();
    const deadline = Date.now() + 10000;
    while (database.db.$client.prepare('SELECT id FROM tasks').all().some((task: any) => runner.isTaskRunning(task.id)) && Date.now() < deadline) {
      await delay(50);
    }
    database.db.$client.close(); rmSync(directory, { recursive: true, force: true });
  });
  const sqlite = database.db.$client;
  const until = async (predicate: () => any, label: string) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const result = predicate(); if (result) return result;
      await delay(50);
    }
    assert.fail(`Timed out: ${label}`);
  };
  const poster = readFileSync(new URL('../backend/src/template/poster/1.jpg', import.meta.url));
  const uploaded: Buffer[] = [];
  const media = express();
  media.get('/System/Info', (_: any, res: any) => res.json({ Version: '12.1.0', ServerName: 'Scheduler fixture' }));
  media.get('/Items', (_: any, res: any) => res.json({ Items: [{ Id: 'movie', Name: 'Poster', ImageTags: { Primary: 'fixture' } }], TotalRecordCount: 1 }));
  media.get('/Items/movie/Images/Primary', (_: any, res: any) => res.type('image/jpeg').send(poster));
  media.post('/Items/:id/Images/Primary', express.text({ type: '*/*', limit: '10mb' }), async (req: any, res: any) => {
    if (holdUploads) await new Promise<void>(resolve => { releaseUpload = resolve; });
    if (uploadFails) return res.sendStatus(403);
    uploaded.push(Buffer.from(req.body, 'base64')); res.sendStatus(204);
  });
  const mediaServer = media.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => mediaServer.on('listening', resolve));
  t.after(() => new Promise<void>(resolve => { releaseUpload?.(); mediaServer.closeAllConnections(); mediaServer.close(() => resolve()); }));
  const userId = randomUUID(), serverId = randomUUID(), templateId = randomUUID();
  sqlite.prepare('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run(userId, 'fixture', 'fixture', 'user');
  sqlite.prepare('INSERT INTO media_servers (id,name,type,url,api_key_encrypted,user_id) VALUES (?,?,?,?,?,?)')
    .run(serverId, 'Isolated fixture', 'jellyfin', `http://127.0.0.1:${mediaServer.address().port}`, encrypt('fixture-key'), userId);
  const canvas = JSON.stringify({ width: 480, height: 270, background: '#532a73', objects: [
    { type: 'image', posterVar: 'post1', left: 290, top: 0, width: 180, height: 270 },
    { type: 'textbox', text: '{{primary_title}}', left: 20, top: 110, width: 250, fontSize: 32, fill: '#ffffff' },
  ] });
  sqlite.prepare('INSERT INTO templates (id,name,canvas_json,width,height,user_id) VALUES (?,?,?,?,?,?)')
    .run(templateId, 'Fixture design', canvas, 480, 270, userId);
  const configs = JSON.stringify([{ libraryId: 'anime', libraryName: 'Anime', libraryType: 'tvshows',
    templateId, primaryTitle: '动漫', secondaryTitle: 'ANIME', sortBy: 'DateCreated', enabled: true }]);
  const app = express(); app.use(express.json()); app.use('/api/tasks', router); app.use(errorHandler);
  const api = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => api.on('listening', resolve));
  t.after(() => new Promise<void>(resolve => { api.closeAllConnections(); api.close(() => resolve()); }));
  const base = `http://127.0.0.1:${api.address().port}/api/tasks`;
  const headers = { Authorization: `Bearer ${auth.generateToken({ userId, username: 'fixture', role: 'user' })}`, 'Content-Type': 'application/json' };
  const request = async (url: string, method: string, body?: any) => {
    const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.ok(response.ok, `${method} ${url}: ${response.status}`);
    return response.json() as Promise<any>;
  };
  const row = (id: string) => sqlite.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  const logs = (id: string) => sqlite.prepare('SELECT * FROM task_logs WHERE task_id = ? ORDER BY rowid').all(id);
  const task = await request('', 'POST', { name: 'Clock-trigger fixture', type: 'scheduled', cronExpression: '  * * * * * *  ', serverId, libraryConfigs: configs, isEnabled: false });
  assert.equal(row(task.id).cron_expression, '* * * * * *');
  assert.equal(row(task.id).next_run_at, null);
  assert.deepEqual(scheduler.getActiveJobs(), []);
  await delay(1200); assert.equal(logs(task.id).length, 0);
  const enabledAt = Date.now();
  await request(`/${task.id}/toggle`, 'POST');
  // A one-second schedule may become due before the HTTP response is read.
  assert.ok(Date.parse(row(task.id).next_run_at) > enabledAt, 'enabling stores the next scheduled execution');
  const first = await until(() => logs(task.id).find((log: any) => log.status === 'completed'), 'first automatic execution');
  await request(`/${task.id}/toggle`, 'POST');
  assert.equal(row(task.id).next_run_at, null, 'pausing clears the scheduled execution');
  assert.equal(first.items_processed, 1); assert.equal(first.items_failed, 0);
  assert.ok(row(task.id).last_run_at);
  const history = await request(`/${task.id}/logs`, 'GET');
  const cover = history.find((log: any) => log.id === first.id).covers[0];
  assert.equal(cover.status, 'uploaded'); assert.ok(cover.thumbnailUrl && cover.imageUrl);
  const image = await fetch(`http://127.0.0.1:${api.address().port}/api${cover.imageUrl}`, { headers });
  assert.equal(image.status, 200);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), uploaded[0]);
  assert.equal((await sharp(uploaded[0]).metadata()).width, 480);
  const stoppedCount = logs(task.id).length;
  await delay(1200); assert.equal(logs(task.id).length, stoppedCount);

  // A slow upload spans several ticks; it remains one run, without failed duplicate records.
  holdUploads = true;
  await request(`/${task.id}`, 'PUT', { isEnabled: true });
  await until(() => releaseUpload, 'slow upload reaches the media server');
  assert.equal((await fetch(`${base}/${task.id}/run`, { method: 'POST', headers })).status, 409);
  assert.equal((await fetch(`${base}/${task.id}`, { method: 'DELETE', headers })).status, 409);
  const runningCount = logs(task.id).length;
  const nextBeforeOverlap = row(task.id).next_run_at;
  await delay(2200);
  assert.equal(logs(task.id).length, runningCount, 'overlapping cron ticks do not create duplicate execution records');
  assert.ok(Date.parse(row(task.id).next_run_at) > Date.parse(nextBeforeOverlap), 'scheduled ticks advance the next execution');
  await request(`/${task.id}`, 'PUT', { isEnabled: false });
  holdUploads = false; releaseUpload?.(); releaseUpload = undefined;
  await until(() => !runner.isTaskRunning(task.id), 'slow execution completes');

  // Registration is reconstructed from enabled scheduled rows, without executing immediately.
  await request(`/${task.id}`, 'PUT', { cronExpression: '*/2 * * * * *', isEnabled: true });
  scheduler.removeScheduledTask(task.id);
  assert.deepEqual(scheduler.getActiveJobs(), []);
  const beforeReload = logs(task.id).length;
  scheduler.initScheduler(); scheduler.initScheduler();
  assert.deepEqual(scheduler.getActiveJobs(), [task.id]);
  assert.equal(logs(task.id).length, beforeReload);
  await until(() => logs(task.id).length > beforeReload && !runner.isTaskRunning(task.id), 'restored schedule triggers');
  await request(`/${task.id}`, 'PUT', { type: 'manual' });
  assert.equal(row(task.id).next_run_at, null);
  assert.deepEqual(scheduler.getActiveJobs(), []);
  scheduler.initScheduler(); assert.deepEqual(scheduler.getActiveJobs(), []);

  // Media-server rejection creates a failed history record with the generated preview.
  uploadFails = true;
  const failed = await request('', 'POST', { name: 'Rejected upload', type: 'scheduled', cronExpression: '* * * * * *', serverId, libraryConfigs: configs });
  const failure = await until(() => logs(failed.id).find((log: any) => log.status === 'failed'), 'automatic upload failure');
  await request(`/${failed.id}`, 'PUT', { isEnabled: false });
  assert.equal(failure.items_failed, 1);
  const failedHistory = await request(`/${failed.id}/logs`, 'GET');
  assert.equal(failedHistory[0].covers[0].status, 'failed');
  assert.ok(failedHistory[0].covers[0].imageUrl);
  uploadFails = false;
  await request(`/${failed.id}`, 'PUT', { isEnabled: true, cronExpression: '0 0 1 1 *' });
  await until(() => !runner.isTaskRunning(failed.id), 'previous failure finishes before deleting the idle scheduled task');
  await request(`/${failed.id}`, 'DELETE');
  assert.deepEqual(scheduler.getActiveJobs(), []);
  const countAfterDelete = uploaded.length;
  await delay(1200); assert.equal(uploaded.length, countAfterDelete);
});
