import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { readFileSync } from 'node:fs';
import {
  getServerInfo, getLibraries, getLibraryItems, downloadCover, uploadCover,
  normalizeServerUrl, MediaServerError
} from '../backend/src/services/mediaClient.service.ts';
import { fetchLibraryPosters } from '../backend/src/services/libraryCover.service.ts';
import { parseLibraryConfigs } from '../web/src/lib/taskConfig.ts';

const poster = readFileSync(new URL('../backend/src/template/poster/1.jpg', import.meta.url));
const key = 'test-local-api-key';
interface Request { url: URL; method: string; headers: IncomingHttpHeaders; body: Buffer; }
interface Response { status?: number; body?: unknown; image?: Buffer; }
async function mock(t: TestContext, handler: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const request = { url: new URL(req.url!, 'http://localhost'), method: req.method!, headers: req.headers, body: Buffer.concat(chunks) };
    requests.push(request);
    try {
      const response = await handler(request);
      res.statusCode = response.status ?? 200;
      res.setHeader('Content-Type', response.image ? 'image/jpeg' : 'application/json');
      res.end(response.image ?? JSON.stringify(response.body ?? {}));
    } catch {
      res.statusCode = 500; res.end('{}');
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections(); server.close(error => error ? reject(error) : resolve());
  }));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, requests };
}
const info = { Version: '12.2.0', ServerName: 'Local fixture', ProductName: 'Jellyfin Server' };
const empty = { Items: [], TotalRecordCount: 0 };
const isInfo = (req: Request) => req.url.pathname.endsWith('/System/Info');

// Requests go only to local mock servers; no live library artwork is modified.
test('Jellyfin modern authentication, valid fields, sort aliases and artwork tags', async t => {
  const fixture = await mock(t, req => isInfo(req) ? { body: info } : { body: {
    Items: [{ Id: 'show', Name: 'Series', Type: 'Series', ProductionYear: 2026, Genres: ['Drama'], CommunityRating: 8,
      ImageTags: { Primary: 'poster-tag' }, BackdropImageTags: ['backdrop-tag'] }], TotalRecordCount: 24
  } });
  const result = await getLibraryItems('jellyfin', fixture.url, key, 'library', { sortBy: 'Name', limit: 9, libraryType: 'tvshows' });
  await getLibraryItems('jellyfin', fixture.url, key, 'library', { sortBy: 'DateLastPlayed' });
  assert.equal(fixture.requests.filter(isInfo).length, 1, 'connection info is reused');
  for (const request of fixture.requests) {
    assert.match(request.headers.authorization!, /^MediaBrowser Client="LibraryCoverStudio".*Token="test-local-api-key"$/);
    assert.equal(request.headers['x-emby-token'], undefined);
  }
  const params = fixture.requests[1].url.searchParams;
  assert.equal(params.get('SortBy'), 'SortName');
  assert.equal(fixture.requests[2].url.searchParams.get('SortBy'), 'DatePlayed');
  assert.equal(params.get('Fields'), 'Genres');
  assert.equal(params.get('IncludeItemTypes'), 'Series');
  assert.equal(params.get('EnableImages'), 'true');
  assert.equal(params.get('EnableUserData'), 'false');
  assert.equal(params.get('Limit'), '9');
  assert.equal(result.totalCount, 24);
  assert.equal(result.items[0].year, 2026);
  assert.deepEqual(result.items[0].imageTags, { Primary: 'poster-tag', Backdrop: 'backdrop-tag' });
});

test('Emby resolves the documented /emby API under a reverse proxy without duplicating it', async t => {
  const fixture = await mock(t, req => {
    if (req.url.pathname === '/media/emby/System/Info') return { body: { ...info, Version: '4.9', ProductName: 'Emby Server' } };
    if (req.url.pathname === '/media/emby/Library/VirtualFolders') return { body: [{ ItemId: 'music', Name: 'Music', CollectionType: 'music', PrimaryImageItemId: 'artwork' }] };
    return { status: 404 };
  });
  const libraries = await getLibraries('emby', `${fixture.url}/media/web/index.html#!/home`, key);
  const connection = await getServerInfo('emby', `${fixture.url}/media/emby/`, key);
  assert.equal(connection.apiBaseUrl, `${fixture.url}/media/emby`);
  assert.equal(libraries[0].imageItemId, 'artwork');
  assert.equal(libraries[0].itemCount, undefined);
  fixture.requests.forEach(request => {
    assert.equal(request.headers['x-emby-token'], key);
    assert.equal(request.headers.authorization, undefined);
    assert.ok(!request.url.pathname.includes('/emby/emby/'));
  });
});

test('Emby root API fallback is remembered after a missing /emby endpoint', async t => {
  const fixture = await mock(t, req => req.url.pathname.startsWith('/emby/') ? { status: 404 }
    : isInfo(req) ? { body: info } : { body: empty });
  await getLibraryItems('emby', fixture.url, key, 'library');
  await getLibraryItems('emby', fixture.url, key, 'library');
  assert.deepEqual(fixture.requests.map(req => req.url.pathname), ['/emby/System/Info', '/System/Info', '/Items', '/Items']);
});

