import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2 } from 'lucide-react';
import { apiClient } from '@/api/client';
import { getLocalizedApiError } from '@/lib/apiError';
import { formatDisplayDate } from '@/lib/displayFormat';
import { ErrorDetails } from '@/components/ErrorDetails';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Category = 'templates' | 'servers' | 'tasks' | 'aiProviders';
interface RestoreSummary {
  counts: Record<Category | 'settings', number>;
  names: Record<Category, string[]>;
  settingKeys: string[];
  exportedAt: string | null;
}
interface RestorePreview extends RestoreSummary { token: string; }
const categories = ['templates', 'servers', 'tasks', 'aiProviders'] as const;
const settingLabels = {
  'storage.savePosters': 'settings.savePosters', 'storage.saveCovers': 'settings.saveCovers',
  'rendering.outputFormat': 'settings.outputFormat', 'rendering.outputQuality': 'settings.outputQuality',
  'rendering.concurrency': 'settings.concurrency', 'history.maxRuns': 'settings.maxRuns', 'history.maxDays': 'settings.maxDays',
  'scheduler.timezone': 'settings.restoreTimezone', 'ai.systemPrompt': 'settings.restoreSystemPrompt'
} as const;

export function ConfigurationRestore({ disabled, onRestored }: { disabled: boolean; onRestored: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [restoreSettings, setRestoreSettings] = useState(false);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [result, setResult] = useState<RestoreSummary | null>(null);
  const [busy, setBusy] = useState<'preview' | 'restore' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [fileTooLarge, setFileTooLarge] = useState(false);
  const formData = () => {
    const data = new FormData();
    data.append('backup', file!); data.append('restoreSettings', String(restoreSettings));
    return data;
  };
  const inspect = async () => {
    if (!file || busy) return;
    setBusy('preview'); setError(null); setResult(null);
    try {
      const response = await apiClient.post<RestorePreview>('/settings/import/preview', formData(), { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(response.data);
    } catch (error) { setError(error); }
    finally { setBusy(null); }
  };
  const restore = async () => {
    if (!file || !preview || busy) return;
    setBusy('restore'); setError(null);
    try {
      const data = formData(); data.append('token', preview.token); data.append('confirm', 'true');
      const response = await apiClient.post<RestoreSummary>('/settings/import', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(response.data); setPreview(null); setFile(null);
      void queryClient.invalidateQueries(); onRestored();
    } catch (error) { setError(error); }
    finally { setBusy(null); }
  };
  return <section style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
    <h3 style={{ fontWeight: 500 }}>{t('settings.restoreData')}</h3>
    <p className="studio-muted" style={{ marginTop: 4 }}>{t('settings.restoreHint')}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 14 }}>
      <input ref={input} type="file" accept=".json,application/json" hidden aria-label={t('settings.restoreChoose')} disabled={disabled || !!busy} onChange={event => {
        const selected = event.target.files?.[0] ?? null; event.target.value = '';
        const tooLarge = !!selected && selected.size > 32 * 1024 * 1024;
        setFileTooLarge(tooLarge); setFile(tooLarge ? null : selected); setError(null); setResult(null); setPreview(null);
      }} />
      <Button className="btn btn-secondary" variant="outline" disabled={disabled || !!busy} onClick={() => input.current?.click()}><Upload size={16} className="mr-2" />{t('settings.restoreChoose')}</Button>
      {file && <span style={{ overflowWrap: 'anywhere' }}>{file.name}</span>}
      <Button className="btn btn-primary" disabled={disabled || !file || !!busy} onClick={() => void inspect()}>
        {busy === 'preview' && <Loader2 size={16} className="mr-2 animate-spin" />}{t('settings.restorePreview')}
      </Button>
    </div>
    <label style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'flex-start' }}>
      <input type="checkbox" checked={restoreSettings} disabled={disabled || !!busy} onChange={event => { setRestoreSettings(event.target.checked); setPreview(null); setResult(null); setError(null); }} />
      <span>{t('settings.restoreSettingsOption')}</span>
    </label>
    {fileTooLarge && <p role="alert" className="studio-error">{t('settings.restoreTooLarge')}</p>}
    {error !== null && !preview && <div role="alert" className="mt-3"><p>{getLocalizedApiError(error, 'import')}</p><ErrorDetails error={error} /></div>}
    {result && <div role="status" className="mt-3"><strong>{t('settings.restoreDone')}</strong><p>{t('settings.restoreResult', result.counts)}</p><p className="studio-muted">{t('settings.restoreReconnect')}</p></div>}
    <Dialog open={!!preview} onOpenChange={open => { if (!open && !busy) { setPreview(null); setError(null); } }}>
      <DialogContent style={{ maxWidth: 640, maxHeight: '90dvh', overflowY: 'auto' }}>
        <DialogHeader><DialogTitle>{t('settings.restoreTitle')}</DialogTitle><DialogDescription>{t('settings.restoreMerge')}</DialogDescription></DialogHeader>
        {preview && <>
          <p style={{ overflowWrap: 'anywhere' }}>{file?.name}</p>
          {preview.exportedAt && <p className="studio-muted">{t('settings.restoreExportedAt', { time: formatDisplayDate(preview.exportedAt, i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) || t('common.unknownTime') })}</p>}
          <dl className="space-y-3 my-3">{categories.map(category => <div key={category}>
            <dt className="font-medium">{t(`settings.restoreCategory_${category}`)} · {preview.counts[category]}</dt>
            <dd className="text-sm text-(--text-secondary)" style={{ overflowWrap: 'anywhere' }}>{preview.names[category].join(' · ') || '—'}</dd>
          </div>)}</dl>
          <p className="studio-muted">{t('settings.restoreListLimit')}</p>
          <p>{restoreSettings ? t('settings.restoreSettingsCount', { count: preview.counts.settings }) : t('settings.restoreSettingsKeep')}</p>
          {restoreSettings && <ul className="text-sm text-(--text-secondary)">{preview.settingKeys.map(key => <li key={key}>{settingLabels[key as keyof typeof settingLabels] ? t(settingLabels[key as keyof typeof settingLabels]) : key}</li>)}</ul>}
          <p>{t('settings.restorePaused')}</p><p className="studio-muted">{t('settings.restoreReconnect')}</p>
          {error !== null && <div role="alert"><p>{getLocalizedApiError(error, 'import')}</p><ErrorDetails error={error} /></div>}
        </>}
        <DialogFooter><Button className="btn btn-secondary" variant="outline" disabled={!!busy} onClick={() => { setPreview(null); setError(null); }}>{t('common.cancel')}</Button>
          <Button className="btn btn-primary" disabled={!!busy} onClick={() => void restore()}>{busy === 'restore' && <Loader2 size={16} className="mr-2 animate-spin" />}{t('settings.restoreConfirm')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
