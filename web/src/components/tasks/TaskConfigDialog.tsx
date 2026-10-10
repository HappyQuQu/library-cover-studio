import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock, Film, Folder, Loader2, Palette, Search, Server, Tv, Zap, Eye, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useServers, useTemplates, useServerLibraries, useCreateTask, useUpdateTask } from '@/api';
import type { Task } from '@/api';
import { apiClient } from '@/api/client';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { toast } from '@/components/ui/use-toast';
import { buildSchedule, describeSchedule, parseLibraryConfigs, readSchedule, reconcileLibraries, SORT_OPTIONS, WEEKDAYS } from '@/lib/taskConfig';
import type { LibraryConfig, ScheduleConfig } from '@/lib/taskConfig';

const STEPS = ['选择媒体库', '配置封面', '设置时间', '预览确认'];
const errorMessage = (error: any) => typeof error?.response?.data?.error === 'string' ? error.response.data.error
  : error?.response?.data?.error?.message || error?.message || '操作失败，请重试';
const formatExecution = (value: string, timezone: string, includeSeconds = false) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: timezone, month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', second: includeSeconds ? '2-digit' : undefined, hourCycle: 'h23'
}).format(new Date(value));

export function TaskConfigDialog({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(task?.name || '');
  const [serverId, setServerId] = useState(task?.serverId || '');
  const [search, setSearch] = useState('');
  const [configError, setConfigError] = useState('');
  const [configs, setConfigs] = useState<LibraryConfig[]>(() => {
    try { return parseLibraryConfigs(task?.libraryConfigs); } catch { return []; }
  });
  const [expandedId, setExpandedId] = useState('');
  const [defaultTemplate, setDefaultTemplate] = useState('');
  const [defaultSort, setDefaultSort] = useState('DateCreated');
  const [type, setType] = useState<'manual' | 'scheduled'>(task?.type || 'manual');
  const [enabled, setEnabled] = useState(task ? !!task.isEnabled : true);
  const initialSchedule = readSchedule(task?.cronExpression);
  const [schedule, setSchedule] = useState<ScheduleConfig>(initialSchedule || readSchedule()!);
  const [advanced, setAdvanced] = useState(!initialSchedule);
  const [customCron, setCustomCron] = useState(task?.cronExpression || '0 4 * * *');
  const [previewLibrary, setPreviewLibrary] = useState('');
  const [coverPreview, setCoverPreview] = useState<{ key: string; image: string; note: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequest = useRef<AbortController | null>(null);
  const fieldsRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fieldsRef.current?.scrollTo({ top: 0 });
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const saving = createMutation.isPending || updateMutation.isPending;
  const serversQuery = useServers();
  const templatesQuery = useTemplates();
  const librariesQuery = useServerLibraries(serverId);
  const servers = serversQuery.data || [];
  const templates = templatesQuery.data || [];
  const selected = configs.filter(config => config.enabled);
  const visible = configs.filter(config => config.libraryName.toLowerCase().includes(search.toLowerCase()));
  const server = servers.find(item => item.id === serverId);
  const sortOptions = SORT_OPTIONS.filter(([value]) => server?.type !== 'emby' || value !== 'OfficialRating');
  const sortsValid = selected.every(config => sortOptions.some(([value]) => value === config.sortBy));
  const effectiveCron = advanced ? customCron.trim() : buildSchedule(schedule);
  const [debouncedCron, setDebouncedCron] = useState(type === 'scheduled' ? effectiveCron : '');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCron(type === 'scheduled' ? effectiveCron : ''), 350);
    return () => clearTimeout(timer);
  }, [effectiveCron, type]);
  const schedulerQuery = useQuery({ queryKey: ['scheduler-timezone'],
    queryFn: () => apiClient.post<{ timezone: string }>('/tasks/preview-schedule', {}).then(response => response.data), refetchOnMount: 'always', staleTime: 0 });
  const scheduleQuery = useQuery({ queryKey: ['schedule-preview', debouncedCron, schedulerQuery.data?.timezone],
    queryFn: ({ signal }) => apiClient.post<{ timezone: string; executions: string[] }>('/tasks/preview-schedule', { cronExpression: debouncedCron }, { signal }).then(response => response.data),
    enabled: type === 'scheduled' && !!debouncedCron, retry: false, staleTime: 0 });
  const timezone = scheduleQuery.data?.timezone || schedulerQuery.data?.timezone;
  const scheduleValid = type === 'manual' || (debouncedCron === effectiveCron && !!scheduleQuery.data?.executions.length && !scheduleQuery.isError && !scheduleQuery.isFetching);

  useEffect(() => {
    try { parseLibraryConfigs(task?.libraryConfigs); } catch { setConfigError('原任务的媒体库配置无法读取，请重新选择媒体库'); }
  }, [task]);
  useEffect(() => { if (!defaultTemplate && templates[0]) setDefaultTemplate(templates[0].id); }, [templates, defaultTemplate]);
  useEffect(() => {
    if (!librariesQuery.data?.length) return;
    setConfigs(previous => reconcileLibraries(previous, librariesQuery.data!, defaultTemplate).map(config => ({
      ...config, templateId: config.templateId || defaultTemplate
    })));
  }, [librariesQuery.data, defaultTemplate]);
  useEffect(() => {
    if (!selected.some(config => config.libraryId === previewLibrary)) setPreviewLibrary(selected[0]?.libraryId || '');
  }, [configs, previewLibrary]);
  useEffect(() => () => { previewRequest.current?.abort(); }, []);

  const previewConfig = selected.find(config => config.libraryId === previewLibrary) || selected[0];
  const previewTemplate = templates.find(template => template.id === previewConfig?.templateId);
  const previewKey = JSON.stringify([serverId, previewConfig, previewTemplate?.updatedAt]);
  const previewImage = coverPreview?.key === previewKey ? coverPreview.image : null;
  useEffect(() => { previewRequest.current?.abort(); setPreviewLoading(false); setPreviewError(''); }, [previewKey]);
  const previewNote = coverPreview?.key === previewKey ? coverPreview.note : '';
  const missingLibraries = selected.some(config => !librariesQuery.data?.some(library => library.id === config.libraryId));
  const libraryValid = !!name.trim() && !!serverId && selected.length > 0 && !librariesQuery.isFetching && !librariesQuery.isError && !missingLibraries;
  const templatesValid = selected.every(config => templates.some(template => template.id === config.templateId));
  const errors = useMemo(() => {
    if (!name.trim()) return '请填写任务名称';
    if (!serverId) return '请选择媒体服务器';
    if (librariesQuery.isFetching) return '正在读取媒体库，请稍候';
    if (librariesQuery.isError) return '媒体库读取失败，请重试';
    if (!selected.length) return '请至少选择一个媒体库';
    if (missingLibraries) return '部分媒体库无法读取，请刷新或重新选择';
    if (step > 0 && !sortsValid) return '此服务器不支持当前排序方式，请重新选择素材排序';
    if (step > 0 && !templatesValid) return '请为每个已选媒体库选择有效模板';
    if (step > 1 && !scheduleValid) return '请先检查执行计划，等待执行时间校验完成';
    return '';
  }, [name, serverId, librariesQuery.isFetching, librariesQuery.isError, selected.length, missingLibraries, templatesValid, sortsValid, step, scheduleValid]);
  const updateConfig = (id: string, updates: Partial<LibraryConfig>) => setConfigs(previous => previous.map(config => config.libraryId === id ? { ...config, ...updates } : config));

  const generatePreview = async () => {
    if (!previewConfig || !previewTemplate) return;
    const controller = new AbortController(); previewRequest.current?.abort(); previewRequest.current = controller;
    setPreviewError(''); setPreviewLoading(true);
    try {
      const response = await apiClient.post<{ image: string; note: string }>('/tasks/preview-cover', { serverId, ...previewConfig }, { signal: controller.signal });
      if (!controller.signal.aborted) setCoverPreview({ key: previewKey, ...response.data });
    } catch (error) { if (!controller.signal.aborted) setPreviewError(errorMessage(error)); }
    finally { if (previewRequest.current === controller) { setPreviewLoading(false); previewRequest.current = null; } }
  };
  const save = async () => {
    if (saving) return;
    if (!libraryValid || !templatesValid || !sortsValid || !scheduleValid) { setConfigError(errors || '请检查任务配置'); return; }
    try {
      const payload = { name: name.trim(), serverId, type, cronExpression: type === 'scheduled' ? effectiveCron : undefined,
        libraryConfigs: JSON.stringify(configs), isEnabled: type === 'scheduled' && enabled };
      if (task) await updateMutation.mutateAsync({ id: task.id, ...payload });
      else await createMutation.mutateAsync(payload);
      toast({ title: task ? '任务已更新' : '任务已创建', description: type === 'scheduled' && enabled ? '将按计划执行' : '任务已保存，可手动运行' });
      onClose();
    } catch (error) { setConfigError(errorMessage(error)); }
  };
  const goNext = () => {
    if (errors) { setConfigError(errors); return; }
    setConfigError(''); setStep(Math.min(3, step + 1));
  };

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="task-config-dialog" style={{ maxWidth: 1080, width: 'calc(100vw - 32px)', height: 'min(820px, 90dvh)', padding: 0, overflow: 'hidden' }}>
      <div className="task-config-header"><div className="task-header-icon"><Zap size={22} /></div><div>
        <DialogTitle>{task ? '编辑自动化任务' : '创建自动化任务'}</DialogTitle>
        <DialogDescription>每个媒体库生成一张封面，先配置和预览，再按计划更新。</DialogDescription>
      </div></div>
      <nav className="task-steps" aria-label="任务配置步骤">{STEPS.map((label, index) => <button type="button" key={label}
        className={index === step ? 'current' : index < step ? 'completed' : ''} aria-current={index === step ? 'step' : undefined}
        disabled={index > step || saving} onClick={() => { setStep(index); setConfigError(''); }}>
        <span>{index < step ? <Check size={13} /> : index + 1}</span><strong>{label}</strong></button>)}</nav>
      <div className="task-config-body" ref={bodyRef}>
        <main className="task-config-fields" ref={fieldsRef}>
          {step === 0 && <>
            <div className="task-section-heading"><Server size={18} /><div><h3>选择更新范围</h3><p>选择服务器及需要更新封面的媒体库。</p></div></div>
            <label className="studio-field">任务名称<input className="studio-input" value={name} maxLength={100} placeholder="例如：每周电影库封面更新" onChange={event => setName(event.target.value)} /></label>
            <label className="studio-field">媒体服务器<select className="studio-input" value={serverId} onChange={event => {
              setServerId(event.target.value); setConfigs([]); setSearch(''); setConfigError(''); setCoverPreview(null);
            }}><option value="">选择媒体服务器</option>{servers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.type === 'jellyfin' ? 'Jellyfin' : 'Emby'}</option>)}</select></label>
            {serversQuery.isLoading && <p className="studio-muted" role="status">正在读取服务器…</p>}
            {serversQuery.isError && <p role="alert">服务器加载失败 <button type="button" className="studio-secondary" onClick={() => void serversQuery.refetch()}>重试</button></p>}
            {!serversQuery.isLoading && !servers.length && <Link to="/servers" className="studio-secondary">先添加媒体服务器<ArrowRight size={14} /></Link>}
            {serverId && <>
              <div className="task-library-toolbar"><label className="studio-search"><Search size={15} /><input aria-label="搜索媒体库" placeholder="搜索媒体库名称" value={search} onChange={event => setSearch(event.target.value)} /></label>
                <button type="button" className="studio-secondary" disabled={!visible.length} onClick={() => {
                  const allSelected = visible.every(config => config.enabled);
                  setConfigs(previous => previous.map(config => visible.some(item => item.libraryId === config.libraryId) ? { ...config, enabled: !allSelected } : config));
                }}>{visible.length && visible.every(config => config.enabled) ? '取消全选' : '全选当前结果'}</button></div>
              <div className="task-selection-count">已选 {selected.length} / {configs.length} 个媒体库</div>
              {librariesQuery.isFetching ? <div className="studio-empty"><Loader2 className="animate-spin" size={22} />正在读取媒体库</div>
                : librariesQuery.isError ? <div className="studio-empty" role="alert">读取失败<button className="studio-secondary" onClick={() => void librariesQuery.refetch()}>重新读取</button></div>
                : !librariesQuery.data?.length ? <div className="studio-empty">未读取到媒体库，请检查服务器连接或库配置<button className="studio-secondary" onClick={() => void librariesQuery.refetch()}>刷新媒体库</button></div>
                : !visible.length ? <div className="studio-empty">没有匹配的媒体库</div>
                : <div className="task-library-list">{visible.map(config => { const Icon = config.libraryType === 'movies' ? Film : config.libraryType === 'tvshows' ? Tv : Folder;
                  return <label key={config.libraryId} className={`task-library-choice ${config.enabled ? 'selected' : ''}`}>
                    <input type="checkbox" checked={config.enabled} onChange={event => updateConfig(config.libraryId, { enabled: event.target.checked })} /><Icon size={19} />
                    <span><strong>{config.libraryName}</strong><small>{config.libraryType === 'movies' ? '电影' : config.libraryType === 'tvshows' ? '电视剧' : '媒体库'}</small></span>
                    <small>1 张封面</small></label>;
                })}</div>}
            </>}
          </>}
          {step === 1 && <>
            <div className="task-section-heading"><Palette size={18} /><div><h3>为媒体库配置封面</h3><p>先统一设置，再按需调整单个媒体库。</p></div></div>
            <div className="task-batch-settings"><span className="studio-label">批量设置 · {selected.length} 个媒体库</span>
              <div className="studio-field-row"><label className="studio-field">统一模板<select className="studio-input" value={defaultTemplate} onChange={event => setDefaultTemplate(event.target.value)}>
                <option value="">选择模板</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                <label className="studio-field">素材排序<select className="studio-input" value={defaultSort} onChange={event => setDefaultSort(event.target.value)}>{sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
              <button type="button" className="studio-secondary" disabled={!defaultTemplate} onClick={() => setConfigs(previous => previous.map(config => config.enabled ? { ...config, templateId: defaultTemplate, sortBy: defaultSort } : config))}>应用到所有已选媒体库<Check size={14} /></button>
            </div>
            {templatesQuery.isError && <div role="alert">模板加载失败<button className="studio-secondary" onClick={() => void templatesQuery.refetch()}>重试</button></div>}
            {!templates.length && !templatesQuery.isLoading && <Link to="/templates" className="studio-secondary">先创建封面模板<ArrowRight size={14} /></Link>}
            <div className="task-library-list">{selected.map(config => <div key={config.libraryId} className="task-library-config">
              <button type="button" className="task-library-summary" aria-expanded={expandedId === config.libraryId} onClick={() => { setExpandedId(expandedId === config.libraryId ? '' : config.libraryId); setPreviewLibrary(config.libraryId); }}>
                <Folder size={17} /><span><strong>{config.libraryName}</strong><small>{templates.find(template => template.id === config.templateId)?.name || '请选择模板'} · {SORT_OPTIONS.find(([value]) => value === config.sortBy)?.[1] || config.sortBy}</small></span><ChevronDown size={16} /></button>
              {expandedId === config.libraryId && <div className="task-library-details">
                <label className="studio-field">封面模板<select className="studio-input" value={config.templateId} onChange={event => updateConfig(config.libraryId, { templateId: event.target.value })}>
                  <option value="">选择模板</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                <div className="studio-field-row"><label className="studio-field">主标题<input className="studio-input" maxLength={200} value={config.primaryTitle} placeholder={config.libraryName} onChange={event => updateConfig(config.libraryId, { primaryTitle: event.target.value })} /></label>
                  <label className="studio-field">副标题（选填）<input className="studio-input" maxLength={200} value={config.secondaryTitle} placeholder="例如：精选佳作" onChange={event => updateConfig(config.libraryId, { secondaryTitle: event.target.value })} /></label></div>
                <label className="studio-field">素材排序<select className="studio-input" value={config.sortBy} onChange={event => updateConfig(config.libraryId, { sortBy: event.target.value })}>{!sortOptions.some(([value]) => value === config.sortBy) && <option value={config.sortBy}>不支持：{config.sortBy}</option>}{sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>}
            </div>)}</div>
          </>}
          {step === 2 && <>
            <div className="task-section-heading"><Clock size={18} /><div><h3>设置执行时间</h3><p>时间以服务器调度时区为准。</p></div></div>
            <div className="segmented task-trigger-mode">{(['manual', 'scheduled'] as const).map(value => <button type="button" key={value} aria-pressed={type === value}
              onClick={() => { setType(value); setConfigError(''); }}>{value === 'manual' ? '手动运行' : '按计划运行'}</button>)}</div>
            {type === 'manual' ? <div className="task-schedule-info"><Zap size={20} /><strong>保存后由你手动触发</strong><p>创建任务不会立即更新封面。需要时在任务列表点击运行。</p></div> : <>
              <div className="task-schedule-presets">{[['每天凌晨', '0 4 * * *'], ['每周一', '0 4 * * 1'], ['每月 1 日', '0 4 1 * *']] .map(([label, expression]) =>
                <button type="button" key={expression} aria-pressed={effectiveCron === expression} onClick={() => { setSchedule(readSchedule(expression)!); setAdvanced(false); setCustomCron(expression); }}>{label}<small>04:00</small></button>)}</div>
              {!advanced && <>
                <div className="studio-field-row"><label className="studio-field">执行频率<select className="studio-input" value={schedule.frequency} onChange={event => setSchedule({ ...schedule, frequency: event.target.value as ScheduleConfig['frequency'] })}>
                  <option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option><option value="hourly">每小时</option></select></label>
                  <label className="studio-field">{schedule.frequency === 'hourly' ? '在第几分钟执行' : '执行时间'}{schedule.frequency === 'hourly'
                    ? <input className="studio-input" type="number" min={0} max={59} value={Number(schedule.time.split(':')[1])} onChange={event => setSchedule({ ...schedule, time: `04:${event.target.value.padStart(2, '0')}` })} />
                    : <input className="studio-input" type="time" required value={schedule.time} onChange={event => setSchedule({ ...schedule, time: event.target.value })} />}</label></div>
                {schedule.frequency === 'weekly' && <label className="studio-field">星期<select className="studio-input" value={schedule.weekday} onChange={event => setSchedule({ ...schedule, weekday: event.target.value })}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
                {schedule.frequency === 'monthly' && <label className="studio-field">日期<select className="studio-input" value={schedule.day} onChange={event => setSchedule({ ...schedule, day: event.target.value })}>{Array.from({ length: 31 }, (_, index) => <option key={index} value={index + 1}>每月 {index + 1} 日</option>)}</select><small>当月没有该日期时不执行。</small></label>}
              </>}
              <label className="task-advanced-toggle"><input type="checkbox" checked={advanced} onChange={event => {
                if (event.target.checked) setCustomCron(buildSchedule(schedule));
                else { const parsed = readSchedule(customCron); if (!parsed) { setConfigError('此表达式无法转换为简易设置，请选择一个时间预设'); return; } setSchedule(parsed); }
                setAdvanced(event.target.checked); setConfigError('');
              }} />高级设置：自定义 Cron</label>
              {advanced && <label className="studio-field">Cron 表达式<input className="studio-input cron-input" value={customCron} placeholder="分 时 日 月 周，例如 0 4 * * 1" onChange={event => setCustomCron(event.target.value)} /><small>支持 5 或 6 个字段，日期与星期同时填写时须同时满足。</small></label>}
              <div className="task-executions"><div><Clock size={15} /><strong>{describeSchedule(effectiveCron)}</strong><span>{timezone || '正在读取时区'}</span></div>
                <p className="studio-muted">未来 3 次执行时间</p>
                {debouncedCron !== effectiveCron || scheduleQuery.isFetching ? <p role="status">正在校验执行计划…</p>
                  : scheduleQuery.isError ? <p className="studio-error" role="alert">{errorMessage(scheduleQuery.error)}</p>
                  : scheduleQuery.data?.executions.map((date, index) => <p key={date}><span>{index + 1}</span>{formatExecution(date, scheduleQuery.data.timezone, effectiveCron.split(/\s+/).length === 6)}</p>)}
              </div>
              <label className="task-advanced-toggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />保存后启用此计划</label>
            </>}
          </>}
          {step === 3 && <>
            <div className="task-section-heading"><Check size={18} /><div><h3>确认更新计划</h3><p>检查配置并生成真实样张，保存后按你的设置执行。</p></div></div>
            <div className="task-review"><dl><div><dt>任务名称</dt><dd>{name}</dd></div><div><dt>媒体服务器</dt><dd>{server?.name}</dd></div>
              <div><dt>更新范围</dt><dd>{selected.length} 个媒体库 · {selected.length} 张封面</dd></div>
              <div><dt>执行方式</dt><dd>{type === 'manual' ? '手动运行' : `${describeSchedule(effectiveCron)} · ${enabled ? '保存后启用' : '保持暂停'}`}</dd></div>
              {type === 'scheduled' && timezone && <div><dt>调度时区</dt><dd>{timezone}</dd></div>}
              {type === 'scheduled' && enabled && scheduleQuery.data?.executions[0] && <div><dt>下次执行</dt><dd>{formatExecution(scheduleQuery.data.executions[0], scheduleQuery.data.timezone, effectiveCron.split(/\s+/).length === 6)}</dd></div>}</dl></div>
            <div className="task-library-list">{selected.map(config => <div className="task-review-library" key={config.libraryId}><Folder size={16} /><strong>{config.libraryName}</strong><span>{templates.find(template => template.id === config.templateId)?.name}</span></div>)}</div>
            <div className="task-review-note"><AlertCircle size={16} /><p>执行时会替换所选媒体库的封面。样张只用于预览，保存任务也不会立即上传。</p></div>
          </>}
        </main>
        <aside className="task-preview-sidebar"><div className="task-preview-title"><Eye size={17} /><strong>封面预览</strong><span>样张</span></div>
          <label className="studio-field">预览媒体库<select className="studio-input" value={previewConfig?.libraryId || ''} disabled={!selected.length} onChange={event => setPreviewLibrary(event.target.value)}>
            {!selected.length && <option value="">先选择媒体库</option>}{selected.map(config => <option key={config.libraryId} value={config.libraryId}>{config.libraryName}</option>)}</select></label>
          <div className="task-cover-preview" style={{ aspectRatio: previewTemplate ? `${previewTemplate.width} / ${previewTemplate.height}` : '16 / 9' }}>{previewImage ? <img src={previewImage} alt={`${previewConfig?.libraryName} 的真实封面样张`} />
            : previewTemplate?.thumbnailPath ? <AuthenticatedImage src={`/templates/${previewTemplate.id}/thumbnail`} refreshKey={previewTemplate.updatedAt}
                alt="模板示例，尚未生成真实样张" fallback={<div className="preview-placeholder"><Palette size={30} /><span>模板示例暂不可用，可点击下方按钮生成真实样张</span></div>} />
              : <div className="preview-placeholder"><Palette size={30} /><span>{previewTemplate ? '点击下方按钮生成封面样张' : selected.length ? '选择模板后查看封面' : '选择媒体库开始配置'}</span></div>}</div>
          <p className="studio-muted">{previewImage ? previewNote : previewTemplate?.thumbnailPath ? '当前为模板示例，点击下方按钮生成真实媒体库样张。' : '选好媒体库和模板后，可生成真实样张。'}</p>
          <button type="button" className="studio-secondary task-preview-button" disabled={!previewTemplate || !previewConfig || previewLoading || librariesQuery.isFetching || missingLibraries} onClick={() => void generatePreview()}>
            {previewLoading ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}{previewLoading ? '正在生成样张…' : previewImage ? '重新生成真实样张' : '生成真实样张'}</button>
          {previewError && <p className="studio-error" role="alert">{previewError}</p>}
          <div className="task-preview-meta"><span>{previewTemplate?.name || '尚未选择模板'}</span><span>{previewTemplate ? `${previewTemplate.width} × ${previewTemplate.height}` : '封面尺寸'}</span></div>
          <p className="task-preview-hint">样张会读取所选媒体库的真实海报，不上传或修改媒体服务器。</p>
        </aside>
      </div>
      <footer className="task-config-footer"><div>{configError ? <p className="studio-error" role="alert">{configError}</p> : <span>第 {step + 1} 步，共 4 步</span>}</div>
        <div><button type="button" className="studio-secondary" disabled={saving} onClick={() => step ? setStep(step - 1) : onClose()}>{step ? <ArrowLeft size={14} /> : null}{step ? '上一步' : '取消'}</button>
          {step < 3 ? <button type="button" className="studio-primary" onClick={goNext} disabled={saving}>下一步<ArrowRight size={14} /></button>
            : <button type="button" className="studio-primary" disabled={saving || !libraryValid || !templatesValid || !sortsValid || !scheduleValid} onClick={() => void save()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{saving ? '正在保存…' : task ? '保存修改' : '创建任务'}</button>}</div>
      </footer>
    </DialogContent>
  </Dialog>;
}
