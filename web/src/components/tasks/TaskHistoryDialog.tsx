import { useState } from 'react';
import { Clock, Loader2, RefreshCw, ChevronDown, ChevronRight, ImageIcon, Download, Maximize2 } from 'lucide-react';
import { useTaskLogs, type TaskLog, type TaskLogCover } from '@/api';
import { apiClient } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';

function runStatus(log: TaskLog) {
  if (log.status === 'running') return { text: '运行中', tone: 'pending' };
  if (log.status === 'failed') return { text: '执行失败', tone: 'error' };
  if (log.itemsFailed) return { text: '部分失败', tone: 'warning' };
  return { text: '已完成', tone: 'success' };
}

function coverStatus(cover: TaskLogCover) {
  if (cover.status === 'uploaded') return '已更新到媒体库';
  if (cover.status === 'failed') return cover.imageUrl ? '上传失败 · 图片已保留' : '生成失败';
  return cover.imageUrl ? '已生成 · 正在上传' : '正在生成';
}

function duration(log: TaskLog) {
  if (!log.startedAt || !log.completedAt) return null;
  const seconds = Math.max(0, (Date.parse(log.completedAt) - Date.parse(log.startedAt)) / 1000);
  if (!Number.isFinite(seconds)) return null;
  return seconds < 60 ? `${Math.round(seconds)} 秒` : `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒`;
}

const date = (value?: string) => value ? new Date(value).toLocaleString('zh-CN') : '时间未知';

export function TaskHistoryDialog({ taskId, taskName, onClose }: { taskId: string; taskName: string; onClose: () => void }) {
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
      toast({ title: '下载失败', description: '图片可能已被清理，请刷新记录后重试。', variant: 'destructive' });
    } finally { setDownloading(false); }
  }

  return <>
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="task-history-dialog" style={{ maxWidth: 880, width: 'calc(100vw - 32px)', maxHeight: '85vh', padding: 0, overflow: 'hidden' }}>
        <div className="task-history-heading">
          <div className="task-history-icon"><Clock size={22} /></div>
          <div style={{ minWidth: 0 }}><DialogTitle>执行历史</DialogTitle><DialogDescription>{taskName} · 查看每次运行的封面与结果</DialogDescription></div>
        </div>
        <div className="task-history-toolbar">
          <span>{logs.length} 次执行 · {logs.reduce((sum, log) => sum + (log.covers?.filter(cover => cover.imageUrl).length || 0), 0)} 张已保存封面</span>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />刷新</Button>
        </div>
        <div className="task-history-list">
          {isLoading ? <div className="task-history-empty"><Loader2 size={24} className="animate-spin" />正在加载执行记录…</div>
            : isError ? <div className="task-history-empty">执行记录加载失败<Button variant="outline" onClick={() => refetch()}>重新加载</Button></div>
              : !logs.length ? <div className="task-history-empty"><ImageIcon size={28} />暂无执行记录，任务运行后会在这里保存生成的封面。</div>
                : orderedLogs.map(log => {
                  const status = runStatus(log), isExpanded = expandedId === log.id;
                  return <section className="task-history-run" key={log.id}>
                    <button className="task-history-run-toggle" onClick={() => setExpanded(isExpanded ? null : log.id)} aria-expanded={isExpanded} aria-controls={`history-${log.id}`}>
                      <div className="task-history-run-title"><span className={`task-history-status ${status.tone}`}>{status.text}</span><time>{date(log.startedAt)}</time></div>
                      <div className="task-history-run-meta"><span>更新 {log.itemsProcessed || 0} 个媒体库</span><span>失败 {log.itemsFailed || 0} 个</span>{duration(log) && <span>耗时 {duration(log)}</span>}{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</div>
                    </button>
                    {isExpanded && <div className="task-history-run-content" id={`history-${log.id}`}>
                      {log.errorMessage && <p className="task-history-error">{log.errorMessage}</p>}
                      {!log.covers?.length ? <div className="task-history-unavailable"><ImageIcon size={20} /><span>{log.status === 'running' ? '任务正在准备，生成后会自动显示封面。' : '本次未保存历史图片。之后的执行会自动保留封面快照。'}</span></div> : <div className="task-history-covers">
                        {log.covers.map(cover => <article className="task-history-cover" key={cover.id}>
                          <button className="task-history-cover-image" disabled={!cover.imageUrl} onClick={() => setPreview({ cover, startedAt: log.startedAt })} aria-label={`放大查看 ${cover.libraryName} 封面`}>
                            <AuthenticatedImage src={cover.thumbnailUrl || cover.imageUrl || undefined} alt={`${cover.libraryName} 本次生成的封面`} fallback={<div className="task-history-image-fallback"><ImageIcon size={26} /><span>{cover.status === 'generated' ? '正在生成封面' : '本次没有可预览的封面'}</span></div>} />
                            {cover.imageUrl && <span className="task-history-enlarge"><Maximize2 size={14} />查看大图</span>}
                          </button>
                          <div className="task-history-cover-info"><div className="task-history-cover-title"><strong>{cover.libraryName}</strong>{cover.imageUrl && <button className="btn-icon" title={`下载 ${cover.libraryName} 封面`} onClick={() => download(cover)} disabled={downloading}><Download size={16} /></button>}</div>
                            <p>{cover.templateName || '模板名称未记录'}{cover.width && cover.height ? ` · ${cover.width} × ${cover.height}` : ''}</p>
                            <span className={cover.status === 'failed' ? 'task-history-error' : 'task-history-cover-status'}>{coverStatus(cover)}</span>
                            {cover.errorMessage && <p className="task-history-error">{cover.errorMessage}</p>}
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
        <DialogTitle>{preview?.cover.libraryName} · 生成封面</DialogTitle>
        <DialogDescription>{date(preview?.startedAt)}{preview?.cover.templateName ? ` · ${preview.cover.templateName}` : ''}</DialogDescription>
        {preview && <>
          <div className="task-history-full-image"><AuthenticatedImage src={preview.cover.imageUrl || undefined} alt={`${preview.cover.libraryName} 生成封面大图`} fallback={<div className="task-history-image-fallback"><ImageIcon size={28} /><span>正在加载图片，若无法显示，请关闭后刷新记录。</span></div>} /></div>
          <div className="task-history-preview-footer"><span>{preview.cover.width} × {preview.cover.height} · PNG</span><Button className="btn btn-primary" onClick={() => download(preview.cover)} disabled={downloading}>{downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}下载原图</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
