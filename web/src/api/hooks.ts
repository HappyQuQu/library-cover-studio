import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { apiClient } from './client';

// ==================== Auth ====================

interface LoginParams {
  username: string;
  password: string;
}

interface AuthResponse {
  user: { id: string; username: string; role: string };
  token: string;
  refreshToken: string;
}

export function useLogin(): UseMutationResult<AuthResponse, Error, LoginParams> {
  return useMutation({
    mutationFn: (params: LoginParams) =>
      apiClient.post<AuthResponse>('/auth/login', params).then((r) => r.data)
  });
}

export function useRegister(): UseMutationResult<AuthResponse, Error, LoginParams> {
  return useMutation({
    mutationFn: (params: LoginParams) =>
      apiClient.post<AuthResponse>('/auth/register', params).then((r) => r.data)
  });
}

// ==================== Servers ====================

export interface MediaServer {
  id: string;
  name: string;
  type: 'jellyfin' | 'emby';
  url: string;
  isActive: boolean;
  lastSyncAt?: string;
  createdAt: string;
}

export interface MediaLibrary {
  id: string;
  name: string;
  type: string;
  itemCount?: number;
  imageUrl?: string;
}

export function useServers(): UseQueryResult<MediaServer[], Error> {
  return useQuery({
    queryKey: ['servers'],
    queryFn: () => apiClient.get<MediaServer[]>('/servers').then((r) => r.data)
  });
}

export function useServer(id: string): UseQueryResult<MediaServer, Error> {
  return useQuery({
    queryKey: ['servers', id],
    queryFn: () => apiClient.get<MediaServer>(`/servers/${id}`).then((r) => r.data),
    enabled: !!id
  });
}

export function useServerLibraries(id: string): UseQueryResult<MediaLibrary[], Error> {
  return useQuery({
    queryKey: ['servers', id, 'libraries'],
    queryFn: () =>
      apiClient.get<MediaLibrary[]>(`/servers/${id}/libraries`).then((r) => r.data),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false
  });
}

export function useServerCoverTargets(id: string): UseQueryResult<MediaLibrary[], Error> {
  return useQuery({
    queryKey: ['servers', id, 'cover-targets'],
    queryFn: () => apiClient.get<MediaLibrary[]>(`/servers/${id}/cover-targets`).then(response => response.data),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false
  });
}

export interface ServerConnection { connected: boolean; version?: string; serverName?: string; product?: string; error?: string; }
export function useServerConnection(id: string) {
  return useQuery({
    queryKey: ['servers', id, 'connection'],
    queryFn: () => apiClient.post<ServerConnection>(`/servers/${id}/test`).then(response => response.data),
    enabled: !!id, staleTime: 60000, retry: false
  });
}

export function useCreateServer(): UseMutationResult<MediaServer, Error, { name: string; type: string; url: string; apiKey: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type: string; url: string; apiKey: string }) =>
      apiClient.post<MediaServer>('/servers', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    }
  });
}

export function useDeleteServer(): UseMutationResult<any, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/servers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    }
  });
}

// ==================== Templates ====================

export interface Template {
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: { name: string; url?: string } | null;
  changelog?: string;
  minAppVersion?: string | null;
  canvasJson?: string;
  thumbnailPath?: string;
  thumbnail?: string; // Base64 data URL for thumbnail upload
  width: number;
  height: number;
  isPublic: boolean;
  isLocked: boolean;
  isDefault: boolean;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useTemplates(): UseQueryResult<Template[], Error> {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => apiClient.get<Template[]>('/templates').then((r) => r.data)
  });
}

export function useTemplate(id: string): UseQueryResult<Template, Error> {
  return useQuery({
    queryKey: ['templates', id],
    queryFn: () => apiClient.get<Template>(`/templates/${id}`).then((r) => r.data),
    enabled: !!id
  });
}

export function useCreateTemplate(): UseMutationResult<Template, Error, Partial<Template>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Template>) =>
      apiClient.post<Template>('/templates', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    }
  });
}

export function useUpdateTemplate(): UseMutationResult<any, Error, Partial<Template> & { id: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Template> & { id: string }) =>
      apiClient.put(`/templates/${id}`, data).then((r) => r.data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['templates', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['template-history', variables.id] });
    }
  });
}

export function useDeleteTemplate(): UseMutationResult<any, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    }
  });
}

export function useSetTemplateLock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isLocked }: { id: string; isLocked: boolean }) => apiClient.post(`/templates/${id}/lock`, { isLocked }),
    onSuccess: (_, { id }) => queryClient.invalidateQueries({ queryKey: ['templates', id] }).then(() => queryClient.invalidateQueries({ queryKey: ['templates'] }))
  });
}

