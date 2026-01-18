import { Link } from 'react-router-dom';
import { 
  Server, 
  Palette, 
  Clock, 
  TrendingUp, 
  ArrowRight,
  Sparkles,
  Zap,
  Layers,
  Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useServers, useTemplates, useTasks } from '@/api';

export function DashboardPage() {
  const { data: servers = [] } = useServers();
  const { data: templates = [] } = useTemplates();
  const { data: tasks = [] } = useTasks();

  const stats = [
    { title: '媒体源', value: servers.length, icon: Server, color: '#6366f1' },
    { title: '设计模板', value: templates.length, icon: Palette, color: '#ec4899' },
    { title: '自动化任务', value: tasks.length, icon: Clock, color: '#f59e0b' },
    { title: '本月生成', value: '0', icon: TrendingUp, color: '#22c55e' },
  ];

  const quickActions = [
    {
      title: '连接服务器',
      description: '添加 Jellyfin / Emby 服务器，同步媒体库数据',
      icon: Server,
      to: '/servers',
      gradient: 'gradient-purple-blue',
    },
    {
      title: '创建模板',
      description: '使用可视化编辑器，设计精美的海报风格',
      icon: Palette,
      to: '/editor',
      gradient: 'gradient-pink',
    },
    {
      title: '自动化',
      description: '设置定时任务，自动批量生成封面',
      icon: Zap,
      to: '/tasks',
      gradient: 'gradient-orange',
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '30px', fontWeight: 700, color: 'var(--text-primary)' }}>
            仪表盘
          </h1>
          <p style={{ fontSize: '16px', marginTop: '8px', color: 'var(--text-secondary)' }}>
            欢迎回来，开始美化你的媒体库
          </p>
        </div>
        <Link to="/editor">
          <Button className="btn btn-primary">
            <Sparkles className="w-4 h-4" />
            开始创作
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {stats.map((stat, i) => (
          <div key={i} className="stat-card group">
            <div 
              className="stat-icon"
              style={{ background: `${stat.color}15` }}
            >
              <stat.icon style={{ width: 24, height: 24, color: stat.color }} />
            </div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.title}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
          快速开始
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {quickActions.map((action, i) => (
            <Link key={i} to={action.to}>
              <div className="action-card h-full group">
                <div 
                  className={`${action.gradient}`}
                  style={{ 
                    width: 56, 
                    height: 56, 
                    borderRadius: 16, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    marginBottom: 24,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    transition: 'transform 0.3s'
                  }}
                >
                  <action.icon style={{ width: 28, height: 28, color: 'white' }} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
                  {action.title}
                </h3>
                <p style={{ fontSize: '14px', lineHeight: 1.6, marginBottom: 16, color: 'var(--text-secondary)' }}>
                  {action.description}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, color: 'var(--primary)' }}>
                  <Play style={{ width: 12, height: 12 }} />
                  开始
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Feature Banner */}
      <div className="glass-panel" style={{ padding: 32, position: 'relative', overflow: 'hidden' }}>
        <div 
          style={{ 
            position: 'absolute', 
            top: -80, 
            right: -80, 
            width: 240, 
            height: 240, 
            borderRadius: '50%', 
            filter: 'blur(60px)',
            opacity: 0.5,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.2))'
          }}
        />
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: 32 }}>
          <div 
            className="gradient-pink"
            style={{ 
              width: 80, 
              height: 80, 
              borderRadius: 24, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: '0 12px 32px rgba(236, 72, 153, 0.3)',
              flexShrink: 0
            }}
          >
            <Layers style={{ width: 40, height: 40, color: 'white' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
              专业级海报设计器
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: 600 }}>
              使用强大的 Canvas 编辑器，支持动态变量、图层管理、实时预览。让你的媒体库封面整齐划一，告别杂乱无章。
            </p>
          </div>
          <Link to="/editor">
            <Button className="btn btn-secondary" style={{ flexShrink: 0 }}>
              立即体验
              <ArrowRight style={{ width: 16, height: 16 }} />
            </Button>
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Clock style={{ width: 20, height: 20, color: 'var(--text-tertiary)' }} />
          最近活动
        </div>
        <div className="card-body">
          {tasks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tasks.slice(0, 3).map(task => (
                <div key={task.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {(() => {
                      const server = servers.find(s => s.id === task.serverId);
                      const isJellyfin = server?.type === 'jellyfin';
                      const brandColor = isJellyfin ? 'var(--jellyfin)' : 'var(--emby)';
                      return (
                        <div style={{ 
                          width: 36, height: 36, borderRadius: 10, 
                          background: task.isEnabled ? (isJellyfin ? 'rgba(170, 92, 195, 0.1)' : 'rgba(82, 181, 75, 0.1)') : 'var(--bg-tertiary)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center' 
                        }}>
                          <Clock style={{ width: 18, height: 18, color: task.isEnabled ? brandColor : 'var(--text-tertiary)' }} />
                        </div>
                      );
                    })()}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{task.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {task.lastRunAt ? `最后运行: ${new Date(task.lastRunAt).toLocaleTimeString()}` : '尚未运行'}
                      </div>
                    </div>
                  </div>
                  <Link to="/tasks">
                    <button className="btn-ghost" style={{ fontSize: 12 }}>管理</button>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Clock style={{ width: 32, height: 32 }} />
              </div>
              <div className="empty-state-title">暂无活动</div>
              <div className="empty-state-description">
                开始使用后，你的操作记录将显示在这里
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
