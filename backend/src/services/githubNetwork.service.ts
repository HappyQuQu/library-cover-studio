import axios, { AxiosHeaders, type AxiosRequestConfig } from 'axios';
import { createHash } from 'node:crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

const modeKey = 'network.github.mode', urlKey = 'network.github.proxy', tokenKey = 'network.github.token';
let revision = 0;
export const githubNetworkRevision = () => revision;
export const githubNetworkSchema = z.object({
  mode: z.enum(['environment', 'direct', 'proxy']),
  proxyUrl: z.string().trim().max(2000).optional(),
  token: z.string().trim().min(1).max(1000).regex(/^\S+$/).optional(),
  clearToken: z.boolean().optional()
}).strict().refine(input => !input.token || !input.clearToken);
export type GithubNetworkInput = z.infer<typeof githubNetworkSchema>;
export type GithubNetworkConfig = { mode: GithubNetworkInput['mode']; proxyUrl: string; token?: string; savedToken?: string; tokenSource?: 'settings' | 'environment' | 'none' };

export function validateProxyUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) || !url.hostname
    || (url.pathname && url.pathname !== '/') || url.search || url.hash) throw new Error('Invalid proxy URL');
  return url.toString();
}
function withToken(config: GithubNetworkConfig, savedToken: string): GithubNetworkConfig {
  const environment = process.env.GITHUB_TOKEN?.trim() || '';
  return { ...config, savedToken, token: savedToken || environment,
    tokenSource: savedToken ? 'settings' : environment ? 'environment' : 'none' };
}

// Lazy database imports keep version parsing and package validation independent of runtime storage.
export async function readGithubNetworkConfig(): Promise<GithubNetworkConfig> {
  const { db } = await import('../config/database.js');
  const { systemSettings } = await import('../config/schema.js');
  const read = (key: string) => db.select().from(systemSettings).where(eq(systemSettings.key, key)).get()?.value;
  const mode = read(modeKey), value = read(urlKey), token = read(tokenKey);
  const { decrypt } = await import('../utils/crypto.js');
  return withToken({ mode: mode === 'direct' || mode === 'proxy' ? mode : 'environment', proxyUrl: value ? decrypt(value) : '' }, token ? decrypt(token) : '');
}

export function publicGithubNetworkConfig(config: GithubNetworkConfig) {
  const url = config.proxyUrl ? new URL(config.proxyUrl) : null;
  const hasCredentials = !!(url?.username || url?.password);
  if (url) { url.username = ''; url.password = ''; }
  return { mode: config.mode, proxyUrl: url?.toString() || '', hasCredentials,
    hasToken: !!config.token, tokenSource: config.tokenSource || 'none', hasSavedToken: !!config.savedToken };
}

export async function resolveGithubNetworkConfig(input: GithubNetworkInput): Promise<GithubNetworkConfig> {
  const saved = await readGithubNetworkConfig();
  const proxyUrl = input.proxyUrl === undefined ? saved.proxyUrl : input.proxyUrl ? validateProxyUrl(input.proxyUrl) : '';
  if (input.mode === 'proxy' && !proxyUrl) throw new Error('Proxy URL required');
  return withToken({ mode: input.mode, proxyUrl }, input.clearToken ? '' : input.token ?? saved.savedToken ?? '');
}

export async function saveGithubNetworkConfig(config: GithubNetworkConfig) {
  const { db } = await import('../config/database.js');
  const { systemSettings } = await import('../config/schema.js');
  const { encrypt } = await import('../utils/crypto.js');
  db.transaction(tx => {
    for (const [key, value] of [[modeKey, config.mode], [urlKey, config.proxyUrl ? encrypt(config.proxyUrl) : ''],
      [tokenKey, config.savedToken ? encrypt(config.savedToken) : '']]) {
      tx.insert(systemSettings).values({ key, value, updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date().toISOString() } }).run();
    }
  });
  revision++; cooldowns.clear();
}

export function githubNetworkOptions(config: GithubNetworkConfig): AxiosRequestConfig {
  if (config.mode === 'environment') return {};
  if (config.mode === 'direct') return { proxy: false };
  const agent = config.proxyUrl.startsWith('socks') ? new SocksProxyAgent(config.proxyUrl) : new HttpsProxyAgent(config.proxyUrl);
  return { proxy: false, httpAgent: agent, httpsAgent: agent };
}

