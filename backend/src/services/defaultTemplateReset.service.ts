import fs from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { templates } from '../config/schema.js';
import { createError } from '../middleware/errorHandler.js';
import { buildDefaultTemplates } from './bundledTemplates.service.js';
import { templateMetadataSchema, readTemplateMetadata } from './templateMetadata.service.js';
import { resetDefaultTemplateVersions } from './templateHistory.service.js';

type Definition = Awaited<ReturnType<typeof buildDefaultTemplates>>[number];
type Template = typeof templates.$inferSelect;

function matchesDefault(template: Template, definition: Definition) {
  try {
    return template.name === definition.name && template.description === definition.description
      && template.width === 1920 && template.height === 1080 && template.isLocked === 1
      && template.isPublic === 1 && template.isDefault === 1 && template.userId === null
      && isDeepStrictEqual(readTemplateMetadata(template.metadataJson), templateMetadataSchema.parse(definition))
      && isDeepStrictEqual(JSON.parse(template.canvasJson), definition.canvas);
  } catch { return false; }
}

export async function getDefaultTemplateStatus() {
  const items = (await buildDefaultTemplates()).map(definition => {
    const current = db.select().from(templates).where(eq(templates.id, definition.id)).get();
    return { id: definition.id, name: definition.name,
      state: !current ? 'missing' : !current.isDefault ? 'conflict' : matchesDefault(current, definition) ? 'unchanged' : 'modified' };
  });
  return { total: items.length, modified: items.filter(item => item.state === 'modified').length,
    missing: items.filter(item => item.state === 'missing').length, templates: items };
}

/** Restore the project's canonical IDs so existing automation assignments keep working. */
export async function restoreDefaultTemplates(savedBy: string) {
  const definitions = await buildDefaultTemplates();
  const replacements = [];
  const expected: { id: string; existing?: Template }[] = [];
  let restored = 0, recreated = 0;
  for (const definition of definitions) {
    const existing = db.select().from(templates).where(eq(templates.id, definition.id)).get();
    expected.push({ id: definition.id, existing });
    if (existing && !existing.isDefault) throw createError('默认模板 ID 被自建模板占用，请先导出并处理冲突', 409, 'DEFAULT_TEMPLATE_CONFLICT');
    if (existing && matchesDefault(existing, definition)) continue;
    const now = new Date().toISOString();
    const next: Template = { id: definition.id, name: definition.name, description: definition.description,
      canvasJson: JSON.stringify(definition.canvas), width: 1920, height: 1080, userId: null,
      metadataJson: JSON.stringify(templateMetadataSchema.parse(definition)),
      isPublic: 1, isLocked: 1, isDefault: 1, thumbnailPath: null,
      createdAt: existing?.createdAt || now, updatedAt: now };
    const preview = await fs.readFile(definition.previewPath);
    replacements.push({ existing, next, preview });
    if (existing) restored++; else recreated++;
  }
  await resetDefaultTemplateVersions(replacements, savedBy, expected);
  return { total: definitions.length, restored, recreated, unchanged: definitions.length - restored - recreated };
}
