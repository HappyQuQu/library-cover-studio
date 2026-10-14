import i18n from './i18n';
import type { TaskLog, TaskLogCover } from '../api/hooks';

export function runStatus(log: TaskLog) {
  if (log.status === 'running') return { text: i18n.t('taskHistory.running'), tone: 'pending' };
  if (log.status === 'failed') return { text: i18n.t('taskHistory.failed'), tone: 'error' };
  if (log.itemsFailed) return { text: i18n.t('taskHistory.partial'), tone: 'warning' };
  return { text: i18n.t('taskHistory.completed'), tone: 'success' };
}

export function coverStatus(cover: TaskLogCover) {
  if (cover.status === 'uploaded') return i18n.t('taskHistory.uploaded');
  if (cover.status === 'failed') return cover.imageUrl ? i18n.t('taskHistory.uploadFailed') : i18n.t('taskHistory.generationFailed');
  return cover.imageUrl ? i18n.t('taskHistory.uploading') : i18n.t('taskHistory.generating');
}

export function duration(log: TaskLog) {
  if (!log.startedAt || !log.completedAt) return null;
  const seconds = Math.max(0, Math.round((Date.parse(log.completedAt) - Date.parse(log.startedAt)) / 1000));
  if (!Number.isFinite(seconds)) return null;
  return seconds < 60 ? i18n.t('taskHistory.seconds', { count: seconds }) : i18n.t('taskHistory.minutesSeconds', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
}
