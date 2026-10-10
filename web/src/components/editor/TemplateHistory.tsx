import { useEffect, useState } from 'react';
import { History, RotateCcw, Loader2, Image as ImageIcon, Lock } from 'lucide-react';
import { useTemplateRevisions, useRestoreTemplateRevision } from '@/api';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const labels = { baseline: '初始版本', save: '保存', restore: '回退保存', 'default-reset': '还原默认模板', 'before-default-reset': '还原前快照' };
const date = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
const fallback = <div className="template-history-image-fallback"><ImageIcon size={28} /><span>预览图暂不可用</span></div>;

export function TemplateHistory({ id, open, onOpenChange, locked, saving }: {
  id: string; open: boolean; onOpenChange: (value: boolean) => void; locked: boolean; saving: boolean;
}) {
  const { data, isLoading, isError, refetch } = useTemplateRevisions(id, open);
  const restore = useRestoreTemplateRevision(id);
  const [selectedId, setSelectedId] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const revisions = data?.revisions || [];
  const selected = revisions.find(revision => revision.id === selectedId) || revisions[0];
  useEffect(() => { setSelectedId(undefined); setConfirming(false); }, [id, open]);
  useEffect(() => { if (locked) setConfirming(false); }, [locked]);

  async function restoreSelected() {
    if (!selected || locked || saving || restore.isPending) return;
    try {
      await restore.mutateAsync(selected.id);
      setConfirming(false);
      toast({ title: '已回退到所选版本', description: '回退结果已保存为新记录，可继续查看和回退。' });
    } catch (error: any) {
      toast({ title: '回退失败', description: error.response?.data?.error?.message || '请刷新后重试', variant: 'destructive' });
    }
  }

  return <Dialog open={open} onOpenChange={value => { if (!restore.isPending) onOpenChange(value); }}>
    <DialogContent style={{ width: 'calc(100vw - 32px)', maxWidth: 1040, padding: 24 }}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><History size={20} />保存历史</DialogTitle>
        <DialogDescription>保留最近 50 条记录。选择预览图查看设计，回退也会保存为新记录。</DialogDescription>
      </DialogHeader>
      {isLoading ? <div className="template-history-empty"><Loader2 className="animate-spin" />正在加载历史记录…</div>
        : isError ? <div className="template-history-empty">历史记录加载失败<Button onClick={() => refetch()}>重试</Button></div>
        : !selected ? <div className="template-history-empty"><History />尚无保存记录，保存后将在这里显示预览图。</div>
        : <div className="template-history-layout">
          <div className="template-history-list" aria-label="保存记录">
            {revisions.map((revision, index) => <button key={revision.id} className="template-history-card" aria-pressed={selected.id === revision.id}
              onClick={() => { setSelectedId(revision.id); setConfirming(false); }}>
              <div className="template-history-thumbnail" style={{ aspectRatio: `${revision.width}/${revision.height}` }}>
                <AuthenticatedImage src={revision.previewUrl} alt={`${revision.name} · ${date(revision.createdAt)}`} fallback={fallback} />
              </div>
              <div className="template-history-card-info"><strong>{revision.name}</strong><span>{labels[revision.kind]}{index === 0 ? ' · 最近保存' : ''}</span><time>{date(revision.createdAt)}</time></div>
            </button>)}
          </div>
          <div className="template-history-detail">
            <div className="template-history-preview" style={{ aspectRatio: `${selected.width}/${selected.height}` }}>
              <AuthenticatedImage key={selected.id} src={selected.previewUrl} alt={`历史预览：${selected.name}`} fallback={fallback} />
            </div>
            <div className="template-history-meta"><strong>{selected.name}</strong><span>{selected.width} × {selected.height}</span></div>
            <p className="text-sm text-(--text-secondary)">{labels[selected.kind]} · {date(selected.createdAt)}</p>
            {locked && <p className="template-history-lock"><Lock size={15} />模板已锁定，可查看历史；解锁后才能回退。</p>}
            {confirming ? <div className="template-history-confirm">
              <p>回退会替换当前设计，未保存的修改会丢失。已保存的版本仍保留在历史中。</p>
              <div className="flex gap-2"><Button onClick={restoreSelected} disabled={restore.isPending || locked || saving}>
                {restore.isPending ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}确认回退并保存
              </Button><Button variant="outline" onClick={() => setConfirming(false)} disabled={restore.isPending}>取消</Button></div>
            </div> : <Button className="mt-4 gap-2" onClick={() => setConfirming(true)} disabled={locked || saving || restore.isPending}><RotateCcw size={15} />回退到此版本</Button>}
            <span className="template-history-count">{revisions.length} / {data?.limit || 50} 条记录</span>
          </div>
        </div>}
    </DialogContent>
  </Dialog>;
}
