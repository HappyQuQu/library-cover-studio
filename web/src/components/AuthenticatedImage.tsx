import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

/** Protected media images use the API interceptor instead of putting tokens into URLs. */
export function AuthenticatedImage({ src, alt, refreshKey, fallback, style, className }: {
  src?: string; alt: string; refreshKey?: number | string; fallback: ReactNode; style?: CSSProperties; className?: string;
}) {
  const userId = useAuthStore(state => state.user?.id);
  const [image, setImage] = useState<{ src: string; userId?: string; refreshKey?: number | string; url: string } | null>(null);
  useEffect(() => {
    setImage(null);
    if (!src || !userId) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    // Backend image paths are API-relative, including when VITE_API_URL uses another host.
    const path = src.replace(/^\/api(?=\/)/, '');
    apiClient.get<Blob>(path, { responseType: 'blob', signal: controller.signal }).then(response => {
      if (controller.signal.aborted || !response.data.type.startsWith('image/')) return;
      objectUrl = URL.createObjectURL(response.data);
      setImage({ src, userId, refreshKey, url: objectUrl });
    }).catch(() => { /* Missing artwork falls back to the library icon. */ });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, refreshKey, userId]);
  if (!image || image.src !== src || image.userId !== userId || image.refreshKey !== refreshKey) return <>{fallback}</>;
  return <img src={image.url} alt={alt} style={style} className={className} onError={() => setImage(null)} />;
}
