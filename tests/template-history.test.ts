import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

test('template saves keep immutable previews, restore safely, enforce locks and ownership, and retain only the latest 50 versions', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express'), sharp = require('sharp');
  const original = process.cwd(), directory = mkdtempSync(join(tmpdir(), 'lcs-template-history-'));
  process.env.JWT_SECRET = 'template-history-test-secret';
  let database: any, router: any, auth: any, errorHandler: any, historyService: any;
  process.chdir(directory);
  try {
    database = await import('../backend/src/config/database.ts');
    await database.initDatabase();
    ({ templateRouter: router } = await import('../backend/src/routes/template.routes.ts'));
    auth = await import('../backend/src/middleware/auth.ts');
    ({ errorHandler } = await import('../backend/src/middleware/errorHandler.ts'));
    historyService = await import('../backend/src/services/templateHistory.service.ts');
  } finally { process.chdir(original); }
  t.after(() => { database.db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const sqlite = database.db.$client;
  for (const id of ['owner','other','admin']) sqlite.prepare('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run(id,id,'fixture',id === 'admin' ? 'admin' : 'user');
  const app = express(); app.use(express.json({ limit: '4mb' })); app.use('/api/templates', router); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.on('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const base = `http://127.0.0.1:${server.address().port}/api/templates`;
  const request = (endpoint: string, method = 'GET', body?: object, user = 'owner') => fetch(base + endpoint, { method,
    headers: { Authorization: `Bearer ${auth.generateToken({ userId: user, username: user, role: user === 'admin' ? 'admin' : 'user' })}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const canvas = (color: string) => JSON.stringify({ version:'6.0.0', width:320, height:180, randomOnGeneration:true, randomBackgroundStyle:'cinema-mesh', background:color, objects:[] });
  const thumbnail = async (color: string) => 'data:image/png;base64,' + (await sharp({ create:{width:320,height:180,channels:3,background:color} }).png().toBuffer()).toString('base64');
  const red = canvas('#ff0000'), blue = canvas('#0000ff');
  const response = await request('', 'POST', { name:'红色版本', canvasJson:red, width:320, height:180, isPublic:true, thumbnail:await thumbnail('#ff0000') });
  assert.equal(response.status,201);
  const created = await response.json() as any, id = created.id;
  const revisions = async () => (await (await request(`/${id}/history`)).json() as any).revisions;
  const initial = (await revisions())[0];
  assert.equal(initial.kind,'save'); assert.equal(initial.canvasJson,undefined);
  const initialImage = Buffer.from(await (await request(`/${id}/history/${initial.id}/thumbnail`)).arrayBuffer());
  assert.equal((await request(`/${id}`, 'PUT', { name:'蓝色版本', canvasJson:blue, thumbnail:await thumbnail('#0000ff') })).status,200);
  const second = (await revisions())[0];
  assert.notEqual(second.id,initial.id);
  assert.deepEqual(Buffer.from(await (await request(`/${id}/history/${initial.id}/thumbnail`)).arrayBuffer()), initialImage);
  assert.notDeepEqual(Buffer.from(await (await request(`/${id}/history/${second.id}/thumbnail`)).arrayBuffer()), initialImage);
  assert.equal((await request(`/${id}/history/${initial.id}/restore`,'POST')).status,200);
  const restored = await (await request(`/${id}`)).json() as any;
  assert.equal(restored.canvasJson,red); assert.equal(restored.name,'红色版本'); assert.equal(restored.isLocked,false);
  assert.equal((await revisions())[0].kind,'restore'); assert.equal((await revisions()).length,3);
  assert.deepEqual(Buffer.from(await (await request(`/${id}/thumbnail`)).arrayBuffer()), initialImage);
  // Public access to the current template does not expose the owner's earlier private designs.
  assert.equal((await request(`/${id}`, 'GET',undefined,'other')).status,200);
  for (const [endpoint, method] of [[`/${id}/history`,'GET'], [`/${id}/history/${initial.id}/thumbnail`,'GET'], [`/${id}/history/${initial.id}/restore`,'POST']])
    assert.equal((await request(endpoint,method,undefined,'other')).status,403);
  assert.equal((await request(`/${id}/history`, 'GET',undefined,'admin')).status,200);
  const copy = await (await request(`/${id}/duplicate`,'POST',undefined,'other')).json() as any;
  assert.equal((await request(`/${copy.id}/history/${initial.id}/restore`,'POST',undefined,'other')).status,404);
  assert.equal((await request(`/${id}/lock`,'POST',{isLocked:true})).status,200);
  const beforeLock = sqlite.prepare('SELECT * FROM templates WHERE id=?').get(id);
  const fileCount = readdirSync(join(directory,'data/thumbnails')).length;
  for (const user of ['owner','admin']) {
    assert.equal((await request(`/${id}`,'PUT',{name:'forged edit',isLocked:false},user)).status,409);
    assert.equal((await request(`/${id}/history/${initial.id}/restore`,'POST',undefined,user)).status,409);
  }
  assert.equal((await revisions()).length,3);
  assert.equal(readdirSync(join(directory,'data/thumbnails')).length,fileCount);
  assert.deepEqual(sqlite.prepare('SELECT * FROM templates WHERE id=?').get(id),beforeLock);
  const lockedCopy = await (await request(`/${id}/duplicate`,'POST')).json() as any;
  assert.equal((await (await request(`/${lockedCopy.id}`)).json() as any).isLocked,false);
  assert.equal((await request(`/${id}/lock`,'POST',{isLocked:false})).status,200);
  // Invalid snapshots fail before replacing the current design or adding history/files.
  const beforeInvalid = sqlite.prepare('SELECT * FROM templates WHERE id=?').get(id);
  const filesBeforeInvalid = readdirSync(join(directory,'data/thumbnails'));
  assert.equal((await request(`/${id}`,'PUT',{name:'invalid',thumbnail:'data:image/png;base64,bm90YW5pbWFnZQ=='})).status,400);
  assert.deepEqual(sqlite.prepare('SELECT * FROM templates WHERE id=?').get(id),beforeInvalid);
  assert.deepEqual(readdirSync(join(directory,'data/thumbnails')),filesBeforeInvalid);
  // Render a preview for API callers that omit it; keep the saved color instead of randomizing.
  assert.equal((await request(`/${id}`,'PUT',{canvasJson:canvas('#00ff00')})).status,200);
  const generatedPreview = Buffer.from(await (await request(`/${id}/thumbnail`)).arrayBuffer());
  const pixel = await sharp(generatedPreview).resize(1,1).raw().toBuffer();
  assert.ok(pixel[1] > 240 && pixel[0] < 20 && pixel[2] < 20);
  // Horizontal templates retain their embedded landscape sample when an API caller omits a thumbnail.
  const wideSample = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#00ff00' } }).png().toBuffer();
  const wideCanvas = JSON.stringify({ width: 320, height: 180, posterSource: 'backdrop', background: '#0000ff', objects: [
    { type: 'Image', posterVar: 'post1', left: 0, top: 0, width: 320, height: 180, src: `data:image/png;base64,${wideSample.toString('base64')}` }
  ] });
  const wideResponse = await request('', 'POST', { name: '横图样张', width: 320, height: 180, canvasJson: wideCanvas });
  assert.equal(wideResponse.status, 201);
  const wide = await wideResponse.json() as any;
  assert.equal(JSON.parse((await (await request(`/${wide.id}`)).json() as any).canvasJson).posterSource, 'backdrop');
  const widePixel = await sharp(Buffer.from(await (await request(`/${wide.id}/thumbnail`)).arrayBuffer())).resize(1,1).raw().toBuffer();
  assert.ok(widePixel[1] > 240 && widePixel[0] < 20 && widePixel[2] < 20, 'history uses the embedded horizontal sample instead of a bundled portrait');
  // Bundled landscape slots keep their individual examples when generating history previews.
  const landscapePreviews: Buffer[] = [];
  for (const number of [1, 9]) {
    const sampledCanvas = JSON.stringify({ width: 320, height: 180, posterSource: 'backdrop', objects: [
      { type: 'Image', posterVar: `post${number}`, left: 0, top: 0, width: 320, height: 180,
        src: `/api/templates/posters/backdrops/${number}.jpg` }
    ] });
    const result = await request('', 'POST', { name: `横图示例 ${number}`, width: 320, height: 180, canvasJson: sampledCanvas });
    assert.equal(result.status, 201);
    const saved = await result.json() as any;
    landscapePreviews.push(Buffer.from(await (await request(`/${saved.id}/thumbnail`)).arrayBuffer()));
  }
  assert.notDeepEqual(landscapePreviews[0], landscapePreviews[1], 'different slots must not all render the old shared backdrop');
  const portraitSample = await sharp({ create: { width: 120, height: 180, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const mixedCanvas = JSON.stringify({ width: 320, height: 180, posterSource: 'backdrop', objects: [
    { type: 'Image', posterVar: 'post1', left: 0, top: 0, width: 160, height: 180, src: `data:image/png;base64,${wideSample.toString('base64')}` },
    { type: 'Image', posterVar: 'post1', artworkSource: 'poster', left: 160, top: 0, width: 160, height: 180, src: `data:image/png;base64,${portraitSample.toString('base64')}` }
  ] });
  const mixedResponse = await request('', 'POST', { name: '横竖混排', width: 320, height: 180, canvasJson: mixedCanvas });
  assert.equal(mixedResponse.status, 201);
  const mixed = await mixedResponse.json() as any;
  const mixedImage = Buffer.from(await (await request(`/${mixed.id}/thumbnail`)).arrayBuffer());
  const mixedPixel = async (left: number) => sharp(mixedImage).extract({ left, top: 100, width: 1, height: 1 }).raw().toBuffer();
  const leftPixel = await mixedPixel(50), rightPixel = await mixedPixel(350);
  assert.ok(leftPixel[1] > 230 && leftPixel[0] < 25);
  assert.ok(rightPixel[0] > 230 && rightPixel[1] < 25, 'history keeps the independent portrait source for the same slot number');
  for (let i=0; i<51; i++) assert.equal((await request(`/${id}`,'PUT',{name:`保存 ${i}`})).status,200);
  const recent = await revisions(); assert.equal(recent.length,50); assert.equal(recent[0].name,'保存 50'); assert.equal(recent[49].name,'保存 1');
  assert.equal((await request(`/${id}/history/${initial.id}/thumbnail`)).status,404);
  assert.equal((await request(`/${id}/history/${initial.id}/restore`,'POST')).status,404);
  assert.equal(existsSync(join(directory,'data/thumbnails',basename(created.thumbnailPath))),false);
  // Restoring the oldest retained record trims that source but the new immutable preview survives.
  assert.equal((await request(`/${id}/history/${recent[49].id}/restore`,'POST')).status,200);
  assert.equal((await revisions()).length,50);
  assert.equal((await request(`/${id}/history/${recent[49].id}/thumbnail`)).status,404);
  assert.equal((await request(`/${id}/thumbnail`)).status,200);
  const beforeRestart = await revisions(); await historyService.initializeTemplateHistory();
  assert.deepEqual(await revisions(),beforeRestart);
  // Initialize an older locked template without rewriting it or creating duplicate baselines.
  sqlite.prepare('INSERT INTO templates (id,name,canvas_json,width,height,user_id,is_locked) VALUES (?,?,?,?,?,?,?)').run('legacy','旧设计',red,320,180,'owner',1);
  const legacyBefore = sqlite.prepare('SELECT * FROM templates WHERE id=?').get('legacy');
  await historyService.initializeTemplateHistory(); await historyService.initializeTemplateHistory();
  const legacyHistory = await (await request('/legacy/history')).json() as any;
  assert.equal(legacyHistory.revisions.length,1); assert.equal(legacyHistory.revisions[0].kind,'baseline');
  assert.equal((await request('/legacy/history/'+legacyHistory.revisions[0].id+'/thumbnail')).status,200);
  assert.deepEqual(sqlite.prepare('SELECT * FROM templates WHERE id=?').get('legacy'),legacyBefore);
  const ownedFiles = sqlite.prepare('SELECT thumbnail_path FROM template_revisions WHERE template_id=?').all(id).map((row:any)=>row.thumbnail_path);
  assert.equal((await request(`/${id}`,'DELETE')).status,200);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM template_revisions WHERE template_id=?').get(id).n,0);
  for (const file of ownedFiles) assert.equal(existsSync(join(directory,'data/thumbnails',basename(file))),false);
  assert.equal((await request(`/${copy.id}/thumbnail`,'GET',undefined,'other')).status,200);
});
