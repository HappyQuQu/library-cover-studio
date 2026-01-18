-- 媒体源和定时任务功能的数据库迁移 (SQLite版本)
-- 执行前请先备份数据库
-- 使用方法: sqlite3 your_database.db < migration_sqlite.sql

-- 注意: SQLite的ALTER TABLE功能有限,如果字段已存在会报错
-- 如果某个字段已存在,请注释掉对应的ALTER TABLE语句

-- 1. 为 media_libraries 表添加 user_id 字段 (如果还没有的话)
-- ALTER TABLE media_libraries ADD COLUMN user_id TEXT;

-- 2. 为 scheduled_tasks 表添加新字段

-- 媒体源ID (外键关联到 media_libraries)
ALTER TABLE scheduled_tasks ADD COLUMN media_source_id TEXT REFERENCES media_libraries(id) ON DELETE CASCADE;

-- 媒体库-模板映射 (JSON格式字符串: {"library-id-1": "template-id-1", "library-id-2": "template-id-2"})
ALTER TABLE scheduled_tasks ADD COLUMN library_template_mapping TEXT DEFAULT '{}';

-- 排除的媒体库列表 (JSON数组格式: ["library-id-1", "library-id-2"])
ALTER TABLE scheduled_tasks ADD COLUMN exclude_libraries TEXT DEFAULT '[]';

-- 每个媒体库下载的封面数量
ALTER TABLE scheduled_tasks ADD COLUMN poster_count INTEGER DEFAULT 9;

-- 是否上传生成的海报回媒体服务器 (0=false, 1=true)
ALTER TABLE scheduled_tasks ADD COLUMN upload_enabled INTEGER DEFAULT 1;

-- 媒体项排序方式 (DateCreated, SortName, Random等)
ALTER TABLE scheduled_tasks ADD COLUMN sort_by TEXT DEFAULT 'DateCreated';

-- 3. 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_media_source ON scheduled_tasks(media_source_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_active ON scheduled_tasks(is_active);
CREATE INDEX IF NOT EXISTS idx_media_libraries_active ON media_libraries(is_active);

-- 4. 验证表结构
.mode column
.headers on

SELECT '=== media_libraries 表结构 ===' as info;
PRAGMA table_info(media_libraries);

SELECT '=== scheduled_tasks 表结构 ===' as info;
PRAGMA table_info(scheduled_tasks);

SELECT 'Migration completed successfully!' as status;
