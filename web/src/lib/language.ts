export const DEFAULT_LANGUAGE = 'zh-CN';
export const LANGUAGE_STORAGE_KEY = 'lcs-language';
export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const;
export type AppLanguage = typeof SUPPORTED_LANGUAGES[number];

export function normalizeLanguage(value: unknown): AppLanguage {
  if (typeof value !== 'string') return DEFAULT_LANGUAGE;
  const language = value.trim().replace(/_/g, '-').toLowerCase();
  if (/^en(?:-[a-z0-9]+)*$/.test(language)) return 'en-US';
  return DEFAULT_LANGUAGE;
}

type LanguageStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface LanguageOptions {
  getStorage: () => LanguageStorage | undefined;
  changeLanguage: (language: AppLanguage) => Promise<unknown>;
  onLanguageChange: (language: AppLanguage) => void;
}

export function createLanguagePreferences(options: LanguageOptions) {
  const readPreference = (): AppLanguage => {
    try {
      return normalizeLanguage(options.getStorage()?.getItem(LANGUAGE_STORAGE_KEY));
    } catch {
      return DEFAULT_LANGUAGE;
    }
  };

  let language = readPreference();
  const initialLanguage = language;
  // Serialize changes so an earlier completion cannot overwrite a later choice.
  let pending: Promise<unknown> = Promise.resolve();

  const apply = (resolveLanguage: () => AppLanguage, persist: boolean) => {
    const change = pending.then(async () => {
      const next = resolveLanguage();
      await options.changeLanguage(next);
      language = next;
      options.onLanguageChange(next);
      let persisted = false;
      if (persist) {
        try {
          const storage = options.getStorage();
          if (storage) {
            storage.setItem(LANGUAGE_STORAGE_KEY, next);
            persisted = true;
          }
        } catch {
          // The in-memory preference still works when browser storage is blocked.
        }
      }
      return { language: next, persisted };
    });
    // A failed change must not prevent the next attempt.
    pending = change.catch(() => undefined);
    return change;
  };

  return {
    initialLanguage,
    getLanguage: () => language,
    setLanguage: (value: unknown) => apply(() => normalizeLanguage(value), true),
    // Re-read storage at execution time rather than trusting an old storage event.
    syncStoredLanguage: () => apply(readPreference, false),
  };
}
