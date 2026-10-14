import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

export const PROJECT_URL = 'https://github.com/HappyQuQu/library-cover-studio';
export const AUTHOR_URL = 'https://github.com/HappyQuQu';

export interface AppRelease {
  version: string;
  name: string;
  publishedAt: string | null;
  notes: string;
  url: string;
}

export interface AppReleases {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string | null;
  stale: boolean;
  checkSource: 'github-api' | 'github-web' | null;
  checkError: string | null;
  releases: AppRelease[];
  projectUrl: string;
  authorUrl: string;
}

const queryKey = ['app-releases'];
export function useAppReleases() {
  return useQuery({ queryKey,
    queryFn: () => apiClient.get<AppReleases>('/system/releases').then(response => response.data),
    staleTime: 5 * 60 * 1000, refetchInterval: 30 * 60 * 1000, retry: false });
}

export function useCheckAppUpdates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.get<AppReleases>('/system/releases?refresh=1').then(response => response.data),
    onSuccess: data => queryClient.setQueryData(queryKey, data)
  });
}
