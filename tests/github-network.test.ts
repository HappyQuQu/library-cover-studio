import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

test('GitHub proxy settings are private, encrypted and live; CONNECT covers catalogs, previews, downloads, statistics and releases', async t => {
  t.mock.method(console, 'error', () => {});
  const directory = mkdtempSync(join(tmpdir(), 'lcs-github-network-'));
  process.env.LCS_DATA_DIR = directory;
  process.env.JWT_SECRET = 'github-network-test';
  process.env.ENCRYPTION_KEY = 'github-network-encryption-test';
  // The isolated local TLS fixture never connects to public hosts.
  const previousToken = process.env.GITHUB_TOKEN; delete process.env.GITHUB_TOKEN;
  t.after(() => { if (previousToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = previousToken; });
  const previousTLS = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const sockets = new Set<net.Socket>();
  const servers: net.Server[] = [];
  const track = (server: net.Server) => { servers.push(server); server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); }); return server; };
  t.after(async () => {
    if (previousTLS === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTLS;
    for (const socket of sockets) socket.destroy();
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    rmSync(directory, { recursive: true, force: true });
  });
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express'), AdmZip = require('adm-zip');
  const database = await import('../backend/src/config/database.ts');
  await database.initDatabase();
  t.after(() => database.db.$client.close());
  for (const [id, role] of [['admin', 'admin'], ['reader', 'user']]) database.db.$client.prepare('INSERT INTO users (id,username,password_hash,role) VALUES (?,?,?,?)').run(id, id, 'unused', role);
  const network = await import('../backend/src/services/githubNetwork.service.ts');
  assert.deepEqual(network.githubNetworkOptions({ mode: 'environment', proxyUrl: '' }), {});
  assert.deepEqual(network.githubNetworkOptions({ mode: 'direct', proxyUrl: '' }), { proxy: false });
  assert.equal(network.githubNetworkOptions({ mode: 'proxy', proxyUrl: 'socks5h://127.0.0.1:1080' }).httpsAgent.constructor.name, 'SocksProxyAgent');
  for (const url of ['file:///tmp/socket', 'ftp://host:123', 'http://host/path', 'http://host?secret=value', 'not-a-url']) assert.throws(() => network.validateProxyUrl(url));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'), '-subj', '/CN=fixture'], { stdio: 'ignore' });
  const image = readFileSync(new URL('../backend/src/template/poster/1.jpg', import.meta.url));
  const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
  const id = hash('proxy-design'), revision = hash('revision');
  const zip = new AdmZip();
  zip.addFile('template.json', Buffer.from(JSON.stringify({ name: 'Proxy Design', description: '', width: 900, height: 600, canvasJson: '{"objects":[]}' })));
  zip.addFile('preview.jpg', image);
  const packageBytes = zip.toBuffer();
  const entry = { id, revision, name: 'Proxy Design', description: '', width: 900, height: 600, folder: 'proxy-design',
    previewUrl: `https://raw.githubusercontent.com/HappyQuQu/library-cover-store/${'a'.repeat(40)}/proxy-design/preview.jpg`,
    packageUrl: `https://github.com/HappyQuQu/library-cover-store/releases/download/store-00001/${id}--${revision}.zip`,
    packageSha256: hash(packageBytes), downloadCount: 0, downloadSources: [{ releaseId: 1, downloadCount: 0 }] };
  let catalogReads = 0, previewFails = false, apiMode = 'ok', apiReads = 0, expectedToken = '';
  const resetAt = Math.floor(Date.now() / 1000) + 3600;
  const upstream = track(https.createServer({ key: readFileSync(join(directory, 'key.pem')), cert: readFileSync(join(directory, 'cert.pem')) }, (req, res) => {
    const isApi = req.headers.host === 'api.github.com';
    assert.equal(req.headers.authorization, isApi && expectedToken ? `Bearer ${expectedToken}` : undefined, 'Tokens are restricted to the API origin');
    if (isApi) {
      apiReads++;
      if (req.url === '/redirect-auth') { res.writeHead(302, { Location: 'https://raw.githubusercontent.com/redirect-target' }); res.end(); return; }
      if (apiMode === 'limit') { res.writeHead(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-limit': '60', 'x-ratelimit-reset': String(resetAt) }); res.end('{}'); return; }
      if (apiMode === 'invalid') { res.writeHead(401); res.end('{}'); return; }
      if (apiMode === 'secondary') { res.writeHead(429, { 'retry-after': '60' }); res.end('{}'); return; }
      if (apiMode === 'denied') { res.writeHead(403); res.end('{}'); return; }
    }
    assert.equal(req.headers['proxy-authorization'], undefined, 'Proxy credentials stay on the CONNECT handshake');
    if (req.url?.includes('catalog.json')) { catalogReads++; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ version: 1, repository: 'HappyQuQu/library-cover-store', generatedAt: new Date().toISOString(), templates: [entry] })); }
    else if (req.url?.includes('preview.jpg')) { if (previewFails) { res.writeHead(403); res.end(); } else { res.setHeader('Content-Type', 'image/jpeg'); res.end(image); } }
    else if (req.url?.includes('/assets')) { res.setHeader('Content-Type', 'application/json'); res.end('[]'); }
    else if (req.headers.host === 'api.github.com') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(req.url?.includes('/latest') ? { tag_name: 'v1.7.0', draft: false, prerelease: false } : [])); }
    else if (req.url?.includes('/releases/download/')) { res.writeHead(302, { Location: 'https://release-assets.githubusercontent.com/package.zip' }); res.end(); }
    else if (req.headers.host === 'release-assets.githubusercontent.com') { res.setHeader('Content-Type', 'application/zip'); res.end(packageBytes); }
    else res.end('<html>GitHub release</html>');
  }));
  upstream.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => upstream.once('listening', resolve));
  const upstreamPort = (upstream.address() as net.AddressInfo).port;
  const targets: string[] = [], credentials: string[] = [];
  const proxy = track(http.createServer());
  proxy.on('connect', (req, client, head) => {
    targets.push(req.url!); credentials.push(String(req.headers['proxy-authorization'] || ''));
    const target = net.connect(upstreamPort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) target.write(head);
      client.pipe(target); target.pipe(client);
    });
    target.on('error', () => client.destroy()); client.on('error', () => target.destroy()); client.on('close', () => target.destroy());
  });
  proxy.listen(0, '127.0.0.1'); await new Promise<void>(resolve => proxy.once('listening', resolve));
  const proxyUrl = `http://proxy-user:proxy-secret@127.0.0.1:${(proxy.address() as net.AddressInfo).port}`;
  const { settingsRouter } = await import('../backend/src/routes/settings.routes.ts');
  const { templateStoreRouter } = await import('../backend/src/routes/templateStore.routes.ts');
  const { systemRouter } = await import('../backend/src/routes/system.routes.ts');
  const { errorHandler } = await import('../backend/src/middleware/errorHandler.ts');
  const { generateToken } = await import('../backend/src/middleware/auth.ts');
  const app = express(); app.use(express.json()); app.use('/api/settings', settingsRouter); app.use('/api/template-store', templateStoreRouter); app.use('/api/system', systemRouter); app.use(errorHandler);
  const api = track(app.listen(0, '127.0.0.1')); await new Promise<void>(resolve => api.once('listening', resolve));
  const base = `http://127.0.0.1:${(api.address() as net.AddressInfo).port}/api`;
  const headers = (role = 'admin') => ({ Authorization: `Bearer ${generateToken({ userId: role, username: role, role: role === 'admin' ? 'admin' : 'user' })}`, 'Content-Type': 'application/json' });
  const post = (path: string, body: unknown, role = 'admin') => fetch(base + path, { method: 'POST', headers: headers(role), body: JSON.stringify(body) });
  assert.equal((await fetch(base + '/settings/network')).status, 401);
  assert.equal((await fetch(base + '/settings/network', { headers: headers('reader') })).status, 403);
  assert.equal((await post('/settings/network', { mode: 'direct' }, 'reader')).status, 403);
  assert.equal((await post('/settings/network/test', { mode: 'direct' }, 'reader')).status, 403);
  assert.equal((await post('/settings/network', { mode: 'proxy', proxyUrl: 'file:///secret' })).status, 400);
  const saved = await post('/settings/network', { mode: 'proxy', proxyUrl }); assert.equal(saved.status, 200);
  const publicConfig = await saved.json();
  assert.equal(publicConfig.hasCredentials, true);
  assert.ok(!JSON.stringify(publicConfig).includes('proxy-user') && !JSON.stringify(publicConfig).includes('proxy-secret'));
  const encrypted = database.db.$client.prepare("SELECT value FROM system_settings WHERE key = 'network.github.proxy'").get() as any;
  assert.ok(!encrypted.value.includes('proxy-secret'));
  assert.equal((await network.readGithubNetworkConfig()).proxyUrl, proxyUrl + '/');
  const normalSettings = await (await fetch(base + '/settings', { headers: headers('reader') })).json();
  assert.ok(Object.keys(normalSettings).every(key => !key.startsWith('network.')));
  const tested = await post('/settings/network/test', { mode: 'proxy' });
  assert.equal(tested.status, 200); const results = await tested.json(); assert.equal(results.storeReady, true); assert.ok(results.results.every((result: any) => result.ok));
  const list = await fetch(base + '/template-store', { headers: headers('reader') }); assert.equal(list.status, 200); assert.equal((await list.json()).total, 1);
  const preview = await fetch(`${base}/template-store/${id}/preview?revision=${revision}`, { headers: headers('reader') });
  assert.equal(preview.status, 200); assert.match(preview.headers.get('content-type')!, /image\/jpeg/); assert.ok((await preview.arrayBuffer()).byteLength > 100);
  assert.equal((await fetch(`${base}/template-store/${id}/preview`)).status, 401);
  assert.equal((await fetch(`${base}/template-store/${id}/preview?revision=wrong`, { headers: headers('reader') })).status, 404);
  assert.equal((await post(`/template-store/${id}/install`, {}, 'reader')).status, 201);
  const version = await (await fetch(base + '/system/releases', { headers: headers('reader') })).json();
  assert.equal(version.stale, false); assert.equal(version.checkSource, 'github-api');
  const before = catalogReads;
  const preserved = await post('/settings/network', { mode: 'proxy' }); assert.equal(preserved.status, 200);
  await fetch(base + '/template-store', { headers: headers('reader') });
  assert.ok(catalogReads > before, 'Saving connection settings immediately invalidates old connection caches');
  assert.ok(targets.includes('raw.githubusercontent.com:443') && targets.includes('api.github.com:443') && targets.includes('github.com:443') && targets.includes('release-assets.githubusercontent.com:443'));
  assert.ok(credentials.length > 0 && credentials.every(value => value === `Basic ${Buffer.from('proxy-user:proxy-secret').toString('base64')}`));
  const storedBeforeTest = await network.readGithubNetworkConfig();
  const failedTest = await (await post('/settings/network/test', { mode: 'proxy', proxyUrl: 'http://draft-user:draft-secret@127.0.0.1:1' })).json();
  assert.equal(failedTest.storeReady, false);
  assert.ok(!JSON.stringify(failedTest).includes('draft-secret'));
  assert.deepEqual(await network.readGithubNetworkConfig(), storedBeforeTest, 'Draft connection tests do not alter saved settings');
  expectedToken = 'settings-fixture-token';
  const tokenSaved = await (await post('/settings/network', { mode: 'proxy', token: expectedToken })).json();
  assert.equal(tokenSaved.tokenSource, 'settings'); assert.equal(tokenSaved.hasSavedToken, true);
  assert.ok(!JSON.stringify(tokenSaved).includes(expectedToken));
  const storedToken = database.db.$client.prepare("SELECT value FROM system_settings WHERE key='network.github.token'").get() as any;
  assert.ok(storedToken.value && !storedToken.value.includes(expectedToken));
  assert.equal((await (await post('/settings/network/test', { mode: 'proxy' })).json()).storeReady, true);
  await network.githubGet('https://api.github.com/redirect-auth');
  const exported = await (await fetch(base + '/settings/export', { headers: headers() })).text();
  assert.ok(!exported.includes(expectedToken) && !exported.includes('network.github.token'));
  apiMode = 'invalid';
  const invalid = await (await post('/settings/network/test', { mode: 'proxy' })).json();
  assert.equal(invalid.storeReady, true); assert.equal(invalid.results.find((r: any) => r.id === 'api').code, 'TOKEN_INVALID');
  process.env.GITHUB_TOKEN = 'environment-fixture-token'; expectedToken = 'environment-fixture-token';
  const cleared = await (await post('/settings/network', { mode: 'proxy', clearToken: true })).json();
  assert.equal(cleared.tokenSource, 'environment'); assert.equal(cleared.hasSavedToken, false);
  assert.equal(database.db.$client.prepare("SELECT value FROM system_settings WHERE key='network.github.token'").get().value, '');
  apiMode = 'ok';
  await post('/settings/network/test', { mode: 'proxy' });
  delete process.env.GITHUB_TOKEN; expectedToken = ''; apiMode = 'limit';
  const limited = await (await post('/settings/network/test', { mode: 'proxy' })).json();
  const rate = limited.results.find((r: any) => r.id === 'api');
  assert.equal(limited.storeReady, true); assert.equal(limited.versionCheckReady, true); assert.equal(limited.liveCountsReady, false);
  assert.equal(rate.code, 'RATE_LIMITED'); assert.equal(rate.reachable, true); assert.equal(rate.authenticated, false);
  assert.equal(rate.retryAt, new Date(resetAt * 1000).toISOString());
  const readsBeforeCooldown = apiReads;
  await post('/settings/network/test', { mode: 'proxy' });
  assert.equal(apiReads, readsBeforeCooldown, 'quota exhaustion pauses API requests across callers');
  await assert.rejects(network.githubGet('https://api.github.com/another'), error => {
    assert.ok(error instanceof network.GithubRequestError); assert.ok(!JSON.stringify(error).includes('proxy-secret')); return true;
  });
  apiMode = 'secondary'; expectedToken = 'draft-new-token';
  const secondary = await (await post('/settings/network/test', { mode: 'proxy', token: expectedToken })).json();
  assert.equal(secondary.results.find((r: any) => r.id === 'api').code, 'SECONDARY_RATE_LIMITED');
  assert.equal((await network.readGithubNetworkConfig()).tokenSource, 'none', 'draft token tests never persist credentials');
  apiMode = 'denied'; expectedToken = 'another-draft-token';
  const denied = await (await post('/settings/network/test', { mode: 'proxy', token: expectedToken })).json();
  assert.equal(denied.results.find((r: any) => r.id === 'api').code, 'ACCESS_DENIED');
  apiMode = 'ok'; expectedToken = '';
  previewFails = true; entry.revision = hash('unavailable-preview');
  await post('/settings/network', { mode: 'proxy' });
  const unavailablePreview = await fetch(`${base}/template-store/${id}/preview?revision=${entry.revision}`, { headers: headers('reader') });
  assert.equal(unavailablePreview.status, 502);
  assert.equal((await unavailablePreview.json()).error.code, 'STORE_PREVIEW_UNAVAILABLE');
});