export interface GithubFailure {
  code: 'RATE_LIMITED' | 'SECONDARY_RATE_LIMITED' | 'TOKEN_INVALID' | 'ACCESS_DENIED' | 'HTTP_ERROR' | 'DNS_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'CONNECTION_FAILED';
  reachable: boolean; status?: number; retryAt?: string; limit?: number; remaining?: number; authenticated?: boolean;
}
export class GithubRequestError extends Error {
  constructor(readonly failure: GithubFailure) { super(githubFailureMessage(failure)); this.name = 'GithubRequestError'; }
}
const cooldowns = new Map<string, { until: number; failure: GithubFailure }>();
export function githubFailure(error: unknown, authenticated = false): GithubFailure {
  if (error instanceof GithubRequestError) return error.failure;
  if (!axios.isAxiosError(error)) return { code: 'CONNECTION_FAILED', reachable: false };
  const status = error.response?.status;
  const headers = new AxiosHeaders(error.response?.headers as Parameters<typeof AxiosHeaders.from>[0]);
  const number = (key: string) => { const value = headers.get(key); return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined; };
  const remaining = number('x-ratelimit-remaining'), limit = number('x-ratelimit-limit');
  const retry = number('retry-after'), reset = number('x-ratelimit-reset');
  if ((status === 403 || status === 429) && (remaining === 0 || status === 429 || retry !== undefined || /secondary rate limit|abuse detection/i.test(String(error.response?.data?.message || '')))) {
    const until = retry !== undefined ? Date.now() + Math.max(1, retry) * 1000 : remaining === 0 && reset !== undefined && reset * 1000 > Date.now() ? reset * 1000 : Date.now() + 60000;
    return { code: remaining === 0 ? 'RATE_LIMITED' : 'SECONDARY_RATE_LIMITED', reachable: true, status,
      retryAt: new Date(until).toISOString(), remaining, limit, authenticated };
  }
  if (status) return { code: status === 401 ? 'TOKEN_INVALID' : status === 403 ? 'ACCESS_DENIED' : 'HTTP_ERROR', reachable: true, status, authenticated };
  return { code: ['ENOTFOUND', 'EAI_AGAIN'].includes(error.code || '') ? 'DNS_ERROR' : ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code || '') ? 'TIMEOUT' : 'CONNECTION_FAILED', reachable: false };
}
export function githubFailureMessage(failure: GithubFailure): string {
  switch (failure.code) {
    case 'RATE_LIMITED': return `GitHub API ${failure.authenticated ? '认证' : '匿名'}额度已用尽；网络已连通，${failure.retryAt} 后重试`;
    case 'SECONDARY_RATE_LIMITED': return `GitHub API 暂时限流；网络已连通，${failure.retryAt} 后重试`;
    case 'TOKEN_INVALID': return 'GitHub Token 无效或已过期';
    case 'ACCESS_DENIED': return 'GitHub 拒绝访问，请检查 Token 权限或访问策略';
    case 'INVALID_RESPONSE': return '连接已建立，但远端响应格式无效';
    case 'HTTP_ERROR': return `远端返回 HTTP ${failure.status}`;
    case 'DNS_ERROR': return 'DNS 无法解析 GitHub 或代理地址';
    case 'TIMEOUT': return '连接超时，请检查代理和服务器网络';
    default: return '连接失败，请检查代理、证书及服务器网络';
  }
}
export function githubNetworkError(error: unknown) { return githubFailureMessage(githubFailure(error)); }
export function githubStatus(error: unknown) { return githubFailure(error).status; }

async function githubRequest<T>(url: string, method: 'GET' | 'HEAD', options: AxiosRequestConfig, network?: GithubNetworkConfig) {
  const config = network ?? await readGithubNetworkConfig();
  const api = new URL(url).origin === 'https://api.github.com';
  const headers = new AxiosHeaders(options.headers as Parameters<typeof AxiosHeaders.from>[0]);
  headers.set('User-Agent', 'LibraryCoverStudio');
  headers.delete('Authorization');
  if (api && config.token) headers.set('Authorization', `Bearer ${config.token}`);
  const key = createHash('sha256').update(JSON.stringify([revision, config.mode, config.proxyUrl, config.token || '', process.env.HTTPS_PROXY || '', process.env.HTTP_PROXY || '', process.env.NO_PROXY || ''])).digest('hex');
  const cached = api ? cooldowns.get(key) : undefined;
  if (cached && cached.until > Date.now()) throw new GithubRequestError(cached.failure);
  try {
    return await axios.request<T>({ ...options, ...githubNetworkOptions(config), url, method, headers,
      beforeRedirect: (redirect, response) => {
        options.beforeRedirect?.(redirect, response);
        if (redirect.protocol !== 'https:' || redirect.hostname !== 'api.github.com' || (redirect.port && String(redirect.port) !== '443')) {
          for (const header of Object.keys(redirect.headers || {})) if (header.toLowerCase() === 'authorization') delete redirect.headers[header];
          delete redirect.auth;
        }
      } });
  } catch (error) {
    const failure = githubFailure(error, !!(api && config.token));
    if (api && failure.retryAt) {
      if (cooldowns.size >= 64) cooldowns.delete(cooldowns.keys().next().value!);
      cooldowns.set(key, { until: Date.parse(failure.retryAt), failure });
    }
    // Never retain Axios config/requests, which may contain API or proxy credentials.
    throw new GithubRequestError(failure);
  }
}
export function githubGet<T = unknown>(url: string, options: AxiosRequestConfig = {}, network?: GithubNetworkConfig) { return githubRequest<T>(url, 'GET', options, network); }
export function githubHead(url: string, options: AxiosRequestConfig = {}, network?: GithubNetworkConfig) { return githubRequest(url, 'HEAD', options, network); }
