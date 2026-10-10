import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeModel, listProviderModels, parseModelCapabilities, requireImageModel } from '../backend/src/services/ai/modelCatalog.service.ts';

async function mock(t: TestContext, handler: (request: any) => any) {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const request = { url: new URL(req.url!, 'http://localhost'), method: req.method, headers: req.headers,
      body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined };
    requests.push(request);
    const response = handler(request);
    res.statusCode = response.status || 200;
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(response.body));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return { requests, url: `http://127.0.0.1:${(server.address() as any).port}` };
}

test('model metadata distinguishes image understanding from audio/output modalities and overrides guesses', () => {
  const config = { type: 'custom' as const, apiUrl: 'https://api.xiaomimimo.com/v1' };
  assert.equal(describeModel(config, { id: 'mimo-v2.6-flash' }).imageInput, true);
  assert.equal(describeModel(config, { id: 'mimo-v2.5-pro' }).imageInput, false);
  assert.equal(describeModel(config, { id: 'mimo-v2.6-flash', capabilities: { image_input: { supported: false } } }).imageInput, false);
  assert.equal(describeModel({ ...config, apiUrl: 'https://proxy.example/v1' }, { id: 'mimo-v2.6-flash' }).imageInput, null);
  assert.equal(describeModel(config, { id: 'audio-test', architecture: { input_modalities: ['text', 'audio'], output_modalities: ['image'] } }).imageInput, false);
  assert.equal(describeModel(config, { id: 'new-vision', architecture: { input_modalities: ['text', 'image'] } }).imageInput, true);
  assert.equal(describeModel({ ...config, modelCapabilities: { 'mimo-v2.6-flash': false } }, { id: 'mimo-v2.6-flash' }).capabilitySource, 'manual');
  assert.deepEqual(parseModelCapabilities('{"good":true,"bad":"true","no":false}'), { good: true, no: false });
  assert.deepEqual(parseModelCapabilities('broken json'), {});
  const openai = { ...config, apiUrl: 'https://api.openai.com/v1' };
  assert.equal(describeModel(openai, { id: 'gpt-4o-2024-08-06' }).imageInput, true);
  assert.equal(describeModel(openai, { id: 'gpt-4o-audio-preview' }).imageInput, null);
});

test('compatible model API uses base path and bearer auth, preserves configured models, filters specialized models and caches per credential', async t => {
  const fixture = await mock(t, () => ({ body: { data: [
    { id: 'vision', input_modalities: ['text', 'image'] }, { id: 'text', supports_vision: false }, { id: 'vision' },
    { id: 'text-embedding-3-small' }, { id: 'mimo-v2.5-tts' }, { id: 'retired', lifecycle: 'retired' }, { id: 'image-output', output_modalities: ['image'] }
  ] } }));
  const config = { type: 'custom' as const, apiUrl: fixture.url + '/gateway/v1/', apiKey: 'fixture-key', model: 'private-model,vision' };
  const result = await listProviderModels(config);
  assert.equal(fixture.requests[0].url.pathname, '/gateway/v1/models');
  assert.equal(fixture.requests[0].headers.authorization, 'Bearer fixture-key');
  assert.equal(result.source, 'api'); assert.deepEqual(result.models.map(model => model.id), ['private-model', 'vision', 'text']);
  assert.equal(result.models[1].imageInput, true, 'duplicate ID-only entries must not erase capability metadata');
  await listProviderModels(config); assert.equal(fixture.requests.length, 1);
  await listProviderModels({ ...config, apiKey: 'different-key' }); assert.equal(fixture.requests.length, 2);
  await listProviderModels(config, true); assert.equal(fixture.requests.length, 3);
  assert.ok(!JSON.stringify(result).includes('fixture-key'));
});

