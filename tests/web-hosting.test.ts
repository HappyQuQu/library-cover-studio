import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCorsMiddleware, mountWebApp } from '../backend/src/middleware/webHosting.ts';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const express = require('express');

test('unified hosting preserves SPA navigation, API boundaries, cache policy and CORS isolation', async t => {
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
  app.use((error: Error, _req: any, res: any, _next: any) => res.status(403).json({ error: error.message }));
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
  for (const origin of ['http://foreign.example', base.replace('http:', 'https:')]) {
    assert.equal((await fetch(base + '/api/fixture', { method: 'POST', headers: { Origin: origin } })).status, 403);
  }
});
