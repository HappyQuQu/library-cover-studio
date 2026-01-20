import { Link } from 'react-router-dom';
import { Plus, Palette, Loader2, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTemplates, apiClient } from '@/api';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function TemplatesPage() {
  const { data: templates = [], isLoading } = useTemplates();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const queryClient = useQueryClient();

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
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      alert('请上传 ZIP 格式的模板包');
      return;
    }

    setIsImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await apiClient.post('/templates/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      alert('导入成功');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    } catch (error) {
      console.error('Import failed:', error);
      alert('导入失败，请检查文件格式');
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>模板库</h1>
          <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-secondary)' }}>
            管理您的海报设计模板
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".zip"
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
            导入模板
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          {templates.map((template) => {
            // Use backend URL for thumbnail
            const thumbnailUrl = template.thumbnailPath
              ? `${import.meta.env.VITE_API_URL || '/api'}${template.thumbnailPath}`
              : null;
            // Calculate aspect ratio from template dimensions
            const aspectRatio = template.width && template.height
              ? `${template.width}/${template.height}`
              : '16/9';

            return (
              <div key={template.id} className="group relative">
                <Link to={`/editor/${template.id}`}>
                  <div className="card h-full overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1">
                    <div style={{ aspectRatio, background: 'var(--bg-tertiary)', position: 'relative' }}>
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt={template.name}
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

                      {/* Export Button Overlay */}
                      <button
                        onClick={(e) => handleExport(e, template.id, template.name)}
                        className="absolute bottom-2 right-2 p-2 rounded-lg bg-white/90 text-gray-700 opacity-0 group-hover:opacity-100 transition-all hover:bg-white hover:text-primary shadow-md"
                        title="导出 ZIP"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-3">
                      <h3 className="font-medium text-sm text-(--text-primary) truncate">
                        {template.name}
                      </h3>
                      <p className="text-[10px] text-(--text-tertiary) mt-1">
                        {new Date(template.updatedAt).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
