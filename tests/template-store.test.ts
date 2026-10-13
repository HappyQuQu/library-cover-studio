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
    const metadata = index === 49 ? {} : { version: '1.0.0', author: { name: 'HappyQuQu', url: 'https://github.com/HappyQuQu' }, changelog: '首次发布' };
    zip.addFile('template.json', Buffer.from(JSON.stringify({ ...metadata, name, description: null, width: 900, height: 600, canvasJson: '{"objects":[]}', isPublic: true })));
    zip.addFile('preview.jpg', image);
    const buffer = zip.toBuffer();
    const packageUrl = `${STORE_URL}/releases/download/store-00001/${id}--${revision}.zip`;
    packages.set(packageUrl, buffer);
    return { ...metadata, id, revision, name, description: '', width: 900, height: 600, folder: `folder-${index}`,
      previewUrl: `https://raw.githubusercontent.com/HappyQuQu/library-cover-store/${'a'.repeat(40)}/folder-${index}/preview.jpg`,
      packageUrl, packageSha256: hash(buffer), downloadCount: 100 - index };
  });
  const fixture = { version: 1, repository: 'HappyQuQu/library-cover-store', generatedAt: new Date().toISOString(), pendingCount: 0, templates: entries };
  const originalAdapter = axios.defaults.adapter;
  t.after(() => { axios.defaults.adapter = originalAdapter; });
  let setup = true, failCatalog = false, downloads = 0, catalogReads = 0;
  let duringDownload: (() => void) | undefined;
  axios.defaults.adapter = async (config: any) => {
    assert.equal(config.headers?.Authorization, undefined, 'Application token must never be forwarded');
    if (config.url === STORE_CATALOG_URL) {
      catalogReads++;
      if (setup || failCatalog) throw new axios.AxiosError('Fixture network error', 'ERR_BAD_RESPONSE', config, {}, { status: setup ? 404 : 502, data: {}, headers: {}, config });
      return { status: 200, data: fixture, config, headers: {}, statusText: 'OK' };
    }
    const packageUrl = config.url.split('?')[0];
    assert.match(config.url, /\?download=/, 'Each actual ZIP download bypasses cached redirects');
    assert.ok(packages.has(packageUrl));
    downloads++;
    duringDownload?.();
    await new Promise(resolve => setTimeout(resolve, 40));
    return { status: 200, data: packages.get(packageUrl), config, headers: {}, statusText: 'OK' };
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
  const update = (index: number, id: string, user = 'owner') => fetch(`${base}/template-store/${entries[index].id}/update`, {
    method: 'POST', headers: { ...headers(user), 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: id, revision: entries[index].revision }) });
  const revise = (index: number, version: string, minAppVersion?: string) => {
    const entry: any = entries[index];
    entry.version = version; entry.minAppVersion = minAppVersion;
    entry.changelog = `更新至 ${version}`; entry.revision = hash(`revision-${index}-${version}`);
    const zip = new AdmZip();
    zip.addFile('template.json', Buffer.from(JSON.stringify({ name: entry.name, description: '', width: entry.width, height: entry.height, canvasJson: '{"objects":[]}',
      version, author: entry.author, changelog: entry.changelog, minAppVersion })));
    zip.addFile('preview.jpg', image);
    const buffer = zip.toBuffer(); entry.packageSha256 = hash(buffer);
    entry.packageUrl = `${STORE_URL}/releases/download/store-00001/${entry.id}--${entry.revision}.zip`;
    packages.set(entry.packageUrl, buffer); clock += 301000;
  };

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
  assert.deepEqual(results.map(response => response.status), [201, 200]);
  const [added, duplicate] = await Promise.all(results.map(response => response.json()));
  assert.equal(added.id, duplicate.id); assert.equal(downloads, 1);
  const pendingCount = (await get('/template-store?sort=popular')).templates[0];
  assert.equal(pendingCount.downloadCount, 101); assert.equal(pendingCount.countPending, true);
  const saved = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(added.id) as any;
  assert.equal(saved.name, entries[0].name); assert.equal(saved.user_id, 'owner');
  assert.equal(saved.is_public, 0); assert.equal(saved.is_locked, 0); assert.equal(saved.is_default, 0);
  assert.ok(saved.thumbnail_path);
  assert.equal(JSON.parse(saved.metadata_json).author.name, 'HappyQuQu');
  assert.equal((await get('/template-store?sort=popular')).templates[0].version, '1.0.0');
  assert.equal((await get('/templates')).some((item: any) => item.id === added.id), true);
  assert.equal((await get('/template-store?sort=popular')).templates[0].installedTemplateId, added.id);
  const repeat = await install(entries[0].id); assert.equal(repeat.status, 200); assert.equal(downloads, 1);
  assert.equal((await repeat.json()).alreadyInstalled, true);
  const other = await install(entries[0].id, 'other'); assert.equal(other.status, 201); assert.equal(downloads, 2);
  assert.notEqual((await other.json()).id, added.id);

  // New store revisions create a separate editable template rather than overwriting an edited design.
  sqlite.prepare('UPDATE templates SET name = ? WHERE id = ?').run('My edited template', added.id);
  revise(0, '1.1.0');
  assert.equal((await get('/template-store?sort=popular')).templates[0].installedTemplateId, null);
  assert.equal((await get('/template-store?sort=popular')).templates[0].updateMode, 'copy');
  const nextVersion = await update(0, added.id); assert.equal(nextVersion.status, 201);
  const updated = await nextVersion.json(); assert.notEqual(updated.id, added.id);
  assert.equal(updated.action, 'copied');
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

  failCatalog = false;
  // Untouched designs update in place, preserving direct and per-library task references.
  const initial = await (await install(entries[3].id)).json();
  sqlite.prepare('INSERT INTO tasks (id,name,type,template_id,user_id,library_configs) VALUES (?,?,?,?,?,?)')
    .run('store-task', 'Scheduled design', 'manual', initial.id, 'owner', JSON.stringify([{ templateId: initial.id }]));
  revise(3, '1.1.0');
  const state = (await get('/template-store?q=' + encodeURIComponent(entries[3].name))).templates[0];
  assert.equal(state.updateAvailable, true); assert.equal(state.updateMode, 'replace'); assert.equal(state.installedVersion, '1.0.0');
  const replacements = await Promise.all([update(3, initial.id), update(3, initial.id)]);
  const replaced = await replacements[0].json(); assert.equal(replaced.action, 'updated'); assert.equal(replaced.id, initial.id);
  assert.equal((await replacements[1].json()).alreadyInstalled, true);
  const task = sqlite.prepare('SELECT * FROM tasks WHERE id = ?').get('store-task') as any;
  assert.equal(task.template_id, initial.id); assert.equal(JSON.parse(task.library_configs)[0].templateId, initial.id);
  const history = await get(`/templates/${initial.id}/history`);
  assert.equal(history.revisions[0].version, '1.1.0'); assert.equal(history.revisions[1].version, '1.0.0');
  const exported = await fetch(`${base}/templates/${initial.id}/export`, { headers: headers() });
  const exportedData = JSON.parse(new AdmZip(Buffer.from(await exported.arrayBuffer())).readAsText('template.json'));
  assert.equal(exportedData.version, '1.1.0'); assert.equal(exportedData.author.name, 'HappyQuQu');
  assert.equal(exportedData.changelog, '更新至 1.1.0');
  const restored = await fetch(`${base}/templates/${initial.id}/history/${history.revisions[1].id}/restore`, { method: 'POST', headers: headers() });
  assert.equal(restored.status, 200); assert.equal((await restored.json()).version, '1.0.0');

  // Locked designs and legacy records keep originals; incompatible packages cannot download.
  const locked = await (await install(entries[4].id)).json();
  sqlite.prepare('UPDATE templates SET is_locked = 1 WHERE id = ?').run(locked.id);
  revise(4, '1.1.0');
  const lockedCopy = await (await update(4, locked.id)).json(); assert.equal(lockedCopy.action, 'copied'); assert.notEqual(lockedCopy.id, locked.id);
  assert.equal((sqlite.prepare('SELECT is_locked FROM templates WHERE id = ?').get(locked.id) as any).is_locked, 1);
  const legacy = await (await install(entries[5].id)).json();
  sqlite.prepare('UPDATE template_store_installs SET content_hash = NULL, version = NULL WHERE template_id = ?').run(legacy.id);
  revise(5, '1.1.0');
  assert.equal((await (await update(5, legacy.id)).json()).action, 'copied');
  revise(6, '1.1.0', '999.0.0');
  const beforeIncompatible = downloads;
  assert.equal((await get('/template-store?q=' + encodeURIComponent(entries[6].name))).templates[0].compatible, false);
  assert.equal((await install(entries[6].id)).status, 409); assert.equal(downloads, beforeIncompatible);
  assert.equal((await update(4, locked.id, 'other')).status, 404);
  assert.equal((await get('/template-store?q=HappyQuQu')).total, 49);

  // A local save that arrives during the network download must never be overwritten.
  const racing = await (await install(entries[7].id)).json();
  revise(7, '1.1.0');
  duringDownload = () => sqlite.prepare('UPDATE templates SET name = ? WHERE id = ?').run('Saved during download', racing.id);
  const raceResponse = await update(7, racing.id); assert.equal(raceResponse.status, 409);
  duringDownload = undefined;
  assert.equal((sqlite.prepare('SELECT name FROM templates WHERE id = ?').get(racing.id) as any).name, 'Saved during download');
  assert.equal((sqlite.prepare('SELECT version FROM template_store_installs WHERE template_id = ?').get(racing.id) as any).version, '1.0.0');

  // Editing metadata through the normal template API survives future canvas saves and exports.
  const editable = await (await install(entries[8].id)).json();
  const editResponse = await fetch(`${base}/templates/${editable.id}`, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: '2.0.0', author: { name: 'Local creator', url: 'https://example.com' }, description: 'Local description', changelog: 'Local edits' }) });
  assert.equal(editResponse.status, 200);
  const canvasSave = await fetch(`${base}/templates/${editable.id}`, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ canvasJson: '{"objects":[]}' }) });
  assert.equal(canvasSave.status, 200);
  const details = await get(`/templates/${editable.id}`); assert.equal(details.version, '2.0.0'); assert.equal(details.author.name, 'Local creator');
  const clearAuthor = await fetch(`${base}/templates/${editable.id}`, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ author: null, minAppVersion: null }) });
  assert.equal(clearAuthor.status, 200); assert.equal((await get(`/templates/${editable.id}`)).author, undefined);

  // Pre-store local templates retain their IDs and task references; only explicitly chosen backups add a copy.
  const localId = 'de8a5d75-95dc-4e5a-9f05-189576d239ea';
  sqlite.prepare('INSERT INTO templates (id,name,description,canvas_json,width,height,user_id,is_locked,is_default) VALUES (?,?,?,?,?,?,?,0,0)')
    .run(localId, entries[9].name, '', '{"objects":[]}', 900, 600, 'owner');
  const localCount = (sqlite.prepare('SELECT COUNT(*) n FROM templates').get() as any).n;
  const localState = (await get('/template-store?q=' + encodeURIComponent(entries[9].name))).templates.find((item: any) => item.id === entries[9].id);
  assert.equal(localState.localMatch, true); assert.equal(localState.previousTemplateId, localId);
  const linked = await (await install(entries[9].id)).json();
  assert.equal(linked.id, localId); assert.equal(linked.action, 'updated');
  assert.equal((sqlite.prepare('SELECT COUNT(*) n FROM templates').get() as any).n, localCount);
  sqlite.prepare('UPDATE templates SET canvas_json=? WHERE id=?').run('{"objects":[],"background":"#abcdef"}', localId);
  revise(9, '1.1.0');
  const withBackup = await fetch(`${base}/template-store/${entries[9].id}/update`, { method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: localId, revision: entries[9].revision, strategy: 'backup' }) });
  assert.equal(withBackup.status, 200);
  const backedUp = await withBackup.json(); assert.equal(backedUp.id, localId); assert.ok(backedUp.backupId);
  assert.equal((sqlite.prepare('SELECT canvas_json FROM templates WHERE id=?').get(backedUp.backupId) as any).canvas_json, '{"objects":[],"background":"#abcdef"}');
  sqlite.prepare('UPDATE templates SET description=? WHERE id=?').run('Local changes to overwrite', localId);
  const overwrite = await fetch(`${base}/template-store/${entries[9].id}/update`, { method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: localId, revision: entries[9].revision, strategy: 'replace' }) });
  assert.equal(overwrite.status, 200); assert.equal((await overwrite.json()).id, localId);
  assert.equal((sqlite.prepare('SELECT description FROM templates WHERE id=?').get(localId) as any).description, '');

  // A same-name template belonging to another user is never adopted or overwritten.
  const foreignId = '13782d63-844c-42ee-8c20-0b9e09e07c14';
  sqlite.prepare('INSERT INTO templates (id,name,canvas_json,width,height,user_id) VALUES (?,?,?,?,?,?)').run(foreignId, entries[10].name, '{"objects":[]}', 900, 600, 'other');
  assert.equal((await get('/template-store?q=' + encodeURIComponent(entries[10].name))).templates[0].previousTemplateId, null);
  assert.equal((await update(10, foreignId)).status, 404);
  assert.notEqual((await (await install(entries[10].id)).json()).id, foreignId);
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
