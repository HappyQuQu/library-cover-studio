import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { templates, systemSettings, tasks, aiConversations } from '../config/schema.js';
import { THUMBNAILS_DIR } from '../config/paths.js';
import { renderLibraryCover } from './renderer.service.js';

import { buildDefaultTemplates } from './bundledTemplates.service.js';
export { buildDefaultTemplates } from './bundledTemplates.service.js';

const width = 1920, height = 1080;
const layoutMigrationKeys = [
  'templates.defaults.wall-seamless-v1',
  'templates.defaults.wall-variants-v1',
  'templates.defaults.wall-reference-original-v1',
  'templates.defaults.cinematic-three-v1',
  'templates.defaults.fan-wide-v1',
];

/** Install/migrate once; later restarts preserve edits, locks, and deliberate deletions. */
export async function seedDefaultTemplates() {
  const key = 'templates.defaults.reference-v2';
  if (db.select().from(systemSettings).where(eq(systemSettings.key, key)).get()) {
    await migrateDefaultWallLayout();
    await splitDefaultWallLayouts();
    await restoreReferenceWallLayout();
    await installCinematicDefaults();
    await widenDefaultFan();
    return;
  }
  const freshInstallation = db.select({ id: templates.id }).from(templates).limit(1).all().length === 0;
  const prepared: { definition: Awaited<ReturnType<typeof buildDefaultTemplates>>[number]; existing?: typeof templates.$inferSelect; canvas: any; filename: string }[] = [];
  for (const definition of await buildDefaultTemplates()) {
    const existing = db.select().from(templates).where(eq(templates.id, definition.id)).get();
    if (existing && !existing.isDefault) continue;
    // Preserve any layout edits to the previously installed defaults during this palette migration.
    const savedCanvas = existing ? JSON.parse(existing.canvasJson) : undefined;
    const canvas = existing ? { ...savedCanvas, randomOnGeneration: !savedCanvas.posterBackground,
      randomBackgroundStyle: definition.canvas.randomBackgroundStyle } : definition.canvas;
    const filename = `${definition.id}.jpg`;
    if (existing) {
      const rendered = await renderLibraryCover(JSON.stringify(canvas), { title: definition.primaryTitle,
        primaryTitle: definition.primaryTitle, secondaryTitle: definition.secondaryTitle }, definition.posterBuffers, { width, height });
      await fs.writeFile(path.join(THUMBNAILS_DIR, filename), await sharp(rendered).resize(480, 270).jpeg({ quality: 88 }).toBuffer());
    } else {
      await fs.copyFile(definition.previewPath, path.join(THUMBNAILS_DIR, filename));
    }
    prepared.push({ definition, existing, canvas, filename });
  }
  const removed: string[] = [];
  db.transaction(tx => {
    const now = new Date().toISOString();
    for (const { definition, existing, canvas, filename } of prepared) {
      if (existing) {
        const generatedName = ['柔彩扇形 · 电影', '倾斜海报墙 · 暖金'].includes(existing.name);
        tx.update(templates).set({ name: generatedName ? definition.name : existing.name, description: definition.description,
          canvasJson: JSON.stringify(canvas), thumbnailPath: `/thumbnails/${filename}`, updatedAt: now }).where(eq(templates.id, definition.id)).run();
      } else {
        tx.insert(templates).values({ id: definition.id, name: definition.name, description: definition.description, canvasJson: JSON.stringify(canvas), width, height,
          thumbnailPath: `/thumbnails/${filename}`, isPublic: 1, isLocked: 1, isDefault: 1, createdAt: now, updatedAt: now }).run();
      }
    }
    const aliases = [
      ['7de80a91-0d2c-4d9a-8e3a-902c8d241102', '7de80a91-0d2c-4d9a-8e3a-902c8d241101'],
      ['7de80a91-0d2c-4d9a-8e3a-902c8d241104', '7de80a91-0d2c-4d9a-8e3a-902c8d241103']
    ];
    for (const [oldId, newId] of aliases) {
      const old = tx.select().from(templates).where(eq(templates.id, oldId)).get();
      if (!old?.isDefault || !tx.select().from(templates).where(eq(templates.id, newId)).get()) continue;
      tx.update(tasks).set({ templateId: newId }).where(eq(tasks.templateId, oldId)).run();
      for (const task of tx.select().from(tasks).all()) {
        if (!task.libraryConfigs) continue;
        let configs;
        try { configs = JSON.parse(task.libraryConfigs); } catch { continue; }
        if (!Array.isArray(configs) || !configs.some(config => config?.templateId === oldId)) continue;
        tx.update(tasks).set({ libraryConfigs: JSON.stringify(configs.map(config => config?.templateId === oldId ? { ...config, templateId: newId } : config)) }).where(eq(tasks.id, task.id)).run();
      }
      tx.update(aiConversations).set({ templateId: newId }).where(eq(aiConversations.templateId, oldId)).run();
      tx.delete(templates).where(eq(templates.id, oldId)).run();
      removed.push(oldId);
    }
    tx.insert(systemSettings).values({ key, value: 'installed', updatedAt: now }).run();
    // Bundled layouts already include every migration; preserve their matching previews.
    if (freshInstallation) for (const migrationKey of layoutMigrationKeys) {
      tx.insert(systemSettings).values({ key: migrationKey, value: 'installed', updatedAt: now }).onConflictDoNothing().run();
    }
  });
  for (const id of removed) await fs.unlink(path.join(THUMBNAILS_DIR, `${id}.jpg`)).catch(() => {});
  await migrateDefaultWallLayout();
  await splitDefaultWallLayouts();
  await restoreReferenceWallLayout();
  await installCinematicDefaults();
  await widenDefaultFan();
}

