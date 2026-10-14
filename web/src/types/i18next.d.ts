import 'i18next';
import type zhCN from '../locales/zh-CN';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    returnNull: false;
    resources: {
      translation: typeof zhCN;
    };
  }
}
