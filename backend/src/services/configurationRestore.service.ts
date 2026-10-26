import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import cron from 'node-cron';
import { db } from '../config/database.js';
import { templates, tasks, mediaServers, aiProviders, systemSettings } from '../config/schema.js';
import { createError } from '../middleware/errorHandler.js';
import { validateRuntimeSettings, getRenderSettings } from './runtimeSettings.service.js';
import { initScheduler } from './scheduler.service.js';
import { encrypt } from '../utils/crypto.js';
import { templateSelectionFields, templateCandidates, validTemplateSelection } from './taskTemplate.service.js';

export const MAX_CONFIGURATION_BYTES = 32 * 1024 * 1024;
const id = z.string().min(1).max(200);
const name = z.string().trim().min(1).max(100);
const objectJson = z.string().refine(value => {
  try { const parsed = JSON.parse(value); return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed); } catch { return false; }
});
const canvas = objectJson.refine(value => { try { return Array.isArray(JSON.parse(value).objects); } catch { return false; } });
const httpUrl = z.string().max(2000).url().refine(value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}).transform(value => { const url = new URL(value); url.search = ''; url.hash = ''; return url.toString(); });
const librarySchema = z.object({
  libraryId: id, libraryName: z.string().min(1).max(200), libraryType: z.string().max(100).optional(),
  ...templateSelectionFields,
  primaryTitle: z.string().max(200).default(''), secondaryTitle: z.string().max(200).default(''),
  sortBy: z.enum(['Name', 'SortName', 'Random', 'CommunityRating', 'CriticRating', 'DateCreated', 'DateLastPlayed', 'DatePlayed', 'OfficialRating', 'PlayCount', 'PremiereDate', 'Runtime']).default('DateCreated'),
  maxItems: z.string().max(20).optional(), enabled: z.boolean().default(true)
});
const backupSchema = z.object({
  version: z.literal(1), exportedAt: z.string().max(100).optional(), settings: z.record(z.unknown()),
  templates: z.array(z.object({ id, name, description: z.string().max(50000).nullish(), canvasJson: canvas,
    metadataJson: objectJson.nullish(), width: z.number().int().min(100).max(4000).nullish(), height: z.number().int().min(100).max(6000).nullish() })).max(5000),
  servers: z.array(z.object({ id, name, type: z.enum(['jellyfin', 'emby']), url: httpUrl })).max(1000),
  aiProviders: z.array(z.object({ id, name, type: z.enum(['claude', 'openai', 'ollama', 'custom']), apiUrl: httpUrl,
    model: z.string().max(500).nullish(), modelCapabilities: objectJson.nullish() })).max(1000),
  tasks: z.array(z.object({ id, name, type: z.enum(['scheduled', 'manual']), serverId: id,
    templateId: id.nullish(), cronExpression: z.string().max(200).nullish(),
    libraryConfigs: z.string().nullish(), libraryIds: z.string().nullish(), options: objectJson.nullish() })).max(10000)
});
const invalid = (details: string) => createError(`Invalid configuration backup: ${details}`, 400, 'CONFIGURATION_INVALID');

/** No database writes, filesystem paths, credentials or outbound requests are accepted from a backup. */
function readBackup(bytes: Buffer) {
  if (bytes.length > MAX_CONFIGURATION_BYTES) throw createError('Configuration backup exceeds 32 MB', 413, 'CONFIGURATION_TOO_LARGE');
  let raw: any;
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')); } catch { throw invalid('JSON'); }
  if (raw?.version !== 1) throw createError('Unsupported configuration backup version', 400, 'CONFIGURATION_VERSION');
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error.issues.map(issue => issue.path.join('.')).slice(0, 5).join(', '));
  const backup = parsed.data;
  for (const [kind, rows] of Object.entries({ templates: backup.templates, servers: backup.servers, tasks: backup.tasks, aiProviders: backup.aiProviders })) {
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw invalid(`${kind}: duplicate IDs`);
  }
  const templateMap = new Map(backup.templates.map(template => [template.id, template]));
  const serverIds = new Set(backup.servers.map(server => server.id));
  const requireTemplate = (value: string) => { if (!templateMap.has(value)) throw invalid('task references a missing template'); };
  const taskRows = backup.tasks.map(task => {
    if (!serverIds.has(task.serverId)) throw invalid('task references a missing server');
    if (!task.libraryConfigs && task.templateId) requireTemplate(task.templateId);
    if (task.type === 'scheduled' && (!task.cronExpression || !cron.validate(task.cronExpression))) throw invalid('task cronExpression');
    let configs: z.infer<typeof librarySchema>[] | null = null;
    try {
      if (task.libraryConfigs) configs = z.array(librarySchema).max(10000).parse(JSON.parse(task.libraryConfigs));
      if (configs && new Set(configs.map(config => config.libraryId)).size !== configs.length) throw new Error();
      if (!configs && (!task.templateId || !task.libraryIds || !z.array(id).parse(JSON.parse(task.libraryIds)).length)) throw new Error();
      if (task.options) z.object({ randomBackground: z.boolean().optional() }).strict().parse(JSON.parse(task.options));
    } catch { throw invalid('task libraryConfigs, libraryIds or options'); }
    for (const config of configs || []) {
      if (!config.enabled) continue;
      if (config.enabled && !validTemplateSelection(config)) throw invalid('task template selection');
      for (const templateId of templateCandidates(config)) requireTemplate(templateId);
      const pool = templateCandidates(config).map(templateId => templateMap.get(templateId)!);
      if (pool.some(item => (item.width ?? 1920) * (pool[0].height ?? 1080) !== (pool[0].width ?? 1920) * (item.height ?? 1080))) throw invalid('task template aspect ratios');
    }
    return { ...task, configs };
  });
  const settings = validateRuntimeSettings(backup.settings);
  return { ...backup, tasks: taskRows, settings };
}

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const signature = (payload: string) => createHmac('sha256', process.env.JWT_SECRET!).update('configuration-restore:' + payload).digest('base64url');
function summary(backup: ReturnType<typeof readBackup>, restoreSettings: boolean) {
  return {
    exportedAt: backup.exportedAt ?? null,
    counts: { templates: backup.templates.length, servers: backup.servers.length, tasks: backup.tasks.length, aiProviders: backup.aiProviders.length, settings: restoreSettings ? backup.settings.length : 0 },
    // Bounded preview names; full counts always include every row.
    names: { templates: backup.templates.slice(0, 20).map(row => row.name), servers: backup.servers.slice(0, 20).map(row => row.name), tasks: backup.tasks.slice(0, 20).map(row => row.name), aiProviders: backup.aiProviders.slice(0, 20).map(row => row.name) },
    settingKeys: restoreSettings ? backup.settings.map(row => row.key) : []
  };
}
export function previewConfiguration(bytes: Buffer, userId: string, restoreSettings: boolean) {
  const backup = readBackup(bytes);
  const payload = Buffer.from(JSON.stringify({ userId, digest: digest(bytes), restoreSettings, expires: Date.now() + 15 * 60 * 1000 })).toString('base64url');
  return { ...summary(backup, restoreSettings), token: payload + '.' + signature(payload) };
}

