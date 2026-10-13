import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Loader2, Palette, RefreshCw, Search, Store, Check, ArrowRight } from 'lucide-react';
import { apiClient } from '@/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface StoreTemplate {
  id: string; revision: string; name: string; description: string; width: number; height: number;
  previewUrl: string; downloadCount: number; installedTemplateId: string | null;
  version: string; author?: { name: string; url?: string }; changelog: string; minAppVersion?: string;
  compatible: boolean; updateAvailable: boolean; previousTemplateId: string | null; installedVersion: string | null;
  updateMode: 'replace' | 'copy' | null; updateReason: string;
  localMatch: boolean; localLocked: boolean; localModified: boolean; countPending: boolean; countLive: boolean;
}
interface CatalogPage {
  repositoryUrl: string; generatedAt: string | null; stale: boolean; setupRequired: boolean;
  pendingCount: number; total: number; page: number; totalPages: number; templates: StoreTemplate[];
}

function Preview({ template }: { template: StoreTemplate }) {
  const [failed, setFailed] = useState(false);
  return <div className="template-store-preview" style={{ aspectRatio: `${template.width}/${template.height}` }}>
    {failed ? <Palette size={36} aria-label="预览图暂时无法加载" /> : <img src={template.previewUrl} alt={`${template.name} 预览`} loading="lazy" onError={() => setFailed(true)} />}
    <span className="template-store-dimensions">{template.width} × {template.height}</span>
  </div>;
}

