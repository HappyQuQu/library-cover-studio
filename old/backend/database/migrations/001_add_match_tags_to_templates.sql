-- 为 templates 表添加 match_tags 字段
-- 用于存储匹配字符串，用于自动匹配媒体库
ALTER TABLE templates
ADD COLUMN match_tags TEXT DEFAULT '[]';

-- 注释：match_tags 是一个 JSON 数组，存储用于匹配媒体库的字符串
-- 例如：["电影", "Movies", "Film"]
-- 创建定时任务时，如果媒体库名称包含这些字符串（模糊匹配），则自动选中该媒体库