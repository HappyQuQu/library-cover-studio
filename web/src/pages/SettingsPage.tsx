import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore, useThemeStore } from '@/stores';
import { useLogs, useUsers, useCreateUser, useUpdateUser, useDeleteUser, User } from '@/api/hooks';
import { Palette, Database, Download, Trash2, Moon, Sun, Monitor, Sparkles, Server, Upload, Type, Terminal, ChevronRight, Play, Pause, Users, UserPlus, Key } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useState, useEffect, useRef } from 'react';
import { resolveApiUrl } from '@/lib/apiUrl';
import { apiClient } from '@/api/client';
import { AIProviderSettings } from '@/components/settings/AIProviderSettings';

interface Font {
  filename: string;
  name: string;
  size: number;
  url: string;
  uploadedAt: string;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const { mode, setMode, brand, setBrand } = useThemeStore();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [retention, setRetention] = useState({ maxRuns: '50', maxDays: '30' });
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [cachePreview, setCachePreview] = useState<{ files: number; bytes: number } | null>(null);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [uploading, setUploading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = (searchParams.get('tab') as 'appearance' | 'rendering' | 'storage' | 'fonts' | 'data' | 'logs' | 'users' | 'ai') || 'appearance';
  const setActiveSection = (tab: string) => setSearchParams({ tab });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [storageSettings, setStorageSettings] = useState({ savePosters: false, saveCovers: false });
  const [renderingSettings, setRenderingSettings] = useState({ outputFormat: 'PNG', outputQuality: '90', concurrency: '3' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // User Management State
  const { data: userList = [], isLoading: usersLoading } = useUsers(user?.role === 'admin');
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const deleteUserMutation = useDeleteUser();

  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({ username: '', password: '', role: 'user' as 'admin' | 'user' });
  const { data: historicalLogs = [] } = useLogs();
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [autoScroll, setAutoScroll] = useState(true);

  // Self Change Password State
  const [isChangePwdOpen, setIsChangePwdOpen] = useState(false);
  const [pwdFormData, setPwdFormData] = useState({ password: '', confirmPassword: '' });

  // Initialize logs with historical data once loaded
  useEffect(() => {
    if (historicalLogs.length > 0) {
      setLogs(historicalLogs);
    }
  }, [historicalLogs]);

  useEffect(() => {
    // 1. Initial Load
    loadFonts();
    loadStorageSettings();
    loadRenderingSettings();

    // 2. Capture Console Logs (Local)
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      addLog('info', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      originalLog.apply(console, args);
    };
    console.warn = (...args) => {
      addLog('warn', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      originalWarn.apply(console, args);
    };
    console.error = (...args) => {
      addLog('error', args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      originalError.apply(console, args);
    };

    // 3. Connect to Backend Log Stream (SSE) — 先取短期 ticket，再用它打开 EventSource
    let eventSource: EventSource | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.post<{ ticket: string }>('/auth/stream-ticket');
        if (cancelled) return;
        eventSource = new EventSource(resolveApiUrl(`/api/logs/stream?ticket=${encodeURIComponent(data.ticket)}`, import.meta.env.VITE_API_URL || '/api'));

        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            addLog(payload.level, payload.message);
          } catch (e) {
            console.error('Failed to parse log event', e);
          }
        };

        eventSource.onerror = () => {
          console.error('Log stream connection error');
          eventSource?.close();
        };
      } catch (e) {
        console.error('Failed to connect to log stream', e);
      }
    })();

    return () => {
      cancelled = true;
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      eventSource?.close();
    };
  }, []);

  const addLog = (level: 'info' | 'warn' | 'error' | 'debug', message: string) => {
    setLogs(prev => [...prev.slice(-200), {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message
    }]);
  };

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

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

  const handleModeChange = (newMode: any) => setMode(newMode);
  const handleBrandChange = (newBrand: any) => setBrand(newBrand);