test('saved model discovery protects ownership and stored keys, and migrates existing provider rows', async t => {
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const Database = require('better-sqlite3');
  const express = require('express');
  const taskDir = mkdtempSync(join(tmpdir(), 'lcs-model-config-'));
  mkdirSync(join(taskDir, 'data/db'), { recursive: true });
  const legacy = new Database(join(taskDir, 'data/db/data.sqlite'));
  legacy.exec(`CREATE TABLE ai_providers (id TEXT PRIMARY KEY, name TEXT, type TEXT, api_url TEXT, api_key_encrypted TEXT, model TEXT,
    is_active INTEGER DEFAULT 1, is_default INTEGER DEFAULT 0, user_id TEXT, created_at TEXT, updated_at TEXT);`);
  legacy.close();
  const originalDir = process.cwd();
  process.chdir(taskDir);
  process.env.ENCRYPTION_KEY = 'local-model-test-encryption-key';
  process.env.ENCRYPTION_SALT = 'local-model-test-salt';
  let database: any;
  let controller: any;
  try {
    database = await import('../backend/src/config/database.ts');
    controller = await import('../backend/src/controllers/aiProvider.controller.ts');
    await database.initDatabase();
  } finally { process.chdir(originalDir); }
  t.after(() => { database.db.$client.close(); rmSync(taskDir, { recursive: true, force: true }); });
  const fixture = await mock(t, () => ({ body: { data: [{ id: 'vision', input_modalities: ['text', 'image'] }] } }));
  const { encrypt } = await import('../backend/src/utils/crypto.ts');
  const sqlite = database.db.$client;
  sqlite.prepare('INSERT INTO ai_providers (id,name,type,api_url,api_key_encrypted,model,user_id) VALUES (?,?,?,?,?,?,?)')
    .run('owned-provider', 'Legacy', 'custom', fixture.url + '/v1', encrypt('stored-fixture-key'), 'vision', 'owner');
  const app = express(); app.use(express.json());
  app.use((req: any, _res: any, next: any) => { if (req.headers['x-test-user']) req.user = { userId: req.headers['x-test-user'] }; next(); });
  app.get('/providers', controller.getAIProviders);
  app.get('/providers/:id/models', controller.getAIProviderModels);
  app.post('/models-config', controller.getAIProviderModels);
  const { generateTemplate } = await import('../backend/src/controllers/aiChat.controller.ts');
  app.post('/generate', generateTemplate);
  app.put('/providers/:id', controller.updateAIProvider);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/providers/owned-provider/models')).status, 401);
  assert.equal((await fetch(base + '/providers/owned-provider/models', { headers: { 'x-test-user': 'stranger' } })).status, 404);
  const headers = { 'x-test-user': 'owner', 'Content-Type': 'application/json' };
  const models = await (await fetch(base + '/providers/owned-provider/models', { headers })).json() as any;
  assert.equal(models.models[0].imageInput, true);
  assert.equal(fixture.requests[0].headers.authorization, 'Bearer stored-fixture-key');
  assert.ok(!JSON.stringify(models).includes('stored-fixture-key'));
  const edited = await fetch(base + '/models-config', { method: 'POST', headers, body: JSON.stringify({ providerId: 'owned-provider', type: 'custom', apiUrl: fixture.url + '/changed' }) });
  assert.equal(edited.status, 400); assert.equal(fixture.requests.length, 1, 'edited destinations never receive stored keys');
  const update = await fetch(base + '/providers/owned-provider', { method: 'PUT', headers, body: JSON.stringify({ modelCapabilities: { vision: false } }) });
  assert.equal(update.status, 200); assert.deepEqual((await update.json() as any).modelCapabilities, { vision: false });
  const providers = await (await fetch(base + '/providers', { headers })).json() as any;
  assert.deepEqual(providers[0].modelCapabilities, { vision: false });
  const confirmed = await (await fetch(base + '/providers/owned-provider/models', { headers })).json() as any;
  assert.equal(confirmed.models[0].imageInput, false);
  const image = await require('sharp')({ create: { width: 10, height: 10, channels: 3, background: '#334455' } }).png().toBuffer();
  const rejected = await fetch(base + '/generate', { method: 'POST', headers, body: JSON.stringify({ prompt: '参考图片设计', providerId: 'owned-provider', model: 'vision',
    referenceImages: [{ dataUrl: 'data:image/png;base64,' + image.toString('base64') }] }) });
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json() as any).error, /不支持图片/);
  assert.equal(fixture.requests.length, 1, 'a rejected image request never reaches the AI provider');
});

