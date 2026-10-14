import { formatDisplayDate } from '@/lib/displayFormat';
import { getLocalizedApiError } from '@/lib/apiError';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { History, RotateCcw, Loader2, Image as ImageIcon, Lock } from 'lucide-react';
import { useTemplateRevisions, useRestoreTemplateRevision } from '@/api';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';


export function TemplateHistory({ id, open, onOpenChange, locked, saving }: {
  id: string; open: boolean; onOpenChange: (value: boolean) => void; locked: boolean; saving: boolean;
}) {
  const { t, i18n } = useTranslation();
  const labels = { baseline: t('templateHistory.baseline'), save: t('templateHistory.save'), restore: t('templateHistory.restore'), 'default-reset': t('templateHistory.reset'), 'before-default-reset': t('templateHistory.beforeReset') };
  const fallback = <div className="template-history-image-fallback"><ImageIcon size={28} /><span>{t('templateHistory.imageUnavailable')}</span></div>;
  const date = (value: string) => formatDisplayDate(value, i18n.language, { dateStyle: 'medium', timeStyle: 'medium', hour12: false }) || t('common.unknownTime');
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
      toast({ title: i18n.t('templateHistory.restored'), description: i18n.t('templateHistory.restoredHint') });
    } catch (error: any) {
      toast({ title: i18n.t('templateHistory.restoreFailed'), description: getLocalizedApiError(error), variant: 'destructive' });
    }
  }

  return <Dialog open={open} onOpenChange={value => { if (!restore.isPending) onOpenChange(value); }}>
    <DialogContent style={{ width: 'calc(100vw - 32px)', maxWidth: 1040, padding: 24 }}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><History size={20} />{t('templateHistory.title')}</DialogTitle>
        <DialogDescription>{t('templateHistory.hint')}</DialogDescription>
      </DialogHeader>
      {isLoading ? <div className="template-history-empty"><Loader2 className="animate-spin" />{t('templateHistory.loading')}</div>
        : isError ? <div className="template-history-empty">{t('templateHistory.loadFailed')}<Button onClick={() => refetch()}>{t('common.retry')}</Button></div>
        : !selected ? <div className="template-history-empty"><History />{t('templateHistory.empty')}</div>
        : <div className="template-history-layout">
          <div className="template-history-list" aria-label={t('templateHistory.records')}>
            {revisions.map((revision, index) => <button key={revision.id} className="template-history-card" aria-pressed={selected.id === revision.id}
              onClick={() => { setSelectedId(revision.id); setConfirming(false); }}>
              <div className="template-history-thumbnail" style={{ aspectRatio: `${revision.width}/${revision.height}` }}>
                <AuthenticatedImage src={revision.previewUrl} alt={`${revision.name} · ${date(revision.createdAt)}`} fallback={fallback} />
              </div>
              <div className="template-history-card-info"><strong>{revision.name}</strong><span>{labels[revision.kind]}{index === 0 ? t('templateHistory.latest') : ''}</span><time>{date(revision.createdAt)}</time></div>
            </button>)}
          </div>
          <div className="template-history-detail">
            <div className="template-history-preview" style={{ aspectRatio: `${selected.width}/${selected.height}` }}>
              <AuthenticatedImage key={selected.id} src={selected.previewUrl} alt={t('templateHistory.preview', { name: selected.name })} fallback={fallback} />
            </div>
            <div className="template-history-meta"><strong>{selected.name}</strong><span>v{selected.version || '1.0.0'} · {selected.width} × {selected.height}</span></div>
            <p className="text-sm text-(--text-secondary)">{labels[selected.kind]} · {date(selected.createdAt)}</p>
            {locked && <p className="template-history-lock"><Lock size={15} />{t('templateHistory.locked')}</p>}
            {confirming ? <div className="template-history-confirm">
              <p>{t('templateHistory.confirmHint')}</p>
              <div className="flex gap-2"><Button onClick={restoreSelected} disabled={restore.isPending || locked || saving}>
                {restore.isPending ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}{t('templateHistory.confirm')}
              </Button><Button variant="outline" onClick={() => setConfirming(false)} disabled={restore.isPending}>{t('common.cancel')}</Button></div>
            </div> : <Button className="mt-4 gap-2" onClick={() => setConfirming(true)} disabled={locked || saving || restore.isPending}><RotateCcw size={15} />{t('templateHistory.restoreVersion')}</Button>}
            <span className="template-history-count">{t('templateHistory.count', { count: revisions.length, limit: data?.limit || 50 })}</span>
          </div>
        </div>}
    </DialogContent>
  </Dialog>;
}
