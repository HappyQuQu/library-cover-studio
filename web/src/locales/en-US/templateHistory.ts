import type zh from '../zh-CN/templateHistory';
import type { TranslationShape } from '../types';

export default {
  "baseline": "Initial version",
  "save": "Saved",
  "restore": "Restored",
  "reset": "Default template reset",
  "beforeReset": "Snapshot before reset",
  "imageUnavailable": "Preview unavailable",
  "restored": "Selected version restored",
  "restoredHint": "The restored design was saved as a new revision. You can continue browsing and restoring versions.",
  "restoreFailed": "Unable to restore",
  "title": "Save history",
  "hint": "The latest 50 revisions are kept. Select a preview to view its design. Restoring creates a new revision.",
  "loading": "Loading save history…",
  "loadFailed": "Unable to load save history",
  "empty": "No saved revisions yet. Save a design to see its preview here.",
  "records": "Saved revisions",
  "latest": " · Latest save",
  "preview": "Saved preview: {{name}}",
  "locked": "The template is locked. You can view history; unlock it to restore a revision.",
  "confirmHint": "Restoring replaces the current design and discards unsaved changes. Saved versions remain in history.",
  "confirm": "Restore and save",
  "restoreVersion": "Restore this version",
  "count_other": "{{count}} / {{limit}} revisions",
  "count_one": "{{count}} / {{limit}} revision"
} as const satisfies TranslationShape<typeof zh>;