  const handleExport = async () => {
    setMaintenanceBusy(true);
    try {
      const response = await apiClient.get('/settings/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `cover-studio-config-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: '配置已导出', description: '不包含账号密码、连接密钥和图片文件。' });
    } catch { toast({ title: '导出失败', variant: 'destructive' }); }
    finally { setMaintenanceBusy(false); }
  };
  const handleCache = async () => {
    setMaintenanceBusy(true);
    try {
      if (!cachePreview) {
        setCachePreview((await apiClient.get('/settings/cache')).data);
      } else {
        const { data } = await apiClient.post('/settings/cache/clear');
        setCachePreview(null);
        toast({ title: '清理完成', description: `已清理 ${data.files} 个文件。` });
      }
    } catch { toast({ title: '缓存操作失败', variant: 'destructive' }); }
    finally { setMaintenanceBusy(false); }
  };
  const saveRetention = async (key: 'maxRuns' | 'maxDays', value: string) => {
    try { await apiClient.post('/settings', { [`history.${key}`]: value }); toast({ title: '历史保留设置已保存' }); }
    catch { toast({ title: '保存失败，请输入有效整数', variant: 'destructive' }); await loadStorageSettings(); }
  };

  const loadStorageSettings = async () => {
    try {
      const res = await apiClient.get('/settings');
      const settings = res.data || {};
      setRetention({ maxRuns: settings['history.maxRuns'] || '50', maxDays: settings['history.maxDays'] || '30' });
      setStorageSettings({
        savePosters: settings['storage.savePosters'] === 'true',
        saveCovers: settings['storage.saveCovers'] === 'true'
      });
    } catch (error) {
      console.error('Failed to load storage settings', error);
    }
  };

  const toggleStorage = async (key: 'savePosters' | 'saveCovers') => {
    const newValue = !storageSettings[key];
    setStorageSettings(prev => ({ ...prev, [key]: newValue }));
    try {
      // Send directly as object, backend now supports it
      await apiClient.post('/settings', { [`storage.${key}`]: String(newValue) });
    } catch (error) {
      console.error('Failed to save storage setting', error);
      // Revert on error
      setStorageSettings(prev => ({ ...prev, [key]: !newValue }));
    }
  };

  const loadRenderingSettings = async () => {
    try {
      const res = await apiClient.get('/settings');
      const settings = res.data || {};
      setRenderingSettings({
        outputFormat: settings['rendering.outputFormat'] || 'PNG',
        outputQuality: settings['rendering.outputQuality'] || '90',
        concurrency: settings['rendering.concurrency'] || '3'
      });
    } catch (error) {
      console.error('Failed to load rendering settings', error);
    }
  };

  const saveRenderingSetting = async (key: 'outputFormat' | 'outputQuality' | 'concurrency', value: string) => {
    setRenderingSettings(prev => ({ ...prev, [key]: value }));
    try {
      await apiClient.post('/settings', { [`rendering.${key}`]: value });
    } catch (error) {
      console.error('Failed to save rendering setting', error);
      // Revert on error
      toast({ title: '保存失败，请检查输入范围', variant: 'destructive' });
      await loadRenderingSettings();
    }
  };

  const handleUserAction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await updateUserMutation.mutateAsync({
          id: editingUser.id,
          role: userFormData.role,
          ...(userFormData.password ? { password: userFormData.password } : {})
        });
        toast({ title: '用户更新成功' });
      } else {
        await createUserMutation.mutateAsync(userFormData);
        toast({ title: '用户创建成功' });
      }
      setIsUserDialogOpen(false);
      setEditingUser(null);
      setUserFormData({ username: '', password: '', role: 'user' });
    } catch (error: any) {
      toast({ title: '操作失败', description: error.response?.data?.error || '未知错误', variant: 'destructive' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdFormData.password !== pwdFormData.confirmPassword) {
      return toast({ title: '错误', description: '两次输出的密码不一致', variant: 'destructive' });
    }
    if (pwdFormData.password.length < 6) {
      return toast({ title: '错误', description: '密码长度至少为 6 位', variant: 'destructive' });
    }

    try {
      await updateUserMutation.mutateAsync({
        id: user!.id,
        password: pwdFormData.password
      });
      toast({ title: '密码修改成功' });
      setIsChangePwdOpen(false);
      setPwdFormData({ password: '', confirmPassword: '' });
    } catch (error: any) {
      toast({ title: '修改失败', description: error.response?.data?.error || '未知错误', variant: 'destructive' });
    }
  };

  const menuItems = [
    { id: 'appearance', label: '外观设置', icon: Palette },
    { id: 'rendering', label: '渲染设置', icon: Sparkles },
    { id: 'storage', label: '存储设置', icon: Server },
    { id: 'fonts', label: '字体管理', icon: Type },
    { id: 'ai', label: 'AI 配置', icon: Sparkles },
    { id: 'data', label: '数据管理', icon: Database },
    { id: 'logs', label: '系统日志', icon: Terminal },
    ...(user?.role === 'admin' ? [{ id: 'users', label: '用户管理', icon: Users }] : []),
  ];

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error': return '#ef4444';
      case 'warn': return '#f59e0b';
      case 'info': return '#3b82f6';
      default: return 'var(--text-tertiary)';
    }
  };

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 120px)' }}>
      {/* Left Sidebar */}
      <div style={{ width: 240, flexShrink: 0 }}>
        {/* User Card */}
        <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 16, borderRadius: 12 }}>
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.username || 'User'}</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {user?.role === 'admin' ? '管理员' : '普通用户'}
              </p>
            </div>
          </div>
          <Button
            className="btn btn-ghost btn-xs"
            onClick={() => setIsChangePwdOpen(true)}
            style={{ width: '100%', marginTop: 12, fontSize: 11, height: 28, gap: 6, opacity: 0.8 }}
          >
            <Key style={{ width: 12, height: 12 }} />
            修改密码
          </Button>
        </div>

        {/* Menu */}
        <div className="glass-panel" style={{ padding: 8 }}>
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id as any)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: 'none',
                background: activeSection === item.id ? 'var(--primary)' : 'transparent',
                color: activeSection === item.id ? 'white' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginBottom: 2,
                fontSize: 13,
                fontWeight: 500
              }}
            >
              <item.icon style={{ width: 18, height: 18 }} />
              {item.label}
              {activeSection === item.id && <ChevronRight style={{ width: 16, height: 16, marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>

        {/* About */}
        <div style={{ marginTop: 16, padding: 16, textAlign: 'center', opacity: 0.7 }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>CoverStudio v{import.meta.env.VITE_APP_VERSION}</p>
        </div>
      </div>

      {/* Right Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Appearance */}
        {activeSection === 'appearance' && (
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Palette style={{ width: 18, height: 18, color: 'var(--primary)' }} />
              外观设置
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {/* Mode */}
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>显示模式</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 400 }}>
                  {[
                    { id: 'light' as const, label: '浅色', icon: Sun },
                    { id: 'dark' as const, label: '深色', icon: Moon },
                    { id: 'system' as const, label: '系统', icon: Monitor },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleModeChange(m.id)}
                      style={{
                        padding: 20,
                        borderRadius: 16,
                        border: `2px solid ${mode === m.id ? 'var(--primary)' : 'var(--border-color)'}`,
                        background: mode === m.id ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <m.icon style={{ width: 28, height: 28, color: mode === m.id ? 'var(--primary)' : 'var(--text-tertiary)' }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: mode === m.id ? 'var(--primary)' : 'var(--text-secondary)' }}>
                        {m.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand */}
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>品牌色彩</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, maxWidth: 280 }}>
                  {[
                    { id: 'jellyfin' as const, label: 'Jellyfin', icon: Palette, color: 'var(--jellyfin)' },
                    { id: 'emby' as const, label: 'Emby', icon: Server, color: 'var(--emby)' },
                  ].map((b) => (
                    <button
                      key={b.id}
                      onClick={() => handleBrandChange(b.id)}
                      style={{
                        padding: 20,
                        borderRadius: 16,
                        border: `2px solid ${brand === b.id ? b.color : 'var(--border-color)'}`,
                        background: brand === b.id ? `${b.color}15` : 'var(--bg-primary)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <b.icon style={{ width: 28, height: 28, color: brand === b.id ? b.color : 'var(--text-tertiary)' }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: brand === b.id ? b.color : 'var(--text-secondary)' }}>
                        {b.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rendering */}
        {activeSection === 'rendering' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Sparkles style={{ width: 18, height: 18, color: 'var(--primary)' }} />
              渲染设置
            </div>
            {!isAdmin && <p style={{ padding: 16 }}>全局设置仅管理员可修改。</p>}
            <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0 }}>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>输出格式</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>生成海报的图片格式</p>
                </div>
                <select
                  className="input"
                  style={{ width: 140 }}
                  value={renderingSettings.outputFormat}
                  onChange={e => saveRenderingSetting('outputFormat', e.target.value)}
                >
                  <option value="PNG">PNG</option>
                  <option value="JPEG">JPEG</option>
                  <option value="WebP">WebP</option>
                </select>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>输出质量</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>JPEG / WebP 压缩质量 (1-100)，PNG 为无损格式</p>
                </div>
                <Input
                  type="number"
                  value={renderingSettings.outputQuality}
                  onChange={e => setRenderingSettings(prev => ({ ...prev, outputQuality: e.target.value }))}
                  onBlur={e => saveRenderingSetting('outputQuality', e.target.value)}
                  min="1"
                  max="100"
                  className="input"
                  style={{ width: 120 }}
                />
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>并发数量</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>同时渲染的图片数量</p>
                </div>
                <Input
                  type="number"
                  value={renderingSettings.concurrency}
                  onChange={e => setRenderingSettings(prev => ({ ...prev, concurrency: e.target.value }))}
                  onBlur={e => saveRenderingSetting('concurrency', e.target.value)}
                  min="1"
                  max="10"
                  className="input"
                  style={{ width: 120 }}
                />
              </div>
            </fieldset>
          </div>
        )}

        {/* Storage */}
        {activeSection === 'storage' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Server style={{ width: 18, height: 18, color: 'var(--primary)' }} />
              存储设置
            </div>
            {!isAdmin && <p style={{ padding: 16 }}>全局设置仅管理员可修改。</p>}
            <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0 }}>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>保存原海报</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>将抓取到的高清海报保存到 <code>./data/posters</code></p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={storageSettings.savePosters}
                    onChange={() => toggleStorage('savePosters')}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>保存生成的封面</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>额外保存一份封面文件；执行历史中的图片由下方保留策略管理</p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={storageSettings.saveCovers}
                    onChange={() => toggleStorage('saveCovers')}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
              <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border-color)' }}>
                <h3>执行历史保留</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0' }}>每个任务保留最近指定次数、指定天数内的已结束记录和图片；超出任一上限会在启动或执行结束后清理。正在执行的记录会保留。</p>
                <label>每任务最多次数 <Input type="number" min={1} max={500} value={retention.maxRuns} onChange={e => setRetention(p => ({ ...p, maxRuns: e.target.value }))} onBlur={e => saveRetention('maxRuns', e.target.value)} /></label>
                <label>最多保留天数 <Input type="number" min={1} max={365} value={retention.maxDays} onChange={e => setRetention(p => ({ ...p, maxDays: e.target.value }))} onBlur={e => saveRetention('maxDays', e.target.value)} /></label>
              </div>
            </fieldset>
          </div>
        )}

        {/* Fonts */}
        {activeSection === 'fonts' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Type style={{ width: 18, height: 18, color: 'var(--primary)' }} />
                字体管理
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                onChange={handleFontUpload}
                style={{ display: 'none' }}
              />
              <Button
                className="btn btn-primary btn-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload style={{ width: 14, height: 14 }} />
                {uploading ? '上传中...' : '上传字体'}
              </Button>
            </div>
            <div>
              {fonts.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <Type style={{ width: 48, height: 48, color: 'var(--text-tertiary)', margin: '0 auto 16px' }} />
                  <p style={{ color: 'var(--text-tertiary)' }}>暂无自定义字体</p>
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>点击上方按钮上传 TTF/OTF/WOFF 字体</p>
                </div>
              ) : (
                fonts.map((font) => (
                  <div key={font.filename} style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Type style={{ width: 22, height: 22, color: 'var(--text-tertiary)' }} />
                      </div>
                      <div>
                        <h4 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{font.name}</h4>
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{(font.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <Button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDeleteFont(font.filename)}
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 style={{ width: 16, height: 16 }} />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* AI Configuration */}
        {activeSection === 'ai' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Sparkles style={{ width: 18, height: 18, color: 'var(--primary)' }} />
              AI 配置
            </div>
            <div className="card-body">
              <AIProviderSettings />
            </div>
          </div>
        )}

        {/* Data */}
        {activeSection === 'data' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Database style={{ width: 18, height: 18, color: 'var(--primary)' }} />
              数据管理
            </div>
            <div>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>导出数据</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>导出模板和配置 JSON；不包含账号密码、API 密钥、历史图片与字体文件</p>
                </div>
                <Button className="btn btn-secondary" disabled={!isAdmin || maintenanceBusy} onClick={handleExport}>
                  <Download style={{ width: 16, height: 16 }} />
                  导出
                </Button>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>清理缓存</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>清理超过 24 小时的临时文件和未被历史引用的图片，保留模板、字体和有效历史</p>
                </div>
                <Button className="btn btn-secondary" disabled={!isAdmin || maintenanceBusy} onClick={handleCache}>
                  <Trash2 style={{ width: 16, height: 16 }} />
                  {cachePreview ? '确认清理' : '查看可清理文件'}
                </Button>
              </div>
              {cachePreview && <div style={{ padding: '0 24px 20px' }} role="status">可清理 {cachePreview.files} 个文件，约 {(cachePreview.bytes / 1024 / 1024).toFixed(2)} MB。<Button variant="ghost" onClick={() => setCachePreview(null)}>取消</Button></div>}
              {!isAdmin && <p style={{ padding: 16 }}>配置导出和缓存清理仅管理员可操作。</p>}
            </div>
          </div>
        )}

        {/* Logs */}
        {activeSection === 'logs' && (
          <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Terminal style={{ width: 18, height: 18, color: 'var(--primary)' }} />
                系统日志
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 10 }}>
                  {logs.filter(l => logFilter === 'all' || l.level === logFilter).length} 条
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Auto-scroll Toggle */}
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    border: 'none', cursor: 'pointer',
                    background: autoScroll ? 'var(--success)' : 'var(--bg-tertiary)',
                    color: autoScroll ? 'white' : 'var(--text-secondary)',
                    transition: 'all 0.2s'
                  }}
                  title={autoScroll ? '自动滚动已开启' : '自动滚动已关闭'}
                >
                  {autoScroll ? <Play style={{ width: 12, height: 12 }} /> : <Pause style={{ width: 12, height: 12 }} />}
                  {autoScroll ? '滚动' : '暂停'}
                </button>
                <Button className="btn btn-ghost btn-sm" onClick={() => setLogs([])}>
                  <Trash2 style={{ width: 14, height: 14 }} />
                  清空
                </Button>
              </div>
            </div>

            {/* Log Level Filter Tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              {[
                { id: 'all' as const, label: '全部', color: 'var(--text-primary)' },
                { id: 'info' as const, label: 'INFO', color: '#3b82f6' },
                { id: 'warn' as const, label: 'WARN', color: '#f59e0b' },
                { id: 'error' as const, label: 'ERROR', color: '#ef4444' },
              ].map(filter => {
                const count = filter.id === 'all' ? logs.length : logs.filter(l => l.level === filter.id).length;
                return (
                  <button
                    key={filter.id}
                    onClick={() => setLogFilter(filter.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                      border: 'none', cursor: 'pointer',
                      background: logFilter === filter.id ? (filter.id === 'all' ? 'var(--primary)' : filter.color) : 'transparent',
                      color: logFilter === filter.id ? 'white' : filter.color,
                      transition: 'all 0.2s'
                    }}
                  >
                    {filter.label} ({count})
                  </button>
                );
              })}
            </div>

            <div style={{ flex: 1, overflow: 'auto', background: '#1a1a2e', borderRadius: '0 0 12px 12px' }}>
              {logs.filter(l => logFilter === 'all' || l.level === logFilter).length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <Terminal style={{ width: 48, height: 48, color: '#4a5568', margin: '0 auto 16px' }} />
                  <p style={{ color: '#718096' }}>暂无{logFilter !== 'all' ? ` ${logFilter.toUpperCase()} ` : ''}日志</p>
                  <p style={{ fontSize: 13, color: '#4a5568', marginTop: 8 }}>执行操作时将在此显示日志</p>
                </div>
              ) : (
                <div style={{ padding: 16, fontFamily: 'Consolas, Monaco, monospace', fontSize: 12, lineHeight: 1.8 }}>
                  {logs.filter(l => logFilter === 'all' || l.level === logFilter).map((log, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12 }}>
                      <span style={{ color: '#4a5568', flexShrink: 0 }}>{log.timestamp}</span>
                      <span style={{ color: getLogColor(log.level), flexShrink: 0, width: 50 }}>[{log.level.toUpperCase()}]</span>
                      <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{log.message}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* User Management */}
        {activeSection === 'users' && user?.role === 'admin' && (
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Users style={{ width: 18, height: 18, color: 'var(--primary)' }} />
                用户管理
              </div>
              <Button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setEditingUser(null);
                  setUserFormData({ username: '', password: '', role: 'user' });
                  setIsUserDialogOpen(true);
                }}
              >
                <UserPlus style={{ width: 14, height: 14 }} />
                添加用户
              </Button>
            </div>

            <div>
              {usersLoading ? (
                <div style={{ padding: 48, textAlign: 'center' }}>加载中...</div>
              ) : userList.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>未找到用户</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '12px 24px', fontWeight: 500 }}>用户名</th>
                        <th style={{ padding: '12px 24px', fontWeight: 500 }}>角色</th>
                        <th style={{ padding: '12px 24px', fontWeight: 500 }}>创建日期</th>
                        <th style={{ padding: '12px 24px', fontWeight: 500, textAlign: 'right' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userList.map((u) => (
                        <tr
                          key={u.id}
                          style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}
                          className="hover:bg-(--bg-tertiary) transition-colors"
                        >
                          <td style={{ padding: '16px 24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div className="avatar" style={{ width: 32, height: 32, fontSize: 12, borderRadius: 8 }}>
                                {u.username[0].toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{u.username}</span>
                              {u.id === user.id && <span style={{ fontSize: 10, background: 'var(--primary)', color: 'white', padding: '1px 6px', borderRadius: 4 }}>我</span>}
                            </div>
                          </td>
                          <td style={{ padding: '12px 24px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 11,
                              background: u.role === 'admin' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                              color: u.role === 'admin' ? 'var(--primary)' : 'var(--text-secondary)',
                              fontWeight: 500
                            }}>
                              {u.role === 'admin' ? '管理员' : '普通用户'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 24px', color: 'var(--text-tertiary)' }}>
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <Button
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  setEditingUser(u);
                                  setUserFormData({ username: u.username, password: '', role: u.role });
                                  setIsUserDialogOpen(true);
                                }}
                              >
                                编辑
                              </Button>
                              <Button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)' }}
                                onClick={async () => {
                                  if (u.id === user.id) return alert('不能删除自己');
                                  if (confirm(`确定要删除用户 "${u.username}" 吗？`)) {
                                    try {
                                      await deleteUserMutation.mutateAsync(u.id);
                                    } catch (err) {
                                      alert('删除失败');
                                    }
                                  }
                                }}
                              >
                                删除
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* User Dialog */}
            {isUserDialogOpen && (
              <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000
              }}>
                <div className="card" style={{ width: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                  <div className="card-header">
                    {editingUser ? '编辑用户' : '新建用户'}
                  </div>
                  <form onSubmit={handleUserAction} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>用户名</label>
                      <Input
                        value={userFormData.username}
                        onChange={e => setUserFormData({ ...userFormData, username: e.target.value })}
                        disabled={!!editingUser}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{editingUser ? '新密码 (留空则不修改)' : '密码'}</label>
                      <Input
                        type="password"
                        value={userFormData.password}
                        onChange={e => setUserFormData({ ...userFormData, password: e.target.value })}
                        required={!editingUser}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>角色</label>
                      <select
                        className="input"
                        value={userFormData.role}
                        onChange={e => setUserFormData({ ...userFormData, role: e.target.value as any })}
                      >
                        <option value="user">普通用户</option>
                        <option value="admin">管理员</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                      <Button type="button" className="btn btn-secondary" onClick={() => setIsUserDialogOpen(false)}>取消</Button>
                      <Button type="submit" className="btn btn-primary" disabled={createUserMutation.isPending || updateUserMutation.isPending}>
                        {editingUser ? '保存修改' : '立即创建'}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Change Password Dialog (Self) */}
      {isChangePwdOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Key style={{ width: 18, height: 18, color: 'var(--primary)' }} />
              修改我的密码
            </div>
            <form onSubmit={handleChangePassword} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>新密码</label>
                <Input
                  type="password"
                  placeholder="请输入至少 6 位新密码"
                  value={pwdFormData.password}
                  onChange={e => setPwdFormData({ ...pwdFormData, password: e.target.value })}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>确认新密码</label>
                <Input
                  type="password"
                  placeholder="请再次输入新密码"
                  value={pwdFormData.confirmPassword}
                  onChange={e => setPwdFormData({ ...pwdFormData, confirmPassword: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                <Button type="button" className="btn btn-secondary" onClick={() => setIsChangePwdOpen(false)}>取消</Button>
                <Button type="submit" className="btn btn-primary" disabled={updateUserMutation.isPending}>
                  确认修改
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
