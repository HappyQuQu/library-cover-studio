import { useTranslation } from 'react-i18next';
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
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { useServers, useCreateServer, useDeleteServer, useServerLibraries, useServerConnection, MediaServer } from '@/api';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { toast } from '@/components/ui/use-toast';
import { getLocalizedApiError } from '@/lib/apiError';
import { ErrorDetails } from '@/components/ErrorDetails';

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
  const { t, i18n } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const librariesQuery = useServerLibraries(isExpanded ? server.id : '');
  const { data: libraries = [], isLoading: loadingLibraries } = librariesQuery;
  const connectionQuery = useServerConnection(server.id);
  const connection = connectionQuery.data;
  const refresh = async () => {
    const results = await Promise.all([connectionQuery.refetch(), ...(isExpanded ? [librariesQuery.refetch()] : [])]);
    const error = results.find(result => result.error)?.error;
    if (error || !results[0].data || !('connected' in results[0].data) || !results[0].data.connected) {
      toast({ title: i18n.t('servers.refreshFailed'), description: getLocalizedApiError(error || results[0].data, 'connection'), variant: 'destructive' });
      return;
    }
    setRefreshKey(value => value + 1);
    toast({ title: i18n.t('servers.refreshSuccess'), description: isExpanded ? i18n.t('servers.refreshedAll') : i18n.t('servers.refreshedConnection') });
  };

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px' }}>
        <div className="server-card-heading" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div className="server-card-identity" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
              <div className="server-card-status" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                <span className={`badge ${server.type === 'jellyfin' ? 'badge-primary' : 'badge-success'}`}>
                  {server.type}{connection?.version ? ` ${connection.version}` : ''}
                </span>
                {connectionQuery.isFetching ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-tertiary)' }}><Loader2 size={14} className="animate-spin" />{t('servers.checking')}</span>
                ) : connection?.connected ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--success)' }}>
                    <CheckCircle2 style={{ width: 14, height: 14 }} />
                    {t('servers.online')}
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--danger)' }}>
                    <XCircle style={{ width: 14, height: 14 }} />
                    {t('servers.offline')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="server-card-actions" style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-ghost btn-icon" aria-label={t('servers.refreshConnection')} onClick={refresh} disabled={connectionQuery.isFetching || librariesQuery.isFetching}><RefreshCw style={{ width: 16, height: 16 }} /></button>
            <button className="btn-ghost btn-icon" aria-label={t('servers.deleteLabel', { name: server.name })} onClick={() => onDelete(server.id)} style={{ color: 'var(--danger)' }}>
              <Trash2 style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>

        {(connection?.error || connectionQuery.error) && <div role="alert" style={{ marginTop: 12, fontSize: 13, color: 'var(--danger)' }}>
          <p>{getLocalizedApiError(connectionQuery.error || connection, 'connection')}</p>
          <ErrorDetails error={connectionQuery.error || connection} />
        </div>}
        {/* URL */}
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
          <div className="server-card-address" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
              {t('servers.libraries')}
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
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{t('servers.discoveredLibraries')}</span>
            <button
              className="btn-ghost"
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}
              disabled={connectionQuery.isFetching || librariesQuery.isFetching}
              onClick={refresh}
            >
              <RefreshCw style={{ width: 12, height: 12 }} />
              {t('servers.refreshLibraries')}
            </button>
          </div>

          {loadingLibraries ? (
            <div role="status" aria-label={t('common.loading')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <Loader2 style={{ width: 20, height: 20, color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : librariesQuery.isError ? (
            <div role="alert" style={{ padding: 20, color: 'var(--danger)', fontSize: 14 }}>
              <p>{t('servers.libraryReadFailed', { reason: getLocalizedApiError(librariesQuery.error, 'connection') })}</p>
              <ErrorDetails error={librariesQuery.error} />
            </div>
          ) : libraries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-tertiary)', fontSize: 14, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px dashed var(--border-color)' }}>
              <Folder style={{ width: 24, height: 24, margin: '0 auto 8px', opacity: 0.5 }} />
              <div>{t('servers.noLibraries')}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{t('servers.noLibrariesHint')}</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
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
                      <AuthenticatedImage src={lib.imageUrl} refreshKey={refreshKey} alt={lib.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.5s' }}
                        className="group-hover/lib:scale-110"
                        fallback={<Icon style={{ width: 56, height: 56, color: server.type === 'jellyfin' ? 'var(--jellyfin)' : 'var(--emby)', opacity: 0.8 }} />} />
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
                        {lib.itemCount !== undefined ? t('servers.itemCount', { count: lib.itemCount }) : lib.type}
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
  const { t, i18n } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'jellyfin' as 'jellyfin' | 'emby',
    url: '',
    apiKey: ''
  });

  const serversQuery = useServers();
  const { data: servers = [], isLoading } = serversQuery;
  const createMutation = useCreateServer();
  const deleteMutation = useDeleteServer();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      toast({ title: i18n.t('servers.created'), description: i18n.t('servers.createdHint') });
      setIsDialogOpen(false);
      setFormData({ name: '', type: 'jellyfin', url: '', apiKey: '' });
    } catch (error: any) {
      toast({
        title: i18n.t('servers.createFailed'),
        description: getLocalizedApiError(error, 'connection'),
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('servers.deleteConfirm'))) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: i18n.t('servers.deleted'), description: i18n.t('servers.deletedHint') });
    } catch (error) {
      toast({ title: i18n.t('servers.deleteFailed'), variant: 'destructive' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div className="page-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{t('servers.title')}</h1>
          <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--text-secondary)' }}>
            {t('servers.description')}
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn btn-primary">
              <Plus style={{ width: 16, height: 16 }} />
              {t('servers.addServer')}
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
                <DialogTitle style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {t('servers.addTitle')}
                </DialogTitle>
                <DialogDescription style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {t('servers.addHint')}
                </DialogDescription>
              </div>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="server-name" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{t('servers.serverName')}</label>
                <Input
                  id="server-name"
                  placeholder={t('servers.namePlaceholder')}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="input"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{t('servers.serverType')}</label>
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
                <label htmlFor="server-url" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{t('servers.serverUrl')}</label>
                <Input
                  id="server-url"
                  placeholder="http://192.168.1.10:8096"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  required
                  type="url"
                  className="input"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label htmlFor="server-api-key" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{t('servers.apiKey')}</label>
                <Input
                  id="server-api-key"
                  placeholder={t('servers.keyPlaceholder')}
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  required
                  type="password"
                  className="input"
                />
              </div>

              <DialogFooter>
                <Button type="button" className="btn btn-secondary" onClick={() => setIsDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />}
                  {t('servers.connect')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Server List */}
      {isLoading ? (
        <div role="status" aria-label={t('common.loading')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <Loader2 style={{ width: 32, height: 32, color: 'var(--text-tertiary)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : serversQuery.isError ? <div className="card card-body" role="alert">
        <p>{t('servers.loadFailed')}</p><Button variant="outline" onClick={() => void serversQuery.refetch()}>{t('common.retry')}</Button>
      </div> : servers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Server style={{ width: 32, height: 32 }} />
            </div>
            <div className="empty-state-title">{t('servers.empty')}</div>
            <div className="empty-state-description" style={{ marginBottom: '20px' }}>
              {t('servers.emptyHint')}
            </div>
            <Button className="btn btn-primary" onClick={() => setIsDialogOpen(true)}>
              <Plus style={{ width: 16, height: 16 }} />
              {t('servers.addServer')}
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
