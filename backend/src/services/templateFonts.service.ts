import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GlobalFonts } from '@napi-rs/canvas';
import { FONTS_DIR } from '../config/paths.js';
import { createError } from '../middleware/errorHandler.js';

export const MAX_FONT_BYTES = 50 * 1024 * 1024;
export const MAX_PACKAGE_FONTS = 16;
export const fontManifestSchema = z.array(z.object({
  family: z.string().trim().min(1).max(100).regex(/^[^\\/:*?"<>|\x00-\x1f]+$/),
  file: z.string().regex(/^fonts\/[a-zA-Z0-9_-]+\.(ttf|otf|woff|woff2)$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
})).max(MAX_PACKAGE_FONTS);
export type PackageFont = z.infer<typeof fontManifestSchema>[number] & { buffer: Buffer };
export type ImportedFont = { name: string; filename: string; action: 'installed' | 'reused' };
const extensions = new Set(['.ttf', '.otf', '.woff', '.woff2']);
const systemFamilies = new Set(['arial', 'helvetica', 'times new roman', 'georgia', 'verdana', 'courier new', 'impact', 'comic sans ms', 'inter', 'sans-serif', 'serif', 'monospace']);
const normalize = (name: string) => name.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
export const fontDigest = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

export function fontNameFromFilename(filename: string) {
  let original = filename.replace(/^\d{10,}-/, '');
  if (/[\u0080-\u00ff]/.test(original)) {
    const decoded = Buffer.from(original, 'latin1').toString('utf8');
    if (!decoded.includes('\ufffd')) original = decoded;
  }
  return path.basename(original, path.extname(original));
}

export function customFonts() {
  if (!fs.existsSync(FONTS_DIR)) return [];
  return fs.readdirSync(FONTS_DIR).sort().flatMap(filename => {
    if (!extensions.has(path.extname(filename).toLowerCase())) return [];
    const stat = fs.lstatSync(path.join(FONTS_DIR, filename));
    if (!stat.isFile() || stat.isSymbolicLink()) return [];
    return [{ filename, name: fontNameFromFilename(filename), size: stat.size,
      uploadedAt: stat.mtime, url: `/api/uploads/fonts/${encodeURIComponent(filename)}` }];
  });
}

function families(value: string) {
  return [value, ...value.split(',')].map(normalize);
}

/** Includes nested groups and per-character Fabric text styles. */
export function usedFontFamilies(canvasJson: string) {
  const names = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'fontFamily' && typeof child === 'string') families(child).forEach(name => names.add(name));
      else visit(child);
    }
  };
  visit(JSON.parse(canvasJson));
  return names;
}

export function validateFontBuffer(buffer: Buffer, file: string) {
  const extension = path.extname(file).toLowerCase();
  const magic = buffer.subarray(0, 4).toString('latin1');
  const valid = extension === '.ttf' ? (magic === '\x00\x01\x00\x00' || magic === 'true')
    : extension === '.otf' ? magic === 'OTTO'
    : extension === '.woff' ? magic === 'wOFF'
    : extension === '.woff2' && magic === 'wOF2';
  if (buffer.length < 12 || buffer.length > MAX_FONT_BYTES || !valid) {
    throw createError(`字体文件 ${file} 无效或超过 50 MB`, 400, 'INVALID_TEMPLATE_FONT');
  }
}

export function exportTemplateFonts(canvasJson: string): PackageFont[] {
  const used = usedFontFamilies(canvasJson), selected = new Set<string>();
  return customFonts().flatMap(font => {
    const family = normalize(font.name);
    if (!used.has(family) || selected.has(family)) return [];
    const buffer = fs.readFileSync(path.join(FONTS_DIR, font.filename));
    validateFontBuffer(buffer, font.filename);
    const sha256 = fontDigest(buffer);
    selected.add(family);
    return [{ family: font.name, file: `fonts/${sha256}${path.extname(font.filename).toLowerCase()}`, sha256, buffer }];
  });
}

function remapCanvas(canvasJson: string, aliases: Map<string, string>) {
  if (!aliases.size) return canvasJson;
  const canvas = JSON.parse(canvasJson);
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'fontFamily' && typeof child === 'string') {
        const record = value as Record<string, unknown>;
        record[key] = aliases.get(normalize(child)) ?? child.split(',').map(part => {
          const mapped = aliases.get(normalize(part));
          return mapped ? JSON.stringify(mapped) : part;
        }).join(',');
      } else visit(child);
    }
  };
  visit(canvas);
  return JSON.stringify(canvas);
}

let imports: Promise<unknown> = Promise.resolve();
/** Serialize font imports through template persistence so a failed import can safely roll back its files. */
export async function withTemplateFonts<T>(fonts: PackageFont[], canvasJson: string,
  save: (canvasJson: string, imported: ImportedFont[]) => Promise<T>): Promise<T> {
  if (!fonts.length) return save(canvasJson, []);
  const run = imports.catch(() => undefined).then(async () => {
    const created: string[] = [], imported: ImportedFont[] = [], aliases = new Map<string, string>();
    try {
      fs.mkdirSync(FONTS_DIR, { recursive: true });
      const available = customFonts().map(font => ({ ...font, hash: fontDigest(fs.readFileSync(path.join(FONTS_DIR, font.filename))) }));
      for (const font of fonts) {
        // Identical bytes are shared even when another package used a different family alias.
        const match = available.find(item => item.hash === font.sha256);
        if (match) {
          if (match.name !== font.family) aliases.set(normalize(font.family), match.name);
          imported.push({ name: match.name, filename: match.filename, action: 'reused' });
          continue;
        }
        let name = font.family;
        if (available.some(item => normalize(item.name) === normalize(name)) || systemFamilies.has(normalize(name)) || GlobalFonts.has(name)) {
          name = `${font.family.slice(0, 80)} · ${font.sha256.slice(0, 12)}`;
        }
        const base = name;
        for (let suffix = 2; available.some(item => normalize(item.name) === normalize(name)); suffix++) name = `${base} (${suffix})`;
        const filename = `${Date.now()}-${name}${path.extname(font.file)}`;
        fs.writeFileSync(path.join(FONTS_DIR, filename), font.buffer, { flag: 'wx' });
        created.push(filename);
        available.push({ filename, name, size: font.buffer.length, uploadedAt: new Date(), url: '', hash: font.sha256 });
        if (name !== font.family) aliases.set(normalize(font.family), name);
        imported.push({ name, filename, action: 'installed' });
      }
      return await save(remapCanvas(canvasJson, aliases), imported);
    } catch (error) {
      for (const filename of created) try { fs.unlinkSync(path.join(FONTS_DIR, filename)); } catch { /* Preserve the import error. */ }
      throw error;
    }
  });
  imports = run;
  return run;
}
