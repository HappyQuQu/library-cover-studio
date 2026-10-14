import { readFileSync } from 'node:fs';
import axios from 'axios';
import { APP_VERSION } from '../config/version.js';
import { githubGet as networkGet, githubNetworkRevision } from './githubNetwork.service.js';

export const PROJECT_URL = 'https://github.com/HappyQuQu/library-cover-studio';
export const AUTHOR_URL = 'https://github.com/HappyQuQu';
const RELEASES_API = 'https://api.github.com/repos/HappyQuQu/library-cover-studio/releases';
export const RELEASES_PAGE = `${PROJECT_URL}/releases/latest`;
const RAW_REPOSITORY = 'https://raw.githubusercontent.com/HappyQuQu/library-cover-studio';
const CACHE_MS = 30 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const REFRESH_MIN_MS = 60 * 1000;

export interface AppRelease {
  version: string;
  name: string;
  publishedAt: string | null;
  notes: string;
  url: string;
}

export function stableVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^v?((?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8}))(?:\+[\da-zA-Z.-]+)?$/.exec(value);
  return match?.[1] ?? null;
}

export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

export function parseChangelog(markdown: string): AppRelease[] {
  return markdown.split(/^## /m).slice(1).flatMap(section => {
    const header = /^\[([^\]]+)\]\([^\n]+\) \((\d{4}-\d{2}-\d{2})\)/.exec(section);
    const version = stableVersion(header?.[1]);
    if (!header || !version) return [];
    return [{ version, name: `v${version}`, publishedAt: header[2],
      notes: section.slice(section.indexOf('\n') + 1).trim(), url: `${PROJECT_URL}/releases/tag/v${version}` }];
  });
}

function bundledReleases(): AppRelease[] {
  // Production builds carry the changelog in dist; development reads the repo source.
  for (const path of ['../CHANGELOG.md', '../../../CHANGELOG.md']) {
    try { return parseChangelog(readFileSync(new URL(path, import.meta.url), 'utf8')); }
    catch { /* Try the source location. */ }
  }
  return [];
}

export function parseGitHubRelease(value: unknown): AppRelease | null {
  if (!value || typeof value !== 'object') return null;
  const release = value as Record<string, unknown>;
  const version = stableVersion(release.tag_name);
  if (!version || release.draft !== false || release.prerelease !== false) return null;
  return { version, name: typeof release.name === 'string' && release.name ? release.name : `v${version}`,
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
    notes: typeof release.body === 'string' ? release.body : '',
    url: `${PROJECT_URL}/releases/tag/${encodeURIComponent(release.tag_name as string)}` };
}

async function githubGet(url: string): Promise<unknown> {
  try {
    const response = await networkGet(url, { timeout: 8000, maxContentLength: 5 * 1024 * 1024,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LibraryCoverStudio', 'X-GitHub-Api-Version': '2022-11-28' } });
    return url === RELEASES_PAGE ? { releaseUrl: response.request?.res?.responseUrl } : response.data;
  } catch (error) {
    if (url.endsWith('/latest') && axios.isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
}

export function parseReleaseRedirect(value: unknown): { version: string; tag: string } | null {
  if (!value || typeof value !== 'object' || !('releaseUrl' in value) || typeof value.releaseUrl !== 'string') return null;
  try {
    const url = new URL(value.releaseUrl);
    const prefix = '/HappyQuQu/library-cover-studio/releases/tag/';
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith(prefix)) return null;
    const tag = decodeURIComponent(url.pathname.slice(prefix.length));
    const version = stableVersion(tag);
    return version ? { version, tag } : null;
  } catch { return null; }
}

function checkFailure(error: unknown) {
  if (axios.isAxiosError(error) && [403, 429].includes(error.response?.status ?? 0)) return 'GitHub API 访问受限或已达到访问频率上限';
  return '无法连接 GitHub API 或版本响应无效';
}

export function createAppReleaseService(get = githubGet, local = bundledReleases()) {
  let releases = local;
  let latestVersion: string | null = null;
  let checkedAt: string | null = null;
  let attemptedAt: number | null = null;
  let stale = true;
  let checkSource: 'github-api' | 'github-web' | null = null;
  let checkError: string | null = null;
  let pending: Promise<void> | null = null;
  let networkRevision = githubNetworkRevision();

  async function refresh() {
    attemptedAt = Date.now();
    const [latest, history] = await Promise.allSettled([get(`${RELEASES_API}/latest`), get(`${RELEASES_API}?per_page=100`)]);
    if (history.status === 'fulfilled' && Array.isArray(history.value)) {
      const merged = new Map([...local, ...releases].map(release => [release.version, release]));
      for (const value of history.value) {
        const release = parseGitHubRelease(value);
        if (release) merged.set(release.version, release);
      }
      releases = [...merged.values()];
    }
    const latestError: unknown = latest.status === 'rejected' ? latest.reason : new Error('Invalid release response');
    if (latest.status === 'fulfilled') {
      const release = parseGitHubRelease(latest.value);
      // A malformed response must not turn a failed check into an "up to date" result.
      if (latest.value === null || release) {
        latestVersion = release?.version ?? null;
        checkedAt = new Date().toISOString();
        stale = false;
        checkSource = 'github-api';
        checkError = null;
        if (release) releases = [...releases.filter(item => item.version !== release.version), release];
      } else stale = true;
    } else stale = true;
    if (stale) {
      try {
        // Follow the official latest-release redirect. Never treat main's development version as a release.
        const published = parseReleaseRedirect(await get(RELEASES_PAGE));
        if (!published) throw new Error('Invalid latest-release redirect');
        latestVersion = published.version;
        checkedAt = new Date().toISOString();
        stale = false;
        checkSource = 'github-web';
        checkError = null;
        try {
          const markdown = await get(`${RAW_REPOSITORY}/${encodeURIComponent(published.tag)}/CHANGELOG.md`);
          if (typeof markdown === 'string') {
            const merged = new Map(releases.map(release => [release.version, release]));
            for (const release of parseChangelog(markdown)) {
              if (compareVersions(release.version, published.version) <= 0) merged.set(release.version, release);
            }
            releases = [...merged.values()];
          }
        } catch { /* Version detection succeeded; cached notes remain usable. */ }
        if (!releases.some(release => release.version === published.version)) {
          releases.push({ version: published.version, name: published.tag, publishedAt: null, notes: '',
            url: `${PROJECT_URL}/releases/tag/${encodeURIComponent(published.tag)}` });
        }
      } catch {
        checkError = `${checkFailure(latestError)}，发布页备用检查也未成功。请稍后重试。`;
      }
    }
    releases.sort((a, b) => compareVersions(b.version, a.version));
  }

  return async (force = false) => {
    if (networkRevision !== githubNetworkRevision()) {
      if (pending) await pending;
      networkRevision = githubNetworkRevision(); attemptedAt = null;
    }
    const age = attemptedAt === null ? Infinity : Date.now() - attemptedAt;
    if (age >= (force ? REFRESH_MIN_MS : (stale ? RETRY_MS : CACHE_MS))) {
      // Share one check across tabs/users and keep failures from hammering GitHub.
      if (!pending) pending = refresh().finally(() => { pending = null; });
    }
    if (pending) await pending;
    return { currentVersion: APP_VERSION, latestVersion,
      updateAvailable: latestVersion !== null && compareVersions(latestVersion, APP_VERSION) > 0,
      checkedAt, stale, checkSource, checkError, releases, projectUrl: PROJECT_URL, authorUrl: AUTHOR_URL };
  };
}

export const getAppReleases = createAppReleaseService();
