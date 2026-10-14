import { normalizeLanguage } from './language';

export function formatDisplayDate(value: string | null | undefined, language: string, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(normalizeLanguage(language), options).format(date);
  } catch {
    return null;
  }
}

export function formatDisplayNumber(value: number, language: string) {
  return Number.isFinite(value) ? new Intl.NumberFormat(normalizeLanguage(language)).format(value) : '—';
}