export function restoreConfiguration(bytes: Buffer, userId: string, restoreSettings: boolean, token: unknown) {
  try {
    if (typeof token !== 'string' || token.length > 2000) throw new Error();
    const [payload, received, extra] = token.split('.');
    const expected = signature(payload);
    if (extra || received?.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) throw new Error();
    const claim = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (claim.userId !== userId || claim.digest !== digest(bytes) || claim.restoreSettings !== restoreSettings || claim.expires <= Date.now()) throw new Error();
  } catch { throw createError('Preview expired or configuration changed; preview again', 409, 'CONFIGURATION_PREVIEW_REQUIRED'); }
  const backup = readBackup(bytes); // Revalidate the complete file before the transaction.
  const templateIds = new Map(backup.templates.map(row => [row.id, randomUUID()]));
  const serverIds = new Map(backup.servers.map(row => [row.id, randomUUID()]));
  const now = new Date().toISOString();
  const blankKey = backup.servers.length ? encrypt('') : '';
  db.transaction(tx => {
    for (const row of backup.templates) tx.insert(templates).values({ id: templateIds.get(row.id)!, name: row.name,
      description: row.description ?? null, canvasJson: row.canvasJson, metadataJson: row.metadataJson ?? null,
      width: row.width ?? 1920, height: row.height ?? 1080, userId, isPublic: 0, isDefault: 0, isLocked: 0, thumbnailPath: null, createdAt: now, updatedAt: now }).run();
    for (const row of backup.servers) tx.insert(mediaServers).values({ id: serverIds.get(row.id)!, name: row.name, type: row.type, url: row.url,
      apiKeyEncrypted: blankKey, userId, isActive: 1, lastSyncAt: null, createdAt: now, updatedAt: now }).run();
    for (const row of backup.aiProviders) tx.insert(aiProviders).values({ id: randomUUID(), name: row.name, type: row.type, apiUrl: row.apiUrl,
      model: row.model ?? null, modelCapabilities: row.modelCapabilities ?? null, apiKeyEncrypted: null, userId,
      isActive: 0, isDefault: 0, createdAt: now, updatedAt: now }).run();
    for (const row of backup.tasks) tx.insert(tasks).values({ id: randomUUID(), name: row.name, type: row.type, userId,
      serverId: serverIds.get(row.serverId)!, templateId: row.templateId ? templateIds.get(row.templateId) ?? null : null,
      cronExpression: row.cronExpression ?? null, libraryIds: row.libraryIds ?? null,
      libraryConfigs: row.configs ? JSON.stringify(row.configs.map(config => ({ ...config,
        templateId: templateIds.get(config.templateId) ?? '',
        ...(config.templateIds ? { templateIds: config.templateIds.flatMap(id => templateIds.has(id) ? [templateIds.get(id)!] : []) } : {}) }))) : null,
      options: row.options ?? null, isEnabled: 0, lastRunAt: null, nextRunAt: null, createdAt: now, updatedAt: now }).run();
    if (restoreSettings) for (const row of backup.settings) tx.insert(systemSettings).values({ ...row, updatedAt: now })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: row.value, updatedAt: now } }).run();
  });
  if (restoreSettings) { getRenderSettings(); if (backup.settings.some(row => row.key === 'scheduler.timezone')) initScheduler(); }
  return summary(backup, restoreSettings);
}