test('Claude uses native headers and follows paginated model lists without duplicating /v1', async t => {
  const fixture = await mock(t, request => ({ body: request.url.searchParams.has('after_id')
    ? { data: [{ id: 'second', capabilities: { image_input: { supported: false } } }], has_more: false }
    : { data: [{ id: 'first', display_name: 'Vision', capabilities: { image_input: { supported: true } } }], has_more: true, last_id: 'first' } }));
  const result = await listProviderModels({ type: 'claude', apiUrl: fixture.url + '/v1', apiKey: 'claude-fixture' });
  assert.equal(fixture.requests.length, 2); assert.equal(fixture.requests[0].url.pathname, '/v1/models');
  assert.equal(fixture.requests[0].headers['x-api-key'], 'claude-fixture'); assert.equal(fixture.requests[0].headers['anthropic-version'], '2023-06-01');
  assert.equal(fixture.requests[0].headers.authorization, undefined);
  assert.equal(fixture.requests[1].url.searchParams.get('after_id'), 'first');
  assert.deepEqual(result.models.map(model => model.imageInput), [true, false]);
});

test('Ollama fetches installed models then reads actual /api/show vision capabilities', async t => {
  const fixture = await mock(t, request => ({ body: request.url.pathname === '/api/tags'
    ? { models: [{ name: 'vision:latest' }, { name: 'text:7b' }, { name: 'old-server:latest' }] }
    : request.body.model.startsWith('vision') ? { capabilities: ['completion', 'vision'] }
    : request.body.model.startsWith('text') ? { capabilities: ['completion'] } : {} }));
  const config = { type: 'ollama' as const, apiUrl: fixture.url };
  const result = await listProviderModels(config);
  assert.deepEqual(result.models.map(model => model.imageInput), [true, false, null]);
  assert.equal(fixture.requests.filter(request => request.url.pathname === '/api/show').length, 3);
  await requireImageModel(config, 'vision:latest');
  await assert.rejects(requireImageModel(config, 'text:7b'), { statusCode: 400 });
  await assert.rejects(requireImageModel(config, 'old-server:latest'), { statusCode: 400 });
  assert.equal(fixture.requests.length, 4, 'generation capability checks reuse discovery');
});

test('model list failures retain configured models and return safe errors, never upstream secrets', async t => {
  for (const status of [401, 404, 429, 500]) {
    const fixture = await mock(t, () => ({ status, body: { error: 'sensitive-key upstream detail' } }));
    const result = await listProviderModels({ type: 'custom', apiUrl: fixture.url + '/v1', apiKey: 'sensitive-key', model: 'manual' });
    assert.equal(result.source, 'configured'); assert.equal(result.models[0].id, 'manual'); assert.ok(result.warning);
    assert.ok(!JSON.stringify(result).includes('sensitive-key'));
  }
});

test('unknown/text models cannot receive references, while explicit per-model confirmation works without a discovery endpoint', async t => {
  const fixture = await mock(t, () => ({ body: { data: [{ id: 'unknown' }, { id: 'text', capabilities: { image_input: { supported: false } } }] } }));
  const config = { type: 'custom' as const, apiUrl: fixture.url + '/v1' };
  await assert.rejects(requireImageModel(config, 'unknown'), /尚未确认/);
  await assert.rejects(requireImageModel(config, 'text'), /不支持图片/);
  await requireImageModel({ ...config, modelCapabilities: { unknown: true } }, 'unknown');
  await assert.rejects(requireImageModel({ ...config, modelCapabilities: { unknown: true } }, 'another'), /尚未确认/);
  await assert.rejects(listProviderModels({ ...config, apiUrl: 'file:///secret' }));
});
