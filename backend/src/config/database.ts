import Database from 'better-sqlite3';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as schema from './schema.js';

const DB_PATH = process.env.DATABASE_PATH || './database/data.sqlite';

// 确保目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 创建 SQLite 连接
const sqlite = new Database(DB_PATH);
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
      library_ids TEXT,
      library_configs TEXT,
      options TEXT,
      is_enabled INTEGER DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL,
      FOREIGN KEY (server_id) REFERENCES media_servers(id) ON DELETE CASCADE
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
      console.warn('⚠️ Could not add library_configs column (it might already exist):', err);
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

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_media_servers_user ON media_servers(user_id);
    CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_template ON tasks(template_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_server ON tasks(server_id);
    CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_logs(task_id);
  `);

  console.log('📦 Database tables created');
}