export interface TemplateRevision {
  id: string;
  name: string;
  version?: string;
  width: number;
  height: number;
  createdAt: string;
  kind: 'save' | 'restore' | 'baseline' | 'default-reset' | 'before-default-reset';
  previewUrl: string;
}

export function useTemplateRevisions(id: string, enabled: boolean) {
  return useQuery({ queryKey: ['template-history', id], enabled: !!id && enabled,
    queryFn: () => apiClient.get<{ limit: number; revisions: TemplateRevision[] }>(`/templates/${id}/history`).then(response => response.data) });
}

export function useRestoreTemplateRevision(id: string) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (revisionId: string) => apiClient.post<Template>(`/templates/${id}/history/${revisionId}/restore`).then(response => response.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['templates', id] });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['templates'] }), queryClient.invalidateQueries({ queryKey: ['template-history', id] })]);
    }
  });
}

// ==================== Tasks ====================

export interface Task {
  id: string;
  name: string;
  type: 'scheduled' | 'manual';
  cronExpression?: string;
  templateId?: string;
  serverId?: string;
  libraryConfigs?: string; // JSON string of LibraryConfig[]
  isEnabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  timezone?: string;
  createdAt: string;
}

export function useTasks(): UseQueryResult<Task[], Error> {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiClient.get<Task[]>('/tasks').then((r) => r.data)
  });
}

export function useCreateTask(): UseMutationResult<Task, Error, Partial<Task>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Task>) =>
      apiClient.post<Task>('/tasks', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });
}

export function useRunTask(): UseMutationResult<any, Error, string> {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/tasks/${id}/run`).then((r) => r.data)
  });
}

export function useToggleTask(): UseMutationResult<any, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/tasks/${id}/toggle`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });
}

export function useUpdateTask(): UseMutationResult<any, Error, Partial<Task> & { id: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Task> & { id: string }) =>
      apiClient.put(`/tasks/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });
}

export function useDeleteTask(): UseMutationResult<any, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });
}

export interface TaskLogCover {
  id: string;
  libraryId: string;
  libraryName: string;
  templateName?: string | null;
  templateId?: string | null; templateVersion?: string | null; warningMessage?: string | null;
  status: 'generated' | 'uploaded' | 'failed';
  width?: number | null;
  height?: number | null;
  errorMessage?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}

export interface TaskLog {
  id: string;
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  itemsProcessed?: number;
  itemsFailed?: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  covers?: TaskLogCover[];
}

export function useTaskLogs(taskId: string): UseQueryResult<TaskLog[], Error> {
  return useQuery({
    queryKey: ['tasks', taskId, 'logs'],
    queryFn: () => apiClient.get<TaskLog[]>(`/tasks/${taskId}/logs`).then((r) => r.data),
    refetchInterval: query => query.state.data?.some(log => log.status === 'running') ? 3000 : false,
    enabled: !!taskId,
    refetchOnMount: 'always',
    staleTime: 0
  });
}

// ==================== Settings ====================

export function useSettings(): UseQueryResult<Record<string, string>, Error> {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.get<Record<string, string>>('/settings').then((r) => r.data)
  });
}

export function useUpdateSettings(): UseMutationResult<any, Error, Record<string, string>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Record<string, string>) =>
      apiClient.post('/settings', { settings }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    }
  });
}
// ==================== Logs ====================

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export function useLogs(): UseQueryResult<LogEntry[], Error> {
  return useQuery({
    queryKey: ['logs'],
    queryFn: () => apiClient.get<LogEntry[]>('/logs').then((r) => r.data)
  });
}

// ==================== Users ====================

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
  updatedAt?: string;
}

export function useUsers(enabled: boolean = true): UseQueryResult<User[], Error> {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get<User[]>('/users').then((r) => r.data),
    enabled
  });
}

export function useCreateUser(): UseMutationResult<User, Error, Partial<User> & { password?: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User> & { password?: string }) =>
      apiClient.post<User>('/users', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
}

export function useUpdateUser(): UseMutationResult<any, Error, Partial<User> & { id: string; password?: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<User> & { id: string; password?: string }) =>
      apiClient.put(`/users/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
}

export function useDeleteUser(): UseMutationResult<any, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
}

// ==================== Stats ====================

export interface DashboardStats {
  monthlyGenerated: number;
}

export function useStats(): UseQueryResult<DashboardStats, Error> {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => apiClient.get<DashboardStats>('/stats').then((r) => r.data)
  });
}
