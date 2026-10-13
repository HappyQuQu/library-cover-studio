import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Loader2, Palette, RefreshCw, Search, Store, Check, ArrowRight } from 'lucide-react';
import { apiClient } from '@/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

interface StoreTemplate {
  id: string; revision: string; name: string; description: string; width: number; height: number;
  previewUrl: string; downloadCount: number; installedTemplateId: string | null;
  version: string; author?: { name: string; url?: string }; changelog: string; minAppVersion?: string;
  compatible: boolean; updateAvailable: boolean; previousTemplateId: string | null; installedVersion: string | null;
  updateMode: 'replace' | 'copy' | null; updateReason: string;
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
  const client = useQueryClient();
  const catalog = useQuery({ queryKey: ['template-store', query, sort, page],
    queryFn: ({ signal }) => apiClient.get<CatalogPage>('/template-store', { params: { q: query, sort, page }, signal }).then(response => response.data),
    staleTime: 60000, retry: false });
  const data = catalog.data;

  async function install(template: StoreTemplate) {
    if (busyId) return;
    setBusyId(template.id);
    try {
      const update = template.updateAvailable && template.previousTemplateId;
      const { data: result } = await apiClient.post<{ id: string; alreadyInstalled: boolean; action: 'installed' | 'updated' | 'copied' | 'existing' }>(`/template-store/${template.id}/${update ? 'update' : 'install'}`, { revision: template.revision, ...(update ? { templateId: template.previousTemplateId } : {}) }, { timeout: 90000 });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['templates'] }),
        client.invalidateQueries({ queryKey: ['template-store'] }),
        client.invalidateQueries({ queryKey: ['template-history'] })
      ]);
      toast({ title: result.alreadyInstalled ? '此版本已在模板库中' : result.action === 'updated' ? `「${template.name}」已更新` : result.action === 'copied' ? '已添加新版副本，原模板已保留' : `「${template.name}」已添加到模板库`,
        description: result.action === 'updated' ? '任务引用保持有效，更新前的版本可从历史回退。' : '现在可以在设计器和自动化的模板菜单中选择。' });
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
        <a href="https://github.com/HappyQuQu/library-cover-store#提交模板" target="_blank" rel="noreferrer"><Button className="btn btn-secondary"><ExternalLink size={16} />提交模板</Button></a>
      </div>
    </div>

    <div className="template-store-toolbar">
      <label className="template-store-search"><Search size={17} /><input type="search" aria-label="搜索商店模板" placeholder="搜索模板、作者或描述…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
      <select aria-label="模板排序" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="popular">下载最多</option><option value="name">按名称排序</option></select>
      <Button className="btn btn-secondary" onClick={() => catalog.refetch()} disabled={catalog.isFetching} aria-label="刷新商店目录"><RefreshCw size={16} className={catalog.isFetching ? 'animate-spin' : ''} />刷新</Button>
    </div>

    {data && <div className="template-store-meta"><span>{data.total.toLocaleString()} 套模板 · 全站累计下载</span><span>{data.generatedAt ? `统计更新于 ${new Date(data.generatedAt).toLocaleString()}，约每小时同步` : '模板源：GitHub'}{data.stale ? ' · 当前显示缓存目录' : ''}</span></div>}
    {data && data.pendingCount > 0 && <p className="template-store-notice">还有 {data.pendingCount} 套模板正在排队发布，发布后会自动出现在商店。</p>}

    {catalog.isPending ? <div className="template-store-loading" role="status"><Loader2 size={28} className="animate-spin" /><span>正在加载模板商店…</span></div>
      : catalog.isError ? <div className="card empty-state" role="alert"><Store size={32} /><div className="empty-state-title">暂时无法连接模板商店</div><p>请检查服务器到 GitHub 的网络连接后重试。</p><Button className="btn btn-primary" onClick={() => catalog.refetch()}>重新加载</Button></div>
      : !data?.templates.length ? <div className="card empty-state"><Store size={36} /><div className="empty-state-title">{data?.setupRequired ? '商店即将开张' : query ? '没有找到匹配的模板' : '还没有上架模板'}</div><p className="empty-state-description">{data?.setupRequired ? '仓库首次运行发布工作流后，模板目录会自动加载。' : query ? '换个关键词，或清空搜索看看。' : '将导出的模板 JSON 和预览图提交到公开仓库，即可分享给大家。'}</p><a href="https://github.com/HappyQuQu/library-cover-store" target="_blank" rel="noreferrer" className="template-store-source">查看模板仓库<ExternalLink size={14} /></a></div>
      : <div className="template-library-grid">{data.templates.map(template => <article className="template-library-card" key={`${template.id}:${template.revision}`}>
        <Preview template={template} />
        <div className="template-store-card-content"><h2>{template.name}</h2>
          <div className="template-store-author"><span>{template.author?.url ? <a href={template.author.url} target="_blank" rel="noreferrer">{template.author.name}</a> : template.author?.name || '未标注作者'}</span><span>v{template.version}</span></div><p>{template.description || '社区分享的封面设计'}</p>
          {template.changelog && <details className="template-store-changelog"><summary>更新说明</summary>{template.changelog}</details>}
          {template.updateAvailable && <div className="template-store-update">本地 {template.installedVersion ? `v${template.installedVersion}` : '未标注版本'} → v{template.version}<br />{template.updateReason}</div>}
          {!template.compatible && <div className="template-store-update">需要应用 v{template.minAppVersion} 或更高版本，请先升级。</div>}
          <span className="template-store-downloads"><Download size={14} />{template.downloadCount.toLocaleString()} 次下载</span></div>
        <div className="template-store-card-actions">{template.installedTemplateId
          ? <><span className="template-store-installed"><Check size={15} />已添加</span><Link to={`/editor/${template.installedTemplateId}`}>打开模板<ArrowRight size={15} /></Link></>
          : <Button className="btn btn-primary" onClick={() => install(template)} disabled={!!busyId || !template.compatible}>{busyId === template.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}{busyId === template.id ? '下载处理中…' : !template.compatible ? '请先升级应用' : template.updateAvailable ? template.updateMode === 'copy' ? '更新为新版副本' : '更新模板' : '下载并添加'}</Button>}</div>
      </article>)}</div>}

    {data && data.totalPages > 1 && <nav className="template-store-pagination" aria-label="商店分页"><Button className="btn btn-secondary" disabled={data.page <= 1 || catalog.isFetching} onClick={() => setPage(data.page - 1)}>上一页</Button><span>第 {data.page} / {data.totalPages} 页</span><Button className="btn btn-secondary" disabled={data.page >= data.totalPages || catalog.isFetching} onClick={() => setPage(data.page + 1)}>下一页</Button></nav>}
    <p className="template-store-footer">下载次数包含各版本的 GitHub ZIP 下载；已添加的模板可以继续编辑，更新会保留历史，本地已有修改或锁定时会添加新版副本。</p>
  </div>;
}
