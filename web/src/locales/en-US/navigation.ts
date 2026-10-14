import type zh from '../zh-CN/navigation';
import type { TranslationShape } from '../types';

export default {
  "dashboard": "Dashboard",
  "servers": "Media Sources",
  "templates": "Templates",
  "tasks": "Automation",
  "settings": "Settings",
  "templateStore": "Template Store",
  "designer": "Designer",
  "users": "Users",
  "main": "Main navigation",
  "account": "Account: {{username}}",
  "personalSettings": "Personal settings",
  "logout": "Sign out"
} as const satisfies TranslationShape<typeof zh>;
