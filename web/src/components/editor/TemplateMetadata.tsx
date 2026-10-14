import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LanguageSelect } from '@/components/LanguageSelect';

export interface TemplateDetails { version: string; description: string; author?: { name: string; url?: string } | null; changelog: string; minAppVersion?: string | null }
export function TemplateMetadata({ open, onOpenChange, value, onApply, readOnly }: {
  open: boolean; onOpenChange: (value: boolean) => void; value: TemplateDetails; onApply: (value: TemplateDetails) => void; readOnly: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [authorName, setAuthorName] = useState('');
  const [authorUrl, setAuthorUrl] = useState('');
  useEffect(() => { if (open) { setDraft(value); setAuthorName(value.author?.name || ''); setAuthorUrl(value.author?.url || ''); } }, [open, value]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="template-metadata-dialog" style={{ width: 'calc(100vw - 32px)', maxWidth: 640, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>
    <DialogHeader><DialogTitle>{t('templateMetadata.title')}</DialogTitle><DialogDescription>{t('templateMetadata.hint')}</DialogDescription></DialogHeader>
    <LanguageSelect compact />
    <form onSubmit={event => { event.preventDefault(); onApply({ ...draft, author: authorName.trim() ? { name: authorName.trim(), ...(authorUrl.trim() ? { url: authorUrl.trim() } : {}) } : null, minAppVersion: draft.minAppVersion || null }); onOpenChange(false); }}>
      <fieldset disabled={readOnly} className="template-metadata-fields">
        <label>{t('templateMetadata.version')}<input required maxLength={32} pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)" placeholder="1.0.0" value={draft.version} onChange={event => setDraft({ ...draft, version: event.target.value })} /></label>
        <label>{t('templateMetadata.author')}<input maxLength={100} placeholder={t('templateMetadata.authorPlaceholder')} value={authorName} onChange={event => setAuthorName(event.target.value)} /></label>
        <label>{t('templateMetadata.authorUrl')}<input type="url" maxLength={500} pattern="https?://.*" placeholder={t('templateMetadata.urlPlaceholder')} value={authorUrl} disabled={!authorName.trim()} onChange={event => setAuthorUrl(event.target.value)} /></label>
        <label>{t('templateMetadata.minVersion')}<input maxLength={32} pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)" placeholder={t('templateMetadata.versionPlaceholder')} value={draft.minAppVersion || ''} onChange={event => setDraft({ ...draft, minAppVersion: event.target.value })} /></label>
        <label className="template-metadata-wide">{t('templateMetadata.description')}<textarea maxLength={10000} rows={3} placeholder={t('templateMetadata.descriptionPlaceholder')} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="template-metadata-wide">{t('templateMetadata.changelog')}<textarea maxLength={10000} rows={3} placeholder={t('templateMetadata.changelogPlaceholder')} value={draft.changelog} onChange={event => setDraft({ ...draft, changelog: event.target.value })} /></label>
      </fieldset>
      <div className="template-metadata-buttons"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.close')}</Button>{!readOnly && <Button type="submit">{t('templateMetadata.apply')}</Button>}</div>
    </form>
  </DialogContent></Dialog>;
}
