import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('saved thumbnails require authentication, enforce template access and handle missing files without exposing storage', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express');
  const image = readFileSync(new URL('../backend/src/template/poster/1.jpg', import.meta.url));
  const taskDir = mkdtempSync(join(tmpdir(), 'lcs-thumbnail-test-'));
  const originalDir = process.cwd();
  process.env.JWT_SECRET = 'thumbnail-local-test-jwt-secret';
  let database: any;
  let router: any;
  let auth: any;
  let errorHandler: any;
  process.chdir(taskDir);
  try {
    database = await import('../backend/src/config/database.ts');
    await database.initDatabase();
    ({ templateRouter: router } = await import('../backend/src/routes/template.routes.ts'));
    auth = await import('../backend/src/middleware/auth.ts');
    ({ errorHandler } = await import('../backend/src/middleware/errorHandler.ts'));
  } finally { process.chdir(originalDir); }
  t.after(() => { database.db.$client.close(); rmSync(taskDir, { recursive: true, force: true }); });
  const sqlite = database.db.$client;
  for (const [id, role] of [['owner', 'user'], ['other', 'user'], ['admin', 'admin']]) {
    sqlite.prepare('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run(id, id, 'fixture', role);
  }
  const insert = sqlite.prepare('INSERT INTO templates (id,name,canvas_json,thumbnail_path,user_id,is_public) VALUES (?,?,?,?,?,?)');
  insert.run('private', 'Private', '{}', '/thumbnails/saved.jpg', 'owner', 0);
  insert.run('public', 'Shared', '{}', '/thumbnails/saved.jpg', 'owner', 1);
  insert.run('missing', 'Missing file', '{}', '/thumbnails/missing.jpg', 'owner', 0);
  insert.run('empty', 'No artwork', '{}', null, 'owner', 0);
  insert.run('invalid', 'Invalid path', '{}', '/thumbnails/private.txt', 'owner', 0);
  writeFileSync(join(taskDir, 'data/thumbnails/saved.jpg'), image);
  const app = express(); app.use('/api/templates', router); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const base = `http://127.0.0.1:${server.address().port}/api/templates`;
  const headers = (id: string) => ({ Authorization: `Bearer ${auth.generateToken({ userId: id, username: id, role: id === 'admin' ? 'admin' : 'user' })}` });
  assert.equal((await fetch(base + '/private/thumbnail')).status, 401);
  assert.equal((await fetch(base + '/private/thumbnail', { headers: headers('other') })).status, 403);
  for (const [id, viewer] of [['private', 'owner'], ['private', 'admin'], ['public', 'other']]) {
    const response = await fetch(`${base}/${id}/thumbnail`, { headers: headers(viewer) });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /^image\/jpeg/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  }
  for (const id of ['missing', 'empty', 'invalid', 'nonexistent']) {
    const response = await fetch(`${base}/${id}/thumbnail`, { headers: headers('owner') });
    assert.equal(response.status, 404); assert.ok(!(await response.text()).includes(taskDir));
  }
  // The former public URL remains unmounted. Reading artwork goes through its template.
  assert.equal((await fetch(base.replace('/templates', '/thumbnails') + '/saved.jpg')).status, 404);
});
