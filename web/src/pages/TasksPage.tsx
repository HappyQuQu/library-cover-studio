import { getLocalizedApiError } from '@/lib/apiError';
import { formatDisplayDate } from '@/lib/displayFormat';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
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
    if (!confirm(t('tasks.deleteConfirm'))) return;
    try {
      await deleteMutation.mutateAsync(taskId);
      toast({ title: i18n.t('tasks.deleted') });
    } catch (error: any) {
      toast({ title: i18n.t('tasks.deleteFailed'), description: getLocalizedApiError(error), variant: 'destructive' });
    }
  };

  const handleRun = async (id: string) => {
    try {
      await runMutation.mutateAsync(id);
      toast({ title: i18n.t('tasks.started'), description: i18n.t('tasks.startedHint') });
    } catch (error: any) {
      toast({ title: i18n.t('tasks.runFailed'), description: getLocalizedApiError(error), variant: 'destructive' });
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await toggleMutation.mutateAsync(id);
      // Toast is handled by hook's success? No, let's add it here.
      toast({ title: i18n.t('tasks.statusUpdated') });
    } catch (error) {
      toast({ title: i18n.t('tasks.operationFailed'), variant: 'destructive' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div className="page-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{t('tasks.pageTitle')}</h1>
          <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-secondary)' }}>
            {t('tasks.pageDescription')}
          </p>
        </div>

        <Button className="btn btn-primary" onClick={handleNewTask}><Plus size={16} />{t('tasks.newTask')}</Button>
      </div>
      {isDialogOpen && <TaskConfigDialog task={editingTask} onClose={() => { setIsDialogOpen(false); setEditingTask(null); }} />}


      {isError && <div className="card" role="alert" style={{ padding: 20 }}>{t('tasks.loadFailed')}<Button onClick={() => refetch()}>{t('common.retry')}</Button></div>}
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
              <div className="empty-state-title">{t('tasks.empty')}</div>
              <div className="empty-state-description" style={{ marginBottom: '24px' }}>
                {t('tasks.emptyHint')}
              </div>
              <Button className="btn btn-primary" onClick={handleNewTask}>
                <Plus style={{ width: 18, height: 18 }} />
                {t('tasks.createFirst')}
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
                  const templateName = firstLib.templateMode === 'random' ? t('taskWizard.randomSummary', { count: firstLib.templateIds?.length || 0 }) : templates.find(t => t.id === firstLib.templateId)?.name || t('tasks.unknownTemplate');
                  configSummary = configs.length > 1
                    ? t('tasks.librarySummary', { name: firstLib.libraryName, count: libCount })
                    : `${firstLib.libraryName} (${templateName})`;
                }
              }
            } catch (e) {
              console.error('Failed to parse libraryConfigs', e);
            }

            return (
              <div key={task.id} className="card group" style={{ padding: '0', overflow: 'hidden' }}>
                <div className="automation-task-body" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
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

                  <div className="automation-task-info" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 16 }}>{task.name}</h3>
                      {task.type === 'scheduled' ? (
                        task.isEnabled ? (
                          <span className={`badge ${isJellyfin ? 'badge-primary' : 'badge-success'}`}>{t('tasks.scheduledEnabled')}</span>
                        ) : (
                          <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}>{t('tasks.paused')}</span>
                        )
                      ) : (
                        <span className="badge">{t('tasks.manual')}</span>
                      )}
                    </div>
                    <div className="automation-task-meta" style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: brandColor }} />
                        {server?.name || t('tasks.unknownServer')}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                        <Palette style={{ width: 14, height: 14 }} />
                        {configSummary || templates.find(t => t.id === task.templateId)?.name || t('tasks.unconfigured')}
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
                  <div className="automation-task-actions" style={{
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
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('tasks.lastExecution')}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {task.lastRunAt ? formatDisplayDate(task.lastRunAt, i18n.language, { hour: '2-digit', minute: '2-digit', ...(task.timezone ? { timeZone: task.timezone } : {}) }) || t('common.unknownTime') : t('tasks.never')}
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
                        title={task.isEnabled ? t('tasks.pause') : t('tasks.enable')}
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
                        {t('tasks.runNow')}
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
                        title={t('tasks.edit')}
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
                        title={t('tasks.deleteTask')}
                      >
                        <Trash2 style={{ width: 16, height: 16 }} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress / History Tab */}
                <div style={{ height: 1, background: 'var(--border-color)' }} />
                <div className="automation-task-footer" style={{ padding: '10px 20px', background: 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{task.nextRunAt && task.timezone
                      ? t('tasks.nextExecution', { time: formatDisplayDate(task.nextRunAt, i18n.language, { dateStyle: 'medium', timeStyle: 'short', timeZone: task.timezone }) || t('common.unknownTime'), timezone: task.timezone })
                      : t('tasks.onePerLibrary')}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[12px] text-(--primary) hover:text-(--primary) hover:bg-(--primary)/10"
                    onClick={() => setLogsTaskId(task.id)}
                  >
                    {t('tasks.viewHistory')}
                    <ChevronRight style={{ width: 12, height: 12, marginLeft: 4 }} />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {logsTaskId && <TaskHistoryDialog taskId={logsTaskId} taskName={tasks.find(task => task.id === logsTaskId)?.name || t('tasks.fallbackName')} onClose={() => setLogsTaskId(null)} />}

      {/* Warning/Info Banner */}
      <div style={{
        display: 'flex', gap: 16, padding: 20,
        background: 'rgba(99, 102, 241, 0.05)',
        border: '1px solid rgba(99, 102, 241, 0.1)',
        borderRadius: 16
      }}>
        <AlertCircle style={{ width: 24, height: 24, color: 'var(--primary)', flexShrink: 0 }} />
        <div>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{t('tasks.resourceHint')}</h4>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {t('tasks.resourceDescription')}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 4 }}>
            {t('tasks.previewHint')}
          </p>
        </div>
      </div>
    </div>
  );
}