export function TemplateStorePage() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('popular');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTemplate, setConfirmTemplate] = useState<StoreTemplate | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const client = useQueryClient();
  const catalog = useQuery({ queryKey: ['template-store', query, sort, page],
    queryFn: ({ signal }) => apiClient.get<CatalogPage>('/template-store', { params: { q: query, sort, page }, signal }).then(response => response.data),
    staleTime: 60000, retry: false });
  const data = catalog.data;

  async function install(template: StoreTemplate, strategy?: 'backup' | 'replace' | 'copy') {
    if (busyId) return;
    setBusyId(template.id);
    try {
      const update = !!template.previousTemplateId;
      const { data: result } = await apiClient.post<{ id: string; alreadyInstalled: boolean; backupId?: string; action: 'installed' | 'updated' | 'copied' | 'existing' }>(`/template-store/${template.id}/${update ? 'update' : 'install'}`, { revision: template.revision, ...(update ? { templateId: template.previousTemplateId, strategy } : {}) }, { timeout: 90000 });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['templates'] }),
        client.invalidateQueries({ queryKey: ['template-store'] }),
        client.invalidateQueries({ queryKey: ['template-history'] })
      ]);
      toast({ title: result.alreadyInstalled ? '此版本已在模板库中' : result.action === 'updated' ? `「${template.name}」已更新` : result.action === 'copied' ? '已添加新版副本，原模板已保留' : `「${template.name}」已添加到模板库`,
        description: result.backupId ? '原设计已另存为「更新前备份」，当前模板已更新，任务引用保持有效。' : result.action === 'updated' ? '任务引用保持有效，更新前的版本可从历史回退。' : '现在可以在设计器和自动化的模板菜单中选择。' });
      setConfirmTemplate(null);
    } catch (error: unknown) {
      const response = error as { response?: { data?: { error?: { message?: string } } } };
      toast({ title: '添加失败', description: response.response?.data?.error?.message || '网络连接失败，请稍后重试', variant: 'destructive' });
    } finally { setBusyId(null); }
  }

  return <div className="template-store-page">
    <div className="page-heading template-store-heading">
      <div><h1>模板商店</h1><p>发现社区封面模板，下载后自动加入你的模板库。</p></div>
      <div className="template-store-header-actions">
        <Link to="/templates"><Button className="btn btn-secondary"><Palette size={16} />我的模板</Button></Link>
        <Button className="btn btn-secondary" onClick={() => setSubmitOpen(true)}><ExternalLink size={16} />提交模板</Button>
      </div>
    </div>

    <div className="template-store-toolbar">
      <label className="template-store-search"><Search size={17} /><input type="search" aria-label="搜索商店模板" placeholder="搜索模板、作者或描述…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
      <select aria-label="模板排序" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="popular">下载最多</option><option value="name">按名称排序</option></select>
      <Button className="btn btn-secondary" onClick={() => catalog.refetch()} disabled={catalog.isFetching} aria-label="刷新商店目录"><RefreshCw size={16} className={catalog.isFetching ? 'animate-spin' : ''} />刷新</Button>
    </div>

    {data && <div className="template-store-meta"><span>{data.total.toLocaleString()} 套模板 · 全站累计下载</span><span>{data.templates.some(item => item.countLive) ? 'GitHub 下载统计约每 2 分钟刷新' : data.generatedAt ? `GitHub 统计快照 ${new Date(data.generatedAt).toLocaleString()}` : '模板源：GitHub'}{data.stale ? ' · 当前显示缓存目录' : ''}</span></div>}
    {data && data.pendingCount > 0 && <p className="template-store-notice">还有 {data.pendingCount} 套模板正在排队发布，发布后会自动出现在商店。</p>}

    {catalog.isPending ? <div className="template-store-loading" role="status"><Loader2 size={28} className="animate-spin" /><span>正在加载模板商店…</span></div>
      : catalog.isError ? <div className="card empty-state" role="alert"><Store size={32} /><div className="empty-state-title">暂时无法连接模板商店</div><p>请检查服务器到 GitHub 的网络连接后重试。</p><Button className="btn btn-primary" onClick={() => catalog.refetch()}>重新加载</Button></div>
      : !data?.templates.length ? <div className="card empty-state"><Store size={36} /><div className="empty-state-title">{data?.setupRequired ? '商店即将开张' : query ? '没有找到匹配的模板' : '还没有上架模板'}</div><p className="empty-state-description">{data?.setupRequired ? '仓库首次运行发布工作流后，模板目录会自动加载。' : query ? '换个关键词，或清空搜索看看。' : '将导出的模板 JSON 和预览图提交到公开仓库，即可分享给大家。'}</p><a href="https://github.com/HappyQuQu/library-cover-store" target="_blank" rel="noreferrer" className="template-store-source">查看模板仓库<ExternalLink size={14} /></a></div>
      : <div className="template-library-grid">{data.templates.map(template => <article className="template-library-card" key={`${template.id}:${template.revision}`}>
        <Preview template={template} />
        <div className="template-store-card-content"><h2>{template.name}</h2>
          <div className="template-store-author"><span>{template.author?.url ? <a href={template.author.url} target="_blank" rel="noreferrer">{template.author.name}</a> : template.author?.name || '未标注作者'}</span><span>v{template.version}</span></div><p>{template.description || '社区分享的封面设计'}</p>
          {template.changelog && <details className="template-store-changelog"><summary>更新说明</summary>{template.changelog}</details>}
          {template.updateAvailable && <div className="template-store-update">{template.localMatch ? '模板库已有同名模板' : `本地 v${template.installedVersion || '1.0.0'} → v${template.version}`}<br />{template.localLocked ? '相同设计会复用原模板；不同设计将添加新版副本。' : '更新会覆盖当前模板，建议先复制备份。'}</div>}
          {!template.compatible && <div className="template-store-update">需要应用 v{template.minAppVersion} 或更高版本，请先升级。</div>}
          <span className="template-store-downloads"><Download size={14} />{template.countPending ? '≥ ' : ''}{template.downloadCount.toLocaleString()} 次下载{template.countPending && <small title="包含本机已完成的下载，等待 GitHub 官方统计同步；同步后不会重复累加。"> · 同步中</small>}</span></div>
        <div className="template-store-card-actions">{template.installedTemplateId
          ? <><span className="template-store-installed"><Check size={15} />已添加</span>{template.localModified && <Button className="btn btn-secondary" disabled={!!busyId || !template.compatible} onClick={() => setConfirmTemplate(template)}>重新下载</Button>}<Link to={`/editor/${template.installedTemplateId}`}>打开模板<ArrowRight size={15} /></Link></>
          : <Button className="btn btn-primary" onClick={() => template.previousTemplateId ? setConfirmTemplate(template) : void install(template)} disabled={!!busyId || !template.compatible}>{busyId === template.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}{busyId === template.id ? '下载处理中…' : !template.compatible ? '请先升级应用' : template.localMatch ? '下载并同步' : template.updateAvailable ? '更新模板' : '下载并添加'}</Button>}</div>
      </article>)}</div>}

    {data && data.totalPages > 1 && <nav className="template-store-pagination" aria-label="商店分页"><Button className="btn btn-secondary" disabled={data.page <= 1 || catalog.isFetching} onClick={() => setPage(data.page - 1)}>上一页</Button><span>第 {data.page} / {data.totalPages} 页</span><Button className="btn btn-secondary" disabled={data.page >= data.totalPages || catalog.isFetching} onClick={() => setPage(data.page + 1)}>下一页</Button></nav>}
    <p className="template-store-footer">下载次数包含各版本的 GitHub ZIP 下载。成功下载后立即显示待同步次数，GitHub 同步后以官方统计为准。更新已有模板前请确认覆盖方式，建议先复制保留自己的改动。</p>
    <Dialog open={!!confirmTemplate} onOpenChange={open => { if (!open && !busyId) setConfirmTemplate(null); }}>
      <DialogContent style={{ maxWidth: 560 }}>
        <DialogHeader><DialogTitle>下载「{confirmTemplate?.name}」</DialogTitle><DialogDescription>{confirmTemplate?.localLocked
          ? '原模板已锁定或为共享默认模板。设计相同时会复用原模板；设计不同会添加新版副本。'
          : '模板库已有此模板。更新会覆盖原模板的设计和说明，如果你改动过它，建议先复制一个版本保留自己的设计。'}</DialogDescription></DialogHeader>
        {!confirmTemplate?.localLocked && <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>选择「先复制备份再更新」会保留一份原设计，并在当前模板上更新，已有自动化继续使用当前模板。相同设计会同步版本和作者信息，不会重复添加。</p>}
        <DialogFooter style={{ flexWrap: 'wrap' }}>
          <Button className="btn btn-secondary" disabled={!!busyId} onClick={() => setConfirmTemplate(null)}>取消</Button>
          {confirmTemplate?.localLocked ? <Button className="btn btn-primary" disabled={!!busyId} onClick={() => void install(confirmTemplate, 'copy')}>{busyId ? '下载处理中…' : '确认下载'}</Button>
            : <><Button className="btn btn-secondary" disabled={!!busyId} onClick={() => confirmTemplate && void install(confirmTemplate, 'replace')}>直接覆盖更新</Button>
              <Button className="btn btn-primary" disabled={!!busyId} onClick={() => confirmTemplate && void install(confirmTemplate, 'backup')}>{busyId ? '下载处理中…' : '先复制备份再更新'}</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
      <DialogContent style={{ maxWidth: 560 }}>
        <DialogHeader><DialogTitle>分享你的模板</DialogTitle><DialogDescription>将设计提交到公开模板仓库，审核合并后会自动发布到商店。</DialogDescription></DialogHeader>
        <ol style={{ paddingLeft: 22, fontSize: 14, lineHeight: 1.9, color: 'var(--text-secondary)' }}>
          <li>在设计器的「模板信息」中填写名称、作者、版本、说明和更新记录，然后保存。</li>
          <li>在模板库导出 ZIP，解压得到 <code>template.json</code> 和预览图。</li>
          <li>打开下方 GitHub 仓库，Fork 后创建「模板名」文件夹，放入 JSON 和唯一的 <code>preview.jpg/png/webp</code> 预览图。</li>
          <li>提交 Pull Request，简单介绍设计。修改已有模板时请保留原文件夹名称，并提高版本号。</li>
        </ol>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>请确认图片和设计可公开分享。JSON 与预览图合计不超过 5 MB，完整格式要求见仓库 README。</p>
        <DialogFooter><Button className="btn btn-secondary" onClick={() => setSubmitOpen(false)}>稍后再说</Button><a href="https://github.com/HappyQuQu/library-cover-store#提交模板" target="_blank" rel="noreferrer" className="btn btn-primary">前往 GitHub 提交<ExternalLink size={16} /></a></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