/** Reframe the original fan once without resetting artwork, titles, or later edits. */
async function widenDefaultFan() {
  const key = 'templates.defaults.fan-wide-v1';
  if (db.select().from(systemSettings).where(eq(systemSettings.key, key)).get()) return;
  const id = '7de80a91-0d2c-4d9a-8e3a-902c8d241101';
  const existing = db.select().from(templates).where(eq(templates.id, id)).get();
  if (existing?.isDefault && existing.width === width && existing.height === height) {
    const canvas = JSON.parse(existing.canvasJson);
    const slots = canvas.objects?.filter((object: any) => object.posterVar) || [];
    const previous = [
      { id: 'poster-5', x: 285, y: 975, width: 460, height: 690, angle: -15 },
      { id: 'poster-4', x: 1635, y: 975, width: 460, height: 690, angle: 15 },
      { id: 'poster-3', x: 625, y: 855, width: 520, height: 780, angle: -8 },
      { id: 'poster-2', x: 1295, y: 855, width: 520, height: 780, angle: 8 },
      { id: 'poster-1', x: 960, y: 786, width: 592, height: 888, angle: 0 }
    ];
    const originalLayout = slots.length === previous.length && previous.every(placement => {
      const object = slots.find((slot: any) => slot.id === placement.id);
      return object && object.originX === 'center' && object.originY === 'center'
        && Math.abs(object.left - placement.x) < .01 && Math.abs(object.top - placement.y) < .01
        && Math.abs(object.angle - placement.angle) < .01
        && Math.abs(object.width * object.scaleX - placement.width) < 1
        && Math.abs(object.height * object.scaleY - placement.height) < 1;
    });
    if (originalLayout) {
      const definition = (await buildDefaultTemplates()).find(template => template.id === id)!;
      const placements = new Map(definition.canvas.objects.map(object => [object.id, object]));
      canvas.objects = canvas.objects.map((object: any) => {
        const placement = placements.get(object.id) as any;
        if (!object.posterVar || !placement) return object;
        const ratio = placement.width * placement.scaleX / (object.width * object.scaleX);
        const scaleX = object.scaleX * ratio, scaleY = object.scaleY * ratio;
        const radius = object.id === 'poster-1' ? 68 : 42;
        return { ...object, left: placement.left, top: placement.top, angle: placement.angle, scaleX, scaleY,
          clipPath: object.clipPath ? { ...object.clipPath, rx: radius / scaleX, ry: radius / scaleY } : object.clipPath };
      });
      const rendered = await renderLibraryCover(JSON.stringify(canvas), { title: definition.primaryTitle,
        primaryTitle: definition.primaryTitle, secondaryTitle: definition.secondaryTitle }, definition.posterBuffers, { width, height });
      await fs.writeFile(path.join(THUMBNAILS_DIR, `${id}.jpg`), await sharp(rendered).resize(480, 270).jpeg({ quality: 88 }).toBuffer());
      db.update(templates).set({ canvasJson: JSON.stringify(canvas), thumbnailPath: `/thumbnails/${id}.jpg`,
        updatedAt: new Date().toISOString() }).where(eq(templates.id, id)).run();
    }
  }
  db.insert(systemSettings).values({ key, value: 'installed', updatedAt: new Date().toISOString() }).run();
}

