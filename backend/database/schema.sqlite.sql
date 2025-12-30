-- LibraryCoverStudio 数据库架构
-- SQLite 3
-- 用户表
CREATE TABLE
    IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT (lower(hex (randomblob (16)))),
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime ('now')),
        updated_at TEXT DEFAULT (datetime ('now'))
    );

-- 模板表
CREATE TABLE
    IF NOT EXISTS templates (
        id TEXT PRIMARY KEY DEFAULT (lower(hex (randomblob (16)))),
        name TEXT NOT NULL,
        description TEXT,
        preview_url TEXT,
        canvas_data TEXT NOT NULL, -- 存储 Fabric.js Canvas 数据 (JSON string)
        tags TEXT, -- 标签，逗号分隔
        match_tags TEXT DEFAULT '[]', -- 匹配字符串数组，用于自动匹配媒体库 (JSON array)
        is_public INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime ('now')),
        updated_at TEXT DEFAULT (datetime ('now')),
        deleted_at TEXT NULL
    );

-- 媒体库配置表
CREATE TABLE
    IF NOT EXISTS media_libraries (
        id TEXT PRIMARY KEY DEFAULT (lower(hex (randomblob (16)))),
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('jellyfin', 'emby', 'plex')),
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        user_id TEXT, -- Jellyfin/Emby用户ID
        username TEXT,
        password TEXT,
        is_active INTEGER DEFAULT 1,
        last_sync TEXT NULL,
        config TEXT DEFAULT '{}', -- 额外配置信息 (JSON string)
        created_at TEXT DEFAULT (datetime ('now')),
        updated_at TEXT DEFAULT (datetime ('now'))
    );

-- 海报生成历史表
CREATE TABLE
    IF NOT EXISTS poster_generations (
        id TEXT PRIMARY KEY DEFAULT (lower(hex (randomblob (16)))),
        template_id TEXT REFERENCES templates (id) ON DELETE CASCADE,
        media_library_id TEXT REFERENCES media_libraries (id) ON DELETE CASCADE,
        media_item_id TEXT NOT NULL, -- 媒体项目在媒体库中的ID
        media_title TEXT NOT NULL,
        media_type TEXT NOT NULL CHECK (
            media_type IN ('movie', 'tv', 'episode', 'season')
        ),
        poster_url TEXT NOT NULL, -- 生成的海报URL
        generation_data TEXT, -- 生成时的数据（如文本替换等） (JSON string)
        status TEXT DEFAULT 'completed' CHECK (
            status IN ('pending', 'processing', 'completed', 'failed')
        ),
        error_message TEXT NULL,
        created_at TEXT DEFAULT (datetime ('now'))
    );

-- 自动化任务表
CREATE TABLE
    IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY DEFAULT (lower(hex (randomblob (16)))),
        name TEXT NOT NULL,
        media_source_id TEXT REFERENCES media_libraries (id) ON DELETE CASCADE, -- 关联的媒体源
        library_template_mapping TEXT DEFAULT '{}', -- 媒体库ID到模板ID的映射 (JSON string)
        exclude_libraries TEXT DEFAULT '[]', -- 要排除的媒体库ID列表 (JSON array)
        text_replacements TEXT DEFAULT '{}', -- 文字替换配置 (JSON string)
        cron_expression TEXT NOT NULL, -- Cron 表达式
        poster_count INTEGER DEFAULT 9, -- 每个媒体库下载的封面数量
        upload_enabled INTEGER DEFAULT 1, -- 是否上传回媒体服务器 (0=false, 1=true)
        sort_by TEXT DEFAULT 'DateCreated', -- 排序方式
        is_active INTEGER DEFAULT 1,
        last_run TEXT NULL,
        next_run TEXT NULL,
        run_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        last_error TEXT NULL,
        created_at TEXT DEFAULT (datetime ('now')),
        updated_at TEXT DEFAULT (datetime ('now'))
    );

-- 任务执行记录表
CREATE TABLE
    IF NOT EXISTS task_executions (
        id TEXT PRIMARY KEY DEFAULT (lower(hex (randomblob (16)))),
        task_id TEXT REFERENCES scheduled_tasks (id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
        started_at TEXT DEFAULT (datetime ('now')),
        completed_at TEXT NULL,
        processed_items INTEGER DEFAULT 0,
        failed_items INTEGER DEFAULT 0,
        error_message TEXT NULL,
        execution_log TEXT DEFAULT '[]' -- 执行日志 (JSON string)
    );

-- 系统设置表
CREATE TABLE
    IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TEXT DEFAULT (datetime ('now'))
    );

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_templates_name ON templates (name);

CREATE INDEX IF NOT EXISTS idx_templates_created_at ON templates (created_at);

CREATE INDEX IF NOT EXISTS idx_templates_deleted_at ON templates (deleted_at)
WHERE
    deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_poster_generations_template_id ON poster_generations (template_id);

CREATE INDEX IF NOT EXISTS idx_poster_generations_media_library_id ON poster_generations (media_library_id);

CREATE INDEX IF NOT EXISTS idx_poster_generations_created_at ON poster_generations (created_at);

CREATE INDEX IF NOT EXISTS idx_poster_generations_status ON poster_generations (status);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_is_active ON scheduled_tasks (is_active);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_media_source ON scheduled_tasks (media_source_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks (next_run)
WHERE
    is_active = 1;

CREATE INDEX IF NOT EXISTS idx_task_executions_task_id ON task_executions (task_id);

CREATE INDEX IF NOT EXISTS idx_task_executions_started_at ON task_executions (started_at);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- 创建触发器以自动更新 updated_at
CREATE TRIGGER IF NOT EXISTS update_templates_updated_at AFTER
UPDATE ON templates FOR EACH ROW BEGIN
UPDATE templates
SET
    updated_at = datetime ('now')
WHERE
    id = NEW.id;

END;

CREATE TRIGGER IF NOT EXISTS update_media_libraries_updated_at AFTER
UPDATE ON media_libraries FOR EACH ROW BEGIN
UPDATE media_libraries
SET
    updated_at = datetime ('now')
WHERE
    id = NEW.id;

END;

CREATE TRIGGER IF NOT EXISTS update_scheduled_tasks_updated_at AFTER
UPDATE ON scheduled_tasks FOR EACH ROW BEGIN
UPDATE scheduled_tasks
SET
    updated_at = datetime ('now')
WHERE
    id = NEW.id;

END;

CREATE TRIGGER IF NOT EXISTS update_users_updated_at AFTER
UPDATE ON users FOR EACH ROW BEGIN
UPDATE users
SET
    updated_at = datetime ('now')
WHERE
    id = NEW.id;

END;

-- 插入默认系统设置
INSERT
OR IGNORE INTO system_settings (key, value, description)
VALUES
    ('app_version', '"1.0.0"', '应用程序版本'),
    ('max_concurrent_generations', '5', '最大并发海报生成数量'),
    ('poster_cache_duration', '86400', '海报缓存持续时间（秒）'),
    ('default_poster_format', '"png"', '默认海报格式'),
    ('default_poster_quality', '90', '默认海报质量'),
    ('cleanup_old_generations', 'true', '是否清理旧的海报生成记录'),
    ('cleanup_retention_days', '30', '保留海报生成记录的天数');

-- 插入默认管理员用户（密码: admin123，需要在代码中hash）
-- 注意：这个将在应用启动时创建