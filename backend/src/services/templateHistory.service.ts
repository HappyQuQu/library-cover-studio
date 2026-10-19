import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { templates, templateRevisions } from '../config/schema.js';
import { THUMBNAILS_DIR } from '../config/paths.js';
import { createError } from '../middleware/index.js';
import { renderLibraryCover } from './renderer.service.js';

export const TEMPLATE_HISTORY_LIMIT = 50;
type Template = typeof templates.$inferSelect;
type Revision = typeof templateRevisions.$inferInsert;
type TemplateTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Kind = 'save' | 'restore' | 'baseline' | 'default-reset' | 'before-default-reset';
const postersDirectory = fileURLToPath(new URL('../../src/template/poster/', import.meta.url));

export function getTemplateRevisions(templateId: string) {
  return db.select().from(templateRevisions).where(eq(templateRevisions.templateId, templateId))
    .orderBy(desc(templateRevisions.sequence)).limit(TEMPLATE_HISTORY_LIMIT).all();
}

export function getTemplateRevision(templateId: string, revisionId: string) {
  return db.select().from(templateRevisions).where(and(eq(templateRevisions.templateId, templateId), eq(templateRevisions.id, revisionId))).get();
}

async function previewBuffer(template: Template, thumbnail?: string) {
  if (thumbnail !== undefined) {
    const match = thumbnail.match(/^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) throw createError('预览图格式无效，请重新保存', 400, 'THUMBNAIL_INVALID');
    try { return await sharp(Buffer.from(match[1], 'base64')).resize(480, 270, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer(); }
    catch { throw createError('预览图无法读取，请重新保存', 400, 'THUMBNAIL_INVALID'); }
  }
  if (template.thumbnailPath) {
    try { return await fs.readFile(path.join(THUMBNAILS_DIR, path.basename(template.thumbnailPath))); }
    catch { /* Old templates without an image can still acquire a preview. */ }
  }
  const canvas = JSON.parse(template.canvasJson);
  // A version preview represents the saved palette, rather than a new randomized generation.
  canvas.randomOnGeneration = false;
  const buffers = await Promise.all(Array.from({ length: 9 }, (_, index) => fs.readFile(path.join(postersDirectory, `${index + 1}.jpg`))));
  const backdropBuffer = canvas.posterBackground?.source === 'backdrop'
    ? await fs.readFile(path.join(postersDirectory, 'backdrop.jpg')) : undefined;
  if (canvas.objects?.some((object: any) => object.posterVar === 'post1' && object.src === '/api/templates/posters/backdrop-poster.jpg')) {
    buffers[0] = await fs.readFile(path.join(postersDirectory, 'backdrop-poster.jpg'));
  }
  if (canvas.posterSource === 'backdrop') {
    for (let index = 0; index < buffers.length; index++) {
      const sample = canvas.objects?.find((object: any) => object.posterVar === `post${index + 1}`)?.src;
      const embedded = typeof sample === 'string' && sample.match(/^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/);
      buffers[index] = embedded ? Buffer.from(embedded[1], 'base64')
        : await fs.readFile(path.join(postersDirectory, 'backdrops', `${index + 1}.jpg`));
    }
  }
  const title = (variable: string, fallback: string) => canvas.objects?.find((object: any) => object.textVar === variable)?.text || fallback;
  const rendered = await renderLibraryCover(JSON.stringify(canvas), {
    title: template.name, primaryTitle: title('{{primary_title}}', template.name), secondaryTitle: title('{{secondary_title}}', '')
  }, buffers, { width: template.width || 1920, height: template.height || 1080, backdropBuffer });
  return sharp(rendered).resize(480, 270, { fit: 'inside' }).jpeg({ quality: 88 }).toBuffer();
}

async function prepareRevision(template: Template, savedBy: string | null, kind: Kind, thumbnail?: string, restoredFrom?: string): Promise<Revision> {
  const id = randomUUID();
  const buffer = await previewBuffer(template, thumbnail);
  const filename = `revision-${id}.jpg`;
  await fs.writeFile(path.join(THUMBNAILS_DIR, filename), buffer);
  return { id, templateId: template.id, name: template.name, description: template.description, canvasJson: template.canvasJson,
    metadataJson: template.metadataJson ?? null,
    width: template.width || 1920, height: template.height || 1080, isPublic: template.isPublic,
    thumbnailPath: `/thumbnails/${filename}`, savedBy, kind, restoredFrom,
    createdAt: kind === 'baseline' ? template.updatedAt || template.createdAt || new Date().toISOString() : new Date().toISOString() };
}

/** Delete only unreferenced images; a retained version and the current template may share a file. */
export async function cleanupTemplateImages(paths: (string | null | undefined)[]) {
  for (const imagePath of new Set(paths.filter((value): value is string => !!value))) {
    if (db.select({ id: templates.id }).from(templates).where(eq(templates.thumbnailPath, imagePath)).get()
      || db.select({ id: templateRevisions.id }).from(templateRevisions).where(eq(templateRevisions.thumbnailPath, imagePath)).get()) continue;
    await fs.unlink(path.join(THUMBNAILS_DIR, path.basename(imagePath))).catch(() => {});
  }
}

/** Commit the design and its immutable snapshot together, then trim the oldest versions. */
export async function saveTemplateVersion(existing: Template | undefined, next: Template, savedBy: string, kind: 'save' | 'restore' = 'save', thumbnail?: string, restoredFrom?: string,
  onSaved?: (tx: TemplateTransaction, saved: Template) => void) {
  const prepared: Revision[] = [];
  try {
    if (existing && !getTemplateRevisions(existing.id).length) prepared.push(await prepareRevision(existing, existing.userId, 'baseline'));
    // Without a submitted thumbnail, a changed design must be rendered instead of copying a stale image.
    const designChanged = existing && (next.canvasJson !== existing.canvasJson || next.width !== existing.width || next.height !== existing.height);
    const snapshot = await prepareRevision(designChanged && thumbnail === undefined && kind !== 'restore' ? { ...next, thumbnailPath: null } : next,
      savedBy, kind, thumbnail, restoredFrom);
    prepared.push(snapshot);
    const removed = db.transaction(tx => {
      if (existing) {
        const current = tx.select().from(templates).where(eq(templates.id, existing.id)).get();
        if (!current) throw createError('模板不存在', 404, 'TEMPLATE_NOT_FOUND');
        if (current.isLocked) throw createError('模板已锁定，请先解锁再编辑或回退', 409, 'TEMPLATE_LOCKED');
        if (JSON.stringify(current) !== JSON.stringify(existing)) throw createError('模板已发生变化，请刷新后重试', 409, 'TEMPLATE_CHANGED');
        tx.update(templates).set({ name: next.name, description: next.description, canvasJson: next.canvasJson,
          metadataJson: next.metadataJson ?? null,
          width: next.width, height: next.height, isPublic: next.isPublic, thumbnailPath: snapshot.thumbnailPath,
          updatedAt: snapshot.createdAt }).where(eq(templates.id, existing.id)).run();
      } else {
        tx.insert(templates).values({ ...next, thumbnailPath: snapshot.thumbnailPath }).run();
      }
      for (const revision of prepared) tx.insert(templateRevisions).values(revision).run();
      onSaved?.(tx, { ...next, thumbnailPath: snapshot.thumbnailPath, updatedAt: snapshot.createdAt });
      const stale = tx.select().from(templateRevisions).where(eq(templateRevisions.templateId, next.id))
        .orderBy(desc(templateRevisions.sequence)).all().slice(TEMPLATE_HISTORY_LIMIT);
      for (const revision of stale) tx.delete(templateRevisions).where(eq(templateRevisions.id, revision.id)).run();
      return stale.map(revision => revision.thumbnailPath);
    });
    await cleanupTemplateImages([...removed, existing?.thumbnailPath]);
    return { ...next, thumbnailPath: snapshot.thumbnailPath, updatedAt: snapshot.createdAt, revisionId: snapshot.id };
  } catch (error) {
    await cleanupTemplateImages(prepared.map(revision => revision.thumbnailPath));
    throw error;
  }
}

/** Explicit admin reset: preserve the previous design and replace the entire set atomically. */
export async function resetDefaultTemplateVersions(replacements: { existing?: Template; next: Template; preview: Buffer }[], savedBy: string, expected?: { id: string; existing?: Template }[]) {
  if (!replacements.length) return;
  const prepared: { existing?: Template; next: Template; revisions: Revision[] }[] = [];
  const files: string[] = [];
  try {
    for (const replacement of replacements) {
      const revisions: Revision[] = [];
      if (replacement.existing) {
        let before: Revision;
        try { before = await prepareRevision(replacement.existing, savedBy, 'before-default-reset'); }
        catch {
          // A broken legacy design must remain recoverable without blocking restoration.
          const placeholder = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#202020"/><text x="240" y="135" text-anchor="middle" fill="#eeeeee" font-family="sans-serif" font-size="20">原设计无法生成预览</text></svg>')).png().toBuffer();
          before = await prepareRevision(replacement.existing, savedBy, 'before-default-reset', `data:image/png;base64,${placeholder.toString('base64')}`);
        }
        revisions.push(before); files.push(before.thumbnailPath!);
      }
      const reset = await prepareRevision(replacement.next, savedBy, 'default-reset',
        `data:image/jpeg;base64,${replacement.preview.toString('base64')}`);
      revisions.push(reset); files.push(reset.thumbnailPath!);
      prepared.push({ ...replacement, next: { ...replacement.next, thumbnailPath: reset.thumbnailPath!, updatedAt: reset.createdAt }, revisions });
    }
    const removed = db.transaction(tx => {
      // Validate all rows before any writes: concurrent edits cannot produce a partial reset.
      for (const { id, existing } of expected || prepared.map(item => ({ id: item.next.id, existing: item.existing }))) {
        const current = tx.select().from(templates).where(eq(templates.id, id)).get();
        if (JSON.stringify(current) !== JSON.stringify(existing)) throw createError('模板已发生变化，请刷新后重试', 409, 'TEMPLATE_CHANGED');
        if (current && !current.isDefault) throw createError('不能覆盖自建模板', 409, 'DEFAULT_TEMPLATE_CONFLICT');
      }
      const paths: (string | null)[] = [];
      for (const { existing, next, revisions } of prepared) {
        if (existing) tx.update(templates).set(next).where(eq(templates.id, next.id)).run();
        else tx.insert(templates).values(next).run();
        for (const revision of revisions) tx.insert(templateRevisions).values(revision).run();
        const stale = tx.select().from(templateRevisions).where(eq(templateRevisions.templateId, next.id))
          .orderBy(desc(templateRevisions.sequence)).all().slice(TEMPLATE_HISTORY_LIMIT);
        for (const revision of stale) tx.delete(templateRevisions).where(eq(templateRevisions.id, revision.id)).run();
        paths.push(existing?.thumbnailPath || null, ...stale.map(revision => revision.thumbnailPath));
      }
      return paths;
    });
    await cleanupTemplateImages(removed);
  } catch (error) {
    await cleanupTemplateImages(files);
    throw error;
  }
}

/** Existing installations start with their current design, including locked defaults. */
export async function initializeTemplateHistory() {
  for (const template of db.select().from(templates).all()) {
    if (getTemplateRevisions(template.id).length) continue;
    const baseline = await prepareRevision(template, template.userId, 'baseline');
    try {
      db.transaction(tx => {
        const current = tx.select().from(templates).where(eq(templates.id, template.id)).get();
        if (!current || JSON.stringify(current) !== JSON.stringify(template) || getTemplateRevisions(template.id).length) return;
        tx.insert(templateRevisions).values(baseline).run();
      });
    } finally { await cleanupTemplateImages([baseline.thumbnailPath]); }
  }
}
