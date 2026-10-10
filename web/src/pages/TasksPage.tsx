import { useState } from 'react';
import { TaskHistoryDialog } from '@/components/tasks/TaskHistoryDialog';
import { TaskConfigDialog } from '@/components/tasks/TaskConfigDialog';
import { describeSchedule } from '@/lib/taskConfig';
import {
  Plus, Clock, Play, Loader2, Calendar, Zap,
  Palette, ChevronRight, Edit, Trash2,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useTasks,
  useDeleteTask,
  useRunTask,
  useToggleTask,
  useServers,
  useTemplates,
  Task
} from '@/api';
import { toast } from '@/components/ui/use-toast';

export function TasksPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [logsTaskId, setLogsTaskId] = useState<string | null>(null);
  const { data: tasks = [], isLoading, isError, refetch } = useTasks();
  const { data: servers = [] } = useServers();
  const { data: templates = [] } = useTemplates();
  const deleteMutation = useDeleteTask();
  const runMutation = useRunTask();
  const toggleMutation = useToggleTask();
  const handleEdit = (task: Task) => { setEditingTask(task); setIsDialogOpen(true); };
  const handleNewTask = () => { setEditingTask(null); setIsDialogOpen(true); };
  const handleDelete = async (taskId: string) => {
    if (!confirm('确定要删除这个任务吗？')) return;
    try {
      await deleteMutation.mutateAsync(taskId);
      toast({ title: '任务已删除' });
    } catch (error: any) {
      toast({ title: '删除失败', description: error.response?.data?.error?.message, variant: 'destructive' });
    }
  };

  const handleRun = async (id: string) => {
    try {
      await runMutation.mutateAsync(id);
      toast({ title: '任务已启动', description: '正在后台处理图片...' });
    } catch (error: any) {
      toast({ title: '执行失败', description: error.response?.data?.error?.message, variant: 'destructive' });
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await toggleMutation.mutateAsync(id);
      // Toast is handled by hook's success? No, let's add it here.
      toast({ title: '状态已更新' });
    } catch (error) {
      toast({ title: '操作失败', variant: 'destructive' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div className="page-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>自动化任务</h1>
          <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-secondary)' }}>
            通过定时任务或手动触发，自动批量更新媒体库封面
          </p>
        </div>

        <Button className="btn btn-primary" onClick={handleNewTask}><Plus size={16} />新建任务</Button>
      </div>
      {isDialogOpen && <TaskConfigDialog task={editingTask} onClose={() => { setIsDialogOpen(false); setEditingTask(null); }} />}


      {isError && <div className="card" role="alert" style={{ padding: 20 }}>任务列表加载失败，请检查连接。<Button onClick={() => refetch()}>重试</Button></div>}
      {/* Task List */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px 0' }}>
            <Loader2 style={{ width: 32, height: 32, color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : isError && tasks.length === 0 ? null : tasks.length === 0 ? (
          <div className="card" style={{ padding: '60px 0' }}>
            <div className="empty-state">
              <div className="empty-state-icon">
                <Zap style={{ width: 40, height: 40 }} />
              </div>
              <div className="empty-state-title">尚未创建任何任务</div>
              <div className="empty-state-description" style={{ marginBottom: '24px' }}>
                通过自动化任务，您可以让服务器在后台静默美化您的海报墙
              </div>
              <Button className="btn btn-primary" onClick={handleNewTask}>
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
                const configs = JSON.parse(task.libraryConfigs).filter((config: any) => config.enabled !== false);
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
                      {task.type === 'scheduled' ? (
                        task.isEnabled ? (
                          <span className={`badge ${isJellyfin ? 'badge-primary' : 'badge-success'}`}>定时启用</span>
                        ) : (
                          <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>已暂停</span>
                        )
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
                          {describeSchedule(task.cronExpression)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Group */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'var(--bg-tertiary)',
                    padding: '6px 8px',
                    borderRadius: 14,
                    border: '1px solid var(--border-color)',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                  }}>
                    {/* Last Run Info (Compact) */}
                    <div style={{ padding: '0 12px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>最后执行</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {task.lastRunAt ? new Date(task.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '从未'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Toggle Button */}
                      {task.type === 'scheduled' && <button
                        className={`btn-icon ${task.isEnabled ? 'text-amber-500' : 'text-emerald-500'}`}
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          cursor: 'pointer'
                        }}
                        onClick={() => handleToggle(task.id)}
                        disabled={toggleMutation.isPending}
                        title={task.isEnabled ? "暂停定时执行" : "启用定时执行"}
                      >
                        {toggleMutation.isPending ? (
                          <Loader2 style={{ width: 16, height: 16, animation: 'spin 1.5s linear infinite' }} />
                        ) : task.isEnabled ? (
                          <Zap style={{ width: 16, height: 16, fill: 'currentColor' }} />
                        ) : (
                          <Play style={{ width: 16, height: 16, fill: 'currentColor' }} />
                        )}
                      </button>}

                      {/* Run Now Button - Enhanced with Gradient */}
                      <button
                        onClick={() => handleRun(task.id)}
                        disabled={runMutation.isPending}
                        style={{
                          height: 36,
                          padding: '0 16px',
                          borderRadius: 10,
                          border: 'none',
                          color: 'white',
                          background: 'var(--primary)',
                          fontSize: 13,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                          transition: 'all 0.2s'
                        }}
                      >
                        {runMutation.isPending ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Play style={{ width: 16, height: 16 }} />}
                        立即执行
                      </button>

                      <div style={{ width: 1, height: 20, background: 'var(--border-color)', margin: '0 2px' }} />

                      {/* Edit/Delete Group */}
                      <button
                        className="btn-icon"
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--text-secondary)',
                          background: 'transparent',
                          transition: 'all 0.2s',
                          cursor: 'pointer'
                        }}
                        onClick={() => handleEdit(task)}
                        title="编辑配置"
                      >
                        <Edit style={{ width: 16, height: 16 }} />
                      </button>
                      <button
                        className="btn-icon"
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--error)',
                          background: 'transparent',
                          transition: 'all 0.2s',
                          cursor: 'pointer',
                          opacity: 0.7
                        }}
                        onClick={() => handleDelete(task.id)}
                        title="删除任务"
                      >
                        <Trash2 style={{ width: 16, height: 16 }} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress / History Tab */}
                <div style={{ height: 1, background: 'var(--border-color)' }} />
                <div style={{ padding: '10px 20px', background: 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{task.nextRunAt && task.timezone
                      ? `下次执行：${new Date(task.nextRunAt).toLocaleString('zh-CN', { timeZone: task.timezone })} · ${task.timezone}`
                      : '每个已选媒体库生成一张封面'}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[12px] text-(--primary) hover:text-(--primary) hover:bg-(--primary)/10"
                    onClick={() => setLogsTaskId(task.id)}
                  >
                    查看执行历史
                    <ChevronRight style={{ width: 12, height: 12, marginLeft: 4 }} />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {logsTaskId && <TaskHistoryDialog taskId={logsTaskId} taskName={tasks.find(task => task.id === logsTaskId)?.name || '任务'} onClose={() => setLogsTaskId(null)} />}

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
            可先在配置界面生成真实样张，确认效果后再启用定时计划。
          </p>
        </div>
      </div>
    </div>
  );
}