/** Update earlier built-in wall layouts once, preserving custom layouts and deleted templates. */
async function migrateDefaultWallLayout() {
  const key = 'templates.defaults.wall-seamless-v1';
  if (db.select().from(systemSettings).where(eq(systemSettings.key, key)).get()) return;
  const id = '7de80a91-0d2c-4d9a-8e3a-902c8d241103';
  const existing = db.select().from(templates).where(eq(templates.id, id)).get();
  if (existing?.isDefault) {
    const canvas = JSON.parse(existing.canvasJson);
    const slots = canvas.objects?.filter((object: any) => object.posterVar) || [];
    const previousLayouts = [
      { angle: 17, x: 1640, y: 580, column: 520, row: 770, width: 440, height: 660 },
      { angle: 15, x: 1420, y: 540, column: 315, row: 460, width: 280, height: 420 },
      { angle: 15, x: 1328, y: 540, column: 355, row: 500, width: 320, height: 480 }
    ];
    const originalLayout = previousLayouts.find(layout => slots.length === 9 && slots.every((object: any, index: number) => {
      const row = Math.floor(index / 3) - 1, column = index % 3 - 1;
      const x = column * layout.column, y = row * layout.row, radians = layout.angle * Math.PI / 180;
      return object.id === `poster-${index + 1}` && Math.abs(object.angle - layout.angle) < .01
        && Math.abs(object.left - (layout.x + x * Math.cos(radians) - y * Math.sin(radians))) < .01
        && Math.abs(object.top - (layout.y + x * Math.sin(radians) + y * Math.cos(radians))) < .01
        && Math.abs(object.width * object.scaleX - layout.width) < 1
        && Math.abs(object.height * object.scaleY - layout.height) < 1;
    }));
    if (originalLayout) {
      const definition = (await buildDefaultTemplates()).find(template => template.id === id)!;
      const layout = new Map(definition.canvas.objects.map(object => [object.id, object]));
      const tiles = definition.canvas.objects.filter((object: any) => object.posterVar).map((placement: any) => {
        const original = slots.find((object: any) => object.posterVar === placement.posterVar);
        if (!original) return placement;
        return { ...original, id: placement.id, left: placement.left, top: placement.top, angle: placement.angle,
          scaleX: original.scaleX * 404 / originalLayout.width, scaleY: original.scaleY * 404 / originalLayout.width,
          clipPath: placement.clipPath, shadow: undefined };
      });
      let placed = false;
      canvas.objects = canvas.objects.flatMap((object: any) => {
        if (object.posterVar) {
          if (placed) return [];
          placed = true;
          return tiles;
        }
        const placement = layout.get(object.id) as any;
        if (!placement) return [object];
        const originalTitle = object.id === 'primary-title' && object.fontSize === 148 && object.left === 95 && object.top === 445 && object.width === 640;
        const originalSubtitle = object.id === 'secondary-title' && object.fontSize === 65 && object.left === 148 && object.top === 646 && object.width === 570;
        if (originalTitle || originalSubtitle) return { ...object, left: placement.left, top: placement.top,
          width: placement.width, height: placement.height, fontSize: placement.fontSize, charSpacing: placement.charSpacing, fitText: true };
        if (object.id === 'accent' && object.left === 98 && object.top === 655 && object.width === 20 && object.height === 66) {
          return { ...object, left: placement.left, top: placement.top, width: placement.width, height: placement.height };
        }
        return object;
      });
      const rendered = await renderLibraryCover(JSON.stringify(canvas), { title: definition.primaryTitle, primaryTitle: definition.primaryTitle, secondaryTitle: definition.secondaryTitle }, definition.posterBuffers,
        { width: existing.width || width, height: existing.height || height });
      await fs.writeFile(path.join(THUMBNAILS_DIR, `${id}.jpg`), await sharp(rendered).resize(480, 270).jpeg({ quality: 88 }).toBuffer());
      db.update(templates).set({ canvasJson: JSON.stringify(canvas), description: definition.description,
        thumbnailPath: `/thumbnails/${id}.jpg`, updatedAt: new Date().toISOString() }).where(eq(templates.id, id)).run();
    }
  }
  db.insert(systemSettings).values({ key, value: 'installed', updatedAt: new Date().toISOString() }).run();
}

