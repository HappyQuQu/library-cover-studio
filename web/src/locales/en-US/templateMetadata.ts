import type zh from '../zh-CN/templateMetadata';
import type { TranslationShape } from '../types';

export default {
  "title": "Template details",
  "hint": "Version, author and descriptions are included in ZIP exports. Save the template after applying changes.",
  "version": "Template version",
  "author": "Author",
  "authorPlaceholder": "Author name",
  "authorUrl": "Author website",
  "urlPlaceholder": "https://github.com/your-account",
  "minVersion": "Minimum app version (optional)",
  "versionPlaceholder": "For example: 1.5.0",
  "description": "Template description",
  "descriptionPlaceholder": "Design features, poster count, required fonts, etc.",
  "changelog": "Release notes",
  "changelogPlaceholder": "For example: Adjust title spacing and improve poster cropping",
  "apply": "Apply details"
} as const satisfies TranslationShape<typeof zh>;
