import i18n from './i18n';
import { getLocalizedApiError } from './apiError';
import type zhCN from '../locales/zh-CN';

type Keys<T> = { [K in keyof T & string]: T[K] extends string ? T[K] extends `${string}{{${string}` ? never : K : `${K}.${Keys<T[K]>}` }[keyof T & string];
export type TranslationKey = Keys<typeof zhCN>;
export type DisplayMessage = { key: TranslationKey } | { error: unknown; context?: Parameters<typeof getLocalizedApiError>[1] };

/** Keep message identity in state so open forms can change language without resetting. */
export function displayMessage(message: DisplayMessage | null | undefined): string {
  if (!message) return '';
  return 'key' in message ? i18n.t(message.key) : getLocalizedApiError(message.error, message.context);
}
