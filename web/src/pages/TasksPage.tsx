import { useState } from 'react';
import { 
  Plus, Clock, Play, Loader2, Calendar, Zap, 
  Palette, ChevronRight, Settings2,
  AlertCircle
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
  useServerLibraries
} from '@/api';
import { toast } from '@/components/ui/use-toast';

export function TasksPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'manual' as 'manual' | 'scheduled',
    serverId: '',
    libraryId: '',
    templateId: '',
    cronExpression: ''
  });

  const { data: tasks = [], isLoading } = useTasks();
  const { data: servers = [] } = useServers();
  const { data: templates = [] } = useTemplates();
  const { data: libraries = [] } = useServerLibraries(formData.serverId);
  
  const createMutation = useCreateTask();
  const runMutation = useRunTask();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.serverId || !formData.templateId) {
      toast({ title: '表单未完成', description: '请选择服务器和模板', variant: 'destructive' });
      return;
    }

    try {
      await createMutation.mutateAsync({
        ...formData,
        isEnabled: formData.type === 'scheduled'
      });
      toast({ title: '任务创建成功 🚀', description: `任务 "${formData.name}" 已就绪` });
      setIsDialogOpen(false);
      setFormData({ name: '', type: 'manual', serverId: '', libraryId: '', templateId: '', cronExpression: '' });
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
          <DialogContent style={{ maxWidth: 500 }}>
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
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>定义自动化执行规则</p>
              </div>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>任务名称</label>
                <Input
                  placeholder="例如: 每周电影墙更新"
                  className="input"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>选择服务器</label>
                  <select 
                    className="input w-full" 
                    value={formData.serverId}
                    onChange={e => setFormData({...formData, serverId: e.target.value, libraryId: ''})}
                    style={{ height: 40 }}
                    required
                  >
                    <option value="">请选择...</option>
                    {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>选择媒体库</label>
                  <select 
                    className="input w-full" 
                    disabled={!formData.serverId}
                    value={formData.libraryId}
                    onChange={e => setFormData({...formData, libraryId: e.target.value})}
                    style={{ height: 40 }}
                  >
                    <option value="">全部（或选择特定分组）</option>
                    {libraries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>使用模板</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {templates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData({...formData, templateId: t.id})}
                      style={{
                        padding: '10px',
                        borderRadius: 10,
                        border: `1px solid ${formData.templateId === t.id ? 'var(--primary)' : 'var(--border-color)'}`,
                        background: formData.templateId === t.id ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-primary)',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: formData.templateId === t.id ? 'var(--primary)' : 'var(--text-primary)' }}>{t.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>Canvas v1</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: 16, background: 'var(--bg-tertiary)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar style={{ width: 16, height: 16, color: 'var(--primary)' }} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>启用定时调度</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={formData.type === 'scheduled'} 
                    onChange={e => setFormData({...formData, type: e.target.checked ? 'scheduled' : 'manual'})}
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
                      onChange={e => setFormData({...formData, cronExpression: e.target.value})}
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
                      {templates.find(t => t.id === task.templateId)?.name || '未知模板'}
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
