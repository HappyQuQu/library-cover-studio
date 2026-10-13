import { z } from 'zod';
import { createHash } from 'node:crypto';

export const templateVersionSchema = z.string().max(32).regex(/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/, '版本号格式应为 1.0.0');
export const templateMetadataSchema = z.object({
  version: templateVersionSchema.default('1.0.0'),
  author: z.object({ name: z.string().trim().min(1).max(100), url: z.string().url().max(500).refine(value => /^https?:\/\//.test(value), '作者链接必须是 HTTP 或 HTTPS 地址').optional() }).nullish().transform(value => value ?? undefined),
  changelog: z.string().max(10000).default(''),
  minAppVersion: templateVersionSchema.nullish().transform(value => value ?? undefined)
});
export type TemplateMetadata = z.infer<typeof templateMetadataSchema>;

export function readTemplateMetadata(value?: string | null): TemplateMetadata {
  try { return templateMetadataSchema.parse(value ? JSON.parse(value) : {}); }
  catch { return templateMetadataSchema.parse({}); }
}

export function supportsTemplateVersion(appVersion: string, minimum?: string) {
  if (!minimum) return true;
  const actual = appVersion.split('.').map(Number), required = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (actual[index] !== required[index]) return actual[index] > required[index];
  }
  return true;
}

/** Compare saved content, ignoring JSON whitespace/key ordering and derived thumbnails. */
export function templateContentHash(template: { name: string; description: string | null; canvasJson: string; width: number | null; height: number | null; metadataJson?: string | null }) {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
    return value;
  };
  return createHash('sha256').update(JSON.stringify(canonical({ name: template.name, description: template.description || '',
    canvas: JSON.parse(template.canvasJson), width: template.width, height: template.height,
    metadata: readTemplateMetadata(template.metadataJson) }))).digest('hex');
}
