import { z } from 'zod';
import { createRequire } from 'node:module';
import { createError } from '../middleware/errorHandler.js';
import { templateMetadataSchema } from './templateMetadata.service.js';
import { fontManifestSchema, fontDigest, validateFontBuffer, usedFontFamilies, type PackageFont } from './templateFonts.service.js';

export const MAX_TEMPLATE_PACKAGE_BYTES = 64 * 1024 * 1024;
export const MAX_TEMPLATE_CONTENT_BYTES = 5 * 1024 * 1024;
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
}).merge(templateMetadataSchema);

interface ZipEntry { entryName: string; header: { size: number }; getData(): Buffer }
const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip') as new (buffer: Buffer) => { getEntries(): ZipEntry[] };

/** Read the expected files in memory, never extract paths from public packages. */
export function readTemplatePackage(buffer: Buffer, requirePreview = true) {
  if (buffer.length > MAX_TEMPLATE_PACKAGE_BYTES) throw createError('模板包超过 64 MB', 400, 'INVALID_TEMPLATE');
  let entries: ZipEntry[];
  try { entries = new AdmZip(buffer).getEntries(); }
  catch { throw createError('文件不是有效的 ZIP 模板包，可能已损坏。请重新导出或下载后重试。', 400, 'INVALID_TEMPLATE'); }
  if (entries.length > 64 || entries.reduce((size, entry) => size + entry.header.size, 0) > MAX_TEMPLATE_PACKAGE_BYTES) {
    throw createError('模板包解压后超过 64 MB', 400, 'INVALID_TEMPLATE');
  }
  if (new Set(entries.map(entry => entry.entryName)).size !== entries.length
    || entries.some(entry => entry.entryName.startsWith('/') || entry.entryName.includes('\\') || entry.entryName.split('/').includes('..'))) {
    throw createError('模板包包含重复文件或非法路径', 400, 'INVALID_TEMPLATE');
  }
  if (entries.filter(entry => !entry.entryName.startsWith('fonts/')).reduce((size, entry) => size + entry.header.size, 0) > MAX_TEMPLATE_CONTENT_BYTES) {
    throw createError('模板 JSON 和预览图解压后合计超过 5 MB', 400, 'INVALID_TEMPLATE');
  }
  const json = entries.find(entry => entry.entryName === 'template.json');
  const preview = entries.find(entry => /^preview\.(jpg|jpeg|png|webp)$/i.test(entry.entryName));
  if (!json) throw createError('ZIP 根目录缺少 template.json。请将单套模板的 JSON 和预览图直接打包，不要上传整个仓库的 Source code ZIP。', 400, 'INVALID_TEMPLATE');
  if (requirePreview && !preview) throw createError('模板包缺少 preview 预览图', 400, 'INVALID_TEMPLATE');
  let raw: unknown;
  try {
    raw = JSON.parse(json.getData().toString('utf8'));
  } catch {
    throw createError('模板包内容无效：template.json 不是有效的 JSON，请检查括号、引号和逗号，或从应用重新导出。', 400, 'INVALID_TEMPLATE');
  }
  const result = createTemplateSchema.safeParse(raw);
  if (!result.success) {
    const field = result.error.issues[0]?.path.join('.') || 'template.json';
    const help: Record<string, string> = { name: '名称需要是 1–100 字符的文本', canvasJson: '画布必须是包含 objects 数组的 JSON 字符串，不能直接填写对象',
      width: '宽度需要是 100–4000 的整数', height: '高度需要是 100–6000 的整数', version: '版本号请使用 1.0.0 格式',
      minAppVersion: '最低应用版本请使用 1.0.0 格式', 'author.name': '作者名称需要是 1–100 字符的文本', 'author.url': '作者主页需要是有效的 HTTP 或 HTTPS 链接' };
    throw createError(`模板包内容无效：${field} 字段不正确。${help[field] || '请参考仓库中的模板格式，或从应用重新导出。'}`, 400, 'INVALID_TEMPLATE');
  }
  const manifest = fontManifestSchema.safeParse((raw as Record<string, unknown>).fonts ?? []);
  if (!manifest.success) throw createError('模板字体清单无效，请从应用重新导出', 400, 'INVALID_TEMPLATE_FONT');
  const references = usedFontFamilies(result.data.canvasJson);
  const names = new Set<string>(), files = new Set<string>();
  const fonts: PackageFont[] = manifest.data.map(font => {
    const family = font.family.toLowerCase();
    if (names.has(family) || !references.has(family)) {
      throw createError('模板字体清单重复或包含未使用的字体', 400, 'INVALID_TEMPLATE_FONT');
    }
    names.add(family); files.add(font.file);
    const entry = entries.find(item => item.entryName === font.file);
    if (!entry) throw createError(`模板包缺少字体文件 ${font.family}`, 400, 'INVALID_TEMPLATE_FONT');
    let buffer: Buffer;
    try { buffer = entry.getData(); } catch { throw createError('字体文件无法解压', 400, 'INVALID_TEMPLATE_FONT'); }
    validateFontBuffer(buffer, font.file);
    if (fontDigest(buffer) !== font.sha256) throw createError(`字体 ${font.family} 校验失败`, 400, 'INVALID_TEMPLATE_FONT');
    return { ...font, buffer };
  });
  if (entries.some(entry => entry.entryName.startsWith('fonts/') && !entry.entryName.endsWith('/') && !files.has(entry.entryName))) {
    throw createError('模板包的字体文件未在字体清单中声明', 400, 'INVALID_TEMPLATE_FONT');
  }
  const extension = preview?.entryName.split('.').pop()?.toLowerCase();
  let thumbnail: string | undefined;
  if (preview) {
    try { thumbnail = `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${preview.getData().toString('base64')}`; }
    catch { throw createError('预览图无法解压，请重新打包模板 ZIP。', 400, 'INVALID_TEMPLATE'); }
  }
  return { data: result.data, thumbnail, fonts };
}
