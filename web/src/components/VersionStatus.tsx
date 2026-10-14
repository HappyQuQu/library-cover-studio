import { Link } from 'react-router-dom';
import { AlertCircle, ArrowUpCircle, CheckCircle2, History, RefreshCw } from 'lucide-react';
import { useAppReleases, useCheckAppUpdates, PROJECT_URL } from '@/api/system';
import { Button } from '@/components/ui/button';

export function UpdateDot() {
  return <span className="update-dot" role="img" aria-label="有新版本可更新" title="有新版本可更新" />;
}

export function VersionStatus({ showHistoryLink = false }: { showHistoryLink?: boolean }) {
  const { data, isPending, isFetching, isError } = useAppReleases();
  const check = useCheckAppUpdates();
  const busy = isFetching || check.isPending;
  const unavailable = isError || check.isError || data?.stale;
  const Icon = data?.updateAvailable ? ArrowUpCircle : unavailable ? AlertCircle : CheckCircle2;
  const status = data?.updateAvailable ? `发现新版本 v${data.latestVersion}`
    : unavailable ? '暂时无法检查最新版本'
    : isPending ? '正在检查更新…'
    : data?.latestVersion ? (data.currentVersion === data.latestVersion ? '当前已是最新版本' : '当前版本高于最新正式版本') : '暂无正式发布版本';

  return (
    <section className="card version-status" aria-label="系统版本">
      <div className="version-status-main">
        <div className="version-status-icon"><Icon className="w-6 h-6" /></div>
        <div className="min-w-0">
          <p className="text-sm text-(--text-secondary)">当前版本</p>
          <p className="text-2xl font-semibold text-(--text-primary)">v{data?.currentVersion ?? import.meta.env.VITE_APP_VERSION}</p>
          <p className="version-status-message" role="status">
            {data?.updateAvailable && <UpdateDot />}{status}
          </p>
          {data?.updateAvailable && data.stale && <p className="version-status-detail">最新检查未成功，显示上次确认的新版本。</p>}
          {unavailable && <p className="version-status-detail">{data?.checkError || '请稍后重试，或前往 GitHub 查看发布记录。'}</p>}
          {!unavailable && data?.checkSource === 'github-web' && <p className="version-status-detail">已通过 GitHub 发布页确认最新正式版本。</p>}
          {data?.checkedAt && <p className="version-status-detail">上次成功检查：{new Date(data.checkedAt).toLocaleString('zh-CN')}</p>}
        </div>
      </div>
      <div className="version-status-actions">
        <Button variant="outline" onClick={() => check.mutate()} disabled={busy}>
          <RefreshCw className={busy ? 'animate-spin' : ''} />{busy ? '检查中…' : '检查更新'}
        </Button>
        {showHistoryLink && <Button variant="outline" asChild><Link to="/settings?tab=releases"><History />版本记录{data?.updateAvailable && <UpdateDot />}</Link></Button>}
        <a className={data?.updateAvailable ? 'btn btn-primary' : 'btn btn-secondary'}
          href={`${PROJECT_URL}/releases`} target="_blank" rel="noopener noreferrer">{data?.updateAvailable ? '前往更新' : 'GitHub 发布记录'}</a>
      </div>
    </section>
  );
}
