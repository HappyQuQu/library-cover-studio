import Database from 'better-sqlite3';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

import { DB_FILE, ensureDataDirs } from './paths.js';

// Ensure data directories exist before connecting
ensureDataDirs();

// 创建 SQLite 连接
const sqlite = new Database(DB_FILE);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Drizzle ORM 实例
export const db = drizzle(sqlite, { schema });

// 初始化数据库
export async function initDatabase() {
  // 创建表
  sqlite.exec(`
    -- 用户表
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 媒体服务器表
    CREATE TABLE IF NOT EXISTS media_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('jellyfin', 'emby')),
      url TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      user_id TEXT,
      is_active INTEGER DEFAULT 1,
      last_sync_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- 模板表
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      canvas_json TEXT NOT NULL,
      thumbnail_path TEXT,
      width INTEGER DEFAULT 600,
      height INTEGER DEFAULT 900,
      user_id TEXT,
      is_public INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- 任务表
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('scheduled', 'manual')),
      cron_expression TEXT,
      template_id TEXT,
      server_id TEXT,
      user_id TEXT,
      library_ids TEXT,
      library_configs TEXT,
      options TEXT,
      is_enabled INTEGER DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL,
      FOREIGN KEY (server_id) REFERENCES media_servers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    -- 检查并添加 library_configs 列 (如果表已存在但列不存在)
    PRAGMA table_info(tasks);
  `);

  // 检查 library_configs 列是否存在，不存在则添加
  const tableInfo = sqlite.prepare("PRAGMA table_info(tasks)").all() as any[];
  const hasLibraryConfigs = tableInfo.some(col => col.name === 'library_configs');

  if (!hasLibraryConfigs) {
    try {
      sqlite.exec('ALTER TABLE tasks ADD COLUMN library_configs TEXT;');
      console.log('⚡ Added library_configs column to tasks table');
    } catch (err) {
      console.warn('⚠️ Could not add library_configs column:', err);
    }
  }

  sqlite.exec(`
    -- 任务日志表
    CREATE TABLE IF NOT EXISTS task_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
      items_processed INTEGER DEFAULT 0,
      items_failed INTEGER DEFAULT 0,
      error_message TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- 系统设置表
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- AI 服务提供商配置表
    CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('claude', 'openai', 'ollama', 'custom')),
      api_url TEXT NOT NULL,
      api_key_encrypted TEXT,
      model TEXT,
      is_active INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      user_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- AI 对话历史表
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      template_id TEXT,
      provider_id TEXT,
      messages TEXT NOT NULL,
      generated_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL,
      FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE SET NULL
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_media_servers_user ON media_servers(user_id);
    CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_template ON tasks(template_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_server ON tasks(server_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_ai_providers_user ON ai_providers(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_provider ON ai_conversations(provider_id);
  `);

  // 初始化系统设置
  const defaultSettings = [
    { key: 'storage.savePosters', value: 'false' },
    { key: 'storage.saveCovers', value: 'false' },
    { key: 'rendering.outputFormat', value: 'PNG' },
    { key: 'rendering.outputQuality', value: '90' },
    { key: 'rendering.concurrency', value: '3' },
    { key: 'scheduler.timezone', value: 'Asia/Shanghai' }
  ];

  for (const setting of defaultSettings) {
    const existing = sqlite.prepare("SELECT key FROM system_settings WHERE key = ?").get(setting.key);
    if (!existing) {
      sqlite.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?)").run(setting.key, setting.value);
      console.log(`✅ Seeded default setting: ${setting.key} = ${setting.value}`);
    }
  }

  console.log('📦 Database initialized');
}


