import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore, useThemeStore } from '@/stores';
import { useUpdateSettings } from '@/api/hooks';
import { Settings, User, Palette, Database, Download, Trash2, Moon, Sun, Monitor, Sparkles, Server, Upload, Type } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/api/client';

interface Font {
  filename: string;
  name: string;
  size: number;
  url: string;
  uploadedAt: string;
}

export function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const { mode, setMode, brand, setBrand } = useThemeStore();
  const updateSettings = useUpdateSettings();
  const [fonts, setFonts] = useState<Font[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFonts();
  }, []);

  const loadFonts = async () => {
    try {
      const res = await apiClient.get('/fonts');
      setFonts(res.data.fonts || []);
    } catch (error) {
      console.error('Failed to load fonts:', error);
    }
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('font', file);

    try {
      await apiClient.post('/fonts/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      loadFonts();
    } catch (error) {
      console.error('Failed to upload font:', error);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFont = async (filename: string) => {
    try {
      await apiClient.delete(`/fonts/${filename}`);
      loadFonts();
    } catch (error) {
      console.error('Failed to delete font:', error);
    }
  };

  const handleModeChange = async (newMode: any) => {
    setMode(newMode);
    try {
      await updateSettings.mutateAsync({ theme_mode: newMode });
    } catch (error) {
      console.error('Failed to sync theme mode:', error);
    }
  };

  const handleBrandChange = async (newBrand: any) => {
    setBrand(newBrand);
    try {
      await updateSettings.mutateAsync({ brand_theme: newBrand });
    } catch (error) {
      console.error('Failed to sync brand theme:', error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>设置</h1>
        <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-secondary)' }}>
          管理应用程序配置
        </p>
      </div>

      {/* User Card */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="avatar" style={{ width: 56, height: 56, fontSize: 20, borderRadius: 16 }}>
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontWeight: 600, fontSize: 18, color: 'var(--text-primary)' }}>{user?.username || 'User'}</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>
              {user?.role === 'admin' ? '管理员' : '普通用户'}
            </p>
          </div>
          <Button className="btn btn-secondary">
            <User style={{ width: 16, height: 16 }} />
            编辑
          </Button>
        </div>
      </div>

      {/* Theme */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Palette style={{ width: 18, height: 18, color: 'var(--primary)' }} />
          外观设置
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Mode */}
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>显示模式</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { id: 'light' as const, label: '浅色', icon: Sun },
                { id: 'dark' as const, label: '深色', icon: Moon },
                { id: 'system' as const, label: '系统', icon: Monitor },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleModeChange(m.id)}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: `2px solid ${mode === m.id ? 'var(--primary)' : 'var(--border-color)'}`,
                    background: mode === m.id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <m.icon style={{ width: 24, height: 24, color: mode === m.id ? 'var(--primary)' : 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: mode === m.id ? 'var(--primary)' : 'var(--text-secondary)' }}>
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Brand */}
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>品牌色彩</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { id: 'jellyfin' as const, label: 'Jellyfin', icon: Palette, color: 'var(--jellyfin)' },
                { id: 'emby' as const, label: 'Emby', icon: Server, color: 'var(--emby)' },
              ].map((b) => (
                <button
                  key={b.id}
                  onClick={() => handleBrandChange(b.id)}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: `2px solid ${brand === b.id ? b.color : 'var(--border-color)'}`,
                    background: brand === b.id ? `${b.color}15` : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <b.icon style={{ width: 24, height: 24, color: brand === b.id ? b.color : 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: brand === b.id ? b.color : 'var(--text-secondary)' }}>
                    {b.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Custom Fonts */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Type style={{ width: 18, height: 18, color: 'var(--primary)' }} />
            自定义字体
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            onChange={handleFontUpload}
            style={{ display: 'none' }}
          />
          <Button
            className="btn btn-secondary btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload style={{ width: 14, height: 14 }} />
            {uploading ? '上传中...' : '上传字体'}
          </Button>
        </div>
        <div>
          {fonts.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              暂无自定义字体，点击上方按钮上传
            </div>
          ) : (
            fonts.map((font) => (
              <div key={font.filename} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Type style={{ width: 20, height: 20, color: 'var(--text-tertiary)' }} />
                  </div>
                  <div>
                    <h4 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{font.name}</h4>
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{(font.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <Button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDeleteFont(font.filename)}
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Rendering Settings */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Sparkles style={{ width: 18, height: 18, color: 'var(--primary)' }} />
          渲染设置
        </div>
        <div>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
            <div>
              <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>输出格式</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>生成海报的图片格式</p>
            </div>
            <select className="input" style={{ width: 120 }}>
              <option>PNG</option>
              <option>JPEG</option>
              <option>WebP</option>
            </select>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
            <div>
              <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>输出质量</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>压缩质量 (1-100)</p>
            </div>
            <Input type="number" defaultValue="90" className="input" style={{ width: 100 }} />
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>并发数量</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>同时处理任务数</p>
            </div>
            <Input type="number" defaultValue="3" className="input" style={{ width: 100 }} />
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Database style={{ width: 18, height: 18, color: 'var(--primary)' }} />
          数据管理
        </div>
        <div>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
            <div>
              <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>导出数据</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>导出模板和配置</p>
            </div>
            <Button className="btn btn-secondary btn-sm">
              <Download style={{ width: 14, height: 14 }} />
              导出
            </Button>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>清理缓存</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>清除临时文件</p>
            </div>
            <Button className="btn btn-secondary btn-sm">
              <Trash2 style={{ width: 14, height: 14 }} />
              清理
            </Button>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
        <div className="gradient-purple-blue" style={{ width: 56, height: 56, borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Settings style={{ width: 28, height: 28, color: 'white' }} />
        </div>
        <h3 style={{ fontWeight: 600, fontSize: 18, color: 'var(--text-primary)' }}>CoverStudio</h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>v1.3.0</p>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 12 }}>
          Jellyfin / Emby 封面设计工具
        </p>
      </div>
    </div>
  );
}
