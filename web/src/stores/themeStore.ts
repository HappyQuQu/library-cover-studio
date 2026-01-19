import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type BrandTheme = 'jellyfin' | 'emby';

interface ThemeState {
  mode: ThemeMode;
  brand: BrandTheme;
  resolvedMode: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  setBrand: (brand: BrandTheme) => void;
}

function getSystemMode(): 'light' | 'dark' {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

function updateDocumentTheme(mode: 'light' | 'dark', brand: BrandTheme) {
  const root = document.documentElement;
  // 清理旧类
  root.classList.remove('light', 'dark', 'jellyfin', 'emby');

  // 应用模式
  root.classList.add(mode);

  // 应用品牌色
  root.classList.add(brand);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'dark',
      brand: 'jellyfin',
      resolvedMode: 'dark',

      setMode: (mode) => {
        const resolvedMode = mode === 'system' ? getSystemMode() : mode;
        updateDocumentTheme(resolvedMode, get().brand);
        set({ mode, resolvedMode });
      },

      setBrand: (brand) => {
        updateDocumentTheme(get().resolvedMode, brand);
        set({ brand });
      }
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolvedMode = state.mode === 'system' ? getSystemMode() : state.mode;
          updateDocumentTheme(resolvedMode, state.brand);
          state.resolvedMode = resolvedMode;
        }
      }
    }
  )
);

// 监听系统主题变化
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const store = useThemeStore.getState();
    if (store.mode === 'system') {
      store.setMode('system');
    }
  });
}
