import i18n from './i18n';
import { CodedError } from './codedError';
import type { MediaLibrary } from '@/api';

export interface LibraryConfig {
  libraryId: string; libraryName: string; libraryType: string; templateId: string;
  primaryTitle: string; secondaryTitle: string; sortBy: string; maxItems?: string; enabled: boolean;
}
export const SORT_OPTIONS = [
  ['DateCreated', 'schedule.sortDateCreated'],
  ['Random', 'schedule.sortRandom'],
  ['CommunityRating', 'schedule.sortCommunityRating'],
  ['SortName', 'schedule.sortSortName'],
  ['PremiereDate', 'schedule.sortPremiereDate'],
  ['DatePlayed', 'schedule.sortDatePlayed'],
  ['PlayCount', 'schedule.sortPlayCount'],
  ['CriticRating', 'schedule.sortCriticRating'],
  ['OfficialRating', 'schedule.sortOfficialRating'],
  ['Runtime', 'schedule.sortRuntime']
] as const;
export const WEEKDAYS = ['schedule.sunday', 'schedule.monday', 'schedule.tuesday', 'schedule.wednesday', 'schedule.thursday', 'schedule.friday', 'schedule.saturday'] as const;
export interface ScheduleConfig { frequency: 'daily' | 'weekly' | 'monthly' | 'hourly'; time: string; weekday: string; day: string; }
export function buildSchedule(config: ScheduleConfig): string {
  const [hour, minute] = config.time.split(':').map(Number);
  switch (config.frequency) {
    case 'hourly': return `${minute} * * * *`;
    case 'weekly': return `${minute} ${hour} * * ${config.weekday}`;
    case 'monthly': return `${minute} ${hour} ${config.day} * *`;
    default: return `${minute} ${hour} * * *`;
  }
}
export function readSchedule(expression?: string): ScheduleConfig | null {
  if (!expression) return { frequency: 'daily', time: '04:00', weekday: '1', day: '1' };
  const [minute, hour, day, month, weekday, extra] = expression.trim().split(/\s+/);
  if (extra || month !== '*' || !/^\d+$/.test(minute) || !(hour === '*' || /^\d+$/.test(hour))) return null;
  if (Number(minute) > 59 || (hour !== '*' && Number(hour) > 23)) return null;
  const base: ScheduleConfig = { frequency: 'daily', time: `${hour === '*' ? '04' : hour.padStart(2, '0')}:${minute.padStart(2, '0')}`, weekday: '1', day: '1' };
  if (day === '*' && weekday === '*') return { ...base, frequency: hour === '*' ? 'hourly' : 'daily' };
  if (hour !== '*' && day === '*' && /^[0-6]$/.test(weekday)) return { ...base, frequency: 'weekly', weekday };
  if (hour !== '*' && weekday === '*' && /^\d+$/.test(day) && Number(day) >= 1 && Number(day) <= 31) return { ...base, frequency: 'monthly', day };
  return null;
}
export function describeSchedule(expression?: string): string {
  const config = readSchedule(expression);
  if (!config) return i18n.t('schedule.custom');
  if (config.frequency === 'hourly') return i18n.t('schedule.hourly', { minute: config.time.split(':')[1] });
  if (config.frequency === 'weekly') return i18n.t('schedule.weekly', { weekday: i18n.t(WEEKDAYS[Number(config.weekday)]), time: config.time });
  if (config.frequency === 'monthly') return i18n.t('schedule.monthly', { day: config.day, time: config.time });
  return i18n.t('schedule.daily', { time: config.time });
}

/** Refresh discovery data while retaining user edits, selection and per-library overrides. */
export function reconcileLibraries(previous: LibraryConfig[], libraries: MediaLibrary[], templateId: string): LibraryConfig[] {
  const existing = new Map(previous.map(config => [config.libraryId, config]));
  return libraries.map(library => existing.get(library.id) || {
    libraryId: library.id, libraryName: library.name, libraryType: library.type, templateId,
    primaryTitle: library.name, secondaryTitle: '', sortBy: 'DateCreated', enabled: false
  });
}

export function parseLibraryConfigs(value?: string): LibraryConfig[] {
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new CodedError('INVALID_LIBRARY_CONFIG');
  return parsed.map(config => ({ ...config, sortBy: config.sortBy === 'Name' ? 'SortName' : config.sortBy === 'DateLastPlayed' ? 'DatePlayed' : config.sortBy || 'DateCreated', enabled: config.enabled !== false }));
}
