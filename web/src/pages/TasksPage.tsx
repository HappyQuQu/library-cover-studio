import { useState, useEffect } from 'react';
import {
  Plus, Clock, Play, Loader2, Calendar, Zap,
  Palette, ChevronRight, Settings2,
  AlertCircle, Film, Tv, Music, Folder, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  useTasks,
  useCreateTask,
  useRunTask,
  useServers,
  useTemplates,
  useServerLibraries,
  MediaLibrary
} from '@/api';
import { toast } from '@/components/ui/use-toast';

// Library configuration interface
interface LibraryConfig {
  libraryId: string;
  libraryName: string;
  libraryType: string;
  templateId: string;
  primaryTitle: string;
  secondaryTitle: string;
  enabled: boolean;
}

// Get library type icon
function getLibraryIcon(type: string) {
  switch (type?.toLowerCase()) {
    case 'movies': return Film;
    case 'tvshows': return Tv;
    case 'music': return Music;
    default: return Folder;
  }
}

export function TasksPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'manual' as 'manual' | 'scheduled',
    serverId: '',
    cronExpression: ''
  });
  const [libraryConfigs, setLibraryConfigs] = useState<LibraryConfig[]>([]);

  const { data: tasks = [], isLoading } = useTasks();
  const { data: servers = [] } = useServers();
  const { data: templates = [] } = useTemplates();
  const { data: librariesData, isLoading: loadingLibraries } = useServerLibraries(formData.serverId);

  const createMutation = useCreateTask();
  const runMutation = useRunTask();

  // Get first template ID as default (stable reference)
  const defaultTemplateId = templates.length > 0 ? templates[0].id : '';

  // Update library configs when libraries change
  useEffect(() => {
    if (librariesData && librariesData.length > 0) {
      setLibraryConfigs(librariesData.map((lib: MediaLibrary) => ({
        libraryId: lib.id,
        libraryName: lib.name,
        libraryType: lib.type,
        templateId: defaultTemplateId,
        primaryTitle: lib.name,
        secondaryTitle: '',
        enabled: true
      })));
    } else {
      setLibraryConfigs([]);
    }
  }, [librariesData, defaultTemplateId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const enabledConfigs = libraryConfigs.filter(c => c.enabled);

    if (!formData.serverId || enabledConfigs.length === 0) {
      toast({ title: '表单未完成', description: '请选择服务器和至少一个媒体库', variant: 'destructive' });
      return;
    }

    try {
      // Create task with library configurations
      await createMutation.mutateAsync({
        name: formData.name,
        type: formData.type,
        serverId: formData.serverId,
        cronExpression: formData.cronExpression,
        isEnabled: formData.type === 'scheduled',
        // Store library configs as JSON in a field (backend needs to support this)
        libraryConfigs: JSON.stringify(enabledConfigs)
      } as any);
      toast({ title: '任务创建成功 🚀', description: `任务 "${formData.name}" 已就绪` });
      setIsDialogOpen(false);
      setFormData({ name: '', type: 'manual', serverId: '', cronExpression: '' });
      setLibraryConfigs([]);
    } catch (error: any) {
      toast({ title: '创建失败', description: '请检查输入', variant: 'destructive' });
    }
  };

  const handleRun = async (id: string) => {
    try {
      await runMutation.mutateAsync(id);
      toast({ title: '任务已启动', description: '正在后台处理图片...' });
    } catch (error) {
      toast({ title: '执行失败', variant: 'destructive' });
    }
  };

  const updateLibraryConfig = (libraryId: string, updates: Partial<LibraryConfig>) => {
    setLibraryConfigs(prev => prev.map(c =>
      c.libraryId === libraryId ? { ...c, ...updates } : c
    ));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>自动化任务</h1>
          <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-secondary)' }}>
            通过定时任务或手动触发，自动批量更新媒体库封面
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn btn-primary">
              <Plus style={{ width: 16, height: 16 }} />
              新建任务
            </Button>
          </DialogTrigger>
          <DialogContent style={{ maxWidth: 1000, maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Custom Header with Icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div
                className="gradient-orange"
                style={{
                  width: 48, height: 48, borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(245, 158, 11, 0.25)'
                }}
              >
                <Zap style={{ width: 24, height: 24, color: 'white' }} />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>配置新任务</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>为每个媒体库选择模板和配置变量</p>
              </div>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Task Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>任务名称</label>
                <Input
                  placeholder="例如: 每周电影墙更新"
                  className="input"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              {/* Server Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>选择服务器</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {servers.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', borderRadius: 12, border: '1px dashed var(--border-color)' }}>
                      暂无服务器，请先添加媒体服务器
                    </div>
                  ) : servers.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, serverId: s.id })}
                      style={{
                        padding: '12px',
                        borderRadius: '12px',
                        border: `1px solid ${formData.serverId === s.id ? (s.type === 'jellyfin' ? 'var(--jellyfin)' : 'var(--emby)') : 'var(--border-color)'}`,
                        background: formData.serverId === s.id
                          ? (s.type === 'jellyfin' ? 'rgba(170, 92, 195, 0.1)' : 'rgba(82, 181, 75, 0.1)')
                          : 'var(--bg-primary)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: formData.serverId === s.id ? (s.type === 'jellyfin' ? 'var(--jellyfin)' : 'var(--emby)') : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, textTransform: 'capitalize' }}>{s.type}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Library Configurations */}
              {formData.serverId && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    媒体库配置
                    <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', marginLeft: 8 }}>
                      ({libraryConfigs.filter(c => c.enabled).length}/{libraryConfigs.length} 已选)
                    </span>
                  </label>

                  {loadingLibraries ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
                      <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite', color: 'var(--text-tertiary)' }} />
                    </div>
                  ) : libraryConfigs.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', borderRadius: 12, border: '1px dashed var(--border-color)' }}>
                      该服务器暂无媒体库
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '12px',
                      maxHeight: '400px',
                      overflowY: 'auto',
                      paddingRight: 4,
                      paddingBottom: 4
                    }}>
                      {libraryConfigs.map(config => {
                        const Icon = getLibraryIcon(config.libraryType);
                        const selectedTemplate = templates.find(t => t.id === config.templateId);

                        return (
                          <div
                            key={config.libraryId}
                            style={{
                              padding: '12px',
                              borderRadius: '12px',
                              border: `1px solid ${config.enabled ? 'var(--primary)' : 'var(--border-color)'}`,
                              background: config.enabled ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-primary)',
                              transition: 'all 0.2s',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px'
                            }}
                          >
                            {/* Library Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <button
                                type="button"
                                onClick={() => updateLibraryConfig(config.libraryId, { enabled: !config.enabled })}
                                style={{
                                  width: 20, height: 20, borderRadius: 6,
                                  border: `1px solid ${config.enabled ? 'var(--primary)' : 'var(--border-color)'}`,
                                  background: config.enabled ? 'var(--primary)' : 'transparent',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', flexShrink: 0
                                }}
                              >
                                {config.enabled && <Check style={{ width: 12, height: 12, color: 'white' }} />}
                              </button>
                              <Icon style={{ width: 16, height: 16, color: 'var(--text-tertiary)', flexShrink: 0 }} />
                              <span style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: 'var(--text-primary)',
                                flex: 1,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {config.libraryName}
                              </span>
                            </div>

                            {/* Expanded Config */}
                            {config.enabled && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {/* Template Selection with Preview */}
                                <div style={{ position: 'relative' }}>
                                  <select
                                    className="input"
                                    value={config.templateId}
                                    onChange={e => updateLibraryConfig(config.libraryId, { templateId: e.target.value })}
                                    style={{ width: '100%', height: 32, fontSize: 12, padding: '0 8px' }}
                                  >
                                    <option value="">选择模板...</option>
                                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                  </select>

                                  {selectedTemplate && selectedTemplate.thumbnailPath && (
                                    <div style={{
                                      marginTop: 8,
                                      width: '100%',
                                      aspectRatio: `${selectedTemplate.width || 600} / ${selectedTemplate.height || 900}`,
                                      borderRadius: 8,
                                      overflow: 'hidden',
                                      background: 'var(--bg-tertiary)',
                                      border: '1px solid var(--border-color)'
                                    }}>
                                      <img
                                        src={`${import.meta.env.VITE_API_URL || '/api'}${selectedTemplate.thumbnailPath}`}
                                        alt={selectedTemplate.name}
                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* Primary Title */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>主标题</label>
                                  <Input
                                    placeholder="{{primary_title}}"
                                    value={config.primaryTitle}
                                    onChange={e => updateLibraryConfig(config.libraryId, { primaryTitle: e.target.value })}
                                    className="input"
                                    style={{ height: 32, fontSize: 12, padding: '0 10px' }}
                                  />
                                </div>

                                {/* Secondary Title */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>副标题</label>
                                  <Input
                                    placeholder="{{secondary_title}}"
                                    value={config.secondaryTitle}
                                    onChange={e => updateLibraryConfig(config.libraryId, { secondaryTitle: e.target.value })}
                                    className="input"
                                    style={{ height: 32, fontSize: 12, padding: '0 10px' }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Scheduling Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: 16, background: 'var(--bg-tertiary)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar style={{ width: 16, height: 16, color: 'var(--primary)' }} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>启用定时调度</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.type === 'scheduled'}
                    onChange={e => setFormData({ ...formData, type: e.target.checked ? 'scheduled' : 'manual' })}
                  />
                </div>

                {formData.type === 'scheduled' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Cron 表达式</span>
                      <a href="https://crontab.guru/" target="_blank" className="text-(--primary) hover:underline">在线帮助</a>
                    </div>
                    <Input
                      placeholder="例如: 0 4 * * * (每天凌晨4点)"
                      value={formData.cronExpression}
                      onChange={e => setFormData({ ...formData, cronExpression: e.target.value })}
                      className="input"
                    />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" className="btn btn-secondary" onClick={() => setIsDialogOpen(false)}>取消</Button>
                <Button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />}
                  创建任务
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Task List */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px 0' }}>
            <Loader2 style={{ width: 32, height: 32, color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : tasks.length === 0 ? (
          <div className="card" style={{ padding: '60px 0' }}>
            <div className="empty-state">
              <div className="empty-state-icon">
                <Zap style={{ width: 40, height: 40 }} />
              </div>
              <div className="empty-state-title">尚未创建任何任务</div>
              <div className="empty-state-description" style={{ marginBottom: '24px' }}>
                通过自动化任务，您可以让服务器在后台静默美化您的海报墙
              </div>
              <Button className="btn btn-primary" onClick={() => setIsDialogOpen(true)}>
                <Plus style={{ width: 18, height: 18 }} />
                创建首个任务
              </Button>
            </div>
          </div>
        ) : (
          tasks.map(task => {
            const server = servers.find(s => s.id === task.serverId);
            const isJellyfin = server?.type === 'jellyfin';
            const brandColor = isJellyfin ? 'var(--jellyfin)' : 'var(--emby)';

            // Parse library configs if available
            let configSummary = '';
            let libCount = 0;
            try {
              if (task.libraryConfigs) {
                const configs = JSON.parse(task.libraryConfigs);
                libCount = configs.length;
                if (libCount > 0) {
                  const firstLib = configs[0];
                  const templateName = templates.find(t => t.id === firstLib.templateId)?.name || '未知模板';
                  configSummary = configs.length > 1
                    ? `${firstLib.libraryName} 等 ${libCount} 个媒体库`
                    : `${firstLib.libraryName} (${templateName})`;
                }
              }
            } catch (e) {
              console.error('Failed to parse libraryConfigs', e);
            }

            return (
              <div key={task.id} className="card group" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
                  {/* Status Indicator */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: task.isEnabled ? (isJellyfin ? 'rgba(170, 92, 195, 0.1)' : 'rgba(82, 181, 75, 0.1)') : 'var(--bg-tertiary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {task.type === 'scheduled' ? (
                      <Calendar style={{ width: 24, height: 24, color: task.isEnabled ? brandColor : 'var(--text-tertiary)' }} />
                    ) : (
                      <Zap style={{ width: 24, height: 24, color: task.isEnabled ? brandColor : 'var(--text-tertiary)' }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 16 }}>{task.name}</h3>
                      {task.isEnabled ? (
                        <span className={`badge ${isJellyfin ? 'badge-primary' : 'badge-success'}`}>定时启用</span>
                      ) : (
                        <span className="badge">手动触发</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: brandColor }} />
                        {server?.name || '未知服务器'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                        <Palette style={{ width: 14, height: 14 }} />
                        {configSummary || templates.find(t => t.id === task.templateId)?.name || '未配置'}
                      </div>
                      {task.type === 'scheduled' && task.cronExpression && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                          <Clock style={{ width: 14, height: 14 }} />
                          {task.cronExpression}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ textAlign: 'right', marginRight: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>最后执行</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : '从未执行'}
                      </div>
                    </div>
                    <Button
                      className="btn btn-primary"
                      style={{ height: 38, padding: '0 16px' }}
                      onClick={() => handleRun(task.id)}
                      disabled={runMutation.isPending}
                    >
                      {runMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      立即执行
                    </Button>
                    <button className="btn-ghost" style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Settings2 style={{ width: 18, height: 18 }} />
                    </button>
                  </div>
                </div>

                {/* Progress / History Tab (Mock) */}
                <div style={{ height: 1, background: 'var(--border-color)' }} />
                <div style={{ padding: '10px 20px', background: 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>后端服务正常轮询中</span>
                  </div>
                  <button style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                    查看历史日志
                    <ChevronRight style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Warning/Info Banner */}
      <div style={{
        display: 'flex', gap: 16, padding: 20,
        background: 'rgba(99, 102, 241, 0.05)',
        border: '1px solid rgba(99, 102, 241, 0.1)',
        borderRadius: 16
      }}>
        <AlertCircle style={{ width: 24, height: 24, color: 'var(--primary)', flexShrink: 0 }} />
        <div>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>提示：封面生成是资源密集型操作</h4>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            自动化任务会在后台为您渲染海报并上传到您的媒体服务器。如果您有大量的媒体资源，请考虑将定时任务设置在访问量较低的时段（如凌晨）。
            首次全量生成可能需要较长时间，后续增量更新会非常快。
          </p>
        </div>
      </div>
    </div>
  );
}
