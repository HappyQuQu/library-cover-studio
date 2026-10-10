import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Palette,
  Clock,
  Settings,
  LogOut,
  PenTool,
  ChevronDown,
  Users
} from 'lucide-react';
import { useAuthStore, useThemeStore } from '@/stores';
import { useSettings } from '@/api/hooks';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { setMode, setBrand, resolvedMode } = useThemeStore();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: '仪表盘' },
    { to: '/servers', icon: Server, label: '媒体源' },
    { to: '/templates', icon: Palette, label: '模板库' },
    { to: '/editor', icon: PenTool, label: '设计器' },
    { to: '/tasks', icon: Clock, label: '自动化' },
    ...(user?.role === 'admin' ? [{ to: '/settings?tab=users', icon: Users, label: '用户管理' }] : []),
    { to: '/settings', icon: Settings, label: '设置' }
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load settings from backend
  const { data: settings } = useSettings();
  useEffect(() => {
    if (settings) {
      if (settings.theme_mode) setMode(settings.theme_mode as any);
      if (settings.brand_theme) setBrand(settings.brand_theme as any);
    }
  }, [settings, setMode, setBrand]);

  return (
    <div className="app-layout flex flex-col min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Top Navigation Bar */}
      <header
        className="app-header"
        style={{
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-color)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <div className="app-brand flex items-center gap-3 shrink-0">
          <img
            src={resolvedMode === 'light' ? '/logo-l.png' : '/logo-d.png'}
            alt="CoverStudio"
            className="w-9 h-9 object-contain"
          />
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              CoverStudio
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="app-navigation" aria-label="主导航">
          {navItems.map((item) => {
            const isSettings = item.to.startsWith('/settings');
            const isUserMgmt = item.to.includes('tab=users');

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => {
                  // Custom activation logic to handle search params
                  let active = isActive;
                  const search = window.location.search;

                  if (isUserMgmt) {
                    active = isActive && search.includes('tab=users');
                  } else if (isSettings && item.to === '/settings') {
                    active = isActive && !search.includes('tab=users');
                  }

                  return cn(
                    'app-nav-link h-9 rounded-lg flex items-center gap-2 text-sm font-medium transition-all',
                    active
                      ? 'bg-(--primary) text-white shadow-md'
                      : 'text-(--text-secondary) hover:bg-(--bg-tertiary) hover:text-(--text-primary)'
                  );
                }}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Right Side - User Menu */}
        <div className="app-account">
          {/* User Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-label={`账号：${user?.username || 'User'}`}
              aria-expanded={showUserMenu}
              className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg transition-all hover:bg-(--bg-tertiary)"
            >
              <div
                className="avatar"
                style={{ width: 28, height: 28, fontSize: 11, borderRadius: 8 }}
              >
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="app-account-name text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {user?.username || 'User'}
              </span>
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            </button>

            {showUserMenu && (
              <div
                className="absolute right-0 top-full mt-2 w-48 py-2 rounded-xl shadow-lg"
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  zIndex: 1000
                }}
              >
                <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="app-account-name text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {user?.username}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {user?.role === 'admin' ? '管理员' : '用户'}
                  </div>
                </div>
                <button
                  onClick={() => { navigate('/settings'); setShowUserMenu(false); }}
                  className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-(--bg-tertiary) transition-all"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Settings className="w-4 h-4" />
                  个人设置
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-(--bg-tertiary) transition-all text-red-500"
                >
                  <LogOut className="w-4 h-4" />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main flex-1" style={{ background: 'var(--bg-primary)' }}>
        <div className="app-content">
          <div className="page-enter">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
