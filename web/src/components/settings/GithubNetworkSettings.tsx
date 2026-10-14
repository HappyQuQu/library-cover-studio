import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

type Network = { mode: 'environment' | 'direct' | 'proxy'; proxyUrl: string; hasCredentials: boolean };
type Connection = { storeReady: boolean; results: { label: string; host: string; ok: boolean; message: string }[] };
function errorMessage(error: unknown) {
  return (error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || '请求失败，请稍后重试';
}

export function GithubNetworkSettings() {
  const queryClient = useQueryClient(), { toast } = useToast();
  const settings = useQuery({ queryKey: ['github-network'], queryFn: () => apiClient.get<Network>('/settings/network').then(response => response.data) });
  const [mode, setMode] = useState<Network['mode']>('environment');
  const [proxyUrl, setProxyUrl] = useState('');
  const [urlChanged, setUrlChanged] = useState(false);
  useEffect(() => {
    if (settings.data) { setMode(settings.data.mode); setProxyUrl(settings.data.proxyUrl); setUrlChanged(false); }
  }, [settings.data]);
  const payload = () => ({ mode, ...(urlChanged ? { proxyUrl: proxyUrl.trim() } : {}) });
  const test = useMutation({ mutationFn: () => apiClient.post<Connection>('/settings/network/test', payload(), { timeout: 20000 }).then(response => response.data) });
  const save = useMutation({ mutationFn: () => apiClient.post<Network>('/settings/network', payload()).then(response => response.data),
    onSuccess: async data => {
      queryClient.setQueryData(['github-network'], data);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['template-store'] }), queryClient.invalidateQueries({ queryKey: ['app-releases'] })]);
      toast({ title: '网络设置已保存', description: 'GitHub 请求立即使用新配置，无需重启。', variant: 'success' });
    }, onError: error => toast({ title: '保存失败', description: errorMessage(error), variant: 'destructive' }) });
  const busy = save.isPending || test.isPending;
  if (settings.isPending) return <div className="card card-body" role="status">正在加载网络设置…</div>;
  if (settings.isError) return <div className="card card-body" role="alert">无法读取网络设置。<Button onClick={() => settings.refetch()}>重试</Button></div>;
  return <section className="card">
    <div className="card-header flex items-center gap-3"><Globe className="w-5 h-5 text-(--primary)" />网络设置</div>
    <div className="card-body flex flex-col gap-5">
      <div><h2 className="font-semibold text-(--text-primary)">GitHub 连接</h2><p className="text-sm text-(--text-secondary) mt-2">用于模板商店目录、预览图、下载统计、模板下载与版本检查。</p><p className="text-sm text-(--text-secondary) mt-1">媒体服务器和 AI 服务继续使用各自的连接配置。</p></div>
      <label className="flex flex-col gap-2 text-sm text-(--text-secondary)">连接方式
        <select className="input" aria-label="GitHub 连接方式" value={mode} disabled={busy} onChange={event => { setMode(event.target.value as Network['mode']); test.reset(); }}>
          <option value="environment">跟随服务器环境变量（默认）</option><option value="direct">直接连接</option><option value="proxy">使用指定代理</option>
        </select>
      </label>
      {mode === 'proxy' && <div className="flex flex-col gap-2">
        <label className="text-sm text-(--text-secondary)" htmlFor="github-proxy-url">代理地址</label>
        <Input id="github-proxy-url" className="input" value={proxyUrl} onChange={event => { setProxyUrl(event.target.value); setUrlChanged(true); test.reset(); }} placeholder="http://192.168.1.10:7890" autoComplete="off" disabled={busy} />
        <p className="text-xs text-(--text-tertiary)">支持 http://、https://、socks5:// 和 socks5h://；认证代理可填写 username:password@地址，保存后不显示凭据。</p>
        {settings.data?.hasCredentials && !urlChanged && <p className="text-xs text-(--text-tertiary)">已保存代理凭据，地址未修改时会继续使用。</p>}
        <p className="text-sm text-(--text-secondary)">Docker 中的 127.0.0.1 指向容器自身。请填写代理所在设备的局域网地址；Docker Desktop 可使用 host.docker.internal。代理需允许容器访问。</p>
      </div>}
      {mode === 'environment' && <p className="text-sm text-(--text-secondary)">使用后端进程的 HTTPS_PROXY、HTTP_PROXY 和 NO_PROXY 环境变量；未配置时直连。</p>}
      <div className="flex gap-3 flex-wrap"><Button className="btn btn-secondary" disabled={busy} onClick={() => test.mutate()}>{test.isPending && <Loader2 className="animate-spin" />}测试连接</Button><Button className="btn btn-primary" disabled={busy} onClick={() => save.mutate()}>{save.isPending ? '保存中…' : '保存设置'}</Button></div>
      {test.isError && <p className="text-sm text-red-500" role="alert">{errorMessage(test.error)}</p>}
      {test.data && <div className="flex flex-col gap-3" role="status"><p className="font-medium text-(--text-primary)">{test.data.storeReady ? '商店目录与 GitHub 发布页连接正常' : '部分连接未成功，请检查代理或服务器网络'}</p>{test.data.results.map(result => <div key={result.host} className="flex items-start gap-2 text-sm">{result.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-green-500 mt-1" /> : <AlertCircle className="w-4 h-4 shrink-0 text-amber-500 mt-1" />}<div><strong className="text-(--text-primary)">{result.label}</strong><span className="text-(--text-secondary)"> · {result.message}</span><p className="text-xs text-(--text-tertiary)">{result.host}</p></div></div>)}</div>}
    </div>
  </section>;
}
