import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// 用户表
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').default('user'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at')
});

// 媒体服务器表
export const mediaServers = sqliteTable('media_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'jellyfin' | 'emby'
  url: text('url').notNull(),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  userId: text('user_id').references(() => users.id),
  isActive: integer('is_active').default(1),
  lastSyncAt: text('last_sync_at'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at')
});

// 模板表
export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  canvasJson: text('canvas_json').notNull(),
  thumbnailPath: text('thumbnail_path'),
  width: integer('width').default(1920),
  height: integer('height').default(1080),
  userId: text('user_id').references(() => users.id),
  isPublic: integer('is_public').default(0),
  isLocked: integer('is_locked').default(0),
  isDefault: integer('is_default').default(0),
  createdAt: text('created_at'),
  updatedAt: text('updated_at')
});

// 任务表
export const templateRevisions = sqliteTable('template_revisions', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  id: text('id').unique().notNull(),
  templateId: text('template_id').notNull().references(() => templates.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  canvasJson: text('canvas_json').notNull(),
  thumbnailPath: text('thumbnail_path').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  isPublic: integer('is_public').default(0),
  savedBy: text('saved_by').references(() => users.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  restoredFrom: text('restored_from'),
  createdAt: text('created_at').notNull()
});

// 任务表
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'scheduled' | 'manual'
  cronExpression: text('cron_expression'),
  templateId: text('template_id').references(() => templates.id),
  serverId: text('server_id').references(() => mediaServers.id),
  userId: text('user_id').references(() => users.id),
  libraryIds: text('library_ids'), // Deprecated in favor of libraryConfigs
  libraryConfigs: text('library_configs'), // JSON list of LibraryConfig
  options: text('options'), // JSON
  isEnabled: integer('is_enabled').default(1),
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at')
});

// 任务日志表
export const taskLogs = sqliteTable('task_logs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  status: text('status').notNull(), // 'running' | 'completed' | 'failed'
  itemsProcessed: integer('items_processed').default(0),
  itemsFailed: integer('items_failed').default(0),
  errorMessage: text('error_message'),
  startedAt: text('started_at'),
  completedAt: text('completed_at')
});

// 每次执行的媒体库结果与独立封面快照
export const taskLogCovers = sqliteTable('task_log_covers', {
  id: text('id').primaryKey(),
  logId: text('log_id').notNull().references(() => taskLogs.id, { onDelete: 'cascade' }),
  libraryId: text('library_id').notNull(),
  libraryName: text('library_name').notNull(),
  templateName: text('template_name'),
  status: text('status').notNull(), // 'generated' | 'uploaded' | 'failed'
  imageName: text('image_name'),
  thumbnailName: text('thumbnail_name'),
  width: integer('width'),
  height: integer('height'),
  errorMessage: text('error_message'),
  createdAt: text('created_at')
});

// 系统设置表
export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
});

// AI 服务提供商配置表
export const aiProviders = sqliteTable('ai_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'claude' | 'openai' | 'ollama' | 'custom'
  apiUrl: text('api_url').notNull(),
  apiKeyEncrypted: text('api_key_encrypted'),
  model: text('model'),
  modelCapabilities: text('model_capabilities'),
  isActive: integer('is_active').default(1),
  isDefault: integer('is_default').default(0),
  userId: text('user_id').references(() => users.id),
  createdAt: text('created_at'),
  updatedAt: text('updated_at')
});

// AI 对话历史表
export const aiConversations = sqliteTable('ai_conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  templateId: text('template_id').references(() => templates.id),
  providerId: text('provider_id').references(() => aiProviders.id),
  messages: text('messages').notNull(), // JSON 数组: [{role, content}]
  generatedJson: text('generated_json'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at')
});

// 类型导出
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type MediaServer = typeof mediaServers.$inferSelect;
export type NewMediaServer = typeof mediaServers.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskLog = typeof taskLogs.$inferSelect;
export type NewTaskLog = typeof taskLogs.$inferInsert;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;
export type AIProvider = typeof aiProviders.$inferSelect;
export type NewAIProvider = typeof aiProviders.$inferInsert;
export type AIConversation = typeof aiConversations.$inferSelect;
export type NewAIConversation = typeof aiConversations.$inferInsert;
