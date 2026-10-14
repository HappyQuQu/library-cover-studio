import axios, { type AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

const modeKey = 'network.github.mode', urlKey = 'network.github.proxy';
let revision = 0;
export const githubNetworkRevision = () => revision;
export const githubNetworkSchema = z.object({
  mode: z.enum(['environment', 'direct', 'proxy']),
  proxyUrl: z.string().trim().max(2000).optional()
}).strict();
export type GithubNetworkInput = z.infer<typeof githubNetworkSchema>;
export type GithubNetworkConfig = { mode: GithubNetworkInput['mode']; proxyUrl: string };

export function validateProxyUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) || !url.hostname
    || (url.pathname && url.pathname !== '/') || url.search || url.hash) throw new Error('Invalid proxy URL');
  return url.toString();
}

// Lazy database imports keep version parsing and package validation independent of runtime storage.
export async function readGithubNetworkConfig(): Promise<GithubNetworkConfig> {
  const { db } = await import('../config/database.js');
  const { systemSettings } = await import('../config/schema.js');
  const mode = db.select().from(systemSettings).where(eq(systemSettings.key, modeKey)).get()?.value;
  const value = db.select().from(systemSettings).where(eq(systemSettings.key, urlKey)).get()?.value;
  const proxyUrl = value ? (await import('../utils/crypto.js')).decrypt(value) : '';
  return { mode: mode === 'direct' || mode === 'proxy' ? mode : 'environment', proxyUrl };
}

export function publicGithubNetworkConfig(config: GithubNetworkConfig) {
  if (!config.proxyUrl) return { ...config, hasCredentials: false };
  const url = new URL(config.proxyUrl), hasCredentials = !!(url.username || url.password);
  url.username = ''; url.password = '';
  return { mode: config.mode, proxyUrl: url.toString(), hasCredentials };
}

export async function resolveGithubNetworkConfig(input: GithubNetworkInput): Promise<GithubNetworkConfig> {
  const saved = await readGithubNetworkConfig();
  const proxyUrl = input.proxyUrl === undefined ? saved.proxyUrl : input.proxyUrl ? validateProxyUrl(input.proxyUrl) : '';
  if (input.mode === 'proxy' && !proxyUrl) throw new Error('Proxy URL required');
  return { mode: input.mode, proxyUrl };
}

export async function saveGithubNetworkConfig(config: GithubNetworkConfig) {
  const { db } = await import('../config/database.js');
  const { systemSettings } = await import('../config/schema.js');
  const encrypted = config.proxyUrl ? (await import('../utils/crypto.js')).encrypt(config.proxyUrl) : '';
  db.transaction(tx => {
    for (const [key, value] of [[modeKey, config.mode], [urlKey, encrypted]]) {
      tx.insert(systemSettings).values({ key, value, updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date().toISOString() } }).run();
    }
  });
  revision++;
}

export function githubNetworkOptions(config: GithubNetworkConfig): AxiosRequestConfig {
  if (config.mode === 'environment') return {};
  if (config.mode === 'direct') return { proxy: false };
  const agent = config.proxyUrl.startsWith('socks') ? new SocksProxyAgent(config.proxyUrl) : new HttpsProxyAgent(config.proxyUrl);
  return { proxy: false, httpAgent: agent, httpsAgent: agent };
}

export async function githubGet<T = unknown>(url: string, options: AxiosRequestConfig = {}, network?: GithubNetworkConfig) {
  return axios.get<T>(url, { ...options, ...githubNetworkOptions(network ?? await readGithubNetworkConfig()),
    headers: { 'User-Agent': 'LibraryCoverStudio', ...options.headers } });
}

export function githubNetworkError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 403 || status === 429) return `GitHub 访问受限或达到频率上限（HTTP ${status}）`;
    if (status) return `远端返回 HTTP ${status}`;
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') return 'DNS 无法解析 GitHub 或代理地址';
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return '连接超时，请检查代理和服务器网络';
    if (error.code === 'ECONNREFUSED') return '连接被拒绝，请确认代理地址、端口及访问权限';
  }
  return '连接失败，请检查代理、证书及服务器网络';
}
