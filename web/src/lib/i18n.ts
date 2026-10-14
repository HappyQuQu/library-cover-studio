import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from '../locales/zh-CN';
import enUS from '../locales/en-US';
import { createLanguagePreferences, DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from './language';
import type { AppLanguage } from './language';

function updateDocumentLanguage(language: AppLanguage) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.querySelector('meta[name="description"]')?.setAttribute('content', i18n.t('common.appDescription'));
}

export const languagePreferences = createLanguagePreferences({
  getStorage: () => typeof window === 'undefined' ? undefined : window.localStorage,
  changeLanguage: async language => {
    await i18nReady;
    return i18n.changeLanguage(language);
  },
  onLanguageChange: updateDocumentLanguage,
});

export const i18nReady = i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS }
    },
    lng: languagePreferences.initialLanguage,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    fallbackLng: DEFAULT_LANGUAGE,
    load: 'currentOnly',
    initImmediate: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: {
      escapeValue: false
    }
  }).then(() => updateDocumentLanguage(languagePreferences.initialLanguage));

if (typeof window !== 'undefined') {
  const syncLanguage = (event: StorageEvent) => {
    if (event.key !== LANGUAGE_STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    void languagePreferences.syncStoredLanguage().catch(() => {
      // Keep the active language if a change from another tab cannot be applied.
    });
  };
  window.addEventListener('storage', syncLanguage);
  import.meta.hot?.dispose(() => window.removeEventListener('storage', syncLanguage));
}

export default i18n;
