import { z } from 'zod';
import { createRequire } from 'node:module';
import { createError } from '../middleware/errorHandler.js';

export const MAX_TEMPLATE_PACKAGE_BYTES = 5 * 1024 * 1024;
export const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional().transform(value => value ?? undefined),
  canvasJson: z.string().refine(value => {
    try { const canvas = JSON.parse(value); return !!canvas && !Array.isArray(canvas) && Array.isArray(canvas.objects); }
    catch { return false; }
  }, '画布 JSON 格式无效'),
  thumbnail: z.string().optional(),
  width: z.number().int().min(100).max(4000).default(900),
  height: z.number().int().min(100).max(6000).default(600),
  isPublic: z.boolean().default(false),
  isLocked: z.boolean().default(false)
});

interface ZipEntry { entryName: string; header: { size: number }; getData(): Buffer }
const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip') as new (buffer: Buffer) => { getEntries(): ZipEntry[] };

/** Read the expected files in memory, never extract paths from public packages. */
export function readTemplatePackage(buffer: Buffer) {
  if (buffer.length > MAX_TEMPLATE_PACKAGE_BYTES) throw createError('模板包超过 5 MB', 400, 'INVALID_TEMPLATE');
  const entries = new AdmZip(buffer).getEntries();
  if (entries.length > 10 || entries.reduce((size, entry) => size + entry.header.size, 0) > MAX_TEMPLATE_PACKAGE_BYTES) {
    throw createError('模板包解压后超过 5 MB', 400, 'INVALID_TEMPLATE');
  }
  const json = entries.find(entry => entry.entryName === 'template.json');
  const preview = entries.find(entry => /^preview\.(jpg|jpeg|png|webp)$/i.test(entry.entryName));
  if (!json || !preview) throw createError('模板包缺少 template.json 或 preview 预览图', 400, 'INVALID_TEMPLATE');
  try {
    const data = createTemplateSchema.parse(JSON.parse(json.getData().toString('utf8')));
    const extension = preview.entryName.split('.').pop()?.toLowerCase();
    return { data, thumbnail: `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${preview.getData().toString('base64')}` };
  } catch {
    throw createError('模板包内容无效，请检查 JSON 和预览图', 400, 'INVALID_TEMPLATE');
  }
}
