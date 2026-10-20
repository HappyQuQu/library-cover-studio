import axios from 'axios';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { createError } from '../middleware/errorHandler.js';
import { MAX_TEMPLATE_PACKAGE_BYTES, readTemplatePackage } from './templatePackage.service.js';
import { templateMetadataSchema } from './templateMetadata.service.js';
import { githubGet, githubNetworkRevision } from './githubNetwork.service.js';

export const STORE_REPOSITORY = 'HappyQuQu/library-cover-store';
export const STORE_URL = `https://github.com/${STORE_REPOSITORY}`;
export const STORE_CATALOG_URL = `https://raw.githubusercontent.com/${STORE_REPOSITORY}/catalog/catalog.json`;
const rawPrefix = `https://raw.githubusercontent.com/${STORE_REPOSITORY}/`;
const downloadPrefix = `${STORE_URL}/releases/download/`;
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const classificationSchema = z.object({
  recommendedUses: z.array(z.enum(['library', 'collection'])).min(1).max(2),
  artworkType: z.enum(['poster', 'backdrop', 'mixed', 'none']),
  artworkCount: z.number().int().min(0).max(9),
  tags: z.array(z.string().trim().min(1).max(40)).max(12)
});
const storeEntrySchema = z.object({
  id: hex, revision: hex, name: z.string().min(1).max(100), description: z.string().max(10000).default(''),
  width: z.number().int().min(100).max(4000), height: z.number().int().min(100).max(6000),
  previewUrl: z.string().url().refine(value => new URL(value).href.startsWith(rawPrefix) && !/[?#]/.test(value)),
  packageUrl: z.string().url().refine(value => new URL(value).href.startsWith(downloadPrefix) && !/[?#]/.test(value)),
  packageSha256: hex, downloadCount: z.number().int().nonnegative(),
  folder: z.string().min(1).max(200),
  // Catalog-only data: old packages and saved local templates retain their revisions.
  classification: classificationSchema.optional(),
  publishedAt: z.string().datetime().optional(),
  downloadSources: z.array(z.object({ releaseId: z.number().int().positive(), downloadCount: z.number().int().nonnegative() })).optional()
}).merge(templateMetadataSchema);
const catalogSchema = z.object({
  version: z.literal(1), repository: z.literal(STORE_REPOSITORY), generatedAt: z.string().datetime(),
  pendingCount: z.number().int().nonnegative().default(0), templates: z.array(storeEntrySchema).max(50000)
});
export type StoreEntry = z.infer<typeof storeEntrySchema>;
type Catalog = z.infer<typeof catalogSchema>;
const CACHE_MS = 5 * 60 * 1000;
let cached: { data: Catalog; at: number; setupRequired: boolean } | undefined;
let loading: Promise<typeof cached> | undefined;
let networkRevision = githubNetworkRevision();

export async function getStoreCatalog() {
  if (networkRevision !== githubNetworkRevision()) { networkRevision = githubNetworkRevision(); cached = undefined; loading = undefined; }
  if (cached && Date.now() - cached.at < CACHE_MS) return { ...cached, stale: false };
  if (!loading) {
    const requestRevision = networkRevision;
    const request = (async () => {
      let result: NonNullable<typeof cached>;
      try {
        const response = await githubGet(STORE_CATALOG_URL, {
          timeout: 20000, maxContentLength: 16 * 1024 * 1024, responseType: 'json'
        });
        const data = catalogSchema.parse(response.data);
        if (new Set(data.templates.map(entry => entry.id)).size !== data.templates.length) throw new Error('Duplicate store IDs');
        result = { data, at: Date.now(), setupRequired: false };
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404 && !cached) {
          result = { data: { version: 1, repository: STORE_REPOSITORY, generatedAt: new Date().toISOString(), pendingCount: 0, templates: [] }, at: Date.now(), setupRequired: true };
        } else throw error;
      }
      if (requestRevision === githubNetworkRevision()) cached = result;
      return result;
    })().finally(() => { if (loading === request) loading = undefined; });
    loading = request;
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
    const response = await githubGet<ArrayBuffer>(`${entry.packageUrl}?download=${randomUUID()}`, {
      timeout: 60000, responseType: 'arraybuffer', maxContentLength: MAX_TEMPLATE_PACKAGE_BYTES,
      maxRedirects: 5
    });
    buffer = Buffer.from(response.data);
  } catch { throw createError('模板下载失败，请检查网络后重试', 502, 'STORE_DOWNLOAD_FAILED'); }
  if (createHash('sha256').update(buffer).digest('hex') !== entry.packageSha256) {
    throw createError('模板包校验失败，请等待商店更新后重试', 502, 'STORE_PACKAGE_INVALID');
  }
  const result = readTemplatePackage(buffer);
  if (result.data.name !== entry.name || result.data.width !== entry.width || result.data.height !== entry.height
    || JSON.stringify(templateMetadataSchema.parse(result.data)) !== JSON.stringify(templateMetadataSchema.parse(entry))) {
    throw createError('模板包与商店目录不一致', 502, 'STORE_PACKAGE_INVALID');
  }
  return result;
}