test('connection failures preserve status without exposing credentials or trying another auth path', async t => {
  for (const status of [401, 403]) {
    const fixture = await mock(t, () => ({ status }));
    await assert.rejects(getServerInfo('emby', fixture.url, key), error => {
      assert.ok(error instanceof MediaServerError);
      assert.equal(error.upstreamStatus, status);
      assert.equal(error.statusCode, 502, 'upstream auth failure must not expire the app login');
      assert.ok(!JSON.stringify(error).includes(key));
      assert.ok(!error.message.includes(key));
      return true;
    });
    assert.equal(fixture.requests.length, 1);
  }
});

test('connection cache isolates keys and coalesces concurrent discovery', async t => {
  const fixture = await mock(t, req => req.headers.authorization?.includes('wrong-key') ? { status: 401 } : { body: info });
  await Promise.all([getServerInfo('jellyfin', fixture.url, key), getServerInfo('jellyfin', fixture.url, key)]);
  assert.equal(fixture.requests.length, 1);
  await assert.rejects(getServerInfo('jellyfin', fixture.url, 'wrong-key'), { code: 'MEDIA_AUTH_FAILED' });
  await getServerInfo('jellyfin', fixture.url, key, true);
  assert.equal(fixture.requests.length, 3);
});

test('empty libraries differ from failed/invalid responses; zero limit and counts survive', async t => {
  let mode = 'empty';
  const fixture = await mock(t, req => isInfo(req) ? { body: info }
    : mode === 'empty' ? { body: empty } : mode === 'invalid' ? { body: {} } : { status: 400 });
  const result = await getLibraryItems('jellyfin', fixture.url, key, 'library', { limit: 0, libraryType: 'music' });
  assert.deepEqual(result, { items: [], totalCount: 0 });
  assert.equal(fixture.requests[1].url.searchParams.get('Limit'), '0');
  assert.equal(fixture.requests[1].url.searchParams.get('IncludeItemTypes'), 'MusicAlbum');
  mode = 'invalid';
  await assert.rejects(getLibraryItems('jellyfin', fixture.url, key, 'library'), { code: 'MEDIA_INVALID_RESPONSE' });
  mode = 'failed';
  await assert.rejects(getLibraryItems('jellyfin', fixture.url, key, 'library'), { code: 'MEDIA_REQUEST_FAILED', upstreamStatus: 400 });
});

test('indexed images use index zero and cache tags; missing art returns null', async t => {
  const fixture = await mock(t, req => isInfo(req) ? { body: info }
    : req.url.pathname.includes('/missing/') ? { status: 404 } : { image: poster });
  const result = await downloadCover('jellyfin', fixture.url, key, 'item/id', 'Backdrop', { tag: 'cache-tag', maxWidth: 500 });
  assert.deepEqual(result, poster);
  const request = fixture.requests[1];
  assert.equal(request.url.pathname, '/Items/item%2Fid/Images/Backdrop/0');
  assert.equal(request.url.searchParams.get('Tag'), 'cache-tag');
  assert.equal(request.url.searchParams.get('MaxWidth'), '500');
  assert.equal(await downloadCover('jellyfin', fixture.url, key, 'missing'), null);
});

test('both upload contracts use Base64 with matching content type and no resize parameters', async t => {
  for (const type of ['jellyfin', 'emby']) {
    const fixture = await mock(t, req => isInfo(req) ? { body: info } : { status: type === 'jellyfin' ? 204 : 200 });
    for (const [buffer, mime] of [[poster, 'image/jpeg'], [Buffer.from([137,80,78,71,13,10,26,10,1,2,3]), 'image/png'],
      [Buffer.from('RIFFxxxxWEBPxxxx'), 'image/webp']] as const) {
      assert.equal(await uploadCover(type, fixture.url, key, 'library', buffer), true);
      const request = fixture.requests.at(-1)!;
      assert.equal(request.method, 'POST');
      assert.equal(request.headers['content-type'], mime);
      assert.equal(request.body.toString(), buffer.toString('base64'));
      assert.equal(request.url.search, '');
    }
  }
});

test('invalid uploads never send a request and upload permission failures surface', async t => {
  const fixture = await mock(t, req => isInfo(req) ? { body: info } : { status: 403 });
  await assert.rejects(uploadCover('jellyfin', fixture.url, key, 'lib', Buffer.from('html')), { code: 'MEDIA_INVALID_IMAGE' });
  assert.equal(fixture.requests.length, 0);
  await assert.rejects(uploadCover('jellyfin', fixture.url, key, 'lib', poster), { code: 'MEDIA_FORBIDDEN' });
  assert.equal(fixture.requests.length, 2);
});

