import { ExternalLink, History } from 'lucide-react';
import { useAppReleases, PROJECT_URL } from '@/api/system';
import { VersionStatus } from '@/components/VersionStatus';
import { ReleaseNotes } from '@/components/ReleaseNotes';

export function ReleasesPage() {
  const { data, isPending, isError } = useAppReleases();
  return (
    <div className="system-page">
      <div className="system-page-heading"><h1>版本记录</h1><p>查看每个版本的新功能、改进与修复。</p></div>
      <VersionStatus />
      {data?.stale && <p className="text-sm text-(--text-secondary)" role="status">GitHub 暂时不可用，以下显示本机随附或已缓存的版本记录。</p>}
      {isPending && <div className="card system-empty" role="status">正在加载版本记录…</div>}
      {isError && <div className="card system-empty" role="alert">版本记录加载失败，请点击“检查更新”重试。</div>}
      {data?.releases.map(release => (
        <article className="card release-entry" key={release.version}>
          <header className="release-entry-header">
            <div className="release-entry-title"><History className="w-5 h-5 text-(--primary)" /><h2>v{release.version}</h2>
              {release.version === data.currentVersion && <span className="release-badge">当前版本</span>}
              {release.version === data.latestVersion && <span className="release-badge release-badge-latest">最新版本</span>}
            </div>
            <div className="release-entry-meta">
              {release.publishedAt && <time dateTime={release.publishedAt}>{new Date(release.publishedAt).toLocaleDateString('zh-CN')}</time>}
              <a href={release.url} target="_blank" rel="noopener noreferrer">查看发布<ExternalLink className="w-3.5 h-3.5" /></a>
            </div>
          </header>
          <ReleaseNotes notes={release.notes} />
        </article>
      ))}
      {data && data.releases.length === 0 && <div className="card system-empty">暂无版本记录。<a href={`${PROJECT_URL}/releases`} target="_blank" rel="noopener noreferrer">前往 GitHub 查看</a></div>}
    </div>
  );
}
