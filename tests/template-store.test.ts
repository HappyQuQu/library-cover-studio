import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('store paginates catalogs, imports counted ZIPs privately, deduplicates and retains local edits across updates', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express');
  const axios = (await import(require.resolve('axios/package.json').replace(/package\.json$/, 'index.js'))).default;
  const AdmZip = require('adm-zip');
  const image = readFileSync(new URL('../backend/src/template/poster/1.jpg', import.meta.url));
  const taskDir = mkdtempSync(join(tmpdir(), 'lcs-store-test-'));
  process.env.LCS_DATA_DIR = taskDir;
  process.env.JWT_SECRET = 'store-local-test-jwt-secret';
  const database = await import('../backend/src/config/database.ts');
  await database.initDatabase();
  const { templateStoreRouter } = await import('../backend/src/routes/templateStore.routes.ts');
  const { templateRouter } = await import('../backend/src/routes/template.routes.ts');
  const auth = await import('../backend/src/middleware/auth.ts');
  const { errorHandler } = await import('../backend/src/middleware/errorHandler.ts');
  const { STORE_CATALOG_URL, STORE_URL } = await import('../backend/src/services/templateStore.service.ts');
  t.after(() => { database.db.$client.close(); rmSync(taskDir, { recursive: true, force: true }); });
  const sqlite = database.db.$client;
  for (const id of ['owner', 'other']) sqlite.prepare('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run(id, id, 'fixture', 'user');
  const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
  const packages = new Map<string, Buffer>();
  const entries = Array.from({ length: 50 }, (_, index) => {
    const name = `社区模板 ${index}`;
    const id = hash(`folder-${index}`);
    const revision = hash(`revision-${index}`);
    const zip = new AdmZip();
    zip.addFile('template.json', Buffer.from(JSON.stringify({ name, description: null, width: 900, height: 600, canvasJson: '{"objects":[]}', isPublic: true })));
    zip.addFile('preview.jpg', image);
    const buffer = zip.toBuffer();
    const packageUrl = `${STORE_URL}/releases/download/store-00001/${id}--${revision}.zip`;
    packages.set(packageUrl, buffer);
    return { id, revision, name, description: '', width: 900, height: 600, folder: `folder-${index}`,
      previewUrl: `https://raw.githubusercontent.com/HappyQuQu/library-cover-store/${'a'.repeat(40)}/folder-${index}/preview.jpg`,
      packageUrl, packageSha256: hash(buffer), downloadCount: 100 - index };
  });
  const fixture = { version: 1, repository: 'HappyQuQu/library-cover-store', generatedAt: new Date().toISOString(), pendingCount: 0, templates: entries };
  const originalAdapter = axios.defaults.adapter;
  t.after(() => { axios.defaults.adapter = originalAdapter; });
  let setup = true, failCatalog = false, downloads = 0, catalogReads = 0;
  axios.defaults.adapter = async (config: any) => {
    assert.equal(config.headers?.Authorization, undefined, 'Application token must never be forwarded');
    if (config.url === STORE_CATALOG_URL) {
      catalogReads++;
      if (setup || failCatalog) throw new axios.AxiosError('Fixture network error', 'ERR_BAD_RESPONSE', config, {}, { status: setup ? 404 : 502, data: {}, headers: {}, config });
      return { status: 200, data: fixture, config, headers: {}, statusText: 'OK' };
    }
    assert.ok(packages.has(config.url));
    downloads++;
    await new Promise(resolve => setTimeout(resolve, 40));
    return { status: 200, data: packages.get(config.url), config, headers: {}, statusText: 'OK' };
  };
  let clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  const app = express();
  app.use(express.json()); app.use('/api/template-store', templateStoreRouter); app.use('/api/templates', templateRouter); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = (id = 'owner') => ({ Authorization: `Bearer ${auth.generateToken({ userId: id, username: id, role: 'user' })}` });
  const get = async (path: string) => { const response = await fetch(base + path, { headers: headers() }); assert.equal(response.status, 200); return response.json(); };
  const install = (id: string, user = 'owner') => fetch(`${base}/template-store/${id}/install`, { method: 'POST', headers: headers(user) });

  assert.equal((await fetch(base + '/template-store')).status, 401);
  assert.equal((await fetch(base + '/template-store/' + entries[0].id + '/install', { method: 'POST' })).status, 401);
  assert.equal(catalogReads, 0);
  assert.equal((await get('/template-store')).setupRequired, true);
  setup = false; clock += 301000;
  const firstPage = await get('/template-store?sort=popular');
  assert.equal(firstPage.templates.length, 24); assert.equal(firstPage.total, 50); assert.equal(firstPage.totalPages, 3);
  assert.equal(firstPage.templates[0].id, entries[0].id);
  assert.equal(firstPage.templates[0].packageUrl, undefined);
  assert.equal((await get('/template-store?page=999')).page, 3);
  assert.equal((await get('/template-store?page=999')).templates.length, 2);
  assert.equal((await get('/template-store?q=' + encodeURIComponent('社区模板 25'))).total, 1);
  assert.equal(catalogReads, 2, 'Pagination reuses the CDN catalog cache');
  const results = await Promise.all([install(entries[0].id), install(entries[0].id)]);
  assert.deepEqual(results.map(response => response.status), [201, 201]);
  const [added, duplicate] = await Promise.all(results.map(response => response.json()));
  assert.equal(added.id, duplicate.id); assert.equal(downloads, 1);
  const saved = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(added.id) as any;
  assert.equal(saved.name, entries[0].name); assert.equal(saved.user_id, 'owner');
  assert.equal(saved.is_public, 0); assert.equal(saved.is_locked, 0); assert.equal(saved.is_default, 0);
  assert.ok(saved.thumbnail_path);
  assert.equal((await get('/templates')).some((item: any) => item.id === added.id), true);
  assert.equal((await get('/template-store?sort=popular')).templates[0].installedTemplateId, added.id);
  const repeat = await install(entries[0].id); assert.equal(repeat.status, 200); assert.equal(downloads, 1);
  assert.equal((await repeat.json()).alreadyInstalled, true);
  const other = await install(entries[0].id, 'other'); assert.equal(other.status, 201); assert.equal(downloads, 2);
  assert.notEqual((await other.json()).id, added.id);

  // New store revisions create a separate editable template rather than overwriting an edited design.
  sqlite.prepare('UPDATE templates SET name = ? WHERE id = ?').run('My edited template', added.id);
  entries[0].revision = hash('new revision');
  clock += 301000;
  assert.equal((await get('/template-store?sort=popular')).templates[0].installedTemplateId, null);
  const nextVersion = await install(entries[0].id); assert.equal(nextVersion.status, 201);
  const updated = await nextVersion.json(); assert.notEqual(updated.id, added.id);
  assert.equal((sqlite.prepare('SELECT name FROM templates WHERE id = ?').get(added.id) as any).name, 'My edited template');
  assert.equal(downloads, 3);
  const deleted = await fetch(`${base}/templates/${updated.id}`, { method: 'DELETE', headers: headers() }); assert.equal(deleted.status, 200);
  assert.equal((await get('/template-store?sort=popular')).templates[0].installedTemplateId, null);
  assert.equal((await install(entries[0].id)).status, 201); assert.equal(downloads, 4);
  assert.equal((await install('nonexistent')).status, 404);

  // Failed checksum verification never creates a local template.
  entries[1].packageSha256 = hash('wrong package'); clock += 301000;
  const before = (sqlite.prepare('SELECT COUNT(*) AS count FROM templates').get() as any).count;
  assert.equal((await install(entries[1].id)).status, 502);
  assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM templates').get() as any).count, before);
  failCatalog = true; clock += 301000;
  const stale = await get('/template-store'); assert.equal(stale.stale, true); assert.equal(stale.total, 50);

  // Release ZIPs also retain the application's existing manual import format,
  // including null descriptions produced by exported templates.
  const form = new FormData();
  form.append('file', new Blob([packages.get(entries[2].packageUrl)!], { type: 'application/zip' }), 'community.zip');
  const manual = await fetch(`${base}/templates/import`, { method: 'POST', headers: headers(), body: form });
  assert.equal(manual.status, 201);
  assert.match((await manual.json()).name, /Imported/);
});

test('store packages require canonical JSON and preview files and reject decompression bombs', async () => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const AdmZip = require('adm-zip');
  const { readTemplatePackage } = await import('../backend/src/services/templatePackage.service.ts');
  const missing = new AdmZip(); missing.addFile('template.json', Buffer.from('{}'));
  assert.throws(() => readTemplatePackage(missing.toBuffer()), /缺少/);
  const oversized = new AdmZip(); oversized.addFile('template.json', Buffer.alloc(6 * 1024 * 1024));
  oversized.addFile('preview.jpg', Buffer.from('image'));
  assert.throws(() => readTemplatePackage(oversized.toBuffer()), /解压后/);
  const invalid = new AdmZip(); invalid.addFile('template.json', Buffer.from('{"name":"Bad","canvasJson":"{}"}'));
  invalid.addFile('preview.jpg', Buffer.from('image'));
  assert.throws(() => readTemplatePackage(invalid.toBuffer()), /内容无效/);
});