test('poster selection falls back past corrupt artwork, but does not swallow permissions', async t => {
  let blocked = false;
  const fixture = await mock(t, req => {
    if (isInfo(req)) return { body: info };
    if (req.url.pathname === '/Items') return { body: { Items: [{ Id: 'item', ImageTags: { Primary: 'p', Art: 'a' } }], TotalRecordCount: 1 } };
    if (blocked) return { status: 403 };
    return req.url.pathname.endsWith('/Primary') ? { body: {} } : { image: poster };
  });
  const result = await fetchLibraryPosters({ type: 'jellyfin', url: fixture.url }, key, 'lib');
  assert.equal(result.uniqueCount, 1);
  assert.equal(result.posters.length, 9);
  assert.deepEqual(result.posters[0], poster);
  blocked = true;
  await assert.rejects(fetchLibraryPosters({ type: 'jellyfin', url: fixture.url }, key, 'lib'), { code: 'MEDIA_FORBIDDEN' });
});

test('saved sorting aliases remain compatible, while unsupported Emby sorting is actionable', async () => {
  const configs = parseLibraryConfigs(JSON.stringify([{ sortBy: 'Name' }, { sortBy: 'DateLastPlayed' }]));
  assert.deepEqual(configs.map(config => config.sortBy), ['SortName', 'DatePlayed']);
  await assert.rejects(getLibraryItems('emby', 'http://127.0.0.1:1', key, 'lib', { sortBy: 'OfficialRating' }), { code: 'MEDIA_UNSUPPORTED_SORT' });
  assert.equal(normalizeServerUrl('https://example.test/media/web/index.html#!/home'), 'https://example.test/media');
  assert.throws(() => normalizeServerUrl('ftp://example.test'), { code: 'MEDIA_INVALID_URL' });
  assert.throws(() => normalizeServerUrl('http://user:password@example.test'), { code: 'MEDIA_INVALID_URL' });
  assert.throws(() => normalizeServerUrl('bad url'), { code: 'MEDIA_INVALID_URL' });
});

for (const type of ['jellyfin', 'emby']) test(`${type} background belongs to the first usable poster and uses its tagged landscape image`, async t => {
  const fixture = await mock(t, req => {
    if (isInfo(req)) return { body: info };
    if (req.url.pathname.endsWith('/Items')) return { body: { Items: [
      { Id: 'broken', ImageTags: { Primary: 'bad' } },
      { Id: 'first', ImageTags: { Primary: 'p1' }, BackdropImageTags: ['b1'] },
      { Id: 'second', ImageTags: { Primary: 'p2' }, BackdropImageTags: ['b2'] }
    ], TotalRecordCount: 3 } };
    if (req.url.pathname.includes('/broken/')) return { status: 404 };
    return { image: poster };
  });
  const result = await fetchLibraryPosters({ type, url: fixture.url }, key, 'lib', 'DateCreated', 1, undefined, 'tvshows', 5, true);
  assert.equal(result.uniqueCount, 2); assert.equal(result.posters.length, 5);
  assert.deepEqual(result.backdrop, poster);
  const backgrounds = fixture.requests.filter(req => req.url.pathname.includes('/Backdrop/'));
  assert.equal(backgrounds.length, 1);
  assert.ok(backgrounds[0].url.pathname.endsWith('/Items/first/Images/Backdrop/0'));
  assert.equal(backgrounds[0].url.searchParams.get('Tag'), 'b1');
  assert.equal(backgrounds[0].url.searchParams.get('MaxWidth'), '1920');
});

test('missing/corrupt backdrop falls back to its poster; other templates skip backdrop downloads', async t => {
  let mode = 'missing';
  const fixture = await mock(t, req => {
    if (isInfo(req)) return { body: info };
    if (req.url.pathname === '/Items') return { body: { Items: [
      { Id: 'first', ImageTags: { Primary: 'p1' }, BackdropImageTags: ['b1'] },
      { Id: 'second', ImageTags: { Primary: 'p2' }, BackdropImageTags: ['b2'] }
    ], TotalRecordCount: 2 } };
    if (req.url.pathname.includes('/Backdrop/')) return mode === 'missing' ? { status: 404 }
      : mode === 'corrupt' ? { body: {} } : { status: 403 };
    return { image: poster };
  });
  const fetch = (backdrop: boolean) => fetchLibraryPosters({ type: 'jellyfin', url: fixture.url }, key, 'lib', 'DateCreated', 1, undefined, undefined, 5, backdrop);
  for (mode of ['missing', 'corrupt']) {
    const result = await fetch(true);
    assert.equal(result.backdrop, undefined); assert.deepEqual(result.posters[0], poster);
  }
  mode = 'blocked';
  await assert.rejects(fetch(true), { code: 'MEDIA_FORBIDDEN' });
  const requestsBefore = fixture.requests.filter(req => req.url.pathname.includes('/Backdrop/')).length;
  assert.equal((await fetch(false)).backdrop, undefined);
  assert.equal(fixture.requests.filter(req => req.url.pathname.includes('/Backdrop/')).length, requestsBefore);
});
