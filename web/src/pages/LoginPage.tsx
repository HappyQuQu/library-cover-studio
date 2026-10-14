import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, ArrowRight, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore, useThemeStore } from '@/stores';
import { useLogin, useRegister } from '@/api';
import { toast } from '@/components/ui/use-toast';
import { useTranslation } from 'react-i18next';
import { LanguageSelect } from '@/components/LanguageSelect';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const isAuthenticated = useAuthStore(state => Boolean(state.isAuthenticated && state.token && state.user));
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
        title: i18n.t(isLogin ? 'auth.welcomeToast' : 'auth.registeredToast'),
        description: i18n.t('auth.successDescription', { username: result.user.username })
      });

      navigate('/');
    } catch (error: any) {
      toast({
        title: i18n.t('auth.errorTitle'),
        description: error.response?.data?.error?.code === 'INVALID_CREDENTIALS' ? i18n.t('auth.invalidCredentials')
          : error.response?.data?.error?.code === 'USER_EXISTS' ? i18n.t('auth.userExists')
          : error.response?.data?.error?.code === 'VALIDATION_ERROR' ? i18n.t('auth.validationFailed')
          : !error.response ? i18n.t('auth.networkError') : i18n.t('auth.credentialsHint'),
        variant: 'destructive'
      });
    }
  };

  const toggleTheme = () => {
    setMode(resolvedMode === 'dark' ? 'light' : 'dark');
  };

  const isLoading = loginMutation.isPending || registerMutation.isPending;

  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: 24, background: 'var(--bg-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0, maxWidth: 560 }}>
          <LanguageSelect />
        </div>
        <button
          type="button"
          aria-label={t(resolvedMode === 'dark' ? 'auth.switchToLight' : 'auth.switchToDark')}
          onClick={toggleTheme}
          className="btn-ghost btn-icon"
          style={{ flexShrink: 0 }}
        >
          {resolvedMode === 'dark' ? <Sun style={{ width: 20, height: 20 }} /> : <Moon style={{ width: 20, height: 20 }} />}
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0' }}>
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
              {t('auth.tagline')}
            </p>
          </div>

          {/* Form */}
          <div className="glass-panel" style={{ padding: 28 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
              {t(isLogin ? 'auth.welcome' : 'auth.createAccount')}
            </h2>
            <p style={{ fontSize: 14, marginBottom: 24, color: 'var(--text-secondary)' }}>
              {t(isLogin ? 'auth.loginHint' : 'auth.registerHint')}
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="login-username" style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{t('auth.username')}</label>
                <Input
                  id="login-username"
                  autoComplete="username"
                  type="text"
                  placeholder={t('auth.usernamePlaceholder')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  className="input"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="login-password" style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{t('auth.password')}</label>
                <Input
                  id="login-password"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  type="password"
                  placeholder={t('auth.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="input"
                />
              </div>

              <Button type="submit" className="btn btn-primary" style={{ height: 44, marginTop: 8 }} disabled={isLoading} aria-busy={isLoading} aria-label={t(isLogin ? 'auth.login' : 'auth.register')}>
                {isLoading ? (
                  <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />
                ) : (
                  <>
                    {t(isLogin ? 'auth.login' : 'auth.register')}
                    <ArrowRight style={{ width: 16, height: 16 }} />
                  </>
                )}
              </Button>
            </form>

            <div className="divider" style={{ margin: '24px 0' }} />

            <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
              {t(isLogin ? 'auth.noAccount' : 'auth.hasAccount')}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                style={{ fontWeight: 500, marginLeft: 6, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {t(isLogin ? 'auth.registerNow' : 'auth.loginNow')}
              </button>
            </p>
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, marginTop: 32, color: 'var(--text-tertiary)' }}>
            {t('auth.footer')}
          </p>
        </div>
      </div>
    </div>
  );
}