/** Keep the seamless wall under its existing ID; install the reference as a separate layout once. */
async function splitDefaultWallLayouts() {
  const key = 'templates.defaults.wall-variants-v1';
  if (db.select().from(systemSettings).where(eq(systemSettings.key, key)).get()) return;
  const definitions = await buildDefaultTemplates();
  const upright = definitions.find(template => template.id.endsWith('1103'))!;
  const reference = definitions.find(template => template.id.endsWith('1105'))!;
  const existing = db.select().from(templates).where(eq(templates.id, upright.id)).get();
  const updates: { canvasJson: string; thumbnailPath: string; description: string; name: string }[] = [];
  if (existing?.isDefault) {
    const canvas = JSON.parse(existing.canvasJson);
    const slots = canvas.objects?.filter((object: any) => object.posterVar) || [];
    const radians = 15 * Math.PI / 180;
    const canonical = slots.length === 12 && slots.every((object: any, index: number) => {
      const x = (index % 4 - 1.5) * 400, y = (Math.floor(index / 4) - 1) * 600;
      const placementAngle = object.angle === 0 ? 0 : radians;
      return object.id === `poster-tile-${index + 1}` && [0, 15].includes(object.angle)
        && Math.abs(object.left - (1280 + x * Math.cos(placementAngle) - y * Math.sin(placementAngle))) < .01
        && Math.abs(object.top - (540 + x * Math.sin(placementAngle) + y * Math.cos(placementAngle))) < .01
        && Math.abs(object.width * object.scaleX - 404) < 1
        && Math.abs(object.height * object.scaleY - 606) < 1
        && object.clipPath?.absolutePositioned && object.clipPath?.left === 640
        && object.clipPath?.top === 0 && object.clipPath?.width === 1280 && object.clipPath?.height === 1080;
    });
    if (canonical) {
      const placements = new Map(upright.canvas.objects.map(object => [object.id, object]));
      canvas.objects = canvas.objects.map((object: any) => {
        const placement = placements.get(object.id);
        return object.posterVar && placement ? { ...object, left: placement.left, top: placement.top, angle: 0 } : object;
      });
      const rendered = await renderLibraryCover(JSON.stringify(canvas), { title: upright.primaryTitle,
        primaryTitle: upright.primaryTitle, secondaryTitle: upright.secondaryTitle }, upright.posterBuffers, { width, height });
      await fs.writeFile(path.join(THUMBNAILS_DIR, `${upright.id}.jpg`), await sharp(rendered).resize(480, 270).jpeg({ quality: 88 }).toBuffer());
      updates.push({ canvasJson: JSON.stringify(canvas), thumbnailPath: `/thumbnails/${upright.id}.jpg`,
        description: upright.description, name: existing.name === '倾斜海报墙' ? upright.name : existing.name });
    }
  }
  const installReference = !db.select().from(templates).where(eq(templates.id, reference.id)).get();
  if (installReference) {
    await fs.copyFile(reference.previewPath, path.join(THUMBNAILS_DIR, `${reference.id}.jpg`));
  }
  db.transaction(tx => {
    const now = new Date().toISOString();
    for (const update of updates) tx.update(templates).set({ ...update, updatedAt: now }).where(eq(templates.id, upright.id)).run();
    if (installReference) tx.insert(templates).values({ id: reference.id, name: reference.name, description: reference.description,
      canvasJson: JSON.stringify(reference.canvas), width, height, thumbnailPath: `/thumbnails/${reference.id}.jpg`,
      isPublic: 1, isLocked: 1, isDefault: 1, createdAt: now, updatedAt: now }).run();
    tx.insert(systemSettings).values({ key, value: 'installed', updatedAt: now }).run();
  });
}

