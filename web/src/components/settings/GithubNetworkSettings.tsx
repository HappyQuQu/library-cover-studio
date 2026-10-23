import { getLocalizedApiError } from '@/lib/apiError';
import { formatDisplayDate } from '@/lib/displayFormat';
import { ErrorDetails } from '@/components/ErrorDetails';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

type Network = { mode: 'environment' | 'direct' | 'proxy'; proxyUrl: string; hasCredentials: boolean; hasToken?: boolean; hasSavedToken?: boolean; tokenSource?: 'settings' | 'environment' | 'none' };
type Connection = { storeReady: boolean; catalogReady?: boolean; versionCheckReady?: boolean; liveCountsReady?: boolean; results: { id?: 'catalog' | 'download' | 'releases' | 'api'; code?: string; host: string; ok: boolean; message: string; retryAt?: string; authenticated?: boolean; limit?: number }[] };

export function GithubNetworkSettings() {
  const { t, i18n } = useTranslation();
  const dirty = useRef(false);
  const queryClient = useQueryClient(), { toast } = useToast();
  const settings = useQuery({ queryKey: ['github-network'], queryFn: () => apiClient.get<Network>('/settings/network').then(response => response.data) });
  const [mode, setMode] = useState<Network['mode']>('environment');
  const [proxyUrl, setProxyUrl] = useState('');
  const [urlChanged, setUrlChanged] = useState(false);
  const [token, setToken] = useState('');
  const [clearToken, setClearToken] = useState(false);
  useEffect(() => {
    if (settings.data && !dirty.current) { setMode(settings.data.mode); setProxyUrl(settings.data.proxyUrl); setUrlChanged(false); }
  }, [settings.data]);
  const payload = () => ({ mode, ...(urlChanged ? { proxyUrl: proxyUrl.trim() } : {}), ...(clearToken ? { clearToken: true } : token.trim() ? { token: token.trim() } : {}) });
  const test = useMutation({ mutationFn: () => apiClient.post<Connection>('/settings/network/test', payload(), { timeout: 35000 }).then(response => response.data) });
  const save = useMutation({ mutationFn: () => apiClient.post<Network>('/settings/network', payload()).then(response => response.data),
    onSuccess: async data => {
      dirty.current = false;
      setToken(''); setClearToken(false); setUrlChanged(false); setProxyUrl(data.proxyUrl); test.reset();
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
      <div className="flex flex-col gap-2">
        <label htmlFor="github-token" className="text-sm text-(--text-secondary)">{t('networkSettings.token')}</label>
        <Input id="github-token" type="password" autoComplete="new-password" value={token} disabled={busy} placeholder={t('networkSettings.tokenPlaceholder')}
          onChange={event => { dirty.current = true; setToken(event.target.value); setClearToken(false); test.reset(); }} />
        <p className="text-xs text-(--text-tertiary)">{t('networkSettings.tokenHint')}</p>
        <p className="text-xs text-(--text-tertiary)">{settings.data?.tokenSource === 'settings' ? t('networkSettings.tokenSettings') : settings.data?.tokenSource === 'environment' ? t('networkSettings.tokenEnvironment') : t('networkSettings.tokenNone')}</p>
        {settings.data?.hasSavedToken && <label className="text-sm text-(--text-secondary)"><input type="checkbox" checked={clearToken} disabled={busy} onChange={event => { dirty.current = true; setClearToken(event.target.checked); setToken(''); test.reset(); }} /> {t('networkSettings.clearToken')}</label>}
      </div>
      <div className="flex gap-3 flex-wrap"><Button className="btn btn-secondary" disabled={busy} onClick={() => test.mutate()}>{test.isPending && <Loader2 className="animate-spin" />}{t('networkSettings.test')}</Button><Button className="btn btn-primary" disabled={busy} onClick={() => save.mutate()}>{save.isPending ? t('networkSettings.saving') : t('networkSettings.save')}</Button></div>
      {test.isError && <p className="text-sm text-red-500" role="alert">{getLocalizedApiError(test.error)}</p>}
      {test.data && <div className="flex flex-col gap-3" role="status">
        <p className="font-medium text-(--text-primary)">{test.data.storeReady ? t('networkSettings.ready') : test.data.catalogReady ? t('networkSettings.catalogOnly') : t('networkSettings.partial')}</p>
        <p className="text-xs text-(--text-tertiary)">{t('networkSettings.apiOptional')}</p>
        {test.data.results.map(result => <div key={result.id || result.host} className="flex items-start gap-2 text-sm">{result.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-green-500 mt-1" /> : <AlertCircle className="w-4 h-4 shrink-0 text-amber-500 mt-1" />}<div>
          <strong className="text-(--text-primary)">{result.id ? t(result.id === 'catalog' ? 'networkSettings.catalog' : result.id === 'download' ? 'networkSettings.download' : result.id === 'releases' ? 'networkSettings.releases' : 'networkSettings.api') : result.host}</strong>
          <span className="text-(--text-secondary)"> · {result.ok ? t('networkSettings.connected') : result.code === 'RATE_LIMITED' ? t(result.authenticated ? 'networkSettings.authLimit' : 'networkSettings.anonymousLimit') : result.code === 'SECONDARY_RATE_LIMITED' ? t('networkSettings.secondaryLimit') : result.code === 'TOKEN_INVALID' ? t('networkSettings.invalidToken') : result.code === 'ACCESS_DENIED' ? t('networkSettings.denied') : result.code === 'NOT_TESTED' ? t('networkSettings.notTested') : t('networkSettings.failed')}</span>
          {result.retryAt && <p>{t('networkSettings.retryAt', { time: formatDisplayDate(result.retryAt, i18n.language, { dateStyle: 'medium', timeStyle: 'medium' }) || result.retryAt })}</p>}
          {result.code === 'RATE_LIMITED' && <p>{t('networkSettings.limitHint')}</p>}
          {!result.ok && <ErrorDetails error={{ message: result.message }} />}<p className="text-xs text-(--text-tertiary)">{result.host}</p>
        </div></div>)}
      </div>}
    </div>
  </section>;
}
