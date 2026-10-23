import { parseStoreCatalog, STORE_CATALOG_URL } from '../services/templateStore.service.js';
import { type Request, type Response, type NextFunction } from 'express';
import { createError } from '../middleware/errorHandler.js';
import { githubNetworkSchema, readGithubNetworkConfig, resolveGithubNetworkConfig, publicGithubNetworkConfig,
  saveGithubNetworkConfig, githubGet, githubHead, githubFailure, githubNetworkError, GithubRequestError } from '../services/githubNetwork.service.js';

export async function getGithubNetwork(_req: Request, res: Response, next: NextFunction) {
  try { res.json(publicGithubNetworkConfig(await readGithubNetworkConfig())); } catch (error) { next(error); }
}

async function parseConfig(req: Request) {
  const parsed = githubNetworkSchema.safeParse(req.body);
  if (!parsed.success) throw createError('网络设置格式无效', 400, 'INVALID_NETWORK_SETTINGS');
  try { return await resolveGithubNetworkConfig(parsed.data); }
  catch { throw createError('请输入有效的 HTTP、HTTPS、SOCKS5 或 SOCKS5H 代理地址', 400, 'INVALID_PROXY_URL'); }
}

export async function updateGithubNetwork(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await parseConfig(req);
    await saveGithubNetworkConfig(config);
    res.json(publicGithubNetworkConfig(config));
  } catch (error) { next(error); }
}

export async function testGithubNetwork(req: Request, res: Response, next: NextFunction) {
  try {
    const network = await parseConfig(req);
    const options = { timeout: 12000, maxContentLength: 16 * 1024 * 1024, maxRedirects: 5 };
    const failure = (id: string, host: string, error: unknown) => ({ id, host, ok: false, ...githubFailure(error), message: githubNetworkError(error) });
    const connected = (id: string, host: string) => ({ id, host, ok: true, reachable: true, code: 'CONNECTED', message: '连接成功' });
    const catalog = githubGet(STORE_CATALOG_URL, options, network).then(response => {
      try { return { result: connected('catalog', 'raw.githubusercontent.com'), data: parseStoreCatalog(response.data) }; }
      catch { throw new GithubRequestError({ code: 'INVALID_RESPONSE', reachable: true }); }
    }).catch(error => ({ result: failure('catalog', 'raw.githubusercontent.com', error), data: null }));
    const probe = async (id: string, url: string) => {
      const host = new URL(url).hostname;
      try { await githubGet(url, options, network); return connected(id, host); }
      catch (error) { return failure(id, host, error); }
    };
    const download = catalog.then(async ({ data }) => {
      const entry = data?.templates[0];
      if (!entry) return { id: 'download', host: 'github.com', ok: false, reachable: false, code: 'NOT_TESTED', message: '没有可用于验证下载的模板目录项' };
      try { await githubHead(entry.packageUrl, options, network); return connected('download', 'github.com'); }
      catch (error) { return failure('download', 'github.com', error); }
    });
    const [directory, downloadResult, releases, api] = await Promise.all([catalog, download,
      probe('releases', 'https://github.com/HappyQuQu/library-cover-studio/releases/latest'),
      probe('api', 'https://api.github.com/repos/HappyQuQu/library-cover-studio/releases/latest')]);
    res.json({ storeReady: directory.result.ok && downloadResult.ok, catalogReady: directory.result.ok,
      downloadsReady: downloadResult.code === 'NOT_TESTED' ? null : downloadResult.ok,
      versionCheckReady: releases.ok || api.ok, liveCountsReady: api.ok,
      results: [directory.result, downloadResult, releases, api] });
  } catch (error) { next(error); }
}
