import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Real task/preview HTTP APIs and rendering; every upload goes to a loopback fixture.
test('template pools retain successful choices across previews, failed uploads, history cleanup and restart', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express');
  const directory = mkdtempSync(join(tmpdir(), 'lcs-template-pool-'));
  process.env.LCS_DATA_DIR = directory;
  process.env.JWT_SECRET = 'pool-fixture-secret'; process.env.ENCRYPTION_KEY = 'pool-fixture-key';
  const database = await import('../backend/src/config/database.ts');
  await database.initDatabase();
  const { taskRouter } = await import('../backend/src/routes/task.routes.ts');
  const { errorHandler } = await import('../backend/src/middleware/errorHandler.ts');
  const { generateToken } = await import('../backend/src/middleware/auth.ts');
  const { encrypt } = await import('../backend/src/utils/crypto.ts');
  const selection = await import('../backend/src/services/taskTemplate.service.ts');
  const sqlite = database.db.$client;
  t.after(() => { sqlite.close(); rmSync(directory, { force: true, recursive: true }); });
  const listen = async (app: any) => {
    const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.on('listening', resolve));
    t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const uploads: { id: string; bytes: number }[] = [];
  let failUpload = false;
  const media = express();
  media.get('/System/Info', (_: any, res: any) => res.json({ Version: '12.1.0' }));
  media.get('/Library/VirtualFolders', (_: any, res: any) => res.json([{ ItemId: 'movies', Name: '电影库', CollectionType: 'movies' }]));
  media.post('/Items/:id/Images/Primary', express.text({ type: '*/*' }), (req: any, res: any) => {
    if (failUpload) return res.sendStatus(403);
    uploads.push({ id: req.params.id, bytes: Buffer.from(req.body, 'base64').length }); res.sendStatus(204);
  });
  const mediaUrl = await listen(media);
  const userId = randomUUID(), otherId = randomUUID(), serverId = randomUUID();
  for (const id of [userId, otherId]) sqlite.prepare('INSERT INTO users (id,username,password_hash) VALUES (?,?,?)').run(id, id, 'fixture');
  sqlite.prepare('INSERT INTO media_servers (id,name,type,url,api_key_encrypted,user_id) VALUES (?,?,?,?,?,?)').run(serverId, 'Fixture', 'jellyfin', mediaUrl, encrypt('fixture-key'), userId);
  const a = randomUUID(), b = randomUUID(), portrait = randomUUID(), privateId = randomUUID();
  for (const [id, width, height, owner, version, color] of [[a, 320, 180, userId, '2.0.0', '#5352ab'], [b, 640, 360, userId, '3.0.0', '#2e7c7c'], [portrait, 180, 320, userId, '1.0.0', '#965341'], [privateId, 320, 180, otherId, '1.0.0', '#111111']] as const) {
    sqlite.prepare('INSERT INTO templates (id,name,canvas_json,width,height,user_id,metadata_json) VALUES (?,?,?,?,?,?,?)').run(id, id === a ? '紫色模板' : '青色模板', JSON.stringify({ width, height, background: color, objects: [] }), width, height, owner, JSON.stringify({ version }));
  }
  const app = express(); app.use(express.json()); app.use('/api/tasks', taskRouter); app.use(errorHandler);
  const base = await listen(app) + '/api/tasks';
  const headers = { Authorization: `Bearer ${generateToken({ userId, username: userId, role: 'user' })}`, 'Content-Type': 'application/json' };
  const request = (path: string, body?: unknown) => fetch(base + path, { headers, method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  const config = { libraryId: 'movies', libraryName: '电影库', templateId: a, templateMode: 'random' as const, templateIds: [a, b], avoidRepeat: true, primaryTitle: '精选', secondaryTitle: '', sortBy: 'DateCreated', enabled: true };
  const payload = (overrides: object = {}) => ({ name: '模板池任务', type: 'manual', serverId, libraryConfigs: JSON.stringify([{ ...config, ...overrides }]) });
  for (const ids of [[], [a, a], [a, portrait], [a, privateId], Array(51).fill(a)]) {
    const response = await request('', payload({ templateIds: ids })); assert.equal(response.status, 400);
  }
  assert.equal(selection.chooseTemplateId([a, b], a, true, () => 0), b);
  assert.equal(selection.chooseTemplateId([a], a, true, () => 0), a);
  assert.equal(selection.chooseTemplateId([a, b], a, false, () => 0), a);
  const created = await request('', payload()); assert.equal(created.status, 201); const task: any = await created.json();
  const row = () => sqlite.prepare('SELECT template_id FROM task_template_state WHERE task_id=? AND library_id=?').get(task.id, 'movies') as { template_id: string } | undefined;
  const run = async () => {
    const response = await request(`/${task.id}/run`, {}); assert.equal(response.status, 200);
    const { logId } = await response.json() as any;
    for (let attempt = 0; attempt < 200; attempt++) {
      const log = sqlite.prepare('SELECT status FROM task_logs WHERE id=?').get(logId) as any;
      if (log?.status !== 'running') return sqlite.prepare('SELECT * FROM task_log_covers WHERE log_id=? ORDER BY rowid').all(logId) as any[];
      await delay(25);
    }
    assert.fail('Task did not finish');
  };
  const first = (await run())[0];
  assert.equal(first.status, 'uploaded'); assert.equal(first.template_id, row()?.template_id);
  assert.equal(first.template_version, first.template_id === a ? '2.0.0' : '3.0.0');
  const previous = row()?.template_id;
  for (const id of [a, b]) {
    const response = await request('/preview-cover', { serverId, ...config, previewTemplateId: id });
    assert.equal(response.status, 200); const sample: any = await response.json();
    assert.equal(sample.templateId, id); assert.match(sample.image, /^data:image\/png;base64,/);
    assert.equal(row()?.template_id, previous, 'preview cannot advance random selection state');
  }
  assert.equal(uploads.length, 1);
  const outside = await request('/preview-cover', { serverId, ...config, previewTemplateId: portrait }); assert.equal(outside.status, 400);
  const second = (await run())[0]; assert.notEqual(second.template_id, first.template_id);
  failUpload = true;
  const failed = (await run())[0]; assert.equal(failed.status, 'failed'); assert.equal(row()?.template_id, second.template_id);
  failUpload = false;
  const retry = (await run())[0]; assert.equal(retry.template_id, failed.template_id, 'failed upload is not a successful rotation');
  sqlite.prepare('DELETE FROM task_logs WHERE task_id=?').run(task.id);
  const retained = row()?.template_id;
  await database.initDatabase(); assert.equal(row()?.template_id, retained, 'state survives retention and idempotent migrations');
  const next = (await run())[0]; assert.notEqual(next.template_id, retained);
  selection.rememberTaskTemplate(task.id, 'movies', a); selection.rememberTaskTemplate(task.id, 'tv', b);
  sqlite.prepare('UPDATE tasks SET library_configs=? WHERE id=?').run(JSON.stringify([config, { ...config, libraryId: 'tv', libraryName: '剧集库' }]), task.id);
  const separate = await run(); assert.equal(separate.find(c => c.library_id === 'movies').template_id, b); assert.equal(separate.find(c => c.library_id === 'tv').template_id, a);
  sqlite.prepare('UPDATE tasks SET library_configs=? WHERE id=?').run(JSON.stringify([config]), task.id);
  sqlite.prepare('DELETE FROM templates WHERE id=?').run(a);
  const remaining = (await run())[0]; assert.equal(remaining.status, 'uploaded'); assert.equal(remaining.template_id, b); assert.match(remaining.warning_message, /已跳过 1 个/);
  const repeated = (await run())[0]; assert.equal(repeated.template_id, b); assert.match(repeated.warning_message, /仅剩一个/);
  sqlite.prepare('DELETE FROM templates WHERE id=?').run(b);
  const countBefore = uploads.length;
  const empty = (await run())[0]; assert.equal(empty.status, 'failed'); assert.equal(uploads.length, countBefore); assert.equal(row()?.template_id, b);
  const logs: any = await (await request(`/${task.id}/logs`)).json();
  assert.ok(logs.some((log: any) => log.covers.some((cover: any) => cover.templateId === b && cover.templateVersion === '3.0.0' && cover.warningMessage)));
  assert.ok(uploads.every(upload => ['movies', 'tv'].includes(upload.id) && upload.bytes > 0));
  const deletion = await fetch(base + `/${task.id}`, { method: 'DELETE', headers }); assert.equal(deletion.status, 200);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM task_template_state WHERE task_id=?').get(task.id).count, 0);
});
