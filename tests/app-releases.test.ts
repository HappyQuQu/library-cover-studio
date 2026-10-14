import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_VERSION } from '../backend/src/config/version.ts';
import { compareVersions, stableVersion, parseChangelog, parseGitHubRelease, parseReleaseRedirect, createAppReleaseService, RELEASES_PAGE, PROJECT_URL } from '../backend/src/services/appReleases.service.ts';

const release = (version: string, extra = {}) => ({ tag_name: `v${version}`, name: `Release ${version}`,
  body: '### 修复\n* 修复问题', published_at: '2026-10-14T00:00:00Z', draft: false, prerelease: false, ...extra });
const nextVersion = `${Number(APP_VERSION.split('.')[0]) + 1}.0.0`;

test('update detection compares numeric versions and excludes prereleases, drafts and invalid tags', () => {
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
  assert.ok(compareVersions('2.0.0', '1.99.99') > 0);
  assert.equal(compareVersions('1.7.0', '1.7.0'), 0);
  assert.ok(compareVersions('1.6.9', '1.7.0') < 0);
  assert.equal(stableVersion('v1.7.0+build.2'), '1.7.0');
  for (const tag of ['v1.8.0-beta.1', 'banana', '01.7.0', '1.8', '1.8.0/evil']) assert.equal(stableVersion(tag), null);
  for (const value of [null, {}, release('1.8.0', { draft: true }), release('1.8.0', { prerelease: true }), release('1.8.0-beta.1')]) {
    assert.equal(parseGitHubRelease(value), null);
  }
  assert.match(parseGitHubRelease(release('1.8.0', { html_url: 'javascript:bad()' }))!.url, /^https:\/\/github\.com\/HappyQuQu\/library-cover-studio\/releases\/tag\//);
});

test('bundled changelog preserves release dates and notes and ignores the footer', () => {
  const releases = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
  assert.ok(releases.length >= 5);
  assert.equal(releases[0].version, APP_VERSION);
  assert.match(releases[0].notes, /###/);
  assert.match(releases[0].publishedAt!, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(releases.every(item => !item.notes.includes('本文件由 Release Please')));
  assert.deepEqual(parseChangelog('# Changelog\n\n## 更新日志\n无正式版本'), []);
});

test('release checks share requests, merge history, cache results and preserve update alerts after failures', async t => {
  let clock = Date.now(), requests = 0, failed = false, latest = nextVersion;
  t.mock.method(Date, 'now', () => clock);
  const local = parseChangelog(`## [${APP_VERSION}](https://example.com) (2026-10-13)\n\n* 本机记录`);
  const service = createAppReleaseService(async url => {
    requests++;
    await Promise.resolve();
    if (failed) throw new Error('Rate limited');
    if (url.endsWith('/latest')) return release(latest);
    return [release('0.9.0'), release(APP_VERSION, { body: '* 远程记录' }), release('3.0.0', { prerelease: true }), release('4.0.0', { draft: true })];
  }, local);
  const results = await Promise.all([service(), service(), service(true)]);
  assert.equal(requests, 2);
  assert.ok(results.every(result => result.updateAvailable && !result.stale));
  assert.deepEqual(results[0].releases.map(item => item.version), [nextVersion, APP_VERSION, '0.9.0']);
  assert.equal(results[0].releases[1].notes, '* 远程记录');
  await service(); await service(true);
  assert.equal(requests, 2);
  failed = true; clock += 61_000;
  const stale = await service(true);
  assert.equal(stale.stale, true);
  assert.equal(stale.updateAvailable, true);
  assert.equal(stale.latestVersion, nextVersion);
  assert.equal(stale.checkedAt, results[0].checkedAt);
  await service(true); await service();
  assert.equal(requests, 5, 'failures are not repeatedly retried, including the release-page fallback');
  clock += 301_000; failed = false; latest = APP_VERSION;
  const recovered = await service();
  assert.equal(requests, 7);
  assert.equal(recovered.stale, false);
  assert.equal(recovered.updateAvailable, false, 'equal versions clear the red-dot state');
});

test('offline and malformed checks never claim the installation is up to date', async () => {
  const local = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
  for (const get of [async () => { throw new Error('Offline'); }, async () => ({ error: 'rate limited' })]) {
    const result = await createAppReleaseService(get, local)();
    assert.equal(result.stale, true);
    assert.equal(result.latestVersion, null);
    assert.equal(result.checkedAt, null);
    assert.equal(result.updateAvailable, false);
    assert.ok(result.releases.length >= 5);
  }
  const noReleases = await createAppReleaseService(async url => url.endsWith('/latest') ? null : [], local)();
  assert.equal(noReleases.stale, false);
  assert.equal(noReleases.latestVersion, null);
  const ahead = await createAppReleaseService(async url => url.endsWith('/latest') ? release('1.0.0') : [])();
  assert.equal(ahead.updateAvailable, false);
  const partial = await createAppReleaseService(async url => {
    if (!url.endsWith('/latest')) throw new Error('History unavailable');
    return release(nextVersion);
  }, local)();
  assert.equal(partial.updateAvailable, true);
  assert.ok(partial.releases.some(item => item.version === nextVersion));
  assert.ok(partial.releases.some(item => item.version === APP_VERSION));
});

test('API rate limits fall back to a verified formal-release redirect and tagged changelog', async () => {
  const calls: string[] = [];
  const service = createAppReleaseService(async url => {
    calls.push(url);
    if (url.startsWith('https://api.github.com/')) throw new Error('Rate limit');
    if (url === RELEASES_PAGE) return { releaseUrl: `${PROJECT_URL}/releases/tag/v${nextVersion}` };
    assert.equal(url, `https://raw.githubusercontent.com/HappyQuQu/library-cover-studio/v${nextVersion}/CHANGELOG.md`);
    return `# Changelog\n\n## [99.0.0](https://example.com) (2026-10-14)\n* Unreleased\n\n## [${nextVersion}](https://example.com) (2026-10-14)\n### 新功能\n* Published update`;
  }, []);
  const result = await service();
  assert.equal(result.stale, false);
  assert.equal(result.latestVersion, nextVersion);
  assert.equal(result.updateAvailable, true);
  assert.equal(result.checkSource, 'github-web');
  assert.equal(result.checkError, null);
  assert.ok(result.checkedAt);
  assert.equal(result.releases.length, 1);
  assert.match(result.releases[0].notes, /Published update/);
  await service(); assert.equal(calls.length, 4, 'Fallback checks are cached too');
  for (const url of ['https://evil.example/releases/tag/v9.0.0', `${PROJECT_URL}/tree/main`, `${PROJECT_URL}/releases/tag/v9.0.0-beta.1`, `${PROJECT_URL}/releases/latest`]) {
    assert.equal(parseReleaseRedirect({ releaseUrl: url }), null);
  }
  const withoutNotes = await createAppReleaseService(async url => {
    if (url === RELEASES_PAGE) return { releaseUrl: `${PROJECT_URL}/releases/tag/v${nextVersion}` };
    throw new Error('Unavailable');
  }, [])();
  assert.equal(withoutNotes.stale, false, 'Release detection does not depend on changelog availability');
  assert.equal(withoutNotes.releases[0].version, nextVersion);
});

test('system releases API requires login and is accessible to regular users with offline records', async t => {
  t.mock.method(console, 'error', () => {});
  const directory = mkdtempSync(join(tmpdir(), 'lcs-releases-'));
  process.env.LCS_DATA_DIR = directory;
  process.env.JWT_SECRET = 'releases-test-secret';
  const require = createRequire(new URL('../backend/package.json', import.meta.url));
  const express = require('express');
  const axios = (await import(require.resolve('axios/package.json').replace(/package\.json$/, 'index.js'))).default;
  const database = await import('../backend/src/config/database.ts');
  await database.initDatabase();
  const { users } = await import('../backend/src/config/schema.ts');
  database.db.insert(users).values({ id: 'reader', username: 'reader', passwordHash: 'unused', role: 'user' }).run();
  const original = axios.defaults.adapter;
  axios.defaults.adapter = async () => { throw new Error('Offline fixture'); };
  const { systemRouter } = await import('../backend/src/routes/system.routes.ts');
  const { generateToken } = await import('../backend/src/middleware/auth.ts');
  const { errorHandler } = await import('../backend/src/middleware/errorHandler.ts');
  const app = express();
  app.use('/api/system', systemRouter);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  t.after(async () => {
    axios.defaults.adapter = original;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(resolve));
    database.db.$client.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/api/system/releases`;
  const unauthenticated = await fetch(url);
  assert.equal(unauthenticated.status, 401);
  const response = await fetch(`${url}?refresh=1`, { headers: {
    Authorization: `Bearer ${generateToken({ userId: 'reader', username: 'reader', role: 'user' })}`
  } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.currentVersion, APP_VERSION);
  assert.equal(body.stale, true);
  assert.ok(body.releases.length >= 5);
});
