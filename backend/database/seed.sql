-- 示例数据插入
-- 这个文件包含一些示例数据，用于开发和测试

-- 插入示例模板
INSERT INTO templates (id, name, description, canvas_data, tags, is_public) VALUES
(
    '550e8400-e29b-41d4-a716-446655440001',
    '经典电影海报',
    '适合经典电影的简约设计模板',
    '{
        "version": "5.3.0",
        "objects": [
            {
                "type": "rect",
                "left": 0,
                "top": 0,
                "width": 400,
                "height": 600,
                "fill": "#1a1a1a"
            },
            {
                "type": "text",
                "left": 200,
                "top": 520,
                "text": "{{title}}",
                "fontSize": 32,
                "fill": "#ffffff",
                "fontFamily": "Arial",
                "textAlign": "center",
                "originX": "center"
            },
            {
                "type": "text", 
                "left": 200,
                "top": 560,
                "text": "{{year}}",
                "fontSize": 16,
                "fill": "#cccccc",
                "fontFamily": "Arial",
                "textAlign": "center",
                "originX": "center"
            }
        ]
    }',
    ARRAY['电影', '经典', '简约'],
    true
),
(
    '550e8400-e29b-41d4-a716-446655440002',
    '现代TV剧集海报',
    '适合现代TV剧集的动感设计',
    '{
        "version": "5.3.0",
        "objects": [
            {
                "type": "rect",
                "left": 0,
                "top": 0,
                "width": 400,
                "height": 600,
                "fill": "linear-gradient(45deg, #667eea 0%, #764ba2 100%)"
            },
            {
                "type": "text",
                "left": 200,
                "top": 500,
                "text": "{{title}}",
                "fontSize": 28,
                "fill": "#ffffff",
                "fontFamily": "Microsoft YaHei",
                "textAlign": "center",
                "originX": "center",
                "fontWeight": "bold"
            }
        ]
    }',
    ARRAY['电视剧', '现代', '渐变'],
    true
);

-- 插入示例媒体库配置
INSERT INTO media_libraries (id, name, type, base_url, api_key, username, is_active) VALUES
(
    '660e8400-e29b-41d4-a716-446655440001',
    '本地 Jellyfin 服务器',
    'jellyfin',
    'http://localhost:8096',
    'your-jellyfin-api-key-here',
    'admin',
    false  -- 默认不激活，需要用户配置
),
(
    '660e8400-e29b-41d4-a716-446655440002', 
    '本地 Emby 服务器',
    'emby',
    'http://localhost:8920',
    'your-emby-api-key-here',
    'admin',
    false  -- 默认不激活，需要用户配置
);

-- 插入示例定时任务
INSERT INTO scheduled_tasks (id, name, template_id, media_library_id, cron_expression, filters, is_active) VALUES
(
    '770e8400-e29b-41d4-a716-446655440001',
    '每日电影海报更新',
    '550e8400-e29b-41d4-a716-446655440001',
    '660e8400-e29b-41d4-a716-446655440001',
    '0 2 * * *',  -- 每天凌晨2点执行
    '{"mediaType": "movie", "minRating": 7.0}',
    false  -- 默认不激活
);

-- 插入系统配置示例
INSERT INTO system_settings (key, value, description) VALUES
('smtp_host', '"smtp.example.com"', 'SMTP服务器地址'),
('smtp_port', '587', 'SMTP服务器端口'),
('smtp_username', '"noreply@example.com"', 'SMTP用户名'),
('notification_enabled', 'true', '是否启用通知'),
('webhook_url', '""', 'Webhook通知URL')
ON CONFLICT (key) DO NOTHING;