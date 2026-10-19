import { getLocalizedApiError } from '@/lib/apiError';
import { formatDisplayDate, formatDisplayNumber } from '@/lib/displayFormat';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Loader2, Palette, RefreshCw, Search, Store, Check, ArrowRight, SlidersHorizontal, X } from 'lucide-react';
import { apiClient } from '@/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { useAuthStore } from '@/stores/authStore';
import { artworkOptions, orientationOptions, useOptions, statusOptions, storePageSizes as pageSizes, readStoreFilters, coverRatio } from '@/lib/templateStore';

interface StoreTemplate {
  classification?: { recommendedUses: ('library' | 'collection')[]; artworkType: 'poster' | 'backdrop' | 'mixed' | 'none'; artworkCount: number; tags: string[] };
  id: string; revision: string; name: string; description: string; width: number; height: number;
  previewUrl: string; downloadCount: number; installedTemplateId: string | null;
  version: string; author?: { name: string; url?: string }; changelog: string; minAppVersion?: string;
  compatible: boolean; updateAvailable: boolean; previousTemplateId: string | null; installedVersion: string | null;
  updateMode: 'replace' | 'copy' | null; updateReason: string;
  localMatch: boolean; localLocked: boolean; localModified: boolean; countPending: boolean; countLive: boolean;
}
interface CatalogPage {
  repositoryUrl: string; generatedAt: string | null; stale: boolean; setupRequired: boolean;
  catalogTotal?: number; facets?: { orientations: Record<string, number>; artwork: Record<string, number>; uses: Record<string, number> };
  pendingCount: number; total: number; page: number; pageSize: number; totalPages: number; templates: StoreTemplate[];
}
const pageSizeKey = 'template-store-page-size';


function Preview({ template }: { template: StoreTemplate }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '400px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const fallback = <Palette size={36} aria-label={t('templateStore.previewUnavailable')} />;
  return <div ref={ref} className="template-store-preview" style={{ aspectRatio: `${template.width}/${template.height}` }}>
    {visible ? <AuthenticatedImage src={`/api/template-store/${template.id}/preview?revision=${template.revision}`} alt={t('templateStore.previewAlt', { name: template.name })} fallback={fallback} /> : fallback}
    <span className="template-store-dimensions">{template.width} × {template.height}</span>
  </div>;
}

