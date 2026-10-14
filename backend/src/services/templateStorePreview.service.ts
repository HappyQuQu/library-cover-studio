import sharp from 'sharp';
import { githubGet } from './githubNetwork.service.js';
import { type StoreEntry } from './templateStore.service.js';
import { createError } from '../middleware/errorHandler.js';

const images = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();

export async function storePreview(entry: StoreEntry) {
  const key = `${entry.id}:${entry.revision}`;
  const cached = images.get(key);
  if (cached) return cached;
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      const response = await githubGet<ArrayBuffer>(entry.previewUrl, { timeout: 20000, responseType: 'arraybuffer', maxContentLength: 8 * 1024 * 1024 });
      const image = sharp(Buffer.from(response.data), { limitInputPixels: 40_000_000 });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format || '')) throw new Error('Invalid store preview');
      const buffer = await image.resize(640, 640, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      if (images.size >= 64) images.delete(images.keys().next().value!);
      images.set(key, buffer);
      return buffer;
    })().catch(() => { throw createError('预览图暂时无法获取，请检查 GitHub 网络设置', 502, 'STORE_PREVIEW_UNAVAILABLE'); })
      .finally(() => pending.delete(key)));
  }
  return pending.get(key)!;
}
