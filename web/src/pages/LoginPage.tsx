import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, ArrowRight, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore, useThemeStore } from '@/stores';
import { useLogin, useRegister } from '@/api';
import { toast } from '@/components/ui/use-toast';

export function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const { setMode, resolvedMode } = useThemeStore();
  
  const loginMutation = useLogin();
  const registerMutation = useRegister();

  useEffect(() => {
    document.documentElement.classList.add(resolvedMode);
  }, [resolvedMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const mutation = isLogin ? loginMutation : registerMutation;
      const result = await mutation.mutateAsync({ username, password });
      
      login(result.user, result.token, result.refreshToken);
      
      toast({
        title: isLogin ? '欢迎回来 👋' : '注册成功 🎉',
        description: `${result.user.username}，开始美化您的媒体库吧！`
      });
      
      navigate('/');
    } catch (error: any) {
      toast({
        title: '出错了',
        description: error.response?.data?.error?.message || '请检查您的凭据',
        variant: 'destructive'
      });
    }
  };

  const toggleTheme = () => {
    setMode(resolvedMode === 'dark' ? 'light' : 'dark');
  };

  const isLoading = loginMutation.isPending || registerMutation.isPending;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg-primary)' }}>
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="btn-ghost btn-icon"
        style={{ position: 'absolute', top: 24, right: 24 }}
      >
        {resolvedMode === 'dark' ? <Sun style={{ width: 20, height: 20 }} /> : <Moon style={{ width: 20, height: 20 }} />}
      </button>

      <div style={{ width: '100%', maxWidth: 400 }} className="animate-scale-in">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div 
            className="gradient-purple-blue animate-float"
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: 72, 
              height: 72, 
              borderRadius: 20,
              marginBottom: 20,
              boxShadow: '0 12px 40px rgba(99, 102, 241, 0.3)'
            }}
          >
            <Sparkles style={{ width: 36, height: 36, color: 'white' }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>CoverStudio</h1>
          <p style={{ fontSize: 15, marginTop: 8, color: 'var(--text-secondary)' }}>
            媒体库封面设计与自动化
          </p>
        </div>

        {/* Form */}
        <div className="glass-panel" style={{ padding: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
            {isLogin ? '欢迎回来' : '创建账户'}
          </h2>
          <p style={{ fontSize: 14, marginBottom: 24, color: 'var(--text-secondary)' }}>
            {isLogin ? '登录以继续使用' : '注册开始使用'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>用户名</label>
              <Input
                type="text"
                placeholder="输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                className="input"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>密码</label>
              <Input
                type="password"
                placeholder="输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input"
              />
            </div>
            
            <Button type="submit" className="btn btn-primary" style={{ height: 44, marginTop: 8 }} disabled={isLoading}>
              {isLoading ? (
                <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />
              ) : (
                <>
                  {isLogin ? '登录' : '注册'}
                  <ArrowRight style={{ width: 16, height: 16 }} />
                </>
              )}
            </Button>
          </form>

          <div className="divider" style={{ margin: '24px 0' }} />

          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
            {isLogin ? '还没有账户?' : '已有账户?'}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              style={{ fontWeight: 500, marginLeft: 6, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {isLogin ? '立即注册' : '立即登录'}
            </button>
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, marginTop: 32, color: 'var(--text-tertiary)' }}>
          为 Jellyfin / Emby 打造的封面设计工具
        </p>
      </div>
    </div>
  );
}
