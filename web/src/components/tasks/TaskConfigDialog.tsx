import { displayMessage, type DisplayMessage } from '@/lib/displayMessage';
import { getLocalizedApiError } from '@/lib/apiError';
import { formatDisplayDate } from '@/lib/displayFormat';
import { getPreviewNote, getPreviewNoteDetails, type CoverPreview } from '@/lib/coverPreview';
import { useTranslation } from 'react-i18next';
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
import { LanguageSelect } from '@/components/LanguageSelect';
import { ErrorDetails } from '@/components/ErrorDetails';

const STEPS = ['taskWizard.stepLibraries', 'taskWizard.stepCovers', 'taskWizard.stepSchedule', 'taskWizard.stepReview'] as const;

export function TaskConfigDialog({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const formatExecution = (value: string, timezone: string, includeSeconds = false) => formatDisplayDate(value, i18n.language, {
    timeZone: timezone, month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', second: includeSeconds ? '2-digit' : undefined, hourCycle: 'h23'
  }) || t('common.unknownTime');
  const [step, setStep] = useState(0);
  const [name, setName] = useState(task?.name || '');
  const [serverId, setServerId] = useState(task?.serverId || '');
  const [search, setSearch] = useState('');
  const [configError, setConfigError] = useState<DisplayMessage | null>(null);
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
  const [coverPreview, setCoverPreview] = useState<(CoverPreview & { key: string }) | null>(null);
  const [previewError, setPreviewError] = useState<DisplayMessage | null>(null);
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
  const sortLabel = (value: string) => { const option = SORT_OPTIONS.find(item => item[0] === value); return option ? t(option[1]) : value; };
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
    try { parseLibraryConfigs(task?.libraryConfigs); } catch { setConfigError({ key: 'taskWizard.invalidOriginal' }); }
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
  useEffect(() => { previewRequest.current?.abort(); setPreviewLoading(false); setPreviewError(null); }, [previewKey]);
  const previewNote = coverPreview?.key === previewKey ? getPreviewNote(coverPreview) : '';
  const missingLibraries = selected.some(config => !librariesQuery.data?.some(library => library.id === config.libraryId));
  const libraryValid = !!name.trim() && !!serverId && selected.length > 0 && !librariesQuery.isFetching && !librariesQuery.isError && !missingLibraries;
  const templatesValid = selected.every(config => templates.some(template => template.id === config.templateId));
  const errors = useMemo<DisplayMessage | null>(() => {
    if (!name.trim()) return { key: 'taskWizard.nameRequired' };
    if (!serverId) return { key: 'taskWizard.serverRequired' };
    if (librariesQuery.isFetching) return { key: 'taskWizard.librariesLoading' };
    if (librariesQuery.isError) return { key: 'taskWizard.librariesFailed' };
    if (!selected.length) return { key: 'taskWizard.libraryRequired' };
    if (missingLibraries) return { key: 'taskWizard.librariesMissing' };
    if (step > 0 && !sortsValid) return { key: 'taskWizard.sortInvalid' };
    if (step > 0 && !templatesValid) return { key: 'taskWizard.templateRequired' };
    if (step > 1 && !scheduleValid) return { key: 'taskWizard.schedulePending' };
    return null;
  }, [name, serverId, librariesQuery.isFetching, librariesQuery.isError, selected.length, missingLibraries, templatesValid, sortsValid, step, scheduleValid]);
  const updateConfig = (id: string, updates: Partial<LibraryConfig>) => setConfigs(previous => previous.map(config => config.libraryId === id ? { ...config, ...updates } : config));

  const generatePreview = async () => {
    if (!previewConfig || !previewTemplate) return;
    const controller = new AbortController(); previewRequest.current?.abort(); previewRequest.current = controller;
    setPreviewError(null); setPreviewLoading(true);
    try {
      const response = await apiClient.post<CoverPreview>('/tasks/preview-cover', { serverId, ...previewConfig }, { signal: controller.signal });
      if (!controller.signal.aborted) setCoverPreview({ key: previewKey, ...response.data });
    } catch (error) { if (!controller.signal.aborted) setPreviewError({ error }); }
    finally { if (previewRequest.current === controller) { setPreviewLoading(false); previewRequest.current = null; } }
  };
  const save = async () => {
    if (saving) return;
    if (!libraryValid || !templatesValid || !sortsValid || !scheduleValid) { setConfigError(errors || { key: 'taskWizard.checkConfig' }); return; }
    try {
      const payload = { name: name.trim(), serverId, type, cronExpression: type === 'scheduled' ? effectiveCron : undefined,
        libraryConfigs: JSON.stringify(configs), isEnabled: type === 'scheduled' && enabled };
      if (task) await updateMutation.mutateAsync({ id: task.id, ...payload });
      else await createMutation.mutateAsync(payload);
      toast({ title: task ? i18n.t('taskWizard.updated') : i18n.t('taskWizard.created'), description: type === 'scheduled' && enabled ? i18n.t('taskWizard.willRun') : i18n.t('taskWizard.savedManual') });
      onClose();
    } catch (error) { setConfigError({ error }); }
  };
  const goNext = () => {
    if (errors) { setConfigError(errors); return; }
    setConfigError(null); setStep(Math.min(3, step + 1));
  };

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="task-config-dialog" style={{ maxWidth: 1080, width: 'calc(100vw - 32px)', height: 'min(820px, 90dvh)', padding: 0, overflow: 'hidden' }}>
      <div className="task-config-header"><div className="task-header-icon"><Zap size={22} /></div><div>
        <DialogTitle>{task ? t('taskWizard.editTitle') : t('taskWizard.createTitle')}</DialogTitle>
        <DialogDescription>{t('taskWizard.hint')}</DialogDescription>
      </div></div>
      <div className="task-language-control"><LanguageSelect compact /></div>
      <nav className="task-steps" aria-label={t('taskWizard.steps')}>{STEPS.map((label, index) => <button type="button" key={index}
        className={index === step ? 'current' : index < step ? 'completed' : ''} aria-current={index === step ? 'step' : undefined}
        disabled={index > step || saving} onClick={() => { setStep(index); setConfigError(null); }}>
        <span>{index < step ? <Check size={13} /> : index + 1}</span><strong>{t(label)}</strong></button>)}</nav>
      <div className="task-config-body" ref={bodyRef}>
        <main className="task-config-fields" ref={fieldsRef}>
          {step === 0 && <>
            <div className="task-section-heading"><Server size={18} /><div><h3>{t('taskWizard.scopeTitle')}</h3><p>{t('taskWizard.scopeHint')}</p></div></div>
            <label className="studio-field">{t('taskWizard.name')}<input className="studio-input" value={name} maxLength={100} placeholder={t('taskWizard.namePlaceholder')} onChange={event => setName(event.target.value)} /></label>
            <label className="studio-field">{t('taskWizard.server')}<select className="studio-input" value={serverId} onChange={event => {
              setServerId(event.target.value); setConfigs([]); setSearch(''); setConfigError(null); setCoverPreview(null);
            }}><option value="">{t('taskWizard.selectServer')}</option>{servers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.type === 'jellyfin' ? 'Jellyfin' : 'Emby'}</option>)}</select></label>
            {serversQuery.isLoading && <p className="studio-muted" role="status">{t('taskWizard.serversLoading')}</p>}
            {serversQuery.isError && <p role="alert">{t('taskWizard.serversFailed')} <button type="button" className="studio-secondary" onClick={() => void serversQuery.refetch()}>{t('common.retry')}</button></p>}
            {!serversQuery.isLoading && !servers.length && <Link to="/servers" className="studio-secondary">{t('taskWizard.addServer')}<ArrowRight size={14} /></Link>}
            {serverId && <>
              <div className="task-library-toolbar"><label className="studio-search"><Search size={15} /><input aria-label={t('taskWizard.searchLibraries')} placeholder={t('taskWizard.searchPlaceholder')} value={search} onChange={event => setSearch(event.target.value)} /></label>
                <button type="button" className="studio-secondary" disabled={!visible.length} onClick={() => {
                  const allSelected = visible.every(config => config.enabled);
                  setConfigs(previous => previous.map(config => visible.some(item => item.libraryId === config.libraryId) ? { ...config, enabled: !allSelected } : config));
                }}>{visible.length && visible.every(config => config.enabled) ? t('taskWizard.clearSelection') : t('taskWizard.selectResults')}</button></div>
              <div className="task-selection-count">{t('taskWizard.selectionCount', { count: selected.length, total: configs.length })}</div>
              {librariesQuery.isFetching ? <div className="studio-empty"><Loader2 className="animate-spin" size={22} />{t('taskWizard.readingLibraries')}</div>
                : librariesQuery.isError ? <div className="studio-empty" role="alert">{t('taskWizard.readFailed')}<button className="studio-secondary" onClick={() => void librariesQuery.refetch()}>{t('taskWizard.reload')}</button></div>
                : !librariesQuery.data?.length ? <div className="studio-empty">{t('taskWizard.noLibraries')}<button className="studio-secondary" onClick={() => void librariesQuery.refetch()}>{t('taskWizard.refreshLibraries')}</button></div>
                : !visible.length ? <div className="studio-empty">{t('taskWizard.noMatches')}</div>
                : <div className="task-library-list">{visible.map(config => { const Icon = config.libraryType === 'movies' ? Film : config.libraryType === 'tvshows' ? Tv : Folder;
                  return <label key={config.libraryId} className={`task-library-choice ${config.enabled ? 'selected' : ''}`}>
                    <input type="checkbox" checked={config.enabled} onChange={event => updateConfig(config.libraryId, { enabled: event.target.checked })} /><Icon size={19} />
                    <span><strong>{config.libraryName}</strong><small>{config.libraryType === 'movies' ? t('taskWizard.movies') : config.libraryType === 'tvshows' ? t('taskWizard.series') : t('taskWizard.library')}</small></span>
                    <small>{t('taskWizard.oneCover')}</small></label>;
                })}</div>}
            </>}
          </>}
          {step === 1 && <>
            <div className="task-section-heading"><Palette size={18} /><div><h3>{t('taskWizard.coversTitle')}</h3><p>{t('taskWizard.coversHint')}</p></div></div>
            <div className="task-batch-settings"><span className="studio-label">{t('taskWizard.batchCount', { count: selected.length })}</span>
              <div className="studio-field-row"><label className="studio-field">{t('taskWizard.sharedTemplate')}<select className="studio-input" value={defaultTemplate} onChange={event => setDefaultTemplate(event.target.value)}>
                <option value="">{t('taskWizard.selectTemplate')}</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                <label className="studio-field">{t('taskWizard.sort')}<select className="studio-input" value={defaultSort} onChange={event => setDefaultSort(event.target.value)}>{sortOptions.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label></div>
              <button type="button" className="studio-secondary" disabled={!defaultTemplate} onClick={() => setConfigs(previous => previous.map(config => config.enabled ? { ...config, templateId: defaultTemplate, sortBy: defaultSort } : config))}>{t('taskWizard.applyAll')}<Check size={14} /></button>
            </div>
            {templatesQuery.isError && <div role="alert">{t('taskWizard.templatesFailed')}<button className="studio-secondary" onClick={() => void templatesQuery.refetch()}>{t('common.retry')}</button></div>}
            {!templates.length && !templatesQuery.isLoading && <Link to="/templates" className="studio-secondary">{t('taskWizard.createTemplate')}<ArrowRight size={14} /></Link>}
            <div className="task-library-list">{selected.map(config => <div key={config.libraryId} className="task-library-config">
              <button type="button" className="task-library-summary" aria-expanded={expandedId === config.libraryId} onClick={() => { setExpandedId(expandedId === config.libraryId ? '' : config.libraryId); setPreviewLibrary(config.libraryId); }}>
                <Folder size={17} /><span><strong>{config.libraryName}</strong><small>{templates.find(template => template.id === config.templateId)?.name || t('taskWizard.pleaseSelectTemplate')} · {sortLabel(config.sortBy)}</small></span><ChevronDown size={16} /></button>
              {expandedId === config.libraryId && <div className="task-library-details">
                <label className="studio-field">{t('taskWizard.coverTemplate')}<select className="studio-input" value={config.templateId} onChange={event => updateConfig(config.libraryId, { templateId: event.target.value })}>
                  <option value="">{t('taskWizard.selectTemplate')}</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                <div className="studio-field-row"><label className="studio-field">{t('taskWizard.primaryTitle')}<input className="studio-input" maxLength={200} value={config.primaryTitle} placeholder={config.libraryName} onChange={event => updateConfig(config.libraryId, { primaryTitle: event.target.value })} /></label>
                  <label className="studio-field">{t('taskWizard.secondaryTitle')}<input className="studio-input" maxLength={200} value={config.secondaryTitle} placeholder={t('taskWizard.secondaryPlaceholder')} onChange={event => updateConfig(config.libraryId, { secondaryTitle: event.target.value })} /></label></div>
                <label className="studio-field">{t('taskWizard.sort')}<select className="studio-input" value={config.sortBy} onChange={event => updateConfig(config.libraryId, { sortBy: event.target.value })}>{!sortOptions.some(([value]) => value === config.sortBy) && <option value={config.sortBy}>{t('taskWizard.unsupportedSort', { value: config.sortBy })}</option>}{sortOptions.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
              </div>}
            </div>)}</div>
          </>}
          {step === 2 && <>
            <div className="task-section-heading"><Clock size={18} /><div><h3>{t('taskWizard.scheduleTitle')}</h3><p>{t('taskWizard.scheduleHint')}</p></div></div>
            <div className="segmented task-trigger-mode">{(['manual', 'scheduled'] as const).map(value => <button type="button" key={value} aria-pressed={type === value}
              onClick={() => { setType(value); setConfigError(null); }}>{value === 'manual' ? t('taskWizard.manual') : t('taskWizard.scheduled')}</button>)}</div>
            {type === 'manual' ? <div className="task-schedule-info"><Zap size={20} /><strong>{t('taskWizard.manualTitle')}</strong><p>{t('taskWizard.manualHint')}</p></div> : <>
              <div className="task-schedule-presets">{[[t('taskWizard.presetDaily'), '0 4 * * *'], [t('taskWizard.presetWeekly'), '0 4 * * 1'], [t('taskWizard.presetMonthly'), '0 4 1 * *']] .map(([label, expression]) =>
                <button type="button" key={expression} aria-pressed={effectiveCron === expression} onClick={() => { setSchedule(readSchedule(expression)!); setAdvanced(false); setCustomCron(expression); }}>{label}<small>04:00</small></button>)}</div>
              {!advanced && <>
                <div className="studio-field-row"><label className="studio-field">{t('taskWizard.frequency')}<select className="studio-input" value={schedule.frequency} onChange={event => setSchedule({ ...schedule, frequency: event.target.value as ScheduleConfig['frequency'] })}>
                  <option value="daily">{t('taskWizard.daily')}</option><option value="weekly">{t('taskWizard.weekly')}</option><option value="monthly">{t('taskWizard.monthly')}</option><option value="hourly">{t('taskWizard.hourly')}</option></select></label>
                  <label className="studio-field">{schedule.frequency === 'hourly' ? t('taskWizard.minute') : t('taskWizard.time')}{schedule.frequency === 'hourly'
                    ? <input className="studio-input" type="number" min={0} max={59} value={Number(schedule.time.split(':')[1])} onChange={event => setSchedule({ ...schedule, time: `04:${event.target.value.padStart(2, '0')}` })} />
                    : <input className="studio-input" type="time" required value={schedule.time} onChange={event => setSchedule({ ...schedule, time: event.target.value })} />}</label></div>
                {schedule.frequency === 'weekly' && <label className="studio-field">{t('taskWizard.weekday')}<select className="studio-input" value={schedule.weekday} onChange={event => setSchedule({ ...schedule, weekday: event.target.value })}>{WEEKDAYS.map((day, index) => <option key={index} value={index}>{t(day)}</option>)}</select></label>}
                {schedule.frequency === 'monthly' && <label className="studio-field">{t('taskWizard.day')}<select className="studio-input" value={schedule.day} onChange={event => setSchedule({ ...schedule, day: event.target.value })}>{Array.from({ length: 31 }, (_, index) => <option key={index} value={index + 1}>{t('taskWizard.monthlyDay', { day: index + 1 })}</option>)}</select><small>{t('taskWizard.missingDayHint')}</small></label>}
              </>}
              <label className="task-advanced-toggle"><input type="checkbox" checked={advanced} onChange={event => {
                if (event.target.checked) setCustomCron(buildSchedule(schedule));
                else { const parsed = readSchedule(customCron); if (!parsed) { setConfigError({ key: 'taskWizard.cannotSimplify' }); return; } setSchedule(parsed); }
                setAdvanced(event.target.checked); setConfigError(null);
              }} />{t('taskWizard.advanced')}</label>
              {advanced && <label className="studio-field">{t('taskWizard.cron')}<input className="studio-input cron-input" value={customCron} placeholder={t('taskWizard.cronPlaceholder')} onChange={event => setCustomCron(event.target.value)} /><small>{t('taskWizard.cronHint')}</small></label>}
              <div className="task-executions"><div><Clock size={15} /><strong>{describeSchedule(effectiveCron)}</strong><span>{timezone || t('taskWizard.timezoneLoading')}</span></div>
                <p className="studio-muted">{t('taskWizard.nextThree')}</p>
                {debouncedCron !== effectiveCron || scheduleQuery.isFetching ? <p role="status">{t('taskWizard.validating')}</p>
                  : scheduleQuery.isError ? <div role="alert"><p className="studio-error">{getLocalizedApiError(scheduleQuery.error)}</p><ErrorDetails error={scheduleQuery.error} /></div>
                  : scheduleQuery.data?.executions.map((date, index) => <p key={date}><span>{index + 1}</span>{formatExecution(date, scheduleQuery.data.timezone, effectiveCron.split(/\s+/).length === 6)}</p>)}
              </div>
              <label className="task-advanced-toggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />{t('taskWizard.enableAfterSave')}</label>
            </>}
          </>}
          {step === 3 && <>
            <div className="task-section-heading"><Check size={18} /><div><h3>{t('taskWizard.reviewTitle')}</h3><p>{t('taskWizard.reviewHint')}</p></div></div>
            <div className="task-review"><dl><div><dt>{t('taskWizard.name')}</dt><dd>{name}</dd></div><div><dt>{t('taskWizard.server')}</dt><dd>{server?.name}</dd></div>
              <div><dt>{t('taskWizard.scope')}</dt><dd>{t('taskWizard.scopeSummary', { count: selected.length })}</dd></div>
              <div><dt>{t('taskWizard.trigger')}</dt><dd>{type === 'manual' ? t('taskWizard.manual') : `${describeSchedule(effectiveCron)} · ${enabled ? t('taskWizard.enabled') : t('taskWizard.paused')}`}</dd></div>
              {type === 'scheduled' && timezone && <div><dt>{t('taskWizard.timezone')}</dt><dd>{timezone}</dd></div>}
              {type === 'scheduled' && enabled && scheduleQuery.data?.executions[0] && <div><dt>{t('taskWizard.nextRun')}</dt><dd>{formatExecution(scheduleQuery.data.executions[0], scheduleQuery.data.timezone, effectiveCron.split(/\s+/).length === 6)}</dd></div>}</dl></div>
            <div className="task-library-list">{selected.map(config => <div className="task-review-library" key={config.libraryId}><Folder size={16} /><strong>{config.libraryName}</strong><span>{templates.find(template => template.id === config.templateId)?.name}</span></div>)}</div>
            <div className="task-review-note"><AlertCircle size={16} /><p>{t('taskWizard.replaceHint')}</p></div>
          </>}
        </main>
        <aside className="task-preview-sidebar"><div className="task-preview-title"><Eye size={17} /><strong>{t('taskWizard.previewTitle')}</strong><span>{t('taskWizard.sample')}</span></div>
          <label className="studio-field">{t('taskWizard.previewLibrary')}<select className="studio-input" value={previewConfig?.libraryId || ''} disabled={!selected.length} onChange={event => setPreviewLibrary(event.target.value)}>
            {!selected.length && <option value="">{t('taskWizard.selectLibraryFirst')}</option>}{selected.map(config => <option key={config.libraryId} value={config.libraryId}>{config.libraryName}</option>)}</select></label>
          <div className="task-cover-preview" style={{ aspectRatio: previewTemplate ? `${previewTemplate.width} / ${previewTemplate.height}` : '16 / 9' }}>{previewImage ? <img src={previewImage} alt={t('taskWizard.sampleAlt', { name: previewConfig?.libraryName || '' })} />
            : previewTemplate?.thumbnailPath ? <AuthenticatedImage src={`/templates/${previewTemplate.id}/thumbnail`} refreshKey={previewTemplate.updatedAt}
                alt={t('taskWizard.templateExample')} fallback={<div className="preview-placeholder"><Palette size={30} /><span>{t('taskWizard.exampleUnavailable')}</span></div>} />
              : <div className="preview-placeholder"><Palette size={30} /><span>{previewTemplate ? t('taskWizard.generateHint') : selected.length ? t('taskWizard.chooseTemplateHint') : t('taskWizard.startHint')}</span></div>}</div>
          <p className="studio-muted">{previewImage ? previewNote : previewTemplate?.thumbnailPath ? t('taskWizard.exampleHint') : t('taskWizard.previewHint')}</p>
          {previewImage && coverPreview && getPreviewNoteDetails(coverPreview) && <ErrorDetails error={{ message: getPreviewNoteDetails(coverPreview) }} />}
          <button type="button" className="studio-secondary task-preview-button" disabled={!previewTemplate || !previewConfig || previewLoading || librariesQuery.isFetching || missingLibraries} onClick={() => void generatePreview()}>
            {previewLoading ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}{previewLoading ? t('taskWizard.generating') : previewImage ? t('taskWizard.regenerate') : t('taskWizard.generate')}</button>
          {previewError && <div role="alert"><p className="studio-error">{displayMessage(previewError)}</p>{'error' in previewError && <ErrorDetails error={previewError.error} />}</div>}
          <div className="task-preview-meta"><span>{previewTemplate?.name || t('taskWizard.noTemplate')}</span><span>{previewTemplate ? `${previewTemplate.width} × ${previewTemplate.height}` : t('taskWizard.coverSize')}</span></div>
          <p className="task-preview-hint">{t('taskWizard.readOnlyPreviewHint')}</p>
        </aside>
      </div>
      <footer className="task-config-footer"><div>{configError ? <div role="alert"><p className="studio-error">{displayMessage(configError)}</p>{'error' in configError && <ErrorDetails error={configError.error} />}</div> : <span>{t('taskWizard.stepCount', { step: step + 1, total: 4 })}</span>}</div>
        <div><button type="button" className="studio-secondary" disabled={saving} onClick={() => step ? setStep(step - 1) : onClose()}>{step ? <ArrowLeft size={14} /> : null}{step ? t('taskWizard.back') : t('common.cancel')}</button>
          {step < 3 ? <button type="button" className="studio-primary" onClick={goNext} disabled={saving}>{t('taskWizard.next')}<ArrowRight size={14} /></button>
            : <button type="button" className="studio-primary" disabled={saving || !libraryValid || !templatesValid || !sortsValid || !scheduleValid} onClick={() => void save()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{saving ? t('taskWizard.saving') : task ? t('taskWizard.saveChanges') : t('taskWizard.create')}</button>}</div>
      </footer>
    </DialogContent>
  </Dialog>;
}
