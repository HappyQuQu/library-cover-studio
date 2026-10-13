import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface TemplateDetails { version: string; description: string; author?: { name: string; url?: string } | null; changelog: string; minAppVersion?: string | null }
export function TemplateMetadata({ open, onOpenChange, value, onApply, readOnly }: {
  open: boolean; onOpenChange: (value: boolean) => void; value: TemplateDetails; onApply: (value: TemplateDetails) => void; readOnly: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [authorName, setAuthorName] = useState('');
  const [authorUrl, setAuthorUrl] = useState('');
  useEffect(() => { if (open) { setDraft(value); setAuthorName(value.author?.name || ''); setAuthorUrl(value.author?.url || ''); } }, [open, value]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="template-metadata-dialog" style={{ width: 'calc(100vw - 32px)', maxWidth: 640, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>
    <DialogHeader><DialogTitle>模板信息</DialogTitle><DialogDescription>版本、作者和说明会随 ZIP 导出。修改后请保存模板。</DialogDescription></DialogHeader>
    <form onSubmit={event => { event.preventDefault(); onApply({ ...draft, author: authorName.trim() ? { name: authorName.trim(), ...(authorUrl.trim() ? { url: authorUrl.trim() } : {}) } : null, minAppVersion: draft.minAppVersion || null }); onOpenChange(false); }}>
      <fieldset disabled={readOnly} className="template-metadata-fields">
        <label>模板版本<input required maxLength={32} pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)" placeholder="1.0.0" value={draft.version} onChange={event => setDraft({ ...draft, version: event.target.value })} /></label>
        <label>作者<input maxLength={100} placeholder="作者名称" value={authorName} onChange={event => setAuthorName(event.target.value)} /></label>
        <label>作者主页<input type="url" maxLength={500} pattern="https?://.*" placeholder="https://github.com/你的账号" value={authorUrl} disabled={!authorName.trim()} onChange={event => setAuthorUrl(event.target.value)} /></label>
        <label>最低应用版本（选填）<input maxLength={32} pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)" placeholder="例如 1.5.0" value={draft.minAppVersion || ''} onChange={event => setDraft({ ...draft, minAppVersion: event.target.value })} /></label>
        <label className="template-metadata-wide">模板说明<textarea maxLength={10000} rows={3} placeholder="设计特点、海报数量、所需字体等" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="template-metadata-wide">本次更新说明<textarea maxLength={10000} rows={3} placeholder="例如：调整标题间距，改善蜂巢海报裁切" value={draft.changelog} onChange={event => setDraft({ ...draft, changelog: event.target.value })} /></label>
      </fieldset>
      <div className="template-metadata-buttons"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>{!readOnly && <Button type="submit">应用信息</Button>}</div>
    </form>
  </DialogContent></Dialog>;
}
