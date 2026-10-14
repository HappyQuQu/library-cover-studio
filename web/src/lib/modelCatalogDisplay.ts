import i18n from './i18n';
import { getLocalizedApiError } from './apiError';

export function modelCatalogWarning(catalog?: { warningCode?: string }): string {
  if (catalog?.warningCode === 'AI_CATALOG_EMPTY') return i18n.t('aiSettings.catalogEmpty');
  if (catalog?.warningCode && ['AI_UPSTREAM_UNAUTHORIZED', 'AI_RATE_LIMIT', 'AI_TIMEOUT', 'AI_CATALOG_UNSUPPORTED'].includes(catalog.warningCode)) {
    return getLocalizedApiError({ code: catalog.warningCode }, 'ai');
  }
  return i18n.t('aiSettings.catalogWarning');
}
