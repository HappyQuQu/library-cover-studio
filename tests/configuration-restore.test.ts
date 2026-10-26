import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('version 1 configuration exports restore through admin-only preview and atomic merge APIs', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url)), express = require('express');
  const directory = mkdtempSync(join(tmpdir(), 'lcs-config-restore-'));
  process.env.LCS_DATA_DIR = directory;
  process.env.JWT_SECRET = 'configuration-restore-fixture'; process.env.ENCRYPTION_KEY = 'configuration-fixture-key';
  const database = await import('../backend/src/config/database.ts'); await database.initDatabase();
  const { settingsRouter } = await import('../backend/src/routes/settings.routes.ts');
  const { errorHandler } = await import('../backend/src/middleware/errorHandler.ts');
  const { generateToken } = await import('../backend/src/middleware/auth.ts');
  const { encrypt, decrypt } = await import('../backend/src/utils/crypto.ts');
  const { MAX_CONFIGURATION_BYTES } = await import('../backend/src/services/configurationRestore.service.ts');
  const sqlite = database.db.$client;
  const app = express(); app.use(express.json()); app.use('/settings', settingsRouter); app.use(errorHandler);
  const listener = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => listener.on('listening', resolve));
  const base = `http://127.0.0.1:${listener.address().port}/settings`;
  t.after(async () => { listener.closeAllConnections(); await new Promise<void>(resolve => listener.close(() => resolve())); sqlite.close(); rmSync(directory, { recursive: true, force: true }); });
  const tokens: Record<string, string> = {};
  for (const [userId, role] of [['admin', 'admin'], ['other-admin', 'admin'], ['user', 'user']]) {
    sqlite.prepare('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run(userId, userId, 'fixture', role);
    tokens[userId] = generateToken({ userId, username: userId, role });
  }
  for (const [id, width, height] of [['a', 320, 180], ['b', 640, 360]] as const) sqlite.prepare('INSERT INTO templates (id,name,canvas_json,width,height,user_id,is_public,is_default,thumbnail_path,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, '模板 ' + id, '{"objects":[]}', width, height, 'user', 1, 1, '/unsafe/original/thumbnail.png', '{"version":"2.0.0","author":{"name":"Original"}}');
  sqlite.prepare('INSERT INTO media_servers (id,name,type,url,api_key_encrypted,user_id) VALUES (?,?,?,?,?,?)')
    .run('server', 'Jellyfin fixture', 'jellyfin', 'http://127.0.0.1:1/?api_key=removed', encrypt('keep-existing-server-key'), 'user');
  sqlite.prepare('INSERT INTO ai_providers (id,name,type,api_url,api_key_encrypted,model,is_default,is_active,user_id,model_capabilities) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('ai', 'AI fixture', 'openai', 'https://example.invalid/v1?token=removed', encrypt('keep-existing-ai-key'), 'model', 1, 1, 'user', '{}');
  const config = { libraryId: 'set', libraryName: '科幻合集', libraryType: 'collection', templateId: 'a', templateMode: 'random', templateIds: ['a', 'b'], avoidRepeat: false, primaryTitle: '科幻', secondaryTitle: 'SCI-FI', sortBy: 'Random', enabled: true };
  sqlite.prepare('INSERT INTO tasks (id,name,type,server_id,user_id,library_configs,is_enabled,cron_expression,last_run_at,next_run_at,options) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run('task', 'Random collection', 'scheduled', 'server', 'user', JSON.stringify([config]), 0, '7 4 * * 1', '2020-01-01', '2030-01-01', '{"randomBackground":true}');
  sqlite.prepare('INSERT INTO tasks (id,name,type,server_id,user_id,template_id,library_ids,is_enabled) VALUES (?,?,?,?,?,?,?,?)')
    .run('legacy', 'Legacy task', 'manual', 'server', 'user', 'b', '["movies"]', 0);
  const snapshot = () => Object.fromEntries(['users', 'templates', 'media_servers', 'ai_providers', 'tasks', 'system_settings', 'template_revisions', 'task_logs', 'task_template_state'].map(table => [table, sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const upload = (path: string, bytes: Buffer, fields: Record<string, string> = {}, user = 'admin') => {
    const data = new FormData(); data.append('backup', new Blob([new Uint8Array(bytes)]), 'backup.json');
    for (const [key, value] of Object.entries({ restoreSettings: 'false', ...fields })) data.append(key, value);
    return fetch(base + path, { method: 'POST', headers: user ? { Authorization: `Bearer ${tokens[user] || user}` } : {}, body: data });
  };
  const getExport = () => fetch(base + '/export', { headers: { Authorization: `Bearer ${tokens.admin}` } }).then(response => response.json()) as Promise<any>;
  const backup = await getExport();
  assert.equal(backup.version, 1);
  assert.doesNotMatch(JSON.stringify(backup), /keep-existing|apiKeyEncrypted|password_hash|api_key=removed|token=removed/);
  const bytes = Buffer.from(JSON.stringify(backup));
  const before = snapshot();
  for (const user of ['', 'user']) for (const path of ['/import/preview', '/import']) assert.equal((await upload(path, bytes, {}, user)).status, user ? 403 : 401);
  assert.deepEqual(snapshot(), before);
  const previewResponse = await upload('/import/preview', bytes); assert.equal(previewResponse.status, 200);
  const preview: any = await previewResponse.json();
  assert.deepEqual(preview.counts, { templates: 2, servers: 1, tasks: 2, aiProviders: 1, settings: 0 });
  assert.deepEqual(snapshot(), before, 'preview is read-only');
  assert.equal((await upload('/import', bytes, { token: preview.token })).status, 409, 'confirmation required');
  assert.equal((await upload('/import', Buffer.concat([bytes, Buffer.from(' ')]), { token: preview.token, confirm: 'true' })).status, 409);
  assert.equal((await upload('/import', bytes, { token: preview.token, confirm: 'true', restoreSettings: 'true' })).status, 409);
  assert.equal((await upload('/import', bytes, { token: preview.token, confirm: 'true' }, 'other-admin')).status, 409);
  assert.equal((await upload('/import/preview', bytes, {}, preview.token)).status, 401, 'preview token is not an access token');
  assert.deepEqual(snapshot(), before);
  const changed = structuredClone(backup);
  // Never import credentials, account IDs, filesystem paths or publication flags from a file.
  changed.servers[0].apiKeyEncrypted = 'attacker-key'; changed.aiProviders[0].apiKeyEncrypted = 'attacker-key';
  changed.users = [{ id: 'injected-user', role: 'admin' }];
  changed.settings['rendering.concurrency'] = '2';
  const changedBytes = Buffer.from(JSON.stringify(changed));
  const ready: any = await (await upload('/import/preview', changedBytes)).json();
  const importedResponse = await upload('/import', changedBytes, { token: ready.token, confirm: 'true' }); assert.equal(importedResponse.status, 201);
  const after: any = snapshot();
  for (const table of ['users', 'templates', 'media_servers', 'ai_providers', 'tasks', 'system_settings']) {
    for (const row of before[table] as any[]) assert.ok(after[table].some((candidate: any) => JSON.stringify(candidate) === JSON.stringify(row)), `${table}: existing row preserved`);
  }
  assert.deepEqual(after.system_settings, before.system_settings, 'settings opt-out is respected');
  assert.equal(after.templates.length, 4); assert.equal(after.tasks.length, 4);
  const importedTemplates = after.templates.filter((row: any) => row.user_id === 'admin');
  assert(importedTemplates.every((row: any) => !['a', 'b'].includes(row.id) && !row.is_public && !row.is_default && row.thumbnail_path === null));
  assert(importedTemplates.every((row: any) => row.metadata_json.includes('Original')));
  const importedServer = after.media_servers.find((row: any) => row.user_id === 'admin');
  assert.equal(decrypt(importedServer.api_key_encrypted), ''); assert.doesNotMatch(importedServer.url, /api_key/);
  const importedAI = after.ai_providers.find((row: any) => row.user_id === 'admin');
  assert.equal(importedAI.api_key_encrypted, null); assert.equal(importedAI.is_active, 0); assert.equal(importedAI.is_default, 0);
  const importedTasks = after.tasks.filter((row: any) => row.user_id === 'admin');
  assert(importedTasks.every((row: any) => row.server_id === importedServer.id && row.is_enabled === 0 && row.last_run_at === null && row.next_run_at === null));
  const restoredConfig = JSON.parse(importedTasks.find((row: any) => row.name === 'Random collection').library_configs)[0];
  assert.equal(restoredConfig.libraryId, 'set'); assert.equal(restoredConfig.primaryTitle, '科幻'); assert.equal(restoredConfig.avoidRepeat, false);
  assert.deepEqual(restoredConfig.templateIds, importedTemplates.map((row: any) => row.id));
  assert.equal(restoredConfig.templateId, importedTemplates[0].id);
  assert.equal(importedTasks.find((row: any) => row.name === 'Legacy task').template_id, importedTemplates[1].id);
  assert.deepEqual(JSON.parse(importedTasks.find((row: any) => row.name === 'Legacy task').library_ids), ['movies']);
  for (const table of ['template_revisions', 'task_logs', 'task_template_state']) assert.deepEqual(after[table], before[table]);

  await t.test('obsolete inactive template selections do not prevent restoring an otherwise valid task', async () => {
    const data = structuredClone(backup);
    data.tasks = [{ ...data.tasks[0], name: 'Stale inactive choices', templateId: 'removed-unused-legacy-template', libraryConfigs: JSON.stringify([
      { ...config, templateId: 'removed-unused-fixed-template' },
      { ...config, libraryId: 'disabled', enabled: false, templateIds: ['a', 'removed-template'] },
      { ...config, libraryId: 'fixed', templateMode: 'fixed', templateIds: ['removed-unused-pool-template'] }
    ]) }];
    const payload = Buffer.from(JSON.stringify(data));
    const plan: any = await (await upload('/import/preview', payload)).json();
    assert.equal((await upload('/import', payload, { token: plan.token, confirm: 'true' })).status, 201);
    const row: any = sqlite.prepare('SELECT * FROM tasks WHERE name=?').get('Stale inactive choices');
    const restored = JSON.parse(row.library_configs);
    assert.equal(row.template_id, null); assert.equal(restored[0].templateId, '');
    assert.equal(restored[1].templateIds.length, 1); assert.deepEqual(restored[2].templateIds, []);
  });
  await t.test('settings opt-in and re-exported copies remain restorable', async () => {
    const plan: any = await (await upload('/import/preview', changedBytes, { restoreSettings: 'true' })).json();
    assert(plan.counts.settings > 0);
    assert.equal((await upload('/import', changedBytes, { restoreSettings: 'true', confirm: 'true', token: plan.token })).status, 201);
    assert.equal(sqlite.prepare('SELECT value FROM system_settings WHERE key=?').get('rendering.concurrency')!.value, '2');
    assert.equal((await upload('/import/preview', Buffer.from(JSON.stringify(await getExport())))).status, 200);
  });
  await t.test('invalid versions, references, schedules, JSON and credentials URLs cannot partially restore', async () => {
    const cases = [Buffer.from('not JSON'), ...[
      { ...backup, version: 2 }, { ...backup, tasks: [{ ...backup.tasks[0], serverId: 'missing' }] },
      { ...backup, templates: [backup.templates[0], backup.templates[0]] },
      { ...backup, templates: [{ ...backup.templates[0], canvasJson: '[]' }] },
      { ...backup, templates: [{ ...backup.templates[0], canvasJson: 'broken JSON' }] },
      { ...backup, templates: [{ ...backup.templates[0], width: 999999 }] },
      { ...backup, tasks: [{ ...backup.tasks[0], libraryConfigs: JSON.stringify([{ ...config, templateIds: ['missing'] }]) }] },
      { ...backup, templates: [backup.templates[0], { ...backup.templates[1], width: 300 }] },
      { ...backup, servers: [{ ...backup.servers[0], url: 'file:///private/key' }] },
      { ...backup, servers: [{ ...backup.servers[0], url: 'bad URL' }] },
      { ...backup, servers: [{ ...backup.servers[0], url: 'https://user:secret@example.invalid' }] },
      { ...backup, tasks: [{ ...backup.tasks[0], cronExpression: '* bad * * *' }] },
      { ...backup, settings: { 'github.token': 'must-not-import' } },
      { ...backup, settings: { 'scheduler.timezone': 'invalid/timezone' } },
      { version: 1, templates: [] }
    ].map(value => Buffer.from(JSON.stringify(value)))];
    const beforeFailures = snapshot();
    for (const bytes of cases) assert.equal((await upload('/import/preview', bytes)).status, 400);
    assert.deepEqual(snapshot(), beforeFailures);
    assert.equal((await upload('/import/preview', Buffer.alloc(MAX_CONFIGURATION_BYTES + 1))).status, 413);
    assert.deepEqual(snapshot(), beforeFailures);
  });
  await t.test('a write failure rolls back all imported records and settings', async () => {
    const snapshotBefore = snapshot();
    const plan: any = await (await upload('/import/preview', bytes, { restoreSettings: 'true' })).json();
    sqlite.exec("CREATE TRIGGER fixture_restore_failure BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    try { assert.equal((await upload('/import', bytes, { confirm: 'true', token: plan.token, restoreSettings: 'true' })).status, 500); }
    finally { sqlite.exec('DROP TRIGGER fixture_restore_failure'); }
    assert.deepEqual(snapshot(), snapshotBefore);
  });
  await t.test('preview expiry cannot authorize writes', async () => {
    const plan: any = await (await upload('/import/preview', bytes)).json();
    const snapshotBefore = snapshot(), now = Date.now();
    const mock = t.mock.method(Date, 'now', () => now + 16 * 60 * 1000);
    try { assert.equal((await upload('/import', bytes, { confirm: 'true', token: plan.token })).status, 409); }
    finally { mock.mock.restore(); }
    assert.deepEqual(snapshot(), snapshotBefore);
  });
});
