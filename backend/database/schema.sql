-- LibraryCoverStudio 数据库架构
-- PostgreSQL 14+

-- 创建数据库（如果不存在）
-- CREATE DATABASE library_cover_studio;

-- 使用数据库
-- \c library_cover_studio;

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 模板表
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    preview_url VARCHAR(500),
    canvas_data JSONB NOT NULL, -- 存储 Fabric.js Canvas 数据
    tags VARCHAR(255)[], -- 标签数组
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- 媒体库配置表
CREATE TABLE media_libraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('jellyfin', 'emby', 'plex')),
    base_url VARCHAR(500) NOT NULL,
    api_key VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    password VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_sync TIMESTAMP WITH TIME ZONE NULL,
    config JSONB DEFAULT '{}', -- 额外配置信息
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 海报生成历史表
CREATE TABLE poster_generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
    media_library_id UUID REFERENCES media_libraries(id) ON DELETE CASCADE,
    media_item_id VARCHAR(255) NOT NULL, -- 媒体项目在媒体库中的ID
    media_title VARCHAR(500) NOT NULL,
    media_type VARCHAR(50) NOT NULL CHECK (media_type IN ('movie', 'tv', 'episode', 'season')),
    poster_url VARCHAR(500) NOT NULL, -- 生成的海报URL
    generation_data JSONB, -- 生成时的数据（如文本替换等）
    status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 自动化任务表
CREATE TABLE scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
    media_library_id UUID REFERENCES media_libraries(id) ON DELETE CASCADE,
    cron_expression VARCHAR(100) NOT NULL, -- Cron 表达式
    filters JSONB DEFAULT '{}', -- 过滤条件（如类型、年份等）
    is_active BOOLEAN DEFAULT true,
    last_run TIMESTAMP WITH TIME ZONE NULL,
    next_run TIMESTAMP WITH TIME ZONE NULL,
    run_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_error TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 任务执行记录表
CREATE TABLE task_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE NULL,
    processed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    error_message TEXT NULL,
    execution_log JSONB DEFAULT '[]' -- 执行日志
);

-- 系统设置表
CREATE TABLE system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_templates_name ON templates USING gin(to_tsvector('english', name));
CREATE INDEX idx_templates_tags ON templates USING gin(tags);
CREATE INDEX idx_templates_created_at ON templates(created_at);
CREATE INDEX idx_templates_deleted_at ON templates(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX idx_poster_generations_template_id ON poster_generations(template_id);
CREATE INDEX idx_poster_generations_media_library_id ON poster_generations(media_library_id);
CREATE INDEX idx_poster_generations_created_at ON poster_generations(created_at);
CREATE INDEX idx_poster_generations_status ON poster_generations(status);

CREATE INDEX idx_scheduled_tasks_is_active ON scheduled_tasks(is_active);
CREATE INDEX idx_scheduled_tasks_next_run ON scheduled_tasks(next_run) WHERE is_active = true;

CREATE INDEX idx_task_executions_task_id ON task_executions(task_id);
CREATE INDEX idx_task_executions_started_at ON task_executions(started_at);

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表创建更新时间触发器
CREATE TRIGGER update_templates_updated_at 
    BEFORE UPDATE ON templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_media_libraries_updated_at 
    BEFORE UPDATE ON media_libraries 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_tasks_updated_at 
    BEFORE UPDATE ON scheduled_tasks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入默认系统设置
INSERT INTO system_settings (key, value, description) VALUES
('app_version', '"1.0.0"', '应用程序版本'),
('max_concurrent_generations', '5', '最大并发海报生成数量'),
('poster_cache_duration', '86400', '海报缓存持续时间（秒）'),
('default_poster_format', '"png"', '默认海报格式'),
('default_poster_quality', '90', '默认海报质量'),
('cleanup_old_generations', 'true', '是否清理旧的海报生成记录'),
('cleanup_retention_days', '30', '保留海报生成记录的天数')
ON CONFLICT (key) DO NOTHING;