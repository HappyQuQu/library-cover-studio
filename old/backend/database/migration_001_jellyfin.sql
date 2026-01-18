-- 媒体源和定时任务功能的数据库迁移
-- 执行前请先备份数据库

-- 1. 检查并添加 user_id 列到 media_libraries 表
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='media_libraries' AND column_name='user_id'
    ) THEN
        ALTER TABLE media_libraries ADD COLUMN user_id VARCHAR(255);
        COMMENT ON COLUMN media_libraries.user_id IS 'Jellyfin/Emby用户ID';
    END IF;
END $$;

-- 2. 修改 scheduled_tasks 表结构
-- 删除旧的单一模板和媒体库引用
ALTER TABLE scheduled_tasks 
DROP COLUMN IF EXISTS template_id,
DROP COLUMN IF EXISTS media_library_id,
DROP COLUMN IF EXISTS filters;

-- 添加新字段
DO $$ 
BEGIN
    -- 媒体源ID
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='scheduled_tasks' AND column_name='media_source_id'
    ) THEN
        ALTER TABLE scheduled_tasks 
        ADD COLUMN media_source_id UUID REFERENCES media_libraries(id) ON DELETE CASCADE;
        COMMENT ON COLUMN scheduled_tasks.media_source_id IS '关联的媒体源(Jellyfin/Emby服务器)';
    END IF;

    -- 媒体库-模板映射
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='scheduled_tasks' AND column_name='library_template_mapping'
    ) THEN
        ALTER TABLE scheduled_tasks 
        ADD COLUMN library_template_mapping JSONB DEFAULT '{}';
        COMMENT ON COLUMN scheduled_tasks.library_template_mapping IS '媒体库ID到模板ID的映射关系，JSON格式: {"libraryId": "templateId"}';
    END IF;

    -- 排除的媒体库列表
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='scheduled_tasks' AND column_name='exclude_libraries'
    ) THEN
        ALTER TABLE scheduled_tasks 
        ADD COLUMN exclude_libraries TEXT[] DEFAULT '{}';
        COMMENT ON COLUMN scheduled_tasks.exclude_libraries IS '要排除的媒体库ID数组';
    END IF;

    -- 下载封面数量
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='scheduled_tasks' AND column_name='poster_count'
    ) THEN
        ALTER TABLE scheduled_tasks 
        ADD COLUMN poster_count INTEGER DEFAULT 9;
        COMMENT ON COLUMN scheduled_tasks.poster_count IS '每个媒体库下载的封面图片数量';
    END IF;

    -- 是否上传
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='scheduled_tasks' AND column_name='upload_enabled'
    ) THEN
        ALTER TABLE scheduled_tasks 
        ADD COLUMN upload_enabled BOOLEAN DEFAULT true;
        COMMENT ON COLUMN scheduled_tasks.upload_enabled IS '是否将生成的海报上传回媒体服务器';
    END IF;

    -- 排序方式
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='scheduled_tasks' AND column_name='sort_by'
    ) THEN
        ALTER TABLE scheduled_tasks 
        ADD COLUMN sort_by VARCHAR(50) DEFAULT 'DateCreated';
        COMMENT ON COLUMN scheduled_tasks.sort_by IS '媒体项排序方式: DateCreated, SortName, Random等';
    END IF;
END $$;

-- 3. 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_media_source 
ON scheduled_tasks(media_source_id);

CREATE INDEX IF NOT EXISTS idx_media_libraries_active 
ON media_libraries(is_active) WHERE is_active = true;

-- 4. 插入示例数据 (可选，仅用于测试)
-- 取消注释下面的代码来插入示例数据

/*
-- 示例媒体源
INSERT INTO media_libraries (name, type, base_url, api_key, user_id, is_active)
VALUES 
    ('示例 Jellyfin 服务器', 'jellyfin', 'http://localhost:8096', 'your_api_key_here', 'your_user_id_here', true)
ON CONFLICT DO NOTHING;

-- 示例定时任务
INSERT INTO scheduled_tasks (
    name, 
    media_source_id, 
    library_template_mapping,
    cron_expression,
    poster_count,
    upload_enabled,
    is_active
)
SELECT 
    '示例定时任务',
    ml.id,
    '{"library-id-1": "template-id-1"}'::jsonb,
    '0 0 * * *',
    9,
    true,
    false
FROM media_libraries ml
WHERE ml.name = '示例 Jellyfin 服务器'
ON CONFLICT DO NOTHING;
*/

-- 完成
SELECT 'Migration completed successfully!' as status;
