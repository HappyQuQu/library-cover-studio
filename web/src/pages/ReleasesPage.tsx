import { useTranslation } from 'react-i18next';
import { ExternalLink, History } from 'lucide-react';
import { useAppReleases, PROJECT_URL } from '@/api/system';
import { VersionStatus } from '@/components/VersionStatus';
import { ReleaseNotes } from '@/components/ReleaseNotes';
import { formatDisplayDate } from '@/lib/displayFormat';

export function ReleasesPage() {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError } = useAppReleases();
  return (
    <div className="system-page">
      <div className="system-page-heading"><h1>{t('releases.title')}</h1><p>{t('releases.description')}</p></div>
      <VersionStatus />
      {data?.stale && <p className="text-sm text-(--text-secondary)" role="status">{t('releases.cachedHistory')}</p>}
      {isPending && <div className="card system-empty" role="status">{t('releases.loading')}</div>}
      {isError && <div className="card system-empty" role="alert">{t('releases.loadFailed')}</div>}
      {data?.releases.map(release => (
        <article className="card release-entry" key={release.version}>
          <header className="release-entry-header">
            <div className="release-entry-title"><History className="w-5 h-5 text-(--primary)" /><h2>v{release.version}</h2>
              {release.version === data.currentVersion && <span className="release-badge">{t('releases.currentVersion')}</span>}
              {release.version === data.latestVersion && <span className="release-badge release-badge-latest">{t('releases.latestVersion')}</span>}
            </div>
            <div className="release-entry-meta">
              {release.publishedAt && <time dateTime={release.publishedAt}>{formatDisplayDate(release.publishedAt, i18n.resolvedLanguage || 'zh-CN', { dateStyle: 'medium' }) || t('common.unknownTime')}</time>}
              <a href={release.url} target="_blank" rel="noopener noreferrer">{t('releases.viewRelease')}<ExternalLink className="w-3.5 h-3.5" /></a>
            </div>
          </header>
          <section aria-label={t('releases.originalNotes')}><ReleaseNotes notes={release.notes} /></section>
        </article>
      ))}
      {data && data.releases.length === 0 && <div className="card system-empty">{t('releases.empty')}<a href={`${PROJECT_URL}/releases`} target="_blank" rel="noopener noreferrer">{t('releases.viewGithub')}</a></div>}
    </div>
  );
}
