import { useI18n } from 'vue-i18n';

export function useLocale() {
  const { locale, t } = useI18n();

  const toggleLocale = () => {
    const newLocale = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN';
    locale.value = newLocale;
    localStorage.setItem('locale', newLocale);
  };

  return {
    locale,
    t,
    toggleLocale,
  };
}
