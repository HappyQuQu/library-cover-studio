import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCorsMiddleware, mountWebApp } from '../backend/src/middleware/webHosting.ts';
import { errorHandler } from '../backend/src/middleware/errorHandler.ts';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const express = require('express');

test('unified hosting preserves SPA navigation, API boundaries, cache policy and CORS isolation', async t => {
  t.mock.method(console, 'error', () => {});
  const root = mkdtempSync(join(tmpdir(), 'lcs-web-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<html>SPA fixture</html>');
  writeFileSync(join(root, 'assets', 'index-hash.js'), 'fixture();');
  assert.throws(() => mountWebApp(express(), join(root, 'missing')), /Frontend build missing/);
  const app = express();
  app.use(createCorsMiddleware(true));
  app.post('/api/fixture', (_req: any, res: any) => res.json({ ok: true }));
  mountWebApp(app, root);
  app.use((_req: any, res: any) => res.status(404).json({ error: 'Not Found' }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of ['/', '/editor/template-id', '/tasks']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /SPA fixture/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
  }
  const asset = await fetch(base + '/assets/index-hash.js');
  assert.match(asset.headers.get('cache-control')!, /immutable/);
  for (const route of ['/api', '/api/unknown', '/assets', '/assets/missing.js', '/missing.png', '/.env', '/%2eenv']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, route);
    assert.match(response.headers.get('content-type')!, /json/);
  }
  assert.equal((await fetch(base + '/editor', { method: 'POST' })).status, 404);
  assert.equal((await fetch(base + '/editor', { headers: { Accept: 'application/json' } })).status, 404);
  const sameOrigin = await fetch(base + '/api/fixture', { method: 'POST', headers: { Origin: base } });
  assert.equal(sameOrigin.status, 200);
  assert.equal(sameOrigin.headers.get('access-control-allow-origin'), base);
  const localAlias = base.replace('127.0.0.1', 'localhost');
  assert.equal((await fetch(base + '/api/fixture', { method: 'POST', headers: { Origin: localAlias } })).status, 200);
  for (const origin of ['http://foreign.example', base.replace('http:', 'https:')]) {
    assert.equal((await fetch(base + '/api/fixture', { method: 'POST', headers: { Origin: origin } })).status, 403);
  }
});

test('legacy hosting accepts configured loopback aliases and preflights without opening other origins', async t => {
  t.mock.method(console, 'error', () => {});
  const previousOrigin = process.env.FRONTEND_URL;
  // Reproduce the local Docker deployment: browser uses 127.0.0.1:8084,
  // while the backend's FRONTEND_URL uses localhost:8084.
  process.env.FRONTEND_URL = ' http://localhost:8084/ ';
  const app = express();
  let handled = 0;
  app.use(createCorsMiddleware(false));
  app.post('/api/fixture', (_req: any, res: any) => { handled++; res.json({ ok: true }); });
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  t.after(async () => {
    if (previousOrigin === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousOrigin;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(resolve));
  });
  const endpoint = `http://127.0.0.1:${server.address().port}/api/fixture`;
  const post = (origin?: string, headers: Record<string, string> = {}) => fetch(endpoint, {
    method: 'POST', headers: { ...(origin === undefined ? {} : { Origin: origin }), ...headers }
  });
  for (const origin of ['http://localhost:8084', 'http://127.0.0.1:8084', 'http://[::1]:8084',
    'http://127.0.0.1:5173', 'http://[::1]:5176']) {
    const response = await post(origin);
    assert.equal(response.status, 200, origin);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.match(response.headers.get('vary')!, /Origin/);
    const preflight = await fetch(endpoint, { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type'
    } });
    assert.equal(preflight.status, 204, origin);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.match(preflight.headers.get('access-control-allow-headers')!, /authorization/);
  }
  assert.equal((await post()).status, 200, 'CLI and health checks without Origin still work');
  const beforeRejected = handled;
  for (const origin of ['http://localhost:8085', 'http://127.0.0.1:8085', 'https://127.0.0.1:8084',
    'http://localhost.foreign.example:8084', 'http://127.0.0.1.foreign.example:8084',
    'http://foreign.example', 'null', 'invalid', 'http://localhost:8084/path']) {
    const response = await post(origin, { 'X-Forwarded-Host': origin.replace('http://', ''), 'X-Forwarded-Proto': 'https' });
    assert.equal(response.status, 403, origin);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal((await response.json()).error.code, 'CORS_ORIGIN_DENIED');
  }
  const deniedPreflight = await fetch(endpoint, { method: 'OPTIONS', headers: {
    Origin: 'http://foreign.example', 'Access-Control-Request-Method': 'POST'
  } });
  assert.equal(deniedPreflight.status, 403);
  assert.equal(handled, beforeRejected, 'rejected requests never reach the route');

  process.env.FRONTEND_URL = 'https://cover.example.com:8443/';
  assert.equal((await post('https://cover.example.com:8443')).status, 200);
  for (const origin of ['http://cover.example.com:8443', 'https://cover.example.com', 'http://127.0.0.1:8084']) {
    assert.equal((await post(origin)).status, 403, origin);
  }
  process.env.FRONTEND_URL = 'https://[::1]:8443';
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal((await post(`https://${host}:8443`)).status, 200);
    assert.equal((await post(`http://${host}:8443`)).status, 403);
  }
  process.env.FRONTEND_URL = 'not-a-url';
  assert.equal((await post('http://foreign.example')).status, 403, 'invalid configuration fails closed');
});
