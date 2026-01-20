import { useState } from 'react';
import {
  Plus,
  Server,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Folder,
  Film,
  Tv,
  Music,
  Book,
  Image as ImageIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { useServers, useCreateServer, useDeleteServer, useServerLibraries, MediaServer } from '@/api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';

// 获取媒体库类型图标
function getLibraryIcon(type: string) {
  switch (type.toLowerCase()) {
    case 'movies': return Film;
    case 'tvshows': return Tv;
    case 'music': return Music;
    case 'books': return Book;
    case 'photos': return ImageIcon;
    default: return Folder;
  }
}

// 服务器卡片组件
function ServerCard({ server, onDelete }: { server: MediaServer; onDelete: (id: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const queryClient = useQueryClient();
  const { data: libraries = [], isLoading: loadingLibraries } = useServerLibraries(
    isExpanded ? server.id : ''
  );

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              className={server.type === 'jellyfin' ? 'gradient-jellyfin' : 'gradient-emby'}
              style={{
                width: 52, height: 52, borderRadius: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: server.type === 'jellyfin'
                  ? '0 8px 24px rgba(170, 92, 195, 0.25)'
                  : '0 8px 24px rgba(82, 181, 75, 0.25)'
              }}
            >
              <Server style={{ width: 26, height: 26, color: 'white' }} />
            </div>
            <div>
              <h3 style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{server.name}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                <span className={`badge ${server.type === 'jellyfin' ? 'badge-primary' : 'badge-success'}`}>
                  {server.type}
                </span>
                {server.isActive ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--success)' }}>
                    <CheckCircle2 style={{ width: 14, height: 14 }} />
                    在线
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--danger)' }}>
                    <XCircle style={{ width: 14, height: 14 }} />
                    离线
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-ghost btn-icon"><RefreshCw style={{ width: 16, height: 16 }} /></button>
            <button className="btn-ghost btn-icon" onClick={() => onDelete(server.id)} style={{ color: 'var(--danger)' }}>
              <Trash2 style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>

        {/* URL */}
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-secondary)', overflow: 'hidden' }}>
              <ExternalLink style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{server.url}</span>
            </div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              媒体库
              {isExpanded ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
            </button>
          </div>
        </div>
      </div>

      {/* Libraries */}
      {isExpanded && (
        <div style={{
          background: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border-color)',
          padding: '16px 20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>检测到的媒体库</span>
            <button
              className="btn-ghost"
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['servers', server.id, 'libraries'] });
                setRefreshKey(prev => prev + 1);
                toast({ title: '刷新成功', description: '媒体库列表已更新' });
              }}
            >
              <RefreshCw style={{ width: 12, height: 12 }} />
              刷新列表
            </button>
          </div>

          {loadingLibraries ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <Loader2 style={{ width: 20, height: 20, color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : libraries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-tertiary)', fontSize: 14, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px dashed var(--border-color)' }}>
              <Folder style={{ width: 24, height: 24, margin: '0 auto 8px', opacity: 0.5 }} />
              <div>未发现公开媒体库</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>请确保 API 密钥具有访问权限</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
              {libraries.map((lib) => {
                const Icon = getLibraryIcon(lib.type);
                return (
                  <div
                    key={lib.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      padding: '12px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 16,
                      border: '1px solid var(--border-color)',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      cursor: 'pointer',
                      position: 'relative'
                    }}
                    className="group/lib hover:border-(--primary)/50 hover:translate-y-[-4px]"
                  >
                    <div style={{
                      width: '100%',
                      aspectRatio: '16 / 9',
                      borderRadius: 12,
                      background: 'var(--bg-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      border: '1px solid var(--border-color)',
                      flexShrink: 0,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      position: 'relative'
                    }}>
                      {lib.imageUrl ? (
                        <img
                          src={`${lib.imageUrl}${lib.imageUrl.includes('?') ? '&' : '?'}_t=${refreshKey}`}
                          alt={lib.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s' }}
                          className="group-hover/lib:scale-110"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <Icon style={{ width: 56, height: 56, color: server.type === 'jellyfin' ? 'var(--jellyfin)' : 'var(--emby)', opacity: 0.8 }} />
                      )}
                      {/* Fallback pattern / Icon background */}
                      <div style={{ position: 'absolute', zIndex: -1, opacity: 0.1 }}>
                        <Icon style={{ width: 80, height: 80, color: server.type === 'jellyfin' ? 'var(--jellyfin)' : 'var(--emby)' }} />
                      </div>
                    </div>

                    <div style={{ padding: '0 4px 4px 4px' }}>
                      <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {lib.name}
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: 'var(--text-tertiary)',
                        marginTop: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: server.type === 'jellyfin' ? 'var(--jellyfin)' : 'var(--emby)',
                          opacity: 0.8
                        }} />
                        {lib.itemCount !== undefined ? `${lib.itemCount} 项` : lib.type}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ServersPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'jellyfin' as 'jellyfin' | 'emby',
    url: '',
    apiKey: ''
  });

  const { data: servers = [], isLoading } = useServers();
  const createMutation = useCreateServer();
  const deleteMutation = useDeleteServer();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      toast({ title: '连接成功 🎉', description: '媒体服务器已添加' });
      setIsDialogOpen(false);
      setFormData({ name: '', type: 'jellyfin', url: '', apiKey: '' });
    } catch (error: any) {
      toast({
        title: '连接失败',
        description: error.response?.data?.error?.message || '无法连接到服务器',
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此服务器吗?')) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: '已删除', description: '服务器已移除' });
    } catch (error) {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>媒体源</h1>
          <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-secondary)' }}>
            管理您的 Jellyfin / Emby 服务器连接
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn btn-primary">
              <Plus style={{ width: 16, height: 16 }} />
              添加服务器
            </Button>
          </DialogTrigger>
          <DialogContent>
            {/* Header with Icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div
                className="gradient-purple-blue"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)'
                }}
              >
                <Server style={{ width: 24, height: 24, color: 'white' }} />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  添加媒体服务器
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  连接您的 Jellyfin 或 Emby
                </p>
              </div>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>服务器名称</label>
                <Input
                  placeholder="例如：家庭影院"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="input"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>服务器类型</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {['jellyfin', 'emby'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: type as 'jellyfin' | 'emby' })}
                      style={{
                        padding: '14px',
                        borderRadius: '12px',
                        border: `1px solid ${formData.type === type ? (type === 'jellyfin' ? 'var(--jellyfin)' : 'var(--emby)') : 'var(--border-color)'}`,
                        background: formData.type === type
                          ? (type === 'jellyfin' ? 'rgba(170, 92, 195, 0.1)' : 'rgba(82, 181, 75, 0.1)')
                          : 'var(--bg-primary)',
                        color: formData.type === type
                          ? (type === 'jellyfin' ? 'var(--jellyfin)' : 'var(--emby)')
                          : 'var(--text-secondary)',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <Server style={{ width: 20, height: 20 }} />
                      {type === 'jellyfin' ? 'Jellyfin' : 'Emby'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>服务器地址</label>
                <Input
                  placeholder="http://192.168.1.10:8096"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  required
                  type="url"
                  className="input"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>API 密钥</label>
                <Input
                  placeholder="从服务器控制台获取"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  required
                  type="password"
                  className="input"
                />
              </div>

              <DialogFooter>
                <Button type="button" className="btn btn-secondary" onClick={() => setIsDialogOpen(false)}>
                  取消
                </Button>
                <Button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />}
                  连接
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Server List */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <Loader2 style={{ width: 32, height: 32, color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : servers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Server style={{ width: 32, height: 32 }} />
            </div>
            <div className="empty-state-title">尚未添加服务器</div>
            <div className="empty-state-description" style={{ marginBottom: '20px' }}>
              添加您的第一个媒体服务器
            </div>
            <Button className="btn btn-primary" onClick={() => setIsDialogOpen(true)}>
              <Plus style={{ width: 16, height: 16 }} />
              添加服务器
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          {servers.map((server) => (
            <ServerCard key={server.id} server={server} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
