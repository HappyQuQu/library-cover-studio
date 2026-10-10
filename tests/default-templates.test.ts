import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('reference defaults are editable variable layouts, seed once, and enforce template deletion locks for owners and admins', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express'), sharp = require('sharp');
  const directory = mkdtempSync(join(tmpdir(), 'lcs-default-templates-'));
  const original = process.cwd();
  process.env.JWT_SECRET = 'default-template-fixture-jwt-secret';
  let database: any, defaults: any, renderer: any, router: any, auth: any, errorHandler: any;
  process.chdir(directory);
  try {
    database = await import('../backend/src/config/database.ts');
    await database.initDatabase();
    // Simulate an existing installation without lock/default columns.
    database.db.$client.exec('ALTER TABLE templates DROP COLUMN is_locked; ALTER TABLE templates DROP COLUMN is_default;');
    database.db.$client.prepare('INSERT INTO templates (id,name,canvas_json) VALUES (?,?,?)').run('legacy', 'Existing template', '{"objects":[]}');
    await database.initDatabase();
    defaults = await import('../backend/src/services/defaultTemplates.service.ts');
    renderer = await import('../backend/src/services/renderer.service.ts');
    ({ templateRouter: router } = await import('../backend/src/routes/template.routes.ts'));
    auth = await import('../backend/src/middleware/auth.ts');
    ({ errorHandler } = await import('../backend/src/middleware/errorHandler.ts'));
  } finally { process.chdir(original); }
  t.after(() => { database.db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
  const sqlite = database.db.$client;
  assert.equal(sqlite.prepare('SELECT is_locked FROM templates WHERE id = ?').get('legacy').is_locked, 0);
  assert.equal(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get('legacy').canvas_json, '{"objects":[]}');
  for (const [id, role] of [['owner', 'user'], ['other', 'user'], ['admin', 'admin']]) sqlite.prepare('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run(id, id, 'fixture', role);
  sqlite.prepare('INSERT INTO templates (id,name,canvas_json,user_id,is_locked) VALUES (?,?,?,?,?)').run('locked-private', 'Locked private', '{"objects":[]}', 'owner', 1);
  await defaults.seedDefaultTemplates();
  // Existing installations gain exactly three templates, without modifying the saved older layouts.
  const cinematicIds = ['1106', '1107', '1108'].map(suffix => '7de80a91-0d2c-4d9a-8e3a-902c8d24' + suffix);
  const oldDefaults = sqlite.prepare('SELECT * FROM templates WHERE is_default = 1').all().filter((row: any) => !cinematicIds.includes(row.id));
  for (const id of cinematicIds) sqlite.prepare('DELETE FROM templates WHERE id = ?').run(id);
  sqlite.prepare('DELETE FROM system_settings WHERE key = ?').run('templates.defaults.cinematic-three-v1');
  await defaults.seedDefaultTemplates();
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM templates WHERE is_default = 1').get().count, 6);
  for (const row of oldDefaults) assert.deepEqual(sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(row.id), row);
  const customCinematicId = cinematicIds[0];
  sqlite.prepare('UPDATE templates SET name = ? WHERE id = ?').run('My cinematic layout', customCinematicId);
  await defaults.seedDefaultTemplates();
  assert.equal(sqlite.prepare('SELECT name FROM templates WHERE id = ?').get(customCinematicId).name, 'My cinematic layout');
  // A deleted new template is not resurrected on restart.
  const deletedCinematic = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(cinematicIds[2]);
  sqlite.prepare('DELETE FROM templates WHERE id = ?').run(cinematicIds[2]);
  await defaults.seedDefaultTemplates();
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM templates WHERE id = ?').get(cinematicIds[2]).count, 0);
  sqlite.prepare('INSERT INTO templates (id,name,canvas_json,is_default,is_public,is_locked) VALUES (?,?,?,?,?,?)').run(deletedCinematic.id, deletedCinematic.name, deletedCinematic.canvas_json, 1, 1, 1);
  // Upgrade the mistakenly split color/category variants to two layouts, including disabled task selections.
  const fanId = '7de80a91-0d2c-4d9a-8e3a-902c8d241101', wallId = '7de80a91-0d2c-4d9a-8e3a-902c8d241103';
  const originalFanRow = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(fanId);
  const wideFan = JSON.parse(originalFanRow.canvas_json);
  const wideSlots = wideFan.objects.filter((object: any) => object.posterVar);
  assert.deepEqual(wideSlots.map((object: any) => object.angle), [-26, 26, -13, 13, 0]);
  for (const object of wideSlots) {
    const radians = object.angle * Math.PI / 180;
    const halfWidth = (object.width * object.scaleX * Math.abs(Math.cos(radians))
      + object.height * object.scaleY * Math.abs(Math.sin(radians))) / 2;
    assert.ok(object.left - halfWidth >= 32, 'rotated posters keep a safe left margin');
    assert.ok(object.left + halfWidth <= 1888, 'rotated posters keep a safe right margin');
  }
  // Upgrade an existing fan while preserving its chosen artwork, text, palette, and lock.
  const oldFan = structuredClone(wideFan);
  const previousFanPositions = [[285,975,460,-15], [1635,975,460,15], [625,855,520,-8], [1295,855,520,8], [960,786,592,0]];
  oldFan.objects.filter((object: any) => object.posterVar).forEach((object: any, index: number) => {
    const [left, top, size, angle] = previousFanPositions[index];
    Object.assign(object, { left, top, angle, scaleX: size / object.width, scaleY: size / object.width });
  });
  oldFan.objects[0].src = '/custom-fan-artwork.jpg'; oldFan.randomOnGeneration = false;
  oldFan.objects.find((object: any) => object.id === 'primary-title').text = 'My fan title';
  sqlite.prepare('UPDATE templates SET canvas_json = ?, is_locked = 0 WHERE id = ?').run(JSON.stringify(oldFan), fanId);
  sqlite.prepare('DELETE FROM system_settings WHERE key = ?').run('templates.defaults.fan-wide-v1');
  await defaults.seedDefaultTemplates();
  const upgradedFanRow = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(fanId);
  const upgradedFan = JSON.parse(upgradedFanRow.canvas_json);
  assert.equal(upgradedFanRow.is_locked, 0); assert.equal(upgradedFan.randomOnGeneration, false);
  assert.deepEqual(upgradedFan.backgroundImage, oldFan.backgroundImage);
  assert.equal(upgradedFan.objects[0].src, '/custom-fan-artwork.jpg');
  assert.equal(upgradedFan.objects.find((object: any) => object.id === 'primary-title').text, 'My fan title');
  assert.deepEqual(upgradedFan.objects.filter((object: any) => object.posterVar).map((object: any) => [object.left, object.top, object.angle]),
    wideSlots.map((object: any) => [object.left, object.top, object.angle]));
  // Later adjustments survive restarts, and a custom composition is not migrated.
  upgradedFan.objects[0].left += 12;
  sqlite.prepare('UPDATE templates SET canvas_json = ? WHERE id = ?').run(JSON.stringify(upgradedFan), fanId);
  await defaults.seedDefaultTemplates();
  assert.deepEqual(JSON.parse(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get(fanId).canvas_json), upgradedFan);
  sqlite.prepare('DELETE FROM system_settings WHERE key = ?').run('templates.defaults.fan-wide-v1');
  await defaults.seedDefaultTemplates();
  assert.deepEqual(JSON.parse(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get(fanId).canvas_json), upgradedFan);
  sqlite.prepare('UPDATE templates SET canvas_json = ?, is_locked = 1 WHERE id = ?').run(originalFanRow.canvas_json, fanId);
  const fanAlias = '7de80a91-0d2c-4d9a-8e3a-902c8d241102', wallAlias = '7de80a91-0d2c-4d9a-8e3a-902c8d241104';
  const previous = JSON.parse(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get(fanId).canvas_json);
  previous.objects[0].top += 7;
  delete previous.randomBackgroundStyle; previous.randomOnGeneration = false;
  sqlite.prepare('UPDATE templates SET name = ?, canvas_json = ? WHERE id = ?').run('柔彩扇形 · 电影', JSON.stringify(previous), fanId);
  const oldWall = JSON.parse(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get(wallId).canvas_json);
  oldWall.objects = [...oldWall.objects.filter((object: any) => object.posterVar).slice(0, 9).map((object: any, index: number) => ({ ...object, id: `poster-${index + 1}`, posterVar: `post${index + 1}` })), ...oldWall.objects.filter((object: any) => !object.posterVar)];
  oldWall.objects.filter((object: any) => object.posterVar).forEach((object: any, index: number) => {
    const row = Math.floor(index / 3) - 1, column = index % 3 - 1, radians = 17 * Math.PI / 180;
    object.left = 1640 + column * 520 * Math.cos(radians) - row * 770 * Math.sin(radians);
    object.top = 580 + column * 520 * Math.sin(radians) + row * 770 * Math.cos(radians);
    object.scaleX = object.scaleY = 440 / object.width; object.angle = 17;
  });
  Object.assign(oldWall.objects.find((object: any) => object.id === 'primary-title'), { left: 95, top: 450, width: 640, fontSize: 148 });
  Object.assign(oldWall.objects.find((object: any) => object.id === 'secondary-title'), { left: 148, top: 646, width: 570, fontSize: 65 });
  Object.assign(oldWall.objects.find((object: any) => object.id === 'accent'), { left: 98, top: 655, width: 20, height: 66 });
  oldWall.randomOnGeneration = false;
  sqlite.prepare('UPDATE templates SET canvas_json = ? WHERE id = ?').run(JSON.stringify(oldWall), wallId);
  sqlite.prepare('DELETE FROM system_settings WHERE key = ?').run('templates.defaults.wall-seamless-v1');
  for (const id of [fanAlias, wallAlias]) sqlite.prepare('INSERT INTO templates (id,name,canvas_json,is_default,is_public,is_locked) VALUES (?,?,?,?,?,?)').run(id, 'Old variant', JSON.stringify(previous), 1, 1, 1);
  const selections = [{ libraryId: 'anime', templateId: fanAlias, primaryTitle: '动漫', enabled: true }, { libraryId: 'tv', templateId: wallAlias, enabled: false }];
  sqlite.prepare('INSERT INTO tasks (id,name,type,template_id,library_configs,is_enabled) VALUES (?,?,?,?,?,?)').run('migration-task', 'Keep task', 'manual', wallAlias, JSON.stringify(selections), 0);
  sqlite.prepare('INSERT INTO ai_conversations (id,user_id,template_id,messages) VALUES (?,?,?,?)').run('migration-chat', 'owner', fanAlias, '[]');
  sqlite.prepare('DELETE FROM system_settings WHERE key = ?').run('templates.defaults.reference-v2');
  sqlite.prepare('INSERT INTO system_settings (key,value) VALUES (?,?)').run('templates.defaults.reference-v1', 'installed');
  await defaults.seedDefaultTemplates();
  const migratedTask = sqlite.prepare('SELECT * FROM tasks WHERE id = ?').get('migration-task');
  assert.equal(migratedTask.template_id, wallId); assert.equal(migratedTask.is_enabled, 0);
  assert.deepEqual(JSON.parse(migratedTask.library_configs), [{ ...selections[0], templateId: fanId }, { ...selections[1], templateId: wallId }]);
  assert.equal(sqlite.prepare('SELECT template_id FROM ai_conversations WHERE id = ?').get('migration-chat').template_id, fanId);
  const migratedFan = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(fanId);
  assert.equal(migratedFan.name, '柔彩扇形');
  assert.equal(JSON.parse(migratedFan.canvas_json).objects[0].top, previous.objects[0].top);
  const updatedWall = JSON.parse(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get(wallId).canvas_json);
  assert.equal(updatedWall.objects.filter((object: any) => object.posterVar).length, 12);
  for (const slot of updatedWall.objects.filter((object: any) => object.posterVar)) {
    assert.ok(Math.abs(slot.width * slot.scaleX - 404) < 1);
    assert.equal(slot.angle, 0);
  }
  assert.equal(updatedWall.objects.find((object: any) => object.id === 'primary-title').top, 450);
  assert.equal(updatedWall.objects.find((object: any) => object.id === 'secondary-title').fontSize, 80);
  assert.equal(updatedWall.objects.find((object: any) => object.id === 'secondary-title').fitText, true);
  // Upgrade the compact version used by existing installations, including its original typography.
  updatedWall.randomOnGeneration = false;
  updatedWall.objects = [...updatedWall.objects.filter((object: any) => object.posterVar).slice(0, 9).map((object: any, index: number) => ({ ...object, id: `poster-${index + 1}`, posterVar: `post${index + 1}` })), ...updatedWall.objects.filter((object: any) => !object.posterVar)];
  updatedWall.objects.filter((object: any) => object.posterVar).forEach((object: any, index: number) => {
    const row = Math.floor(index / 3) - 1, column = index % 3 - 1, radians = 15 * Math.PI / 180;
    object.left = 1420 + column * 315 * Math.cos(radians) - row * 460 * Math.sin(radians);
    object.top = 540 + column * 315 * Math.sin(radians) + row * 460 * Math.cos(radians);
    object.scaleX = object.scaleY = 280 / object.width; object.angle = 15;
  });
  Object.assign(updatedWall.objects.find((object: any) => object.id === 'primary-title'), { left: 95, top: 445, width: 640, fontSize: 148 });
  sqlite.prepare('UPDATE templates SET canvas_json = ? WHERE id = ?').run(JSON.stringify(updatedWall), wallId);
  sqlite.prepare('DELETE FROM system_settings WHERE key = ?').run('templates.defaults.wall-seamless-v1');
  await defaults.seedDefaultTemplates();
  const balancedWall = JSON.parse(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get(wallId).canvas_json);
  const largeTitle = balancedWall.objects.find((object: any) => object.id === 'primary-title');
  assert.equal(largeTitle.fontSize, 200); assert.equal(largeTitle.left, 64);
  assert.equal(largeTitle.width, 544); assert.equal(largeTitle.fitText, true);
  assert.equal(balancedWall.randomOnGeneration, false);
  assert.ok(balancedWall.objects.filter((object: any) => object.posterVar).every((object: any) => Math.abs(object.width * object.scaleX - 404) < 1));
  const deployedWall = structuredClone(balancedWall);
  deployedWall.objects.filter((object: any) => object.posterVar).forEach((object: any, index: number) => {
    const x = (index % 4 - 1.5) * 400, y = (Math.floor(index / 4) - 1) * 600, radians = 15 * Math.PI / 180;
    object.left = 1280 + x * Math.cos(radians) - y * Math.sin(radians);
    object.top = 540 + x * Math.sin(radians) + y * Math.cos(radians); object.angle = 15;
  });
  deployedWall.objects[0].src = '/custom-artwork.jpg';
  deployedWall.objects.find((object: any) => object.id === 'primary-title').text = 'My title';
  sqlite.prepare('UPDATE templates SET name = ?, canvas_json = ?, is_locked = 0 WHERE id = ?').run('倾斜海报墙', JSON.stringify(deployedWall), wallId);
  sqlite.prepare('DELETE FROM system_settings WHERE key = ?').run('templates.defaults.wall-variants-v1');
  await defaults.seedDefaultTemplates();
  const upright = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(wallId);
  const uprightCanvas = JSON.parse(upright.canvas_json);
  assert.equal(upright.name, '直列海报墙'); assert.equal(upright.is_locked, 0);
  assert.ok(uprightCanvas.objects.filter((object: any) => object.posterVar).every((object: any) => object.angle === 0));
  assert.equal(uprightCanvas.objects[0].src, '/custom-artwork.jpg');
  assert.equal(uprightCanvas.objects.find((object: any) => object.id === 'primary-title').text, 'My title');
  assert.equal(uprightCanvas.randomOnGeneration, false);
  assert.equal(sqlite.prepare('SELECT template_id FROM tasks WHERE id = ?').get('migration-task').template_id, wallId);
  const referenceIdForFraming = '7de80a91-0d2c-4d9a-8e3a-902c8d241105';
  // Restore both layouts deployed during the recent framing changes, including temporary edge cards.
  for (const layout of ['compact', 'aligned']) {
    const previous = JSON.parse(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get(referenceIdForFraming).canvas_json);
    previous.objects.filter((object: any) => object.posterVar).forEach((object: any, index: number) => {
      const column = index % 3 - 1, row = Math.floor(index / 3) - 1;
      const x = column * 310, y = row * 440, radians = 15 * Math.PI / 180;
      object.left = layout === 'compact' ? 1340 + x * Math.cos(radians) - y * Math.sin(radians) : 1490 + column * 340;
      object.top = layout === 'compact' ? 540 + x * Math.sin(radians) + y * Math.cos(radians)
        : column === 1 ? 550 + row * 440 : 540 + row * 450 + column * 30;
      object.scaleX = object.scaleY = 280 / object.width;
    });
    previous.randomOnGeneration = false;
    previous.objects.find((object: any) => object.id === 'primary-title').text = 'Keep my title';
    previous.objects[0].src = '/keep-my-poster.jpg';
    if (layout === 'compact') previous.objects.unshift({ ...previous.objects[0], id: 'poster-edge-1', left: 1900, top: 400 });
    sqlite.prepare('UPDATE templates SET canvas_json = ?, is_locked = 0 WHERE id = ?').run(JSON.stringify(previous), referenceIdForFraming);
    sqlite.prepare('DELETE FROM system_settings WHERE key = ?').run('templates.defaults.wall-reference-original-v1');
    await defaults.seedDefaultTemplates();
    const row = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(referenceIdForFraming);
    const restored = JSON.parse(row.canvas_json);
    assert.equal(row.is_locked, 0); assert.equal(restored.randomOnGeneration, false);
    assert.equal(restored.objects.filter((object: any) => object.posterVar).length, 9);
    assert.ok(restored.objects.every((object: any) => !object.id?.startsWith('poster-edge-')));
    assert.equal(restored.objects[0].src, '/keep-my-poster.jpg');
    assert.equal(restored.objects.find((object: any) => object.id === 'primary-title').text, 'Keep my title');
    for (const [index, object] of restored.objects.filter((object: any) => object.posterVar).entries()) {
      const column = index % 3 - 1, gridRow = Math.floor(index / 3) - 1, radians = 15 * Math.PI / 180;
      assert.ok(Math.abs(object.width * object.scaleX - 420) < 1);
      assert.ok(Math.abs(object.left - (1465 + column * 450 * Math.cos(radians) - gridRow * 660 * Math.sin(radians))) < .01);
      assert.ok(Math.abs(object.top - (650 + column * 450 * Math.sin(radians) + gridRow * 660 * Math.cos(radians))) < .01);
    }
  }
  // Once restored, later manual design edits survive restarts.
  const restored = JSON.parse(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get(referenceIdForFraming).canvas_json);
  restored.objects[0].top += 18; restored.randomOnGeneration = true;
  sqlite.prepare('UPDATE templates SET canvas_json = ? WHERE id = ?').run(JSON.stringify(restored), referenceIdForFraming);
  await defaults.seedDefaultTemplates();
  assert.equal(JSON.parse(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get(referenceIdForFraming).canvas_json).objects[0].top, restored.objects[0].top);
  // Deleting the new reference is also respected across restarts.
  const referenceId = '7de80a91-0d2c-4d9a-8e3a-902c8d241105';
  const referenceRow = sqlite.prepare('SELECT * FROM templates WHERE id = ?').get(referenceId);
  sqlite.prepare('DELETE FROM templates WHERE id = ?').run(referenceId);
  await defaults.seedDefaultTemplates();
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM templates WHERE id = ?').get(referenceId).count, 0);
  sqlite.prepare('INSERT INTO templates (id,name,canvas_json,is_default,is_public,is_locked) VALUES (?,?,?,?,?,?)').run(referenceId, referenceRow.name, referenceRow.canvas_json, 1, 1, 1);
  sqlite.prepare('UPDATE templates SET is_locked = 1 WHERE id = ?').run(wallId);
  // Restart never resets subsequent edits to the compact layout.
  balancedWall.randomOnGeneration = true;
  balancedWall.objects[0].left += 25;
  sqlite.prepare('UPDATE templates SET canvas_json = ? WHERE id = ?').run(JSON.stringify(balancedWall), wallId);
  await defaults.seedDefaultTemplates();
  assert.equal(JSON.parse(sqlite.prepare('SELECT canvas_json FROM templates WHERE id = ?').get(wallId).canvas_json).objects[0].left, balancedWall.objects[0].left);
  const builtin = sqlite.prepare('SELECT * FROM templates WHERE is_default = 1').all();
  assert.equal(builtin.length, 6);
  for (const template of builtin) {
    assert.equal(template.is_locked, 1); assert.equal(template.is_public, 1);
    const canvas = JSON.parse(template.canvas_json);
    assert.equal(canvas.randomOnGeneration, true);
    assert.ok(['soft-mesh', 'muted-wall', 'cinema-mesh'].includes(canvas.randomBackgroundStyle));
    assert.deepEqual(canvas.objects.filter((o: any) => o.textVar).map((o: any) => o.textVar), ['{{primary_title}}', '{{secondary_title}}']);
    const slots = canvas.objects.filter((o: any) => o.posterVar);
    assert.ok([0, 1, 3, 5, 9, 12].includes(slots.length));
    assert.equal(new Set(slots.map((o: any) => o.posterVar)).size, slots.length <= 3 ? (slots.length ? 1 : 0) : slots.length === 5 ? 5 : 9);
    const thumbnail = await sharp(readFileSync(join(directory, 'data/thumbnails', template.id + '.jpg'))).metadata();
    assert.equal(thumbnail.width, 480); assert.equal(thumbnail.height, 270);
  }
  const definitions = await defaults.buildDefaultTemplates();
  if (process.env.LCS_TEMPLATE_PROOFS_DIR) {
    mkdirSync(process.env.LCS_TEMPLATE_PROOFS_DIR, { recursive: true });
    for (const [i, template] of definitions.entries()) {
      const image = await renderer.renderLibraryCover(JSON.stringify(template.canvas), { title: template.primaryTitle, primaryTitle: template.primaryTitle, secondaryTitle: template.secondaryTitle }, template.posterBuffers, { width: 1920, height: 1080 });
      writeFileSync(join(process.env.LCS_TEMPLATE_PROOFS_DIR, `default-template-${i + 1}.png`), image);
    }
  }
  const app = express(); app.use(express.json()); app.use('/api/templates', router); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.on('listening', r));
  t.after(() => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }));
  const base = `http://127.0.0.1:${server.address().port}/api/templates`;
  const headers = (id: string) => ({ Authorization: `Bearer ${auth.generateToken({ userId: id, username: id, role: id === 'admin' ? 'admin' : 'user' })}`, 'Content-Type': 'application/json' });
  const request = (id: string, endpoint: string, method = 'GET', body?: object) => fetch(base + endpoint, { method, headers: headers(id), ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await fetch(base + '/locked-private', { method: 'DELETE' })).status, 401);
  for (const viewer of ['owner', 'admin']) {
    const response = await request(viewer, '/locked-private', 'DELETE');
    assert.equal(response.status, 409); assert.match(await response.text(), /TEMPLATE_LOCKED/);
  }
  assert.equal((await request('other', '/locked-private', 'DELETE')).status, 403);
  assert.equal((await request('other', '/locked-private/lock', 'POST', { isLocked: false })).status, 403);
  for (const route of ['/locked-private', '/locked-private/export']) assert.equal((await request('other', route)).status, 403);
  assert.equal((await request('other', '/locked-private/duplicate', 'POST')).status, 403);
  // Locked templates reject editing, including a forged unlock in the save payload.
  assert.equal((await request('owner', '/locked-private', 'PUT', { name: 'Edited but locked', isLocked: false })).status, 409);
  assert.equal((await request('admin', '/locked-private', 'PUT', { name: 'Admin edit' })).status, 409);
  assert.equal(sqlite.prepare('SELECT is_locked FROM templates WHERE id = ?').get('locked-private').is_locked, 1);
  assert.equal((await request('owner', '/locked-private/lock', 'POST', { isLocked: 'false' })).status, 400);
  assert.equal((await request('owner', '/locked-private/lock', 'POST', { isLocked: false })).status, 200);
  assert.equal((await request('owner', '/locked-private', 'DELETE')).status, 200);
  const templateId = builtin[0].id;
  const visible = await (await request('other', '')).json() as any[];
  const shared = visible.find(item => item.id === templateId);
  assert.equal(shared.isDefault, true); assert.equal(shared.isLocked, true); assert.equal(shared.canManage, false);
  assert.equal((await request('other', `/${templateId}/lock`, 'POST', { isLocked: false })).status, 403);
  assert.equal((await request('admin', `/${templateId}`, 'DELETE')).status, 409);
  const duplicate = await (await request('other', `/${templateId}/duplicate`, 'POST')).json() as any;
  const copy = await (await request('other', `/${duplicate.id}`)).json() as any;
  assert.equal(copy.isLocked, false); assert.equal(copy.isDefault, false); assert.equal(copy.canManage, true);
  assert.equal(copy.canvasJson, builtin[0].canvas_json);
  assert.equal((await request('other', `/${duplicate.id}/thumbnail`)).status, 200);
  // Restarts preserve edits and deliberate unlock/delete actions instead of resurrecting templates.
  sqlite.prepare('UPDATE templates SET name = ? WHERE id = ?').run('Customized default', templateId);
  await defaults.seedDefaultTemplates();
  assert.equal(sqlite.prepare('SELECT name FROM templates WHERE id = ?').get(templateId).name, 'Customized default');
  assert.equal((await request('admin', `/${templateId}/lock`, 'POST', { isLocked: false })).status, 200);
  assert.equal((await request('admin', `/${templateId}`, 'DELETE')).status, 200);
  await defaults.seedDefaultTemplates();
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM templates WHERE id = ?').get(templateId).count, 0);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM templates WHERE is_default = 1').get().count, 5);
});
