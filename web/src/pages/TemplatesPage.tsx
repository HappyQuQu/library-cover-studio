import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, Palette, Loader2, Download, Upload, Lock, Unlock, Copy, Trash2, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTemplates, apiClient, type Template } from '@/api';
import { toast } from '@/components/ui/use-toast';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { getLocalizedApiError } from '@/lib/apiError';
import { ErrorDetails } from '@/components/ErrorDetails';

type ImportFailure = { kind: 'format' } | { kind: 'large' } | { kind: 'empty' } | { kind: 'api'; error: unknown };

export function TemplatesPage() {
  const { t, i18n } = useTranslation();
  const templatesQuery = useTemplates();
  const { data: templates = [], isLoading } = templatesQuery;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState<ImportFailure | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function manage(template: Template, action: 'lock' | 'copy' | 'delete') {
    if (busyId) return;
    if (action === 'delete' && (template.isLocked || !confirm(t('templates.deleteConfirm', { name: template.name })))) return;
    setBusyId(template.id);
    try {
      if (action === 'lock') await apiClient.post(`/templates/${template.id}/lock`, { isLocked: !template.isLocked });
      if (action === 'copy') await apiClient.post(`/templates/${template.id}/duplicate`);
      if (action === 'delete') await apiClient.delete(`/templates/${template.id}`);
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast({ title: action === 'copy' ? i18n.t('templates.copied') : action === 'delete' ? i18n.t('templates.deleted') : template.isLocked ? i18n.t('templates.unlocked') : i18n.t('templates.locked') });
    } catch (error: any) {
      toast({ title: i18n.t('common.error'), description: getLocalizedApiError(error), variant: 'destructive' });
    } finally { setBusyId(null); }
  }

  const handleExport = async (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await apiClient.get(`/templates/${id}/export`, {
        responseType: 'blob'
      });

      // Get filename from header if possible
      const disposition = response.headers['content-disposition'];
      let filename = `${name.replace(/[\\/:*?"<>|]/g, '_').trim()}.zip`;
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const matches = /filename="([^"]+)"/.exec(disposition);
        if (matches && matches[1]) {
          filename = decodeURIComponent(matches[1]);
        }
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      toast({ title: i18n.t('templates.exportFailed'), description: i18n.t('templates.exportFailedHint'), variant: 'destructive' });
    }
  };

  const handleImportClick = () => {
    setImportError(null);
    setImportFileName('');
    setImportOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || isImporting) return;
    setImportFileName(file.name);
    setImportError(null);

    if (!/\.zip$/i.test(file.name)) {
      setImportError({ kind: 'format' });
      return;
    }
    if (!file.size || file.size > 64 * 1024 * 1024) {
      setImportError({ kind: file.size ? 'large' : 'empty' });
      return;
    }

    setIsImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data: imported } = await apiClient.post<{ id: string; name: string; fonts?: { name: string; action: 'installed' | 'reused' }[] }>('/templates/import', formData, {
        timeout: 90000,
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setImportOpen(false);
      const installed = imported.fonts?.filter(font => font.action === 'installed').length || 0;
      toast({ title: i18n.t('templates.imported', { name: imported.name }), description: installed
        ? i18n.t('templates.fontsInstalled', { count: installed })
        : i18n.t('templates.importedHint'), variant: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    } catch (error: unknown) {
      setImportError({ kind: 'api', error });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div className="page-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{t('templates.title')}</h1>
          <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-secondary)' }}>
            {t('templates.description')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/template-store"><Button className="btn btn-secondary"><Store size={16} />{t('nav.templateStore')}</Button></Link>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={handleFileChange}
          />
          <Button
            className="btn btn-secondary"
            onClick={handleImportClick}
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {isImporting ? t('templates.importing') : t('templates.import')}
          </Button>
          <Link to="/editor">
            <Button className="btn btn-primary">
              <Plus style={{ width: 16, height: 16 }} />
              {t('templates.new')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Template Grid */}
      {isLoading ? (
        <div role="status" aria-label={t('common.loading')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <Loader2 style={{ width: 32, height: 32, color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : templatesQuery.isError ? <div className="card card-body" role="alert">
        <p>{t('templates.loadFailed')}</p><Button variant="outline" onClick={() => void templatesQuery.refetch()}>{t('common.retry')}</Button>
      </div> : templates.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Palette style={{ width: 32, height: 32 }} />
            </div>
            <div className="empty-state-title">{t('templates.empty')}</div>
            <div className="empty-state-description" style={{ marginBottom: '20px' }}>
              {t('templates.emptyHint')}
            </div>
            <Link to="/editor">
              <Button className="btn btn-primary">
                <Plus style={{ width: 16, height: 16 }} />
                {t('templates.openDesigner')}
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="template-library-grid">
          {[...templates].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).map((template) => {
            // Saved thumbnails are private assets, fetched with the API credentials.
            const thumbnailUrl = template.thumbnailPath
              ? `/templates/${template.id}/thumbnail`
              : null;
            // Calculate aspect ratio from template dimensions
            const aspectRatio = template.width && template.height
              ? `${template.width}/${template.height}`
              : '16/9';

            return (
              <article key={template.id} className="template-library-card">
                <Link to={`/editor/${template.id}`} className="template-library-open" aria-label={t('templates.openLabel', { name: template.name })}>
                    <div style={{ aspectRatio, background: 'var(--bg-tertiary)', position: 'relative' }}>
                      {thumbnailUrl ? (
                        <AuthenticatedImage
                          src={thumbnailUrl}
                          refreshKey={template.updatedAt}
                          alt={template.name}
                          fallback={<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Palette style={{ width: 32, height: 32, color: 'var(--text-tertiary)' }} /></div>}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Palette style={{ width: 32, height: 32, color: 'var(--text-tertiary)' }} />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-[10px] backdrop-blur-sm">
                        {template.width}×{template.height}
                      </div>

                      <div className="template-library-badges">{template.isDefault && <span>{t('templates.default')}</span>}{template.isLocked && <span className="template-lock-badge"><Lock size={11} />{t('templates.lockedBadge')}</span>}</div>
                    </div>
                    <div className="p-3">
                      <h3 className="font-medium text-sm text-(--text-primary) truncate">
                        {template.name}
                      </h3>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>v{template.version || '1.0.0'} · {template.author?.name || t('templates.unknownAuthor')}</p>
                      <p className="template-library-description">
                        {template.description || t('templates.customDescription')}
                      </p>
                    </div>
                </Link>
                <div className="template-library-actions">
                  <button onClick={() => manage(template, 'copy')} disabled={!!busyId} title={t('templates.copyLabel', { name: template.name })}><Copy size={15} />{t('common.copy')}</button>
                  <button onClick={e => handleExport(e, template.id, template.name)} title={t('templates.exportLabel', { name: template.name })}><Download size={15} />{t('common.export')}</button>
                  {template.canManage && <>
                    <button onClick={() => manage(template, 'lock')} disabled={!!busyId} title={template.isLocked ? t('templates.unlockLabel', { name: template.name }) : t('templates.lockLabel', { name: template.name })} className={template.isLocked ? 'template-action-locked' : ''}>{busyId === template.id ? <Loader2 size={15} className="animate-spin" /> : template.isLocked ? <Unlock size={15} /> : <Lock size={15} />}{template.isLocked ? t('common.unlock') : t('common.lock')}</button>
                    <button className="template-action-delete" onClick={() => manage(template, 'delete')} disabled={template.isLocked || !!busyId} title={template.isLocked ? t('templates.unlockFirst') : t('templates.deleteLabel', { name: template.name })} aria-label={t('templates.deleteLabel', { name: template.name })}><Trash2 size={15} /></button>
                  </>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Dialog open={importOpen} onOpenChange={open => { if (!isImporting) setImportOpen(open); }}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader><DialogTitle>{t('templates.import')}</DialogTitle><DialogDescription>{t('templates.importDescription')}</DialogDescription></DialogHeader>
          <div className="template-import-guide">
            <p>{t('templates.packageLimits')}</p>
            <pre><code>{t('templates.packageTree')}</code></pre>
            <p>{t('templates.fontsHint')}</p>
            <p>{t('templates.rootHint')}</p>
          </div>
          {importFileName && <p className="template-import-file">{t('templates.selectedFile', { name: importFileName })}</p>}
          {importError && <div className="template-import-error" role="alert"><strong>{t('templates.importIncomplete')}</strong>
            <p>{importError.kind === 'format' ? t('templates.zipRequired') : importError.kind === 'large' ? t('templates.tooLarge') : importError.kind === 'empty' ? t('templates.emptyFile') : getLocalizedApiError(importError.error, 'import')}</p>
            {importError.kind === 'api' && <ErrorDetails error={importError.error} />}
            <p>{t('templates.correctAndRetry')}</p></div>}
          {isImporting && <div className="template-import-progress" role="status"><Loader2 size={18} className="animate-spin" />{t('templates.validating')}</div>}
          <DialogFooter style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <Button className="btn btn-secondary" disabled={isImporting} onClick={() => setImportOpen(false)}>{t('common.cancel')}</Button>
            <Button className="btn btn-primary" disabled={isImporting} onClick={() => fileInputRef.current?.click()}><Upload size={16} />{isImporting ? t('templates.importing') : importError ? t('templates.reselect') : t('templates.selectZip')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
