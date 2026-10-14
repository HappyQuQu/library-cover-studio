import { runStatus, coverStatus, duration } from '@/lib/taskHistoryDisplay';
import { formatDisplayDate } from '@/lib/displayFormat';
import { ErrorDetails } from '@/components/ErrorDetails';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Clock, Loader2, RefreshCw, ChevronDown, ChevronRight, ImageIcon, Download, Maximize2 } from 'lucide-react';
import { useTaskLogs, type TaskLogCover } from '@/api';
import { apiClient } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';

export function TaskHistoryDialog({ taskId, taskName, onClose }: { taskId: string; taskName: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const date = (value?: string) => formatDisplayDate(value, i18n.language, { dateStyle: 'medium', timeStyle: 'medium' }) || t('common.unknownTime');
  const { data: logs = [], isLoading, isError, refetch, isFetching } = useTaskLogs(taskId);
  const [expanded, setExpanded] = useState<string | null | undefined>();
  const [preview, setPreview] = useState<{ cover: TaskLogCover; startedAt?: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const orderedLogs = [...logs].sort((a, b) => Date.parse(b.startedAt || '') - Date.parse(a.startedAt || ''));
  const expandedId = expanded === undefined ? orderedLogs[0]?.id : expanded;

  async function download(cover: TaskLogCover) {
    if (!cover.imageUrl || downloading) return;
    setDownloading(true);
    try {
      const response = await apiClient.get<Blob>(`${cover.imageUrl}?download=1`, { responseType: 'blob' });
      if (!response.data.type.startsWith('image/')) throw new Error('Invalid image');
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url; link.download = `${cover.libraryName.replace(/[<>:"/\\|?*]/g, '_')}-${cover.id.slice(0, 8)}.png`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast({ title: i18n.t('taskHistory.downloadFailed'), description: i18n.t('taskHistory.downloadFailedHint'), variant: 'destructive' });
    } finally { setDownloading(false); }
  }

  return <>
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="task-history-dialog" style={{ maxWidth: 880, width: 'calc(100vw - 32px)', maxHeight: '85vh', padding: 0, overflow: 'hidden' }}>
        <div className="task-history-heading">
          <div className="task-history-icon"><Clock size={22} /></div>
          <div style={{ minWidth: 0 }}><DialogTitle>{t('taskHistory.title')}</DialogTitle><DialogDescription>{t('taskHistory.hint', { name: taskName })}</DialogDescription></div>
        </div>
        <div className="task-history-toolbar">
          <span>{t('taskHistory.summary', { runs: t('taskHistory.runCount', { count: logs.length }), covers: t('taskHistory.savedCoverCount', { count: logs.reduce((sum, log) => sum + (log.covers?.filter(cover => cover.imageUrl).length || 0), 0) }) })}</span>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />{t('common.refresh')}</Button>
        </div>
        <div className="task-history-list">
          {isLoading ? <div className="task-history-empty"><Loader2 size={24} className="animate-spin" />{t('taskHistory.loading')}</div>
            : isError ? <div className="task-history-empty">{t('taskHistory.loadFailed')}<Button variant="outline" onClick={() => refetch()}>{t('taskHistory.reload')}</Button></div>
              : !logs.length ? <div className="task-history-empty"><ImageIcon size={28} />{t('taskHistory.empty')}</div>
                : orderedLogs.map(log => {
                  const status = runStatus(log), isExpanded = expandedId === log.id;
                  return <section className="task-history-run" key={log.id}>
                    <button className="task-history-run-toggle" onClick={() => setExpanded(isExpanded ? null : log.id)} aria-expanded={isExpanded} aria-controls={`history-${log.id}`}>
                      <div className="task-history-run-title"><span className={`task-history-status ${status.tone}`}>{status.text}</span><time>{date(log.startedAt)}</time></div>
                      <div className="task-history-run-meta"><span>{t('taskHistory.updatedCount', { count: log.itemsProcessed || 0 })}</span><span>{t('taskHistory.failedCount', { count: log.itemsFailed || 0 })}</span>{duration(log) && <span>{t('taskHistory.elapsed', { duration: duration(log) })}</span>}{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</div>
                    </button>
                    {isExpanded && <div className="task-history-run-content" id={`history-${log.id}`}>
                      {log.errorMessage && <ErrorDetails error={{ message: log.errorMessage }} />}
                      {!log.covers?.length ? <div className="task-history-unavailable"><ImageIcon size={20} /><span>{log.status === 'running' ? t('taskHistory.preparing') : t('taskHistory.noSnapshots')}</span></div> : <div className="task-history-covers">
                        {log.covers.map(cover => <article className="task-history-cover" key={cover.id}>
                          <button className="task-history-cover-image" disabled={!cover.imageUrl} onClick={() => setPreview({ cover, startedAt: log.startedAt })} aria-label={t('taskHistory.enlargeCover', { name: cover.libraryName })}>
                            <AuthenticatedImage src={cover.thumbnailUrl || cover.imageUrl || undefined} alt={t('taskHistory.coverAlt', { name: cover.libraryName })} fallback={<div className="task-history-image-fallback"><ImageIcon size={26} /><span>{cover.status === 'generated' ? t('taskHistory.generatingCover') : t('taskHistory.noPreview')}</span></div>} />
                            {cover.imageUrl && <span className="task-history-enlarge"><Maximize2 size={14} />{t('taskHistory.enlarge')}</span>}
                          </button>
                          <div className="task-history-cover-info"><div className="task-history-cover-title"><strong>{cover.libraryName}</strong>{cover.imageUrl && <button className="btn-icon" title={t('taskHistory.downloadCover', { name: cover.libraryName })} onClick={() => download(cover)} disabled={downloading}><Download size={16} /></button>}</div>
                            <p>{cover.templateName || t('taskHistory.unknownTemplate')}{cover.width && cover.height ? ` · ${cover.width} × ${cover.height}` : ''}</p>
                            <span className={cover.status === 'failed' ? 'task-history-error' : 'task-history-cover-status'}>{coverStatus(cover)}</span>
                            {cover.errorMessage && <ErrorDetails error={{ message: cover.errorMessage }} />}
                          </div>
                        </article>)}
                      </div>}
                    </div>}
                  </section>;
                })}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}>
      <DialogContent className="task-history-preview" style={{ maxWidth: 1200, width: 'calc(100vw - 32px)', maxHeight: '90vh' }}>
        <DialogTitle>{t('taskHistory.previewTitle', { name: preview?.cover.libraryName || '' })}</DialogTitle>
        <DialogDescription>{date(preview?.startedAt)}{preview?.cover.templateName ? ` · ${preview.cover.templateName}` : ''}</DialogDescription>
        {preview && <>
          <div className="task-history-full-image"><AuthenticatedImage src={preview.cover.imageUrl || undefined} alt={t('taskHistory.fullImageAlt', { name: preview.cover.libraryName })} fallback={<div className="task-history-image-fallback"><ImageIcon size={28} /><span>{t('taskHistory.imageLoading')}</span></div>} /></div>
          <div className="task-history-preview-footer"><span>{preview.cover.width} × {preview.cover.height} · PNG</span><Button className="btn btn-primary" onClick={() => download(preview.cover)} disabled={downloading}>{downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}{t('taskHistory.downloadOriginal')}</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
