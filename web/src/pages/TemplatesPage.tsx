import { Link } from 'react-router-dom';
import { Plus, Palette, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTemplates } from '@/api';

export function TemplatesPage() {
  const { data: templates = [], isLoading } = useTemplates();


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
        <Link to="/editor">
          <Button className="btn btn-primary">
            <Plus style={{ width: 16, height: 16 }} />
            新建模板
          </Button>
        </Link>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
          {templates.map((template) => (
            <Link key={template.id} to={`/editor/${template.id}`}>
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ aspectRatio: '2/3', background: 'var(--bg-tertiary)', position: 'relative' }}>
                  {template.thumbnailPath ? (
                    <img
                      src={template.thumbnailPath}
                      alt={template.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Palette style={{ width: 32, height: 32, color: 'var(--text-tertiary)' }} />
                    </div>
                  )}
                  <div style={{ 
                    position: 'absolute', 
                    top: 8, 
                    right: 8, 
                    padding: '4px 8px', 
                    borderRadius: 6, 
                    background: 'rgba(0,0,0,0.6)', 
                    color: 'white', 
                    fontSize: 11 
                  }}>
                    {template.width}×{template.height}
                  </div>
                </div>
                <div style={{ padding: '12px' }}>
                  <h3 style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {template.name}
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    {new Date(template.updatedAt).toLocaleDateString('zh-CN')}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
