import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowUpCircle, CheckCircle2, History, RefreshCw } from 'lucide-react';
import { useAppReleases, useCheckAppUpdates, PROJECT_URL } from '@/api/system';
import { Button } from '@/components/ui/button';
import { formatDisplayDate } from '@/lib/displayFormat';
import { ErrorDetails } from '@/components/ErrorDetails';

export function UpdateDot() {
  const { t } = useTranslation();
  return <span className="update-dot" role="img" aria-label={t('releases.updateAvailable')} title={t('releases.updateAvailable')} />;
}

export function VersionStatus({ showHistoryLink = false }: { showHistoryLink?: boolean }) {
  const { t, i18n } = useTranslation();
  const { data, isPending, isFetching, isError } = useAppReleases();
  const check = useCheckAppUpdates();
  const busy = isFetching || check.isPending;
  const unavailable = isError || check.isError || data?.stale;
  const Icon = data?.updateAvailable ? ArrowUpCircle : unavailable ? AlertCircle : CheckCircle2;
  const status = data?.updateAvailable ? t('releases.newVersion', { version: data.latestVersion })
    : unavailable ? t('releases.unavailable')
    : isPending ? t('releases.checking')
    : data?.latestVersion ? (data.currentVersion === data.latestVersion ? t('releases.upToDate') : t('releases.ahead')) : t('releases.noReleases');

  return (
    <section className="card version-status" aria-label={t('releases.systemVersion')}>
      <div className="version-status-main">
        <div className="version-status-icon"><Icon className="w-6 h-6" /></div>
        <div className="min-w-0">
          <p className="text-sm text-(--text-secondary)">{t('releases.currentVersion')}</p>
          <p className="text-2xl font-semibold text-(--text-primary)">v{data?.currentVersion ?? import.meta.env.VITE_APP_VERSION}</p>
          <p className="version-status-message" role="status">
            {data?.updateAvailable && <UpdateDot />}{status}
          </p>
          {data?.updateAvailable && data.stale && <p className="version-status-detail">{t('releases.cachedUpdate')}</p>}
          {unavailable && <div className="version-status-detail"><p>{t('releases.retryHint')}</p><ErrorDetails error={{ message: data?.checkError }} /></div>}
          {!unavailable && data?.checkSource === 'github-web' && <p className="version-status-detail">{t('releases.webConfirmed')}</p>}
          {data?.checkedAt && <p className="version-status-detail">{t('releases.checkedAt', { time: formatDisplayDate(data.checkedAt, i18n.resolvedLanguage || 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) || t('common.unknownTime') })}</p>}
        </div>
      </div>
      <div className="version-status-actions">
        <Button variant="outline" onClick={() => check.mutate()} disabled={busy}>
          <RefreshCw className={busy ? 'animate-spin' : ''} />{busy ? t('releases.checkBusy') : t('releases.check')}
        </Button>
        {showHistoryLink && <Button variant="outline" asChild><Link to="/settings?tab=releases"><History />{t('releases.title')}{data?.updateAvailable && <UpdateDot />}</Link></Button>}
        <a className={data?.updateAvailable ? 'btn btn-primary' : 'btn btn-secondary'}
          href={`${PROJECT_URL}/releases`} target="_blank" rel="noopener noreferrer">{data?.updateAvailable ? t('releases.update') : t('releases.github')}</a>
      </div>
    </section>
  );
}
