import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise authenticated APIs, rendering, manual runs and real cron using only disposable fixtures.
test('collection cover APIs read existing artwork, preview safely and update only selected collections', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express');
  const directory = mkdtempSync(join(tmpdir(), 'lcs-collections-'));
  const original = process.cwd();
  process.env.JWT_SECRET = 'collection-fixture-secret';
  process.env.ENCRYPTION_KEY = 'collection-fixture-key';
  process.env.ENCRYPTION_SALT = 'collection-fixture-salt';
  let database: any, scheduler: any, runner: any, taskRouter: any, serverRouter: any, auth: any, encrypt: any, errorHandler: any;
  process.chdir(directory);
  try {
    database = await import('../backend/src/config/database.ts');
    await database.initDatabase();
    scheduler = await import('../backend/src/services/scheduler.service.ts');
    runner = await import('../backend/src/services/taskRunner.service.ts');
    ({ taskRouter } = await import('../backend/src/routes/task.routes.ts'));
    ({ serverRouter } = await import('../backend/src/routes/server.routes.ts'));
    auth = await import('../backend/src/middleware/auth.ts');
    ({ encrypt } = await import('../backend/src/utils/crypto.ts'));
    ({ errorHandler } = await import('../backend/src/middleware/errorHandler.ts'));
  } finally { process.chdir(original); }
  const sqlite = database.db.$client;
  t.after(async () => {
    for (const id of scheduler.getActiveJobs()) scheduler.removeScheduledTask(id);
    const deadline = Date.now() + 5000;
    while (sqlite.prepare('SELECT id FROM tasks').all().some((task: any) => runner.isTaskRunning(task.id)) && Date.now() < deadline) await delay(20);
    sqlite.close(); rmSync(directory, { recursive: true, force: true });
  });
  for (const serverType of ['emby', 'jellyfin']) await t.test(serverType, async t => {
    const prefix = serverType === 'emby' ? '/emby' : '';
    const poster = readFileSync(new URL('../backend/src/template/poster/1.jpg', import.meta.url));
    const uploads: { id: string; buffer: Buffer }[] = [];
    let failUploads = false, hasCollectionCover = true;
    const collectionImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
    const media = express();
    media.use((req: any, _: any, next: any) => {
      if (serverType === 'emby') assert.equal(req.headers['x-emby-token'], 'fixture-key');
      else { assert.match(req.headers.authorization, /^MediaBrowser .*Token="fixture-key"$/); assert.equal(req.headers['x-emby-token'], undefined); }
      next();
    });
    media.get(`${prefix}/System/Info`, (_: any, res: any) => res.json({ Version: serverType === 'emby' ? '4.9.0' : '12.1.0', ProductName: serverType === 'emby' ? 'Emby Server' : 'Jellyfin Server' }));
    media.get(`${prefix}/Library/VirtualFolders`, (_: any, res: any) => res.json([{ ItemId: 'movies', Name: '电影库', CollectionType: 'movies' }]));
    media.get(`${prefix}/Items`, (req: any, res: any) => {
      if (req.query.IncludeItemTypes === 'BoxSet') return res.json({ Items: [{ Id: 'sci-fi', Name: '科幻合集', Type: 'BoxSet', ChildCount: 2 }], TotalRecordCount: 1 });
      assert.equal(req.query.ParentId, 'sci-fi');
      assert.equal(req.query[serverType === 'jellyfin' ? 'CollapseBoxSetItems' : 'GroupItemsIntoCollections'], 'false');
      assert.equal(req.query[serverType === 'jellyfin' ? 'GroupItemsIntoCollections' : 'CollapseBoxSetItems'], undefined);
      assert.ok(req.query.IncludeItemTypes.split(',').includes('Movie'));
      res.json({ Items: [{ Id: 'member', Name: '合集成员', Type: 'Movie', ImageTags: { Primary: 'fixture' } }], TotalRecordCount: 1 });
    });
    media.get(`${prefix}/Items/member/Images/Primary`, (_: any, res: any) => res.type('image/jpeg').send(poster));
    media.get(`${prefix}/Items/sci-fi/Images/Primary`, (_: any, res: any) => hasCollectionCover ? res.type('image/png').send(collectionImage) : res.sendStatus(404));
    media.post(`${prefix}/Items/:id/Images/Primary`, express.text({ type: '*/*', limit: '10mb' }), (req: any, res: any) => {
      if (failUploads) return res.sendStatus(403);
      uploads.push({ id: req.params.id, buffer: Buffer.from(req.body, 'base64') }); res.sendStatus(204);
    });
    const listen = async (app: any) => {
      const server = app.listen(0, '127.0.0.1');
      await new Promise<void>(resolve => server.on('listening', resolve));
      t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
      return `http://127.0.0.1:${server.address().port}`;
    };
    const mediaUrl = await listen(media);
    const userId = randomUUID(), otherId = randomUUID(), serverId = randomUUID(), templateId = randomUUID();
    for (const id of [userId, otherId]) sqlite.prepare('INSERT INTO users (id,username,password_hash) VALUES (?,?,?)').run(id, id, 'fixture');
    sqlite.prepare('INSERT INTO media_servers (id,name,type,url,api_key_encrypted,user_id) VALUES (?,?,?,?,?,?)')
      .run(serverId, `${serverType} fixture`, serverType, mediaUrl, encrypt('fixture-key'), userId);
    const canvas = JSON.stringify({ width: 320, height: 180, background: '#18356b', objects: [
      { type: 'image', posterVar: 'post1', left: 20, top: 20, width: 80, height: 120 }
    ] });
    sqlite.prepare('INSERT INTO templates (id,name,canvas_json,width,height,user_id) VALUES (?,?,?,?,?,?)')
      .run(templateId, '合集模板', canvas, 320, 180, userId);
    const app = express(); app.use(express.json());
    app.use('/api/servers', serverRouter); app.use('/api/tasks', taskRouter); app.use(errorHandler);
    const base = await listen(app);
    const headers = (id = userId) => ({ Authorization: `Bearer ${auth.generateToken({ userId: id, username: id, role: 'user' })}`, 'Content-Type': 'application/json' });
    const request = async (path: string, body?: unknown) => {
      const response = await fetch(base + '/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
      assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
      return response.json() as Promise<any>;
    };
    const targetPath = `/servers/${serverId}/cover-targets`;
    assert.equal((await fetch(base + '/api' + targetPath)).status, 401);
    assert.equal((await fetch(base + '/api' + targetPath, { headers: headers(otherId) })).status, 403);
    const targets = await request(targetPath);
    assert.deepEqual(targets.map((target: any) => [target.id, target.type]), [['movies', 'movies'], ['sci-fi', 'collection']]);
    assert.equal(targets[1].imageUrl, `/api/servers/${serverId}/items/sci-fi/image`);
    assert.ok(!JSON.stringify(targets).includes('fixture-key'));
    assert.equal((await request(`/servers/${serverId}/libraries`)).length, 1, 'legacy library discovery stays library-only');
    const coverUrl = base + targets[1].imageUrl;
    assert.equal((await fetch(coverUrl)).status, 401);
    assert.equal((await fetch(coverUrl, { headers: headers(otherId) })).status, 403);
    const currentCover = await fetch(coverUrl, { headers: headers() });
    assert.equal(currentCover.status, 200);
    assert.match(currentCover.headers.get('content-type')!, /^image\/png/);
    assert.equal(currentCover.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await currentCover.arrayBuffer()), collectionImage, 'proxy returns the collection cover, not a member poster');
    hasCollectionCover = false;
    assert.equal((await fetch(coverUrl, { headers: headers() })).status, 404, 'collections without a cover use the UI fallback');
    hasCollectionCover = true;
    const logCountBeforePreview = sqlite.prepare('SELECT COUNT(*) AS count FROM task_logs').get().count;
    const config = { libraryId: 'sci-fi', libraryName: '科幻合集', libraryType: 'collection', templateId, primaryTitle: '科幻精选', secondaryTitle: '', sortBy: 'DateCreated', enabled: true };
    const previewBody = { serverId, ...config };
    assert.equal((await fetch(base + '/api/tasks/preview-cover', { method: 'POST', headers: headers(otherId), body: JSON.stringify(previewBody) })).status, 403);
    const preview = await request('/tasks/preview-cover', previewBody);
    assert.match(preview.image, /^data:image\/png;base64,/);
    assert.equal(preview.posterCount, 1);
    assert.equal(uploads.length, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM task_logs').get().count, logCountBeforePreview);
    const unavailable = await fetch(base + '/api/tasks/preview-cover', { method: 'POST', headers: headers(), body: JSON.stringify({ ...previewBody, libraryId: 'deleted-collection' }) });
    assert.equal(unavailable.status, 400);
    assert.equal((await unavailable.json() as any).error.code, 'LIBRARY_UNAVAILABLE');
    const untilFinished = async (id: string) => {
      const deadline = Date.now() + 7000;
      while (Date.now() < deadline) {
        const log = sqlite.prepare("SELECT * FROM task_logs WHERE task_id = ? AND status != 'running' ORDER BY rowid DESC").get(id);
        if (log) return log;
        await delay(25);
      }
      assert.fail('Timed out waiting for collection cover run');
    };
    const manual = await request('/tasks', { name: '合集手动更新', type: 'manual', serverId, libraryConfigs: JSON.stringify([config]) });
    const saved = await request(`/tasks/${manual.id}`);
    assert.equal(JSON.parse(saved.libraryConfigs)[0].libraryType, 'collection');
    await request(`/tasks/${manual.id}/run`, {});
    const log = await untilFinished(manual.id);
    assert.equal(log.status, 'completed');
    assert.equal(log.items_processed, 1);
    assert.deepEqual(uploads.map(upload => upload.id), ['sci-fi']);
    const history = await request(`/tasks/${manual.id}/logs`);
    assert.equal(history[0].covers[0].libraryName, '科幻合集');
    assert.equal(history[0].covers[0].status, 'uploaded');
    const image = await fetch(base + '/api' + history[0].covers[0].imageUrl, { headers: headers() });
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), uploads[0].buffer);
    const scheduled = await request('/tasks', { name: '合集定时更新', type: 'scheduled', cronExpression: '* * * * * *', serverId, libraryConfigs: JSON.stringify([config]) });
    const scheduledLog = await untilFinished(scheduled.id);
    scheduler.removeScheduledTask(scheduled.id);
    assert.equal(scheduledLog.status, 'completed');
    assert.equal(scheduledLog.items_processed, 1);
    assert.ok(uploads.length >= 2);
    assert.ok(uploads.every(upload => upload.id === 'sci-fi'), 'never replace member posters or library roots');
    failUploads = true;
    const failed = await request('/tasks', { name: '合集上传失败', type: 'manual', serverId, libraryConfigs: JSON.stringify([config]) });
    await request(`/tasks/${failed.id}/run`, {});
    assert.equal((await untilFinished(failed.id)).status, 'failed');
    const failedHistory = await request(`/tasks/${failed.id}/logs`);
    assert.equal(failedHistory[0].covers[0].status, 'failed');
    assert.match(failedHistory[0].covers[0].errorMessage, /权限不足/);
  });
});
