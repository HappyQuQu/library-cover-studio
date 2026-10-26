import { displayMessage, type DisplayMessage } from '@/lib/displayMessage';
import { getLocalizedApiError, type ApiErrorContext } from '@/lib/apiError';
import { formatDisplayDate, formatDisplayNumber } from '@/lib/displayFormat';
import { ErrorDetails } from '@/components/ErrorDetails';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore, useThemeStore } from '@/stores';
import { useLogs, useUsers, useCreateUser, useUpdateUser, useDeleteUser, User } from '@/api/hooks';
import { Palette, Database, Download, Trash2, Moon, Sun, Monitor, Sparkles, Server, Upload, Type, Terminal, ChevronRight, Play, Pause, Users, UserPlus, Key, Info, History, Globe } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useState, useEffect, useRef } from 'react';
import { resolveApiUrl } from '@/lib/apiUrl';
import { apiClient } from '@/api/client';
import { DefaultTemplateSettings } from '@/components/settings/DefaultTemplateSettings';
import { ConfigurationRestore } from '@/components/settings/ConfigurationRestore';
import { AIProviderSettings } from '@/components/settings/AIProviderSettings';
import { AboutPage } from './AboutPage';
import { ReleasesPage } from './ReleasesPage';
import { useAppReleases } from '@/api/system';
import { UpdateDot } from '@/components/VersionStatus';
import { GithubNetworkSettings } from '@/components/settings/GithubNetworkSettings';
import { useTranslation } from 'react-i18next';
import { LanguageSelect } from '@/components/LanguageSelect';

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

