import { Link } from 'react-router-dom';
import { Plus, Palette, Loader2, Download, Upload, Lock, Unlock, Copy, Trash2, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTemplates, apiClient, type Template } from '@/api';
import { toast } from '@/components/ui/use-toast';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export function TemplatesPage() {
  const { data: templates = [], isLoading } = useTemplates();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function manage(template: Template, action: 'lock' | 'copy' | 'delete') {
    if (busyId) return;
    if (action === 'delete' && (template.isLocked || !confirm(`确定删除模板「${template.name}」吗？`))) return;
    setBusyId(template.id);
    try {
      if (action === 'lock') await apiClient.post(`/templates/${template.id}/lock`, { isLocked: !template.isLocked });
      if (action === 'copy') await apiClient.post(`/templates/${template.id}/duplicate`);
      if (action === 'delete') await apiClient.delete(`/templates/${template.id}`);
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast({ title: action === 'copy' ? '已创建可编辑、未锁定的副本' : action === 'delete' ? '模板已删除' : template.isLocked ? '模板已解锁' : '模板已锁定，编辑和删除前需先解锁' });
    } catch (error: any) {
      toast({ title: '操作失败', description: error.response?.data?.error?.message || error.response?.data?.message || '请刷新后重试', variant: 'destructive' });
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
      toast({ title: '模板导出失败', description: '请检查网络连接，然后重新导出。', variant: 'destructive' });
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
      setImportError('请选择 ZIP 格式的模板包。可以在模板库导出，或从模板商店下载单套模板 ZIP。');
      return;
    }
    if (!file.size || file.size > 5 * 1024 * 1024) {
      setImportError(file.size ? '模板包超过 5 MB，请压缩预览图后重新打包。' : '这个文件为空，请重新导出或下载模板包。');
      return;
    }

    setIsImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data: imported } = await apiClient.post<{ id: string; name: string }>('/templates/import', formData, {
        timeout: 90000,
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setImportOpen(false);
      toast({ title: `「${imported.name}」导入成功`, description: '已添加为可编辑的新模板，现在可以在设计器和自动化中选择。', variant: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    } catch (error: unknown) {
      const response = error as { code?: string; response?: { status?: number; data?: { error?: { message?: string } } } };
      setImportError(response.response?.status === 413 ? '模板包超过上传大小限制，请将文件压缩到 5 MB 以内后重试。'
        : response.code === 'ECONNABORTED' ? '导入超时，请稍后刷新模板库确认是否已导入，再决定是否重试。'
        : response.response?.data?.error?.message || (response.response ? '服务器暂时无法处理这个模板包，请重新导出后重试。' : '无法连接服务器，请检查网络连接后重试。'));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div className="page-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>模板库</h1>
          <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-secondary)' }}>
            默认模板可直接用于自动化；锁定保护模板，解锁后才能编辑、回退或删除。
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/template-store"><Button className="btn btn-secondary"><Store size={16} />模板商店</Button></Link>
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
            {isImporting ? '正在导入…' : '导入模板'}
          </Button>
          <Link to="/editor">
            <Button className="btn btn-primary">
              <Plus style={{ width: 16, height: 16 }} />
              新建模板
            </Button>
          </Link>
        </div>
      </div>

      {/* Template Grid */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <Loader2 style={{ width: 32, height: 32, color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : templates.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Palette style={{ width: 32, height: 32 }} />
            </div>
            <div className="empty-state-title">尚未创建模板</div>
            <div className="empty-state-description" style={{ marginBottom: '20px' }}>
              使用设计器创建您的第一个模板
            </div>
            <Link to="/editor">
              <Button className="btn btn-primary">
                <Plus style={{ width: 16, height: 16 }} />
                打开设计器
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
                <Link to={`/editor/${template.id}`} className="template-library-open" aria-label={`打开模板 ${template.name}`}>
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

                      <div className="template-library-badges">{template.isDefault && <span>默认模板</span>}{template.isLocked && <span className="template-lock-badge"><Lock size={11} />已锁定</span>}</div>
                    </div>
                    <div className="p-3">
                      <h3 className="font-medium text-sm text-(--text-primary) truncate">
                        {template.name}
                      </h3>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>v{template.version || '1.0.0'} · {template.author?.name || '未标注作者'}</p>
                      <p className="template-library-description">
                        {template.description || '自定义封面设计'}
                      </p>
                    </div>
                </Link>
                <div className="template-library-actions">
                  <button onClick={() => manage(template, 'copy')} disabled={!!busyId} title={`复制模板 ${template.name}`}><Copy size={15} />复制</button>
                  <button onClick={e => handleExport(e, template.id, template.name)} title={`导出模板 ${template.name}`}><Download size={15} />导出</button>
                  {template.canManage && <>
                    <button onClick={() => manage(template, 'lock')} disabled={!!busyId} title={template.isLocked ? `解锁模板 ${template.name}` : `锁定模板 ${template.name}`} className={template.isLocked ? 'template-action-locked' : ''}>{busyId === template.id ? <Loader2 size={15} className="animate-spin" /> : template.isLocked ? <Unlock size={15} /> : <Lock size={15} />}{template.isLocked ? '解锁' : '锁定'}</button>
                    <button className="template-action-delete" onClick={() => manage(template, 'delete')} disabled={template.isLocked || !!busyId} title={template.isLocked ? '模板已锁定，请先解锁再删除' : `删除模板 ${template.name}`} aria-label={`删除模板 ${template.name}`}><Trash2 size={15} /></button>
                  </>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Dialog open={importOpen} onOpenChange={open => { if (!isImporting) setImportOpen(open); }}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader><DialogTitle>导入模板</DialogTitle><DialogDescription>选择单套模板 ZIP，导入后会添加到模板库，原有模板会保留。</DialogDescription></DialogHeader>
          <div className="template-import-guide">
            <p>支持从应用导出的模板包，或模板商店 Releases 中的单套 ZIP，文件大小不超过 <strong>5 MB</strong>。</p>
            <pre><code>模板.zip{'\n'}├── template.json{'\n'}└── preview.jpg / png / webp</code></pre>
            <p><code>template.json</code> 要直接放在 ZIP 根目录。GitHub 的整个仓库 Source code ZIP 需要先解压，再把单套模板的文件重新打包。</p>
          </div>
          {importFileName && <p className="template-import-file">已选择：{importFileName}</p>}
          {importError && <div className="template-import-error" role="alert"><strong>导入未完成</strong><p>{importError}</p><p>请修正后重新选择文件。</p></div>}
          {isImporting && <div className="template-import-progress" role="status"><Loader2 size={18} className="animate-spin" />正在上传并校验模板，请稍候…</div>}
          <DialogFooter style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <Button className="btn btn-secondary" disabled={isImporting} onClick={() => setImportOpen(false)}>取消</Button>
            <Button className="btn btn-primary" disabled={isImporting} onClick={() => fileInputRef.current?.click()}><Upload size={16} />{isImporting ? '正在导入…' : importError ? '重新选择 ZIP' : '选择 ZIP 文件'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
