import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore, useThemeStore } from '@/stores';
import { useUpdateSettings } from '@/api/hooks';
import { Settings, User, Palette, Database, Download, Trash2, Moon, Sun, Monitor, Sparkles, Server } from 'lucide-react';

export function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const { mode, setMode, brand, setBrand } = useThemeStore();
  const updateSettings = useUpdateSettings();

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
                { id: 'default' as const, label: '默认主题', icon: Sparkles, color: 'var(--primary)' },
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
