import { getLocalizedApiError } from '@/lib/apiError';
import { ErrorDetails } from '@/components/ErrorDetails';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

type Network = { mode: 'environment' | 'direct' | 'proxy'; proxyUrl: string; hasCredentials: boolean };
type Connection = { storeReady: boolean; results: { id?: 'catalog' | 'releases' | 'api'; code?: string; label: string; host: string; ok: boolean; message: string }[] };

export function GithubNetworkSettings() {
  const { t, i18n } = useTranslation();
  const dirty = useRef(false);
  const queryClient = useQueryClient(), { toast } = useToast();
  const settings = useQuery({ queryKey: ['github-network'], queryFn: () => apiClient.get<Network>('/settings/network').then(response => response.data) });
  const [mode, setMode] = useState<Network['mode']>('environment');
  const [proxyUrl, setProxyUrl] = useState('');
  const [urlChanged, setUrlChanged] = useState(false);
  useEffect(() => {
    if (settings.data && !dirty.current) { setMode(settings.data.mode); setProxyUrl(settings.data.proxyUrl); setUrlChanged(false); }
  }, [settings.data]);
  const payload = () => ({ mode, ...(urlChanged ? { proxyUrl: proxyUrl.trim() } : {}) });
  const test = useMutation({ mutationFn: () => apiClient.post<Connection>('/settings/network/test', payload(), { timeout: 20000 }).then(response => response.data) });
  const save = useMutation({ mutationFn: () => apiClient.post<Network>('/settings/network', payload()).then(response => response.data),
    onSuccess: async data => {
      dirty.current = false;
      queryClient.setQueryData(['github-network'], data);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['template-store'] }), queryClient.invalidateQueries({ queryKey: ['app-releases'] })]);
      toast({ title: i18n.t('networkSettings.saved'), description: i18n.t('networkSettings.savedHint'), variant: 'success' });
    }, onError: error => toast({ title: i18n.t('networkSettings.saveFailed'), description: getLocalizedApiError(error), variant: 'destructive' }) });
  const busy = save.isPending || test.isPending;
  if (settings.isPending) return <div className="card card-body" role="status">{t('networkSettings.loading')}</div>;
  if (settings.isError) return <div className="card card-body" role="alert">{t('networkSettings.loadFailed')}<Button onClick={() => settings.refetch()}>{t('common.retry')}</Button></div>;
  return <section className="card">
    <div className="card-header flex items-center gap-3"><Globe className="w-5 h-5 text-(--primary)" />{t('networkSettings.title')}</div>
    <div className="card-body flex flex-col gap-5">
      <div><h2 className="font-semibold text-(--text-primary)">{t('networkSettings.github')}</h2><p className="text-sm text-(--text-secondary) mt-2">{t('networkSettings.hint')}</p><p className="text-sm text-(--text-secondary) mt-1">{t('networkSettings.separateConnections')}</p></div>
      <label className="flex flex-col gap-2 text-sm text-(--text-secondary)">{t('networkSettings.mode')}
        <select className="input" aria-label={t('networkSettings.modeLabel')} value={mode} disabled={busy} onChange={event => { dirty.current = true; setMode(event.target.value as Network['mode']); test.reset(); }}>
          <option value="environment">{t('networkSettings.environment')}</option><option value="direct">{t('networkSettings.direct')}</option><option value="proxy">{t('networkSettings.proxy')}</option>
        </select>
      </label>
      {mode === 'proxy' && <div className="flex flex-col gap-2">
        <label className="text-sm text-(--text-secondary)" htmlFor="github-proxy-url">{t('networkSettings.proxyUrl')}</label>
        <Input id="github-proxy-url" className="input" value={proxyUrl} onChange={event => { dirty.current = true; setProxyUrl(event.target.value); setUrlChanged(true); test.reset(); }} placeholder="http://192.168.1.10:7890" autoComplete="off" disabled={busy} />
        <p className="text-xs text-(--text-tertiary)">{t('networkSettings.proxyHint')}</p>
        {settings.data?.hasCredentials && !urlChanged && <p className="text-xs text-(--text-tertiary)">{t('networkSettings.credentialsSaved')}</p>}
        <p className="text-sm text-(--text-secondary)">{t('networkSettings.dockerHint')}</p>
      </div>}
      {mode === 'environment' && <p className="text-sm text-(--text-secondary)">{t('networkSettings.environmentHint')}</p>}
      <div className="flex gap-3 flex-wrap"><Button className="btn btn-secondary" disabled={busy} onClick={() => test.mutate()}>{test.isPending && <Loader2 className="animate-spin" />}{t('networkSettings.test')}</Button><Button className="btn btn-primary" disabled={busy} onClick={() => save.mutate()}>{save.isPending ? t('networkSettings.saving') : t('networkSettings.save')}</Button></div>
      {test.isError && <p className="text-sm text-red-500" role="alert">{getLocalizedApiError(test.error)}</p>}
      {test.data && <div className="flex flex-col gap-3" role="status"><p className="font-medium text-(--text-primary)">{test.data.storeReady ? t('networkSettings.ready') : t('networkSettings.partial')}</p>{test.data.results.map(result => <div key={result.host} className="flex items-start gap-2 text-sm">{result.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-green-500 mt-1" /> : <AlertCircle className="w-4 h-4 shrink-0 text-amber-500 mt-1" />}<div><strong className="text-(--text-primary)">{result.id ? t(result.id === 'catalog' ? 'networkSettings.catalog' : result.id === 'releases' ? 'networkSettings.releases' : 'networkSettings.api') : result.host}</strong><span className="text-(--text-secondary)"> · {result.ok ? t('networkSettings.connected') : t('networkSettings.failed')}</span>{!result.ok && <ErrorDetails error={{ message: result.message }} />}<p className="text-xs text-(--text-tertiary)">{result.host}</p></div></div>)}</div>}
    </div>
  </section>;
}
