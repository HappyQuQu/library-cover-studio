import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const directory = new URL('../../src/template/defaults/', import.meta.url);
const posterDirectory = new URL('../../src/template/poster/', import.meta.url);
const assetName = z.string().regex(/^[a-z][a-z0-9-]*\.(json|jpg)$/);
const definitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string(),
  primaryTitle: z.string(),
  secondaryTitle: z.string(),
  previewFile: assetName.refine(value => value.endsWith('.jpg')),
  samplePosters: z.array(z.number().int().min(1).max(9)).length(9),
  canvas: z.object({
    width: z.literal(1920),
    height: z.literal(1080),
    objects: z.array(z.record(z.any())),
    randomOnGeneration: z.boolean(),
    randomBackgroundStyle: z.enum(['soft-mesh', 'muted-wall', 'cinema-mesh']),
    posterBackground: z.object({ blur: z.number().min(0).max(150), dim: z.number().min(0).max(.8) }).optional(),
  }).passthrough(),
});

/** Portable project assets, shared by first-run initialization and legacy migrations. */
export async function buildDefaultTemplates() {
  const manifest = z.object({
    version: z.literal(1),
    templates: z.array(assetName.refine(value => value.endsWith('.json'))).min(1),
  }).parse(JSON.parse(await fs.readFile(new URL('manifest.json', directory), 'utf8')));
  const definitions = await Promise.all(manifest.templates.map(async file =>
    definitionSchema.parse(JSON.parse(await fs.readFile(new URL(file, directory), 'utf8')))));
  if (new Set(definitions.map(definition => definition.id)).size !== definitions.length) {
    throw new Error('Built-in template IDs must be unique');
  }
  const buffers = await Promise.all(Array.from({ length: 9 }, (_, index) =>
    fs.readFile(new URL(`${index + 1}.jpg`, posterDirectory))));
  return definitions.map(definition => ({
    ...definition,
    previewPath: fileURLToPath(new URL(definition.previewFile, directory)),
    posterBuffers: definition.samplePosters.map(index => buffers[index - 1]),
  }));
}