// Moving focus to a language control must not commit an unfinished auto-save field.
const switchingLanguage = (event: React.FocusEvent<HTMLInputElement>) =>
  event.relatedTarget instanceof Element && !!event.relatedTarget.closest('[data-language-control], [data-account-menu]');

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { mode, setMode, brand, setBrand } = useThemeStore();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [retention, setRetention] = useState({ maxRuns: '50', maxDays: '30' });
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const [cachePreview, setCachePreview] = useState<{ files: number; bytes: number } | null>(null);
  const [settingsError, setSettingsFailure] = useState<{ error: unknown; context: ApiErrorContext } | null>(null);
  const setSettingsError = (error: unknown, context: ApiErrorContext = 'operation') =>
    setSettingsFailure(error === null ? null : { error, context });
  const [logStreamAttempt, setLogStreamAttempt] = useState(0);
  const [logStreamStatus, setLogStreamStatus] = useState<DisplayMessage>({ key: 'settings.streamConnecting' });
  const [logStreamError, setLogStreamError] = useState<unknown>(null);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [uploading, setUploading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = (searchParams.get('tab') as 'appearance' | 'rendering' | 'storage' | 'fonts' | 'data' | 'logs' | 'users' | 'ai' | 'about' | 'releases' | 'network') || 'appearance';
  const setActiveSection = (tab: string) => setSearchParams({ tab });
  const { data: releases } = useAppReleases();

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

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  // The stream lifecycle is independent of language and unsaved settings.
  useEffect(() => {
    // 3. Connect to Backend Log Stream (SSE) — 先取短期 ticket，再用它打开 EventSource
    setLogStreamStatus({ key: 'settings.streamConnecting' });
    setLogStreamError(null);
    let eventSource: EventSource | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.post<{ ticket: string }>('/auth/stream-ticket');
        if (cancelled) return;
        eventSource = new EventSource(resolveApiUrl(`/api/logs/stream?ticket=${encodeURIComponent(data.ticket)}`, import.meta.env.VITE_API_URL || '/api'));

        eventSource.onopen = () => { if (!cancelled) setLogStreamStatus({ key: 'settings.streamConnected' }); };
        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            addLog(payload.level, payload.message);
          } catch (e) {
            console.error('Failed to parse log event', e);
          }
        };

        eventSource.onerror = () => {
          if (!cancelled) setLogStreamStatus({ key: 'settings.streamDisconnected' });
          eventSource?.close();
        };
      } catch (e) {
        if (!cancelled) { setLogStreamStatus({ key: 'settings.streamFailed' }); setLogStreamError(e); }
      }
    })();

    return () => { cancelled = true; eventSource?.close(); };
  }, [logStreamAttempt]);

  const addLog = (level: 'info' | 'warn' | 'error' | 'debug', message: string) => {
    setLogs(prev => [...prev.slice(-200), {
      timestamp: new Date().toISOString(),
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
      setSettingsError(error);
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
      setSettingsError(null);
      toast({ title: i18n.t('settings.fontUploaded') });
    } catch (error) {
      console.error('Failed to upload font:', error);
      setSettingsError(error, 'font');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFont = async (filename: string) => {
    try {
      await apiClient.delete(`/fonts/${filename}`);
      loadFonts();
      setSettingsError(null);
      toast({ title: i18n.t('settings.fontDeleted') });
    } catch (error) {
      console.error('Failed to delete font:', error);
      setSettingsError(error);
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
      toast({ title: i18n.t('settings.exported'), description: i18n.t('settings.exportedHint') });
    } catch { toast({ title: i18n.t('settings.exportFailed'), variant: 'destructive' }); }
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
        toast({ title: i18n.t('settings.cacheCleared'), description: i18n.t('settings.cacheClearedCount', { count: data.files }) });
      }
    } catch { toast({ title: i18n.t('settings.cacheFailed'), variant: 'destructive' }); }
    finally { setMaintenanceBusy(false); }
  };
  const saveRetention = async (key: 'maxRuns' | 'maxDays', value: string) => {
    try { await apiClient.post('/settings', { [`history.${key}`]: value }); setSettingsError(null); toast({ title: i18n.t('settings.retentionSaved') }); }
    catch (error) { setSettingsError(error); toast({ title: i18n.t('settings.integerRequired'), variant: 'destructive' }); }
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
      setSettingsError(error);
    }
  };

  const toggleStorage = async (key: 'savePosters' | 'saveCovers') => {
    const newValue = !storageSettings[key];
    setStorageSettings(prev => ({ ...prev, [key]: newValue }));
    try {
      // Send directly as object, backend now supports it
      await apiClient.post('/settings', { [`storage.${key}`]: String(newValue) });
      setSettingsError(null);
    } catch (error) {
      console.error('Failed to save storage setting', error);
      setSettingsError(error);
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
      setSettingsError(error);
    }
  };

  const saveRenderingSetting = async (key: 'outputFormat' | 'outputQuality' | 'concurrency', value: string) => {
    setRenderingSettings(prev => ({ ...prev, [key]: value }));
    try {
      await apiClient.post('/settings', { [`rendering.${key}`]: value });
      setSettingsError(null);
    } catch (error) {
      console.error('Failed to save rendering setting', error);
      toast({ title: i18n.t('settings.rangeRequired'), variant: 'destructive' });
      setSettingsError(error);
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
        toast({ title: i18n.t('settings.userUpdated') });
      } else {
        await createUserMutation.mutateAsync(userFormData);
        toast({ title: i18n.t('settings.userCreated') });
      }
      setIsUserDialogOpen(false);
      setEditingUser(null);
      setUserFormData({ username: '', password: '', role: 'user' });
    } catch (error: any) {
      toast({ title: i18n.t('settings.operationFailed'), description: getLocalizedApiError(error), variant: 'destructive' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdFormData.password !== pwdFormData.confirmPassword) {
      return toast({ title: i18n.t('settings.error'), description: i18n.t('settings.passwordMismatch'), variant: 'destructive' });
    }
    if (pwdFormData.password.length < 6) {
      return toast({ title: i18n.t('settings.error'), description: i18n.t('settings.passwordLength'), variant: 'destructive' });
    }

    try {
      await updateUserMutation.mutateAsync({
        id: user!.id,
        password: pwdFormData.password
      });
      toast({ title: i18n.t('settings.passwordUpdated') });
      setIsChangePwdOpen(false);
      setPwdFormData({ password: '', confirmPassword: '' });
    } catch (error: any) {
      toast({ title: i18n.t('settings.passwordFailed'), description: getLocalizedApiError(error), variant: 'destructive' });
    }
  };

  const menuItems = [
    { id: 'appearance', label: t('settings.appearance'), icon: Palette },
    { id: 'rendering', label: t('settings.rendering'), icon: Sparkles },
    { id: 'storage', label: t('settings.storage'), icon: Server },
    { id: 'fonts', label: t('settings.fonts'), icon: Type },
    { id: 'ai', label: t('settings.ai'), icon: Sparkles },
    ...(isAdmin ? [{ id: 'network', label: t('settings.network'), icon: Globe }] : []),
    { id: 'data', label: t('settings.data'), icon: Database },
    { id: 'logs', label: t('settings.logs'), icon: Terminal },
    ...(user?.role === 'admin' ? [{ id: 'users', label: t('settings.users'), icon: Users }] : []),
    { id: 'releases', label: t('releases.title'), icon: History },
    { id: 'about', label: t('about.title'), icon: Info },
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
    <div className="settings-layout">
      {/* Left Sidebar */}
      <div className="settings-sidebar">
        {/* User Card */}
        <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 16, borderRadius: 12 }}>
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.username || t('common.user')}</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t(user?.role === 'admin' ? 'common.administrator' : 'common.user')}
              </p>
            </div>
          </div>
          <Button
            className="btn btn-ghost btn-xs"
            onClick={() => setIsChangePwdOpen(true)}
            style={{ width: '100%', marginTop: 12, fontSize: 11, height: 28, gap: 6, opacity: 0.8 }}
          >
            <Key style={{ width: 12, height: 12 }} />
            {t('settings.changePassword')}
          </Button>
        </div>

        {/* Menu */}
        <div className="glass-panel settings-menu" style={{ padding: 8 }}>
          {menuItems.map((item) => (
            <button
              key={item.id}
              aria-current={activeSection === item.id ? 'page' : undefined}
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
                fontWeight: 500,
                textAlign: 'left'
              }}
            >
              <item.icon style={{ width: 18, height: 18, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
              {item.id === 'releases' && releases?.updateAvailable && <UpdateDot />}
              {activeSection === item.id && <ChevronRight style={{ width: 16, height: 16, flexShrink: 0, marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>

        {/* About */}
        <div style={{ marginTop: 16, padding: 16, textAlign: 'center', opacity: 0.7 }}>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>CoverStudio v{import.meta.env.VITE_APP_VERSION}</p>
        </div>
      </div>

      {/* Right Content */}
      <div className="settings-content">
        {settingsError && <div className="card card-body" role="alert"><p>{getLocalizedApiError(settingsError.error, settingsError.context)}</p><ErrorDetails error={settingsError.error} /></div>}
        {activeSection === 'about' && <AboutPage />}
        {activeSection === 'releases' && <ReleasesPage />}
        {activeSection === 'network' && (isAdmin ? <GithubNetworkSettings /> : <div className="card card-body">{t('settings.networkAdmin')}</div>)}
        {/* Appearance */}
        {activeSection === 'appearance' && (
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Palette style={{ width: 18, height: 18, color: 'var(--primary)' }} />
              {t('settings.appearance')}
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <LanguageSelect showHint />
              {/* Mode */}
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>{t('settings.displayMode')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 400 }}>
                  {[
                    { id: 'light' as const, label: t('settings.light'), icon: Sun },
                    { id: 'dark' as const, label: t('settings.dark'), icon: Moon },
                    { id: 'system' as const, label: t('settings.system'), icon: Monitor },
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
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>{t('settings.brandTheme')}</p>
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
              {t('settings.rendering')}
            </div>
            {!isAdmin && <p style={{ padding: 16 }}>{t('settings.adminOnly')}</p>}
            <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0 }}>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t('settings.outputFormat')}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('settings.outputFormatHint')}</p>
                </div>
                <select
                  className="input"
                  style={{ width: 140 }}
                  aria-label={t('settings.outputFormat')}
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
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t('settings.outputQuality')}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('settings.outputQualityHint')}</p>
                </div>
                <Input
                  type="number"
                  aria-label={t('settings.outputQuality')}
                  value={renderingSettings.outputQuality}
                  onChange={e => setRenderingSettings(prev => ({ ...prev, outputQuality: e.target.value }))}
                  onBlur={e => { if (!switchingLanguage(e)) void saveRenderingSetting('outputQuality', e.target.value); }}
                  min="1"
                  max="100"
                  className="input"
                  style={{ width: 120 }}
                />
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t('settings.concurrency')}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('settings.concurrencyHint')}</p>
                </div>
                <Input
                  type="number"
                  aria-label={t('settings.concurrency')}
                  value={renderingSettings.concurrency}
                  onChange={e => setRenderingSettings(prev => ({ ...prev, concurrency: e.target.value }))}
                  onBlur={e => { if (!switchingLanguage(e)) void saveRenderingSetting('concurrency', e.target.value); }}
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
              {t('settings.storage')}
            </div>
            {!isAdmin && <p style={{ padding: 16 }}>{t('settings.adminOnly')}</p>}
            <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0 }}>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t('settings.savePosters')}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('settings.savePostersHint')}</p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    aria-label={t('settings.savePosters')} checked={storageSettings.savePosters}
                    onChange={() => toggleStorage('savePosters')}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t('settings.saveCovers')}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('settings.saveCoversHint')}</p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    aria-label={t('settings.saveCovers')} checked={storageSettings.saveCovers}
                    onChange={() => toggleStorage('saveCovers')}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
              <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border-color)' }}>
                <h3>{t('settings.retention')}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0' }}>{t('settings.retentionHint')}</p>
                <label>{t('settings.maxRuns')} <Input type="number" min={1} max={500} value={retention.maxRuns} onChange={e => setRetention(p => ({ ...p, maxRuns: e.target.value }))} onBlur={e => { if (!switchingLanguage(e)) void saveRetention('maxRuns', e.target.value); }} /></label>
                <label>{t('settings.maxDays')} <Input type="number" min={1} max={365} value={retention.maxDays} onChange={e => setRetention(p => ({ ...p, maxDays: e.target.value }))} onBlur={e => { if (!switchingLanguage(e)) void saveRetention('maxDays', e.target.value); }} /></label>
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
                {t('settings.fonts')}
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
                {uploading ? t('settings.uploading') : t('settings.uploadFont')}
              </Button>
            </div>
            <div>
              {fonts.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <Type style={{ width: 48, height: 48, color: 'var(--text-tertiary)', margin: '0 auto 16px' }} />
                  <p style={{ color: 'var(--text-tertiary)' }}>{t('settings.noFonts')}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 8 }}>{t('settings.noFontsHint')}</p>
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
              {t('settings.ai')}
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
              {t('settings.data')}
            </div>
            <div>
              {isAdmin && <DefaultTemplateSettings />}
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t('settings.exportData')}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('settings.exportDataHint')}</p>
                </div>
                <Button className="btn btn-secondary" disabled={!isAdmin || maintenanceBusy} onClick={handleExport}>
                  <Download style={{ width: 16, height: 16 }} />
                  {t('common.export')}
                </Button>
              </div>
              <ConfigurationRestore disabled={!isAdmin || maintenanceBusy} onRestored={() => { void loadStorageSettings(); void loadRenderingSettings(); }} />
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t('settings.clearCache')}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{t('settings.clearCacheHint')}</p>
                </div>
                <Button className="btn btn-secondary" disabled={!isAdmin || maintenanceBusy} onClick={handleCache}>
                  <Trash2 style={{ width: 16, height: 16 }} />
                  {cachePreview ? t('settings.confirmCleanup') : t('settings.previewCleanup')}
                </Button>
              </div>
              {cachePreview && <div style={{ padding: '0 24px 20px' }} role="status">{t('settings.cachePreview', { count: cachePreview.files, size: formatDisplayNumber(Number((cachePreview.bytes / 1024 / 1024).toFixed(2)), i18n.language) })}<Button variant="ghost" onClick={() => setCachePreview(null)}>{t('common.cancel')}</Button></div>}
              {!isAdmin && <p style={{ padding: 16 }}>{t('settings.maintenanceAdmin')}</p>}
            </div>
          </div>
        )}

        {/* Logs */}
        {activeSection === 'logs' && (
          <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Terminal style={{ width: 18, height: 18, color: 'var(--primary)' }} />
                {t('settings.logs')}
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 10 }}>
                  {t('settings.logCount', { count: logs.filter(l => logFilter === 'all' || l.level === logFilter).length })}
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
                  title={autoScroll ? t('settings.autoScrollOn') : t('settings.autoScrollOff')}
                >
                  {autoScroll ? <Play style={{ width: 12, height: 12 }} /> : <Pause style={{ width: 12, height: 12 }} />}
                  {autoScroll ? t('settings.scroll') : t('settings.pause')}
                </button>
                <Button className="btn btn-ghost btn-sm" onClick={() => setLogs([])}>
                  <Trash2 style={{ width: 14, height: 14 }} />
                  {t('settings.clear')}
                </Button>
              </div>
            </div>

            <div className="settings-log-status" role="status"><span>{displayMessage(logStreamStatus)}</span>{logStreamStatus && 'key' in logStreamStatus && ['settings.streamFailed', 'settings.streamDisconnected'].includes(logStreamStatus.key) && <Button variant="outline" size="sm" onClick={() => setLogStreamAttempt(value => value + 1)}>{t('settings.reconnect')}</Button>}{Boolean(logStreamError) && <ErrorDetails error={logStreamError} />}<p>{t('settings.logsOriginal')}</p></div>
            {/* Log Level Filter Tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              {[
                { id: 'all' as const, label: t('settings.all'), color: 'var(--text-primary)' },
                { id: 'info' as const, label: t('settings.info'), color: '#3b82f6' },
                { id: 'warn' as const, label: t('settings.warn'), color: '#f59e0b' },
                { id: 'error' as const, label: t('settings.logErrors'), color: '#ef4444' },
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
                  <p style={{ color: '#718096' }}>{t('settings.noLogs', { level: logFilter !== 'all' ? ` ${logFilter.toUpperCase()} ` : '' })}</p>
                  <p style={{ fontSize: 13, color: '#4a5568', marginTop: 8 }}>{t('settings.logsHint')}</p>
                </div>
              ) : (
                <div style={{ padding: 16, fontFamily: 'Consolas, Monaco, monospace', fontSize: 12, lineHeight: 1.8 }}>
                  {logs.filter(l => logFilter === 'all' || l.level === logFilter).map((log, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12 }}>
                      <span style={{ color: '#4a5568', flexShrink: 0 }}>{formatDisplayDate(log.timestamp, i18n.language, { timeStyle: 'medium' }) || log.timestamp}</span>
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
                {t('settings.users')}
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
                {t('settings.addUser')}
              </Button>
            </div>

            <div>
              {usersLoading ? (
                <div style={{ padding: 48, textAlign: 'center' }}>{t('settings.loading')}</div>
              ) : userList.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>{t('settings.noUsers')}</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '12px 24px', fontWeight: 500 }}>{t('settings.username')}</th>
                        <th style={{ padding: '12px 24px', fontWeight: 500 }}>{t('settings.role')}</th>
                        <th style={{ padding: '12px 24px', fontWeight: 500 }}>{t('settings.createdAt')}</th>
                        <th style={{ padding: '12px 24px', fontWeight: 500, textAlign: 'right' }}>{t('settings.actions')}</th>
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
                              {u.id === user.id && <span style={{ fontSize: 10, background: 'var(--primary)', color: 'white', padding: '1px 6px', borderRadius: 4 }}>{t('settings.me')}</span>}
                            </div>
                          </td>
                          <td style={{ padding: '12px 24px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 11,
                              background: u.role === 'admin' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                              color: u.role === 'admin' ? 'var(--primary)' : 'var(--text-secondary)',
                              fontWeight: 500
                            }}>
                              {u.role === 'admin' ? t('settings.administrator') : t('settings.regularUser')}
                            </span>
                          </td>
                          <td style={{ padding: '12px 24px', color: 'var(--text-tertiary)' }}>
                            {formatDisplayDate(u.createdAt, i18n.language, { dateStyle: 'medium' }) || t('common.unknownTime')}
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
                                {t('settings.edit')}
                              </Button>
                              <Button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)' }}
                                onClick={async () => {
                                  if (u.id === user.id) return alert(t('settings.cannotDeleteSelf'));
                                  if (confirm(t('settings.deleteUserConfirm', { name: u.username }))) {
                                    try {
                                      await deleteUserMutation.mutateAsync(u.id);
                                    } catch (err) {
                                      alert(i18n.t('settings.deleteFailed'));
                                    }
                                  }
                                }}
                              >
                                {t('settings.delete')}
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
                <div className="card" style={{ width: 'calc(100vw - 32px)', maxWidth: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                  <div className="card-header">
                    {editingUser ? t('settings.editUser') : t('settings.newUser')}
                  </div>
                  <div style={{ padding: '12px 24px 0' }}><LanguageSelect compact /></div>
                  <form onSubmit={handleUserAction} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.username')}</label>
                      <Input
                        aria-label={t('settings.username')} value={userFormData.username}
                        onChange={e => setUserFormData({ ...userFormData, username: e.target.value })}
                        disabled={!!editingUser}
                        required
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{editingUser ? t('settings.optionalPassword') : t('settings.password')}</label>
                      <Input
                        type="password"
                        aria-label={editingUser ? t('settings.optionalPassword') : t('settings.password')} value={userFormData.password}
                        onChange={e => setUserFormData({ ...userFormData, password: e.target.value })}
                        required={!editingUser}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.role')}</label>
                      <select
                        className="input"
                        aria-label={t('settings.role')} value={userFormData.role}
                        onChange={e => setUserFormData({ ...userFormData, role: e.target.value as any })}
                      >
                        <option value="user">{t('settings.regularUser')}</option>
                        <option value="admin">{t('settings.administrator')}</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                      <Button type="button" className="btn btn-secondary" onClick={() => setIsUserDialogOpen(false)}>{t('common.cancel')}</Button>
                      <Button type="submit" className="btn btn-primary" disabled={createUserMutation.isPending || updateUserMutation.isPending}>
                        {editingUser ? t('settings.saveChanges') : t('settings.createNow')}
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
          <div className="card" style={{ width: 'calc(100vw - 32px)', maxWidth: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Key style={{ width: 18, height: 18, color: 'var(--primary)' }} />
              {t('settings.myPassword')}
            </div>
            <div style={{ padding: '12px 24px 0' }}><LanguageSelect compact /></div>
            <form onSubmit={handleChangePassword} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.newPassword')}</label>
                <Input
                  type="password"
                  placeholder={t('settings.newPasswordPlaceholder')}
                  aria-label={t('settings.newPassword')} value={pwdFormData.password}
                  onChange={e => setPwdFormData({ ...pwdFormData, password: e.target.value })}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('settings.confirmNewPassword')}</label>
                <Input
                  type="password"
                  placeholder={t('settings.confirmPasswordPlaceholder')}
                  aria-label={t('settings.confirmNewPassword')} value={pwdFormData.confirmPassword}
                  onChange={e => setPwdFormData({ ...pwdFormData, confirmPassword: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                <Button type="button" className="btn btn-secondary" onClick={() => setIsChangePwdOpen(false)}>{t('common.cancel')}</Button>
                <Button type="submit" className="btn btn-primary" disabled={updateUserMutation.isPending}>
                  {t('settings.confirmChange')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
