import type { MediaLibrary } from '@/api';

export interface LibraryConfig {
  libraryId: string; libraryName: string; libraryType: string; templateId: string;
  primaryTitle: string; secondaryTitle: string; sortBy: string; maxItems?: string; enabled: boolean;
}
export const SORT_OPTIONS = [
  ['DateCreated', '最近加入'], ['Random', '随机选取'], ['CommunityRating', '公众评分'], ['SortName', '名称'],
  ['PremiereDate', '发行日期'], ['DatePlayed', '最近播放'], ['PlayCount', '播放次数'],
  ['CriticRating', '影评人评分'], ['OfficialRating', '家长分级'], ['Runtime', '播放时长']
] as const;
export const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
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
  const base: ScheduleConfig = { frequency: 'daily', time: `${hour === '*' ? '04' : hour.padStart(2, '0')}:${minute.padStart(2, '0')}`, weekday: '1', day: '1' };
  if (day === '*' && weekday === '*') return { ...base, frequency: hour === '*' ? 'hourly' : 'daily' };
  if (hour !== '*' && day === '*' && /^[0-6]$/.test(weekday)) return { ...base, frequency: 'weekly', weekday };
  if (hour !== '*' && weekday === '*' && /^\d+$/.test(day)) return { ...base, frequency: 'monthly', day };
  return null;
}
export function describeSchedule(expression?: string): string {
  const config = readSchedule(expression);
  if (!config) return '自定义执行计划';
  if (config.frequency === 'hourly') return `每小时 ${config.time.split(':')[1]} 分`;
  if (config.frequency === 'weekly') return `每${WEEKDAYS[Number(config.weekday)]} ${config.time}`;
  if (config.frequency === 'monthly') return `每月 ${config.day} 日 ${config.time}`;
  return `每天 ${config.time}`;
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
  if (!Array.isArray(parsed)) throw new Error('媒体库配置格式无效');
  return parsed.map(config => ({ ...config, sortBy: config.sortBy === 'Name' ? 'SortName' : config.sortBy === 'DateLastPlayed' ? 'DatePlayed' : config.sortBy || 'DateCreated', enabled: config.enabled !== false }));
}
