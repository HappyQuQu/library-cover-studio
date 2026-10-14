import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('preview APIs add semantic messages without changing legacy payloads, stored designs, or media covers', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express');
  const directory = mkdtempSync(join(tmpdir(), 'lcs-preview-messages-'));
  const original = process.cwd();
  process.env.JWT_SECRET = 'preview-fixture-secret';
  process.env.ENCRYPTION_KEY = 'preview-fixture-key';
  process.env.ENCRYPTION_SALT = 'preview-fixture-salt';
  let database: any, controller: any, encrypt: any;
  process.chdir(directory);
  try {
    database = await import('../backend/src/config/database.ts');
    await database.initDatabase();
    controller = await import('../backend/src/controllers/taskPreview.controller.ts');
    ({ encrypt } = await import('../backend/src/utils/crypto.ts'));
  } finally { process.chdir(original); }
  t.after(() => { database.db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const media = express();
  let mediaWrites = 0;
  media.use((req: any, _: any, next: any) => { if (req.method !== 'GET') mediaWrites++; next(); });
  media.get('/Library/VirtualFolders', (_: any, res: any) => res.json([{ ItemId: 'movies', Name: '原始媒体库名称', CollectionType: 'movies' }]));
  media.get('/System/Info', (_: any, res: any) => res.json({ Version: '10.11.0' }));
  media.get('/Items', (_: any, res: any) => res.json({ Items: [{ Id: 'movie', Name: 'Poster', ImageTags: { Primary: 'fixture' } }], TotalRecordCount: 1 }));
  const poster = readFileSync(new URL('../backend/src/template/poster/1.jpg', import.meta.url));
  media.get('/Items/movie/Images/Primary', (_: any, res: any) => res.type('image/jpeg').send(poster));
  const server = media.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const sqlite = database.db.$client;
  sqlite.prepare('INSERT INTO users (id,username,password_hash) VALUES (?,?,?)').run('owner', 'owner', 'fixture');
  sqlite.prepare('INSERT INTO media_servers (id,name,type,url,api_key_encrypted,user_id) VALUES (?,?,?,?,?,?)').run('server', 'fixture', 'jellyfin', `http://127.0.0.1:${server.address().port}`, encrypt('fixture-key'), 'owner');
  const payloads: any[] = [];
  const response: any = { setHeader: () => {}, json: (value: any) => { payloads.push(value); return response; }, status: (value: number) => { response.statusCode = value; return response; } };
  for (const count of [0, 1, 2]) {
    const json = JSON.stringify({ width: 320, height: 180, background: '#18356b', objects: Array.from({ length: count }, (_, index) => ({ type: 'image', posterVar: `post${index + 1}`, width: 70, height: 100, left: 20 + index * 85, top: 20 })) });
    sqlite.prepare('INSERT INTO templates (id,name,canvas_json,width,height,user_id) VALUES (?,?,?,?,?,?)').run(`template-${count}`, '未翻译的设计', json, 320, 180, 'owner');
    let failure: unknown;
    await controller.previewCover({ body: { serverId: 'server', templateId: `template-${count}`, libraryId: 'movies', primaryTitle: '未保存标题', secondaryTitle: '', sortBy: 'DateCreated' }, user: { userId: 'owner', role: 'user' } }, response, (error: unknown) => { failure = error; });
    assert.equal(failure, undefined);
    const result = payloads.at(-1);
    assert.match(result.image, /^data:image\/png;base64,/);
    assert.equal(result.noteCode, ['NO_POSTERS_REQUIRED', 'LIBRARY_POSTERS', 'POSTERS_REUSED'][count]);
    assert.equal(result.posterCount, count ? 1 : 0);
    assert.deepEqual(result.noteParams, { count: count ? 1 : 0 });
    assert.equal(result.note, ['纯文字模板，无需海报素材', '使用媒体库中的真实海报', '使用 1 张可用海报，重复填充其余位置'][count]);
    assert.equal(sqlite.prepare('SELECT canvas_json FROM templates WHERE id=?').get(`template-${count}`).canvas_json, json);
  }
  assert.equal(mediaWrites, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM task_logs').get().count, 0);
  controller.previewSchedule({ body: { cronExpression: '99 4 * * *' } }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(payloads.at(-1).code, 'INVALID_SCHEDULE');
  assert.equal(typeof payloads.at(-1).error, 'string');
  assert.equal(payloads.at(-1).timezone, 'Asia/Shanghai');
  controller.previewSchedule({ body: { cronExpression: '0 4 * * 1' } }, response);
  assert.equal(payloads.at(-1).executions.length, 3);
  assert.equal(payloads.at(-1).timezone, 'Asia/Shanghai');
});
