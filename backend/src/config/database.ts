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
      is_locked INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS template_store_installs (
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      template_id TEXT NOT NULL,
      PRIMARY KEY (user_id, store_id, revision),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS template_revisions (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT UNIQUE NOT NULL,
      template_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      canvas_json TEXT NOT NULL,
      thumbnail_path TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      is_public INTEGER DEFAULT 0,
      saved_by TEXT,
      kind TEXT NOT NULL CHECK(kind IN ('save', 'restore', 'baseline', 'default-reset', 'before-default-reset')),
      restored_from TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
      FOREIGN KEY (saved_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_template_revisions_template ON template_revisions(template_id, sequence DESC);

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

  // Expand the history kind constraint while preserving every existing revision and sequence.
  const revisionTable = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'template_revisions'").get() as { sql: string };
  if (!revisionTable.sql.includes("'default-reset'")) {
    const expanded = revisionTable.sql.replace(/CHECK\s*\(\s*kind\s+IN\s*\([^)]*\)\s*\)/i,
      "CHECK(kind IN ('save', 'restore', 'baseline', 'default-reset', 'before-default-reset'))");
    if (expanded === revisionTable.sql) throw new Error('Cannot migrate template history constraint');
    sqlite.transaction(() => {
      const sequence = sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'template_revisions'").get() as { seq: number } | undefined;
      sqlite.exec(expanded.replace(/CREATE TABLE (?:IF NOT EXISTS )?["`]?template_revisions["`]?/i, 'CREATE TABLE template_revisions_reset_migration'));
      sqlite.exec(`INSERT INTO template_revisions_reset_migration SELECT * FROM template_revisions;
        DROP TABLE template_revisions;
        ALTER TABLE template_revisions_reset_migration RENAME TO template_revisions;
        CREATE INDEX idx_template_revisions_template ON template_revisions(template_id, sequence DESC);`);
      if (sequence) {
        sqlite.prepare("DELETE FROM sqlite_sequence WHERE name = 'template_revisions'").run();
        sqlite.prepare('INSERT INTO sqlite_sequence (name,seq) VALUES (?,?)').run('template_revisions', sequence.seq);
      }
    })();
  }

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

    CREATE TABLE IF NOT EXISTS task_log_covers (
      id TEXT PRIMARY KEY,
      log_id TEXT NOT NULL,
      library_id TEXT NOT NULL,
      library_name TEXT NOT NULL,
      template_name TEXT,
      status TEXT NOT NULL CHECK(status IN ('generated', 'uploaded', 'failed')),
      image_name TEXT,
      thumbnail_name TEXT,
      width INTEGER,
      height INTEGER,
      error_message TEXT,
      created_at TEXT,
      FOREIGN KEY (log_id) REFERENCES task_logs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_task_log_covers_log ON task_log_covers(log_id);

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
      model_capabilities TEXT,
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

  const providerColumns = sqlite.prepare("PRAGMA table_info(ai_providers)").all() as { name: string }[];
  if (!providerColumns.some(column => column.name === 'model_capabilities')) {
    sqlite.exec('ALTER TABLE ai_providers ADD COLUMN model_capabilities TEXT;');
  }

  const templateColumns = sqlite.prepare('PRAGMA table_info(templates)').all() as { name: string }[];
  for (const column of ['is_locked', 'is_default']) {
    if (!templateColumns.some(existing => existing.name === column)) {
      sqlite.exec(`ALTER TABLE templates ADD COLUMN ${column} INTEGER DEFAULT 0;`);
    }
  }

  // 兼容旧模板与商店安装记录，保留已有设计和下载来源。
  for (const table of ['templates', 'template_revisions']) {
    const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some(column => column.name === 'metadata_json')) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN metadata_json TEXT;`);
  }
  const installColumns = sqlite.prepare('PRAGMA table_info(template_store_installs)').all() as { name: string }[];
  for (const column of ['version', 'content_hash', 'installed_at']) {
    if (!installColumns.some(existing => existing.name === column)) sqlite.exec(`ALTER TABLE template_store_installs ADD COLUMN ${column} TEXT;`);
  }

  // 初始化系统设置
  const defaultSettings = [
    { key: 'history.maxRuns', value: '50' },
    { key: 'history.maxDays', value: '30' },
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