/** Restore the selected large-card composition once, preserving assets, titles, palettes and locks. */
async function restoreReferenceWallLayout() {
  const key = 'templates.defaults.wall-reference-original-v1';
  if (db.select().from(systemSettings).where(eq(systemSettings.key, key)).get()) return;
  const id = '7de80a91-0d2c-4d9a-8e3a-902c8d241105';
  const existing = db.select().from(templates).where(eq(templates.id, id)).get();
  if (existing?.isDefault) {
    const canvas = JSON.parse(existing.canvasJson);
    const slots = canvas.objects?.filter((object: any) => object.posterVar && !object.id?.startsWith('poster-edge-')) || [];
    const radians = 15 * Math.PI / 180;
    const previousLayout = ['compact', 'aligned'].some(layout => slots.length === 9 && slots.every((object: any, index: number) => {
      const column = index % 3 - 1, row = Math.floor(index / 3) - 1;
      const x = column * 310, y = row * 440;
      const left = layout === 'compact' ? 1340 + x * Math.cos(radians) - y * Math.sin(radians) : 1490 + column * 340;
      const top = layout === 'compact' ? 540 + x * Math.sin(radians) + y * Math.cos(radians)
        : column === 1 ? 550 + row * 440 : 540 + row * 450 + column * 30;
      return object.id === `poster-${index + 1}` && object.angle === 15
        && Math.abs(object.left - left) < .01 && Math.abs(object.top - top) < .01
        && Math.abs(object.width * object.scaleX - 280) < 1 && Math.abs(object.height * object.scaleY - 420) < 1;
    }));
    if (previousLayout) {
      const definition = (await buildDefaultTemplates()).find(template => template.id === id)!;
      const placements = new Map(definition.canvas.objects.map(object => [object.id, object]));
      canvas.objects = canvas.objects.filter((object: any) => !object.id?.startsWith('poster-edge-')).map((object: any) => {
        const placement = placements.get(object.id);
        if (!object.posterVar || !placement) return object;
        const scaleX = object.scaleX * 420 / 280, scaleY = object.scaleY * 420 / 280;
        return { ...object, left: placement.left, top: placement.top, scaleX, scaleY,
          clipPath: { ...object.clipPath, rx: 40 / scaleX, ry: 40 / scaleY } };
      });
      const rendered = await renderLibraryCover(JSON.stringify(canvas), { title: definition.primaryTitle,
        primaryTitle: definition.primaryTitle, secondaryTitle: definition.secondaryTitle }, definition.posterBuffers, { width, height });
      await fs.writeFile(path.join(THUMBNAILS_DIR, `${id}.jpg`), await sharp(rendered).resize(480, 270).jpeg({ quality: 88 }).toBuffer());
      db.update(templates).set({ canvasJson: JSON.stringify(canvas), thumbnailPath: `/thumbnails/${id}.jpg`,
        updatedAt: new Date().toISOString() }).where(eq(templates.id, id)).run();
    }
  }
  db.insert(systemSettings).values({ key, value: 'installed', updatedAt: new Date().toISOString() }).run();
}

/** Add the three reference layouts once; edits and intentional deletions survive subsequent restarts. */
async function installCinematicDefaults() {
  const key = 'templates.defaults.cinematic-three-v1';
  if (db.select().from(systemSettings).where(eq(systemSettings.key, key)).get()) return;
  const definitions = (await buildDefaultTemplates()).filter(template => ['1106', '1107', '1108'].some(suffix => template.id.endsWith(suffix)));
  const prepared: typeof definitions = [];
  for (const definition of definitions) {
    if (db.select().from(templates).where(eq(templates.id, definition.id)).get()) continue;
    await fs.copyFile(definition.previewPath, path.join(THUMBNAILS_DIR, `${definition.id}.jpg`));
    prepared.push(definition);
  }
  db.transaction(tx => {
    const now = new Date().toISOString();
    for (const definition of prepared) tx.insert(templates).values({ id: definition.id, name: definition.name, description: definition.description,
      canvasJson: JSON.stringify(definition.canvas), width, height, thumbnailPath: `/thumbnails/${definition.id}.jpg`,
      isPublic: 1, isLocked: 1, isDefault: 1, createdAt: now, updatedAt: now }).run();
    tx.insert(systemSettings).values({ key, value: 'installed', updatedAt: now }).run();
  });
}
