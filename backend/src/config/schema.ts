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
  createdAt: text('created_at'),
  updatedAt: text('updated_at')
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

// 系统设置表
export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
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
