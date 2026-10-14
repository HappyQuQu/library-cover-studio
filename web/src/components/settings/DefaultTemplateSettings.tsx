import { getLocalizedApiError } from '@/lib/apiError';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
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
      toast({ title: result.restored + result.recreated ? i18n.t('defaultTemplates.restored') : i18n.t('defaultTemplates.unchanged'),
        description: result.restored + result.recreated
          ? i18n.t('defaultTemplates.restoredHint', { restored: result.restored, recreated: result.recreated })
          : i18n.t('defaultTemplates.complete', { count: result.total }) });
    } catch (error: any) {
      toast({ title: i18n.t('defaultTemplates.failed'), description: getLocalizedApiError(error), variant: 'destructive' });
    } finally { setRestoring(false); }
  }

  return <section aria-label={t('defaultTemplates.section')} style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3 style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t('defaultTemplates.title')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
          {t('defaultTemplates.hint')}
        </p>
        {isLoading ? <p className="mt-2 text-xs text-(--text-tertiary)">{t('defaultTemplates.loading')}</p>
          : isError ? <div className="mt-2 flex items-center gap-2 text-xs">{t('defaultTemplates.loadFailed')}<Button variant="ghost" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button></div>
          : data && <p className="mt-2 text-xs text-(--text-secondary)">
            {t('defaultTemplates.status', { total: data.total, modified: data.modified, missing: data.missing })}
          </p>}
      </div>
      <Button className="btn btn-secondary shrink-0" disabled={restoring || isLoading || isError} onClick={() => setConfirming(true)}>
        {restoring ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
        {restoring ? t('defaultTemplates.restoring') : t('defaultTemplates.restoreAll')}
      </Button>
    </div>
    <Dialog open={confirming} onOpenChange={value => { if (!restoring) setConfirming(value); }}>
      <DialogContent style={{ width: 'calc(100vw - 32px)', maxWidth: 560 }}>
        <DialogHeader>
          <DialogTitle>{t('defaultTemplates.confirmTitle')}</DialogTitle>
          <DialogDescription>{t('defaultTemplates.confirmHint', { count: data?.total || 0 })}</DialogDescription>
        </DialogHeader>
        <div className="my-4 flex flex-wrap gap-2" aria-label={t('defaultTemplates.listLabel')}>
          {data?.templates.map(template => <span key={template.id} className="rounded-lg bg-(--bg-secondary) px-3 py-2 text-xs">
            {template.name}{template.state === 'missing' ? t('defaultTemplates.recreateBadge') : template.state === 'modified' ? t('defaultTemplates.restoreBadge') : ''}
          </span>)}
        </div>
        <p className="mb-3 text-sm text-(--text-secondary)">{t('defaultTemplates.historyHint')}</p>
        <p className="mb-5 text-xs text-(--text-tertiary)">{t('defaultTemplates.taskHint')}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirming(false)} disabled={restoring}>{t('common.cancel')}</Button>
          <Button onClick={restore} disabled={restoring}>
            {restoring && <Loader2 size={16} className="mr-2 animate-spin" />}{restoring ? t('defaultTemplates.restoring') : t('defaultTemplates.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
