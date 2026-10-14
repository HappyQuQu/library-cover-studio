import { type Request, type Response, type NextFunction } from 'express';
import { createError } from '../middleware/errorHandler.js';
import { githubNetworkSchema, readGithubNetworkConfig, resolveGithubNetworkConfig, publicGithubNetworkConfig,
  saveGithubNetworkConfig, githubGet, githubNetworkError } from '../services/githubNetwork.service.js';

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
    const targets = [
      { label: '商店目录', url: 'https://raw.githubusercontent.com/HappyQuQu/library-cover-store/catalog/catalog.json' },
      { label: 'GitHub 发布页', url: 'https://github.com/HappyQuQu/library-cover-studio/releases/latest' },
      { label: 'GitHub API', url: 'https://api.github.com/repos/HappyQuQu/library-cover-studio/releases/latest' }
    ];
    const results = await Promise.all(targets.map(async target => {
      try {
        await githubGet(target.url, { timeout: 12000, maxContentLength: 5 * 1024 * 1024, maxRedirects: 5 }, network);
        return { label: target.label, host: new URL(target.url).hostname, ok: true, message: '连接成功' };
      } catch (error) { return { label: target.label, host: new URL(target.url).hostname, ok: false, message: githubNetworkError(error) }; }
    }));
    res.json({ storeReady: results[0].ok && results[1].ok, results });
  } catch (error) { next(error); }
}
