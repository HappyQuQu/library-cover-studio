import type zh from '../zh-CN/defaultTemplates';
import type { TranslationShape } from '../types';

export default {
  "restored": "Default templates restored",
  "unchanged": "Default templates already match the built-in designs",
  "restoredHint": "Restored {{restored}} and recreated {{recreated}} templates. Previous designs are retained in history.",
  "complete_one": "The {{count, number}} default template is present and locked.",
  "complete_other": "All {{count, number}} default templates are present and locked.",
  "failed": "Restore failed",
  "section": "Default template recovery",
  "title": "Restore default templates",
  "hint": "Restore built-in layouts, text, backgrounds and previews, recreate missing default templates and lock them again.",
  "loading": "Loading default templates…",
  "loadFailed": "Unable to load template status",
  "status": "Default templates: {{total}} · Modified: {{modified}} · Missing: {{missing}}",
  "restoring": "Restoring…",
  "restoreAll": "Restore all default templates",
  "confirmTitle": "Restore all default templates?",
  "confirmHint_one": "Restore this {{count, number}} template to its built-in version. Custom templates and copies are retained.",
  "confirmHint_other": "Restore these {{count, number}} templates to their built-in versions. Custom templates and copies are retained.",
  "listLabel": "Default templates to restore",
  "recreateBadge": " · Recreate",
  "restoreBadge": " · Restore",
  "historyHint": "The previous saved design is kept in each template's latest 50 revisions. Restored templates are locked; unlock them to recover changes from history.",
  "taskHint": "Tasks using default templates will use the restored design on their next run.",
  "confirm": "Restore default templates"
} as const satisfies TranslationShape<typeof zh>;
