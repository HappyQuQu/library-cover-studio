import i18n from './i18n';

export interface CoverPreview {
  image: string;
  posterCount?: number;
  noteCode?: 'NO_POSTERS_REQUIRED' | 'POSTERS_REUSED' | 'LIBRARY_POSTERS';
  noteParams?: { count?: number };
  /** Kept for compatibility with older servers; never interpreted as a UI translation. */
  note?: string;
}

export function getPreviewNote(preview: CoverPreview): string {
  switch (preview.noteCode) {
    case 'NO_POSTERS_REQUIRED': return i18n.t('taskWizard.previewTextOnly');
    case 'POSTERS_REUSED': return i18n.t('taskWizard.previewReused', { count: preview.noteParams?.count ?? preview.posterCount ?? 0 });
    case 'LIBRARY_POSTERS': return i18n.t('taskWizard.previewLibraryPosters');
    default: return i18n.t('taskWizard.previewReady');
  }
}

/** Older or future servers may only provide source-language notes. Keep them inspectable. */
export function getPreviewNoteDetails(preview: CoverPreview): string | null {
  return ['NO_POSTERS_REQUIRED', 'POSTERS_REUSED', 'LIBRARY_POSTERS'].includes(preview.noteCode || '')
    ? null : preview.note || null;
}
