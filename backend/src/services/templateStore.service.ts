import axios from 'axios';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { createError } from '../middleware/errorHandler.js';
import { MAX_TEMPLATE_PACKAGE_BYTES, readTemplatePackage } from './templatePackage.service.js';

export const STORE_REPOSITORY = 'HappyQuQu/library-cover-store';
export const STORE_URL = `https://github.com/${STORE_REPOSITORY}`;
export const STORE_CATALOG_URL = `https://raw.githubusercontent.com/${STORE_REPOSITORY}/catalog/catalog.json`;
const rawPrefix = `https://raw.githubusercontent.com/${STORE_REPOSITORY}/`;
const downloadPrefix = `${STORE_URL}/releases/download/`;
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const storeEntrySchema = z.object({
  id: hex, revision: hex, name: z.string().min(1).max(100), description: z.string().max(10000).default(''),
  width: z.number().int().min(100).max(4000), height: z.number().int().min(100).max(6000),
  previewUrl: z.string().url().refine(value => new URL(value).href.startsWith(rawPrefix) && !/[?#]/.test(value)),
  packageUrl: z.string().url().refine(value => new URL(value).href.startsWith(downloadPrefix) && !/[?#]/.test(value)),
  packageSha256: hex, downloadCount: z.number().int().nonnegative(),
  folder: z.string().min(1).max(200)
});
const catalogSchema = z.object({
  version: z.literal(1), repository: z.literal(STORE_REPOSITORY), generatedAt: z.string().datetime(),
  pendingCount: z.number().int().nonnegative().default(0), templates: z.array(storeEntrySchema).max(50000)
});
export type StoreEntry = z.infer<typeof storeEntrySchema>;
type Catalog = z.infer<typeof catalogSchema>;
const CACHE_MS = 5 * 60 * 1000;
let cached: { data: Catalog; at: number; setupRequired: boolean } | undefined;
let loading: Promise<typeof cached> | undefined;

export async function getStoreCatalog() {
  if (cached && Date.now() - cached.at < CACHE_MS) return { ...cached, stale: false };
  if (!loading) {
    loading = (async () => {
      try {
        const response = await axios.get(STORE_CATALOG_URL, {
          timeout: 20000, maxContentLength: 16 * 1024 * 1024, responseType: 'json'
        });
        const data = catalogSchema.parse(response.data);
        if (new Set(data.templates.map(entry => entry.id)).size !== data.templates.length) throw new Error('Duplicate store IDs');
        cached = { data, at: Date.now(), setupRequired: false };
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404 && !cached) {
          cached = { data: { version: 1, repository: STORE_REPOSITORY, generatedAt: new Date().toISOString(), pendingCount: 0, templates: [] }, at: Date.now(), setupRequired: true };
        } else throw error;
      }
      return cached;
    })().finally(() => { loading = undefined; });
  }
  try { return { ...(await loading)!, stale: false }; }
  catch {
    if (cached && !cached.setupRequired) return { ...cached, stale: true };
    throw createError('暂时无法读取 GitHub 模板商店，请稍后重试', 502, 'STORE_UNAVAILABLE');
  }
}

export async function downloadStorePackage(entry: StoreEntry) {
  let buffer: Buffer;
  try {
    // Every import fetches the Release attachment so GitHub records a global download.
    // Do not cache ZIPs or send application credentials to GitHub.
    const response = await axios.get<ArrayBuffer>(entry.packageUrl, {
      timeout: 60000, responseType: 'arraybuffer', maxContentLength: MAX_TEMPLATE_PACKAGE_BYTES,
      maxRedirects: 5
    });
    buffer = Buffer.from(response.data);
  } catch { throw createError('模板下载失败，请检查网络后重试', 502, 'STORE_DOWNLOAD_FAILED'); }
  if (createHash('sha256').update(buffer).digest('hex') !== entry.packageSha256) {
    throw createError('模板包校验失败，请等待商店更新后重试', 502, 'STORE_PACKAGE_INVALID');
  }
  const result = readTemplatePackage(buffer);
  if (result.data.name !== entry.name || result.data.width !== entry.width || result.data.height !== entry.height) {
    throw createError('模板包与商店目录不一致', 502, 'STORE_PACKAGE_INVALID');
  }
  return result;
}
