import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, unlinkSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

test('portable fonts survive export, manual and store import, deduplication and name collisions without altering existing fonts', async t => {
  t.mock.method(console, 'error', () => {});
  const directory = mkdtempSync(join(tmpdir(), 'lcs-fonts-'));
  process.env.LCS_DATA_DIR = directory;
  process.env.JWT_SECRET = 'template-fonts-test';
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express'), AdmZip = require('adm-zip');
  const axios = (await import(require.resolve('axios/package.json').replace(/package\.json$/, 'index.js'))).default;
  const { GlobalFonts } = require('@napi-rs/canvas');
  const database = await import('../backend/src/config/database.ts');
  await database.initDatabase();
  t.after(() => { database.db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const { FONTS_DIR } = await import('../backend/src/config/paths.ts');
  const fontService = await import('../backend/src/services/templateFonts.service.ts');
  const { readTemplatePackage } = await import('../backend/src/services/templatePackage.service.ts');
  const { templateRouter } = await import('../backend/src/routes/template.routes.ts');
  const { templateStoreRouter } = await import('../backend/src/routes/templateStore.routes.ts');
  const { fontRouter } = await import('../backend/src/routes/font.routes.ts');
  const { errorHandler } = await import('../backend/src/middleware/errorHandler.ts');
  const auth = await import('../backend/src/middleware/auth.ts');
  const { STORE_CATALOG_URL, STORE_URL } = await import('../backend/src/services/templateStore.service.ts');
  database.db.$client.prepare('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run('reader', 'reader', 'unused', 'user');
  const app = express();
  app.use(express.json()); app.use('/api/templates', templateRouter); app.use('/api/fonts', fontRouter); app.use('/api/template-store', templateStoreRouter); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = { Authorization: `Bearer ${auth.generateToken({ userId: 'reader', username: 'reader', role: 'user' })}` };
  const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
  const first = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'].find(existsSync)!;
  const second = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'].find(existsSync)!;
  assert.ok(first && second, 'A real regular and bold font are needed for rendering validation');
  const a = readFileSync(first), b = readFileSync(second), family = 'Portable-Test-Font';
  const canvas = JSON.stringify({ background: '#202020', objects: [{ type: 'text', text: 'Portable', left: 20, top: 20, width: 400, height: 100, fontSize: 40, fontFamily: family,
    styles: { 0: { 1: { fontFamily: family } } } }, { type: 'group', objects: [{ type: 'text', text: 'nested', fontFamily: family }] }] });
  const source = join(FONTS_DIR, `1700000000000-${family}.ttf`);
  writeFileSync(source, a);
  writeFileSync(join(FONTS_DIR, '1700000000001-Unused.ttf'), b);
  symlinkSync(first, join(FONTS_DIR, '1700000000002-Linked.ttf'));
  const create = await fetch(base + '/templates', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Portable', width: 900, height: 600, canvasJson: canvas }) });
  assert.equal(create.status, 201);
  const id = (await create.json()).id;
  const exportResponse = await fetch(`${base}/templates/${id}/export`, { headers });
  assert.equal(exportResponse.status, 200);
  const exported = Buffer.from(await exportResponse.arrayBuffer());
  const parsed = readTemplatePackage(exported);
  assert.equal(parsed.fonts.length, 1);
  assert.equal(parsed.fonts[0].family, family);
  assert.equal(parsed.fonts[0].sha256, hash(a));
  assert.deepEqual(parsed.fonts[0].buffer, a);
  assert.equal(new AdmZip(exported).getEntries().length, 3, 'Unused fonts and symbolic links are not exported');
  assert.ok(GlobalFonts.has(family), 'The rendering engine registered the uploaded alias');
  unlinkSync(source);
  async function upload(buffer: Buffer) {
    const form = new FormData(); form.append('file', new Blob([buffer], { type: 'application/zip' }), 'portable.zip');
    return fetch(`${base}/templates/import`, { method: 'POST', headers, body: form });
  }
  const imported = await upload(exported);
  assert.equal(imported.status, 201);
  const importedResult = await imported.json();
  assert.equal(importedResult.fonts[0].action, 'installed');
  const list = await (await fetch(base + '/fonts', { headers })).json();
  assert.ok(list.fonts.some((font: any) => font.name === importedResult.fonts[0].name));
  assert.ok(!list.fonts.some((font: any) => font.name === 'Linked'));
  const installedFile = join(FONTS_DIR, importedResult.fonts[0].filename);
  assert.deepEqual(readFileSync(installedFile), a);
  const repeat = await (await upload(exported)).json();
  assert.equal(repeat.fonts[0].action, 'reused');
  assert.equal(repeat.fonts[0].filename, importedResult.fonts[0].filename);
  function packageWith(buffer: Buffer, options: { corruptHash?: boolean; badPreview?: boolean; family?: string } = {}) {
    const zip = new AdmZip();
    const selectedFamily = options.family || family;
    const data = { name: 'Portable Store', width: 900, height: 600, canvasJson: canvas.replaceAll(family, selectedFamily),
      fonts: [{ family: selectedFamily, file: `fonts/${hash(buffer)}.ttf`, sha256: options.corruptHash ? '0'.repeat(64) : hash(buffer) }] };
    zip.addFile('template.json', Buffer.from(JSON.stringify(data)));
    zip.addFile(data.fonts[0].file, buffer);
    if (options.badPreview) zip.addFile('preview.jpg', Buffer.from('broken preview'));
    return zip.toBuffer();
  }
  // Remove the unused bold font so the imported conflicting family must get its own alias.
  unlinkSync(join(FONTS_DIR, '1700000000001-Unused.ttf'));
  const conflict = await upload(packageWith(b));
  assert.equal(conflict.status, 201);
  const changed = await conflict.json();
  assert.notEqual(changed.fonts[0].name, family);
  assert.deepEqual(readFileSync(installedFile), a, 'Existing font bytes are never overwritten');
  const changedTemplate = await (await fetch(`${base}/templates/${changed.id}`, { headers })).json();
  const changedCanvas = JSON.parse(changedTemplate.canvasJson);
  assert.equal(changedCanvas.objects[0].fontFamily, changed.fonts[0].name);
  assert.equal(changedCanvas.objects[0].styles[0][1].fontFamily, changed.fonts[0].name);
  assert.equal(changedCanvas.objects[1].objects[0].fontFamily, changed.fonts[0].name);
  assert.ok(GlobalFonts.has(changed.fonts[0].name), 'Imported font is available during thumbnail rendering');
  const aliasExport = readTemplatePackage(Buffer.from(await (await fetch(`${base}/templates/${changed.id}/export`, { headers })).arrayBuffer()));
  assert.equal(aliasExport.fonts[0].family, changed.fonts[0].name);
  assert.deepEqual(aliasExport.fonts[0].buffer, b);
  const originalFontNames = fontService.customFonts().map(font => font.filename);
  const corrupted = await upload(packageWith(a, { corruptHash: true }));
  assert.equal(corrupted.status, 400);
  const third = Buffer.concat([a, Buffer.from('another version')]);
  const failed = await upload(packageWith(third, { badPreview: true, family: 'Rollback-Font' }));
  assert.equal(failed.status, 400);
  assert.deepEqual(fontService.customFonts().map(font => font.filename), originalFontNames, 'Failed template saves roll back newly installed fonts');
  const traversal = new AdmZip(packageWith(a));
  traversal.addFile('safe/escape.ttf', a);
  const traversalBytes = Buffer.from(traversal.toBuffer().toString('latin1').replaceAll('safe/escape.ttf', '../x/escape.ttf'), 'latin1');
  assert.throws(() => readTemplatePackage(traversalBytes, false));
  for (const alter of [
    (zip: any) => zip.addFile('fonts/unlisted.ttf', a),
    (zip: any) => zip.deleteFile(`fonts/${hash(a)}.ttf`),
    (zip: any) => zip.addFile('notes.txt', Buffer.alloc(5 * 1024 * 1024 + 1))
  ]) {
    const zip = new AdmZip(packageWith(a)); alter(zip);
    assert.throws(() => readTemplatePackage(zip.toBuffer(), false));
  }
  const storeZip = new AdmZip(packageWith(b));
  storeZip.addFile('preview.jpg', readFileSync(new URL('../backend/src/template/poster/1.jpg', import.meta.url)));
  const buffer = storeZip.toBuffer(), storeId = hash('portable-store'), revision = hash('portable-revision');
  const entry = { id: storeId, revision, name: 'Portable Store', description: '', width: 900, height: 600, folder: 'portable',
    previewUrl: `https://raw.githubusercontent.com/HappyQuQu/library-cover-store/${'a'.repeat(40)}/portable/preview.jpg`,
    packageUrl: `${STORE_URL}/releases/download/store-00001/${storeId}--${revision}.zip`, packageSha256: hash(buffer), downloadCount: 0 };
  const adapter = axios.defaults.adapter;
  t.after(() => { axios.defaults.adapter = adapter; });
  axios.defaults.adapter = async (config: any) => ({ config, status: 200, statusText: 'OK', headers: {}, data: config.url === STORE_CATALOG_URL
    ? { version: 1, repository: 'HappyQuQu/library-cover-store', generatedAt: new Date().toISOString(), templates: [entry] } : buffer });
  const store = await fetch(`${base}/template-store/${storeId}/install`, { method: 'POST', headers });
  assert.equal(store.status, 201);
  const fromStore = await store.json();
  assert.equal(fromStore.fonts[0].action, 'reused');
  assert.equal(fromStore.fonts[0].name, changed.fonts[0].name);
  assert.deepEqual(readFileSync(installedFile), a);
  assert.deepEqual(fontService.customFonts().map(font => font.filename), originalFontNames);
});
