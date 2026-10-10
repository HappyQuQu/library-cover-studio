import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Loader2 } from 'lucide-react';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

interface DefaultTemplateStatus {
  total: number;
  modified: number;
  missing: number;
  templates: { id: string; name: string; state: 'unchanged' | 'modified' | 'missing' | 'conflict' }[];
}

export function DefaultTemplateSettings() {
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['default-template-status'],
    queryFn: () => apiClient.get<DefaultTemplateStatus>('/settings/default-templates').then(response => response.data) });

  async function restore() {
    if (restoring) return;
    setRestoring(true);
    try {
      const { data: result } = await apiClient.post<{ total: number; restored: number; recreated: number }>('/settings/default-templates/restore', { confirm: true });
      setConfirming(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['templates'] }),
        queryClient.invalidateQueries({ queryKey: ['template-history'] }),
        queryClient.invalidateQueries({ queryKey: ['default-template-status'] })
      ]);
      toast({ title: result.restored + result.recreated ? '默认模板已还原' : '默认模板已是初始状态',
        description: result.restored + result.recreated
          ? `已还原 ${result.restored} 套，补回 ${result.recreated} 套。还原前的设计已保留在历史中。`
          : `当前 ${result.total} 套默认模板完整且已锁定。` });
    } catch (error: any) {
      toast({ title: '还原失败', description: error.response?.data?.error?.message || '请稍后重试', variant: 'destructive' });
    } finally { setRestoring(false); }
  }

  return <section aria-label="默认模板恢复" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>还原默认模板</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
          恢复项目内置的布局、文字、背景和预览图，补回已删除的默认模板，并重新锁定。
        </p>
        {isLoading ? <p className="mt-2 text-xs text-(--text-tertiary)">正在读取默认模板…</p>
          : isError ? <div className="mt-2 flex items-center gap-2 text-xs">模板状态加载失败<Button variant="ghost" size="sm" onClick={() => refetch()}>重试</Button></div>
          : data && <p className="mt-2 text-xs text-(--text-secondary)">
            共 {data.total} 套默认模板 · {data.modified} 套有修改 · {data.missing} 套已删除
          </p>}
      </div>
      <Button className="btn btn-secondary shrink-0" disabled={restoring || isLoading || isError} onClick={() => setConfirming(true)}>
        {restoring ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
        {restoring ? '正在还原…' : '一键还原默认模板'}
      </Button>
    </div>
    <Dialog open={confirming} onOpenChange={value => { if (!restoring) setConfirming(value); }}>
      <DialogContent style={{ width: 'calc(100vw - 32px)', maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle>还原全部默认模板？</DialogTitle>
          <DialogDescription>将恢复以下 {data?.total || 0} 套模板到项目内置版本。自建模板和复制模板会保留。</DialogDescription>
        </DialogHeader>
        <div className="my-4 flex flex-wrap gap-2" aria-label="将恢复的默认模板">
          {data?.templates.map(template => <span key={template.id} className="rounded-lg bg-(--bg-secondary) px-3 py-2 text-xs">
            {template.name}{template.state === 'missing' ? ' · 补回' : template.state === 'modified' ? ' · 还原' : ''}
          </span>)}
        </div>
        <p className="mb-3 text-sm text-(--text-secondary)">还原前的已保存设计会存入各模板的历史，保留最近 50 条。还原后默认锁定，解锁后可从历史找回修改。</p>
        <p className="mb-5 text-xs text-(--text-tertiary)">使用默认模板的自动化任务将在下次生成时采用恢复后的样式。</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirming(false)} disabled={restoring}>取消</Button>
          <Button onClick={restore} disabled={restoring}>
            {restoring && <Loader2 size={16} className="mr-2 animate-spin" />}{restoring ? '正在还原…' : '确认还原默认模板'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