export function TemplateStorePage() {
  const { t, i18n } = useTranslation();
  const isAdmin = useAuthStore(state => state.user?.role === 'admin');
  const [params, setParams] = useSearchParams();
  const [savedPageSize] = useState(() => {
    try { return Number(localStorage.getItem(pageSizeKey)); } catch { return 24; }
  });
  const filters = readStoreFilters(params, savedPageSize);
  const { q: query, orientation, artwork, use, status, sort, page, pageSize } = filters;
  const [searchQuery, setSearchQuery] = useState(query);
  const [moreOpen, setMoreOpen] = useState(use !== 'all' || status !== 'all');
  const composing = useRef(false);
  const [isComposing, setIsComposing] = useState(false);
  useEffect(() => {
    if (isComposing) return;
    const timer = window.setTimeout(() => setSearchQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query, isComposing]);

  function changeFilters(patch: Partial<typeof filters>, replace = false) {
    setParams(current => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) {
        if (value === 'all' || value === '' || (key === 'page' && value === 1)) next.delete(key);
        else next.set(key, String(value));
      }
      return next;
    }, { replace });
  }
  const setPage = (value: number) => changeFilters({ page: value });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTemplate, setConfirmTemplate] = useState<StoreTemplate | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitMethod, setSubmitMethod] = useState<'export' | 'ai'>('export');
  const client = useQueryClient();
  const catalog = useQuery<CatalogPage>({ queryKey: ['template-store', searchQuery, orientation, artwork, use, status, sort, page, pageSize],
    queryFn: ({ signal }) => apiClient.get<CatalogPage>('/template-store', { params: { q: searchQuery, orientation, artwork, use, status, sort, page, pageSize }, signal }).then(response => response.data),
    enabled: searchQuery === query && !isComposing,
    placeholderData: keepPreviousData, staleTime: 60000, retry: false });
  const data = catalog.data;
  const activeFilters = [
    ...(query ? [{ key: 'q' as const, label: t('templateStore.keyword'), value: query }] : []),
    ...orientationOptions.filter(option => option.value === orientation).map(option => ({ key: 'orientation' as const, label: t('templateStore.orientation'), value: t(option.label) })),
    ...artworkOptions.filter(option => option.value === artwork).map(option => ({ key: 'artwork' as const, label: t('templateStore.artwork'), value: t(option.label) })),
    ...useOptions.filter(option => option.value === use).map(option => ({ key: 'use' as const, label: t('templateStore.recommendedUse'), value: t(option.label) })),
    ...statusOptions.filter(option => option.value === status).map(option => ({ key: 'status' as const, label: t('templateStore.addedStatus'), value: t(option.label) }))
  ];
  const hasFilters = activeFilters.length > 0;

  function clearFilters() {
    setSearchQuery(''); changeFilters({ q: '', orientation: 'all', artwork: 'all', use: 'all', status: 'all', page: 1 });
  }

  function changePageSize(size: number) {
    changeFilters({ pageSize: size, page: 1 });
    try { localStorage.setItem(pageSizeKey, String(size)); } catch { /* Works without persistence. */ }
  }

  async function install(template: StoreTemplate, strategy?: 'backup' | 'replace' | 'copy') {
    if (busyId) return;
    setBusyId(template.id);
    try {
      const update = !!template.previousTemplateId;
      const { data: result } = await apiClient.post<{ id: string; alreadyInstalled: boolean; backupId?: string; fonts?: { action: 'installed' | 'reused' }[]; action: 'installed' | 'updated' | 'copied' | 'existing' }>(`/template-store/${template.id}/${update ? 'update' : 'install'}`, { revision: template.revision, ...(update ? { templateId: template.previousTemplateId, strategy } : {}) }, { timeout: 90000 });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['templates'] }),
        client.invalidateQueries({ queryKey: ['template-store'] }),
        client.invalidateQueries({ queryKey: ['template-history'] })
      ]);
      const installedFonts = result.fonts?.filter(font => font.action === 'installed').length || 0;
      const fontMessage = installedFonts ? i18n.t('templateStore.fontsInstalled', { count: installedFonts }) : '';
      toast({ title: result.alreadyInstalled ? i18n.t('templateStore.alreadyInstalled') : result.action === 'updated' ? i18n.t('templateStore.updated', { name: template.name }) : result.action === 'copied' ? i18n.t('templateStore.copied') : i18n.t('templateStore.installed', { name: template.name }),
        description: (fontMessage ? `${fontMessage} ` : '') + (result.backupId ? i18n.t('templateStore.backupHint') : result.action === 'updated' ? i18n.t('templateStore.updatedHint') : i18n.t('templateStore.installedHint')) });
      setConfirmTemplate(null);
    } catch (error: unknown) {
      toast({ title: i18n.t('templateStore.installFailed'), description: getLocalizedApiError(error), variant: 'destructive' });
    } finally { setBusyId(null); }
  }

  return <div className="template-store-page">
    <div className="page-heading template-store-heading">
      <div><h1>{t('templateStore.title')}</h1><p>{t('templateStore.hint')}</p></div>
      <div className="template-store-header-actions">
        <Link to="/templates"><Button className="btn btn-secondary"><Palette size={16} />{t('templateStore.myTemplates')}</Button></Link>
        <Button className="btn btn-secondary" onClick={() => setSubmitOpen(true)}><ExternalLink size={16} />{t('templateStore.submit')}</Button>
      </div>
    </div>

    <div className="template-store-controls">
      <form className="template-store-toolbar" onSubmit={event => { event.preventDefault(); if (!composing.current) setSearchQuery(query); }}>
        <label className="template-store-search"><Search size={17} /><input type="search" maxLength={200} aria-label={t('templateStore.search')} placeholder={t('templateStore.searchPlaceholder')} value={query}
          onCompositionStart={() => { composing.current = true; setIsComposing(true); }} onCompositionEnd={() => { composing.current = false; setIsComposing(false); }}
          onChange={event => changeFilters({ q: event.target.value, page: 1 }, true)} /></label>
        <label className="template-store-filter"><span>{t('templateStore.sort')}</span><select aria-label={t('templateStore.sortLabel')} value={sort} onChange={event => changeFilters({ sort: event.target.value, page: 1 })}>{query.trim() && <option value="relevance">{t('templateStore.relevance')}</option>}<option value="popular">{t('templateStore.popular')}</option><option value="name">{t('templateStore.name')}</option></select></label>
        <Button type="button" className="btn btn-secondary template-store-refresh" title={t('templateStore.refreshCatalog')} onClick={() => catalog.refetch()} disabled={catalog.isFetching || query !== searchQuery || isComposing} aria-label={t('templateStore.refreshCatalog')}><RefreshCw size={16} className={catalog.isFetching ? 'animate-spin' : ''} /></Button>
      </form>
      <div className="template-store-toolbar" role="group" aria-label={t('templateStore.filters')}>
        <label className="template-store-filter"><span>{t('templateStore.orientation')}</span><select aria-label={t('templateStore.orientationLabel')} value={orientation} onChange={event => changeFilters({ orientation: event.target.value, page: 1 })}><option value="all">{t('templateStore.allOrientations')}</option>{orientationOptions.filter(option => (data?.facets?.orientations[option.value] || 0) > 0 || option.value === orientation || (!data?.facets && option.value !== 'square')).map(option => <option key={option.value} value={option.value}>{t('templateStore.filterOption', { label: t(option.label), count: data?.facets?.orientations[option.value] || 0 })}</option>)}</select></label>
        <label className="template-store-filter"><span>{t('templateStore.artwork')}</span><select aria-label={t('templateStore.artworkLabel')} value={artwork} onChange={event => changeFilters({ artwork: event.target.value, page: 1 })}><option value="all">{t('templateStore.allOrientations')}</option>{artworkOptions.filter(option => (data?.facets?.artwork[option.value] || 0) > 0 || option.value === artwork).map(option => <option key={option.value} value={option.value}>{t('templateStore.filterOption', { label: t(option.label), count: data?.facets?.artwork[option.value] || 0 })}</option>)}</select></label>
        <Button className="btn btn-secondary" onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} aria-controls="store-more-filters"><SlidersHorizontal size={16} />{t('templateStore.moreFilters')}</Button>
        {hasFilters && <Button className="btn btn-secondary" onClick={clearFilters}>{t('templateStore.clearFilters')}</Button>}
      </div>
      {moreOpen && <div id="store-more-filters" className="template-store-more-filters">
        <label className="template-store-filter"><span>{t('templateStore.recommendedUse')}</span><select aria-label={t('templateStore.useLabel')} value={use} onChange={event => changeFilters({ use: event.target.value, page: 1 })}><option value="all">{t('templateStore.allOrientations')}</option>{useOptions.filter(option => (data?.facets?.uses[option.value] || 0) > 0 || option.value === use).map(option => <option key={option.value} value={option.value}>{t('templateStore.filterOption', { label: t(option.label), count: data?.facets?.uses[option.value] || 0 })}</option>)}</select></label>
        <label className="template-store-filter"><span>{t('templateStore.addedStatus')}</span><select aria-label={t('templateStore.statusLabel')} value={status} onChange={event => changeFilters({ status: event.target.value, page: 1 })}><option value="all">{t('templateStore.allOrientations')}</option>{statusOptions.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select></label>
        <p>{t('templateStore.useHint')}</p>
      </div>}
      {hasFilters && <div className="template-store-active-filters" aria-label={t('templateStore.activeFilters')}>{activeFilters.map(filter => <button key={filter.key} className="template-store-filter-chip" aria-label={t('templateStore.removeFilter', { label: filter.label, value: filter.value })} onClick={() => { if (filter.key === 'q') setSearchQuery(''); changeFilters({ [filter.key]: filter.key === 'q' ? '' : 'all', page: 1 }); }}>{t('templateStore.activeFilter', { label: filter.label, value: filter.value })}<X size={13} /></button>)}</div>}
    </div>

    {data && <div className="template-store-meta"><span role="status" aria-live="polite" aria-atomic="true">{t('templateStore.total', { count: data.total })}{data.total > 0 ? t('templateStore.range', { start: formatDisplayNumber((data.page - 1) * data.pageSize + 1, i18n.language), end: formatDisplayNumber(Math.min(data.page * data.pageSize, data.total), i18n.language) }) : ''}{catalog.isFetching || query !== searchQuery ? t('templateStore.updating') : ''}</span><span>{data.templates.some(item => item.countLive) ? t('templateStore.liveStats') : data.generatedAt ? t('templateStore.statsSnapshot', { time: formatDisplayDate(data.generatedAt, i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) || t('common.unknownTime') }) : t('templateStore.source')}{data.stale ? t('templateStore.cached') : ''}</span></div>}
    {data && data.pendingCount > 0 && <p className="template-store-notice">{t('templateStore.pending', { count: data.pendingCount })}</p>}

    {catalog.isPending ? <div className="template-store-loading" role="status"><Loader2 size={28} className="animate-spin" /><span>{t('templateStore.loading')}</span></div>
      : catalog.isError ? <div className="card empty-state" role="alert"><Store size={32} /><div className="empty-state-title">{t('templateStore.loadFailed')}</div><p>{isAdmin ? t('templateStore.adminNetworkHint') : t('templateStore.networkHint')}</p><div className="template-store-header-actions">{isAdmin && <Link to="/settings?tab=network" className="btn btn-secondary">{t('templateStore.networkSettings')}</Link>}<Button className="btn btn-primary" onClick={() => catalog.refetch()}>{t('templateStore.reload')}</Button></div></div>
      : !data?.templates.length ? <div className="card empty-state"><Store size={36} /><div className="empty-state-title">{data?.setupRequired ? t('templateStore.setupTitle') : hasFilters ? t('templateStore.noMatches') : t('templateStore.empty')}</div><p className="empty-state-description">{data?.setupRequired ? t('templateStore.setupHint') : hasFilters ? t('templateStore.noMatchesHint') : t('templateStore.emptyHint')}</p>{hasFilters && !data?.setupRequired && <Button className="btn btn-secondary" onClick={clearFilters}>{t('templateStore.clearFilters')}</Button>}<a href="https://github.com/HappyQuQu/library-cover-store" target="_blank" rel="noreferrer" className="template-store-source">{t('templateStore.viewRepository')}<ExternalLink size={14} /></a></div>
      : <div className="template-library-grid">{data.templates.map(template => <article className="template-library-card" key={`${template.id}:${template.revision}`}>
        <Preview template={template} />
        <div className="template-store-card-content"><h2>{template.name}</h2>
          <div className="template-store-tags"><span>{t('templateStore.coverFormat', { orientation: t(template.width > template.height ? 'templateStore.landscape' : template.width < template.height ? 'templateStore.portrait' : 'templateStore.square'), ratio: coverRatio(template.width, template.height) })}</span>{template.classification && <><span>{t(artworkOptions.find(option => option.value === template.classification!.artworkType)!.label)}</span>{template.classification.artworkCount > 0 && <span title={t('templateStore.artworkCountHint')}>{t('templateStore.artworkCount', { count: template.classification.artworkCount })}</span>}{template.classification.recommendedUses.map(value => <span key={value}>{t(useOptions.find(option => option.value === value)!.label)}</span>)}</>}</div>
          <div className="template-store-author"><span>{template.author?.url ? <a href={template.author.url} target="_blank" rel="noreferrer">{template.author.name}</a> : template.author?.name || t('templateStore.unknownAuthor')}</span><span>v{template.version}</span></div><p>{template.description || t('templateStore.fallbackDescription')}</p>
          {template.changelog && <details className="template-store-changelog"><summary>{t('templateStore.changelog')}</summary>{template.changelog}</details>}
          {template.updateAvailable && <div className="template-store-update">{template.localMatch ? t('templateStore.localMatch') : t('templateStore.versionChange', { installed: template.installedVersion || '1.0.0', version: template.version })}<br />{template.localLocked ? t('templateStore.lockedUpdateHint') : t('templateStore.updateHint')}</div>}
          {!template.compatible && <div className="template-store-update">{t('templateStore.minVersion', { version: template.minAppVersion })}</div>}
          <span className="template-store-downloads"><Download size={14} />{template.countPending ? '≥ ' : ''}{t('templateStore.downloads', { count: template.downloadCount })}{template.countPending && <small title={t('templateStore.pendingSyncHint')}>{t('templateStore.syncing')}</small>}</span></div>
        <div className="template-store-card-actions">{template.installedTemplateId
          ? <><span className="template-store-installed"><Check size={15} />{t('templateStore.added')}</span>{template.localModified && <Button className="btn btn-secondary" disabled={!!busyId || !template.compatible} onClick={() => setConfirmTemplate(template)}>{t('templateStore.redownload')}</Button>}<Link to={`/editor/${template.installedTemplateId}`}>{t('templateStore.openTemplate')}<ArrowRight size={15} /></Link></>
          : <Button className="btn btn-primary" onClick={() => template.previousTemplateId ? setConfirmTemplate(template) : void install(template)} disabled={!!busyId || !template.compatible}>{busyId === template.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}{busyId === template.id ? t('templateStore.processing') : !template.compatible ? t('templateStore.upgrade') : template.localMatch ? t('templateStore.downloadSync') : template.updateAvailable ? t('templateStore.update') : t('templateStore.downloadAdd')}</Button>}</div>
      </article>)}</div>}

    {data && data.total > 0 && <nav className="template-store-pagination" aria-label={t('templateStore.pagination')}><div className="template-store-page-summary"><span>{t('templateStore.pageSummary', { size: data.pageSize, count: data.total })}</span><label className="template-store-filter"><span>{t('templateStore.perPage')}</span><select aria-label={t('templateStore.pageSize')} value={pageSize} onChange={event => changePageSize(Number(event.target.value))}>{pageSizes.map(size => <option key={size} value={size}>{t('templateStore.pageSizeOption', { count: size })}</option>)}</select></label></div><div className="template-store-page-buttons"><Button className="btn btn-secondary" disabled={data.page <= 1 || catalog.isFetching} onClick={() => setPage(1)}>{t('templateStore.firstPage')}</Button><Button className="btn btn-secondary" disabled={data.page <= 1 || catalog.isFetching} onClick={() => setPage(data.page - 1)}>{t('templateStore.previousPage')}</Button><span>{t('templateStore.pageNumber', { page: data.page, total: data.totalPages })}</span><Button className="btn btn-secondary" disabled={data.page >= data.totalPages || catalog.isFetching} onClick={() => setPage(data.page + 1)}>{t('templateStore.nextPage')}</Button><Button className="btn btn-secondary" disabled={data.page >= data.totalPages || catalog.isFetching} onClick={() => setPage(data.totalPages)}>{t('templateStore.lastPage')}</Button></div></nav>}
    <p className="template-store-footer">{t('templateStore.footer')}</p>
    <Dialog open={!!confirmTemplate} onOpenChange={open => { if (!open && !busyId) setConfirmTemplate(null); }}>
      <DialogContent style={{ maxWidth: 560, width: 'calc(100vw - 32px)' }}>
        <DialogHeader><DialogTitle>{t('templateStore.confirmTitle', { name: confirmTemplate?.name || '' })}</DialogTitle><DialogDescription>{confirmTemplate?.localLocked
          ? t('templateStore.lockedConfirmHint')
          : t('templateStore.confirmHint')}</DialogDescription></DialogHeader>
        {!confirmTemplate?.localLocked && <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{t('templateStore.backupExplanation')}</p>}
        <DialogFooter style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <Button className="btn btn-secondary" disabled={!!busyId} onClick={() => setConfirmTemplate(null)}>{t('common.cancel')}</Button>
          {confirmTemplate?.localLocked ? <Button className="btn btn-primary" disabled={!!busyId} onClick={() => void install(confirmTemplate, 'copy')}>{busyId ? t('templateStore.processing') : t('templateStore.confirmDownload')}</Button>
            : <><Button className="btn btn-secondary" disabled={!!busyId} onClick={() => confirmTemplate && void install(confirmTemplate, 'replace')}>{t('templateStore.replace')}</Button>
              <Button className="btn btn-primary" disabled={!!busyId} onClick={() => confirmTemplate && void install(confirmTemplate, 'backup')}>{busyId ? t('templateStore.processing') : t('templateStore.backup')}</Button></>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
      <DialogContent style={{ maxWidth: 560, width: 'calc(100vw - 32px)' }}>
        <DialogHeader><DialogTitle>{t('templateStore.shareTitle')}</DialogTitle><DialogDescription>{t('templateStore.shareHint')}</DialogDescription></DialogHeader>
        <div className="template-store-submit-methods" aria-label={t('templateStore.method')}>
          <Button className={`btn ${submitMethod === 'export' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={submitMethod === 'export'} onClick={() => setSubmitMethod('export')}>{t('templateStore.exportMethod')}</Button>
          <Button className={`btn ${submitMethod === 'ai' ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={submitMethod === 'ai'} onClick={() => setSubmitMethod('ai')}>{t('templateStore.aiMethod')}</Button>
        </div>
        {submitMethod === 'export' ? <ol style={{ paddingLeft: 22, fontSize: 14, lineHeight: 1.9, color: 'var(--text-secondary)' }}>
          <li>{t('templateStore.exportStepOne')}</li>
          <li>{t('templateStore.exportStepTwo')}</li>
          <li>{t('templateStore.exportStepThree')}</li>
          <li>{t('templateStore.exportStepFour')}</li>
        </ol> : <div className="template-store-ai-guide">
          <p>{t('templateStore.aiGuide')}</p>
          <pre><code>git clone https://github.com/HappyQuQu/library-cover-store.git{'\n'}cd library-cover-store</code></pre>
          <ol>
            <li>{t('templateStore.aiStepOne')}</li>
            <li>{t('templateStore.aiStepTwo')}</li>
            <li>{t('templateStore.aiStepThree')}</li>
            <li>{t('templateStore.aiStepFour')}</li>
          </ol>
          <Button className="btn btn-secondary" onClick={async () => {
            try { await navigator.clipboard.writeText(t('templateStore.aiPrompt')); toast({ title: i18n.t('templateStore.promptCopied'), description: i18n.t('templateStore.promptCopiedHint') }); }
            catch { toast({ title: i18n.t('templateStore.copyFailed'), description: i18n.t('templateStore.copyFailedHint'), variant: 'destructive' }); }
          }}>{t('templateStore.copyPrompt')}</Button>
        </div>}
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{t('templateStore.sharingRequirements')}</p>
        <DialogFooter><Button className="btn btn-secondary" onClick={() => setSubmitOpen(false)}>{t('templateStore.later')}</Button><a href="https://github.com/HappyQuQu/library-cover-store#%E6%8F%90%E4%BA%A4%E6%A8%A1%E6%9D%BF" target="_blank" rel="noreferrer" className="btn btn-primary">{t('templateStore.submitGitHub')}<ExternalLink size={16} /></a></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
