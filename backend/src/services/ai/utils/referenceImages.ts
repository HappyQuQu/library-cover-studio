import sharp from 'sharp';
import { createError } from '../../../middleware/errorHandler.js';

export interface ReferenceImage { dataUrl: string }
export const MAX_REFERENCE_IMAGES = 3;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Decode real image bytes instead of trusting an extension or accepting external URLs. */
export async function parseReferenceImages(value: unknown): Promise<ReferenceImage[]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_REFERENCE_IMAGES) throw createError('最多添加 3 张参考图', 400);
  return Promise.all(value.map(async entry => {
    const source = entry?.dataUrl;
    if (typeof source !== 'string' || source.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 100) throw createError('参考图不能超过 2 MB，请压缩后重新上传', 413);
    const match = source.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || match[2].length % 4 !== 0) throw createError('参考图格式无效，请使用 JPG、PNG 或 WebP 图片', 400);
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > MAX_IMAGE_BYTES) throw createError('参考图不能超过 2 MB', 413);
    try {
      const image = sharp(bytes, { limitInputPixels: 40_000_000 });
      const metadata = await image.metadata();
      if (metadata.format !== match[1] || !metadata.width || !metadata.height) throw new Error('Invalid image');
      const normalized = await image.rotate().resize({ width: 1536, height: 1536, fit:'inside', withoutEnlargement:true })
        .flatten({background:'#ffffff'}).jpeg({quality:85}).toBuffer();
      return { dataUrl:`data:image/jpeg;base64,${normalized.toString('base64')}` };
    } catch { throw createError('参考图无法读取，请重新选择有效的图片', 400); }
  }));
}

export function referenceImageError(error: any, hasImages: boolean): string {
  const message = error?.message || 'AI 服务请求失败，请重试';
  if (hasImages && /(?:not support|unsupported|does not|cannot).*(?:image|vision|multimodal)|(?:image|vision).*(?:not support|unsupported)/i.test(message)) {
    return '当前模型或接口不支持图片输入，请选择支持视觉理解的模型后重试';
  }
  return message;
}
