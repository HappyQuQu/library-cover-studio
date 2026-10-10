import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

export interface AIProvider {
  id: string;
  name: string;
  type: 'claude' | 'openai' | 'ollama' | 'custom';
  apiUrl: string;
  apiKey?: string;
  model?: string;
  modelCapabilities?: Record<string, boolean>;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AIModel { id: string; name: string; imageInput: boolean | null; capabilitySource: 'api' | 'official' | 'manual' | 'unknown'; }
export interface ModelCatalog { models: AIModel[]; source: 'api' | 'configured'; warning?: string; }
export function modelImageLabel(model?: AIModel): string {
  return model?.imageInput === true ? '支持图片' : model?.imageInput === false ? '不支持图片' : '图片能力待确认';
}
export function useAIProviderModels(providerId?: string, updatedAt?: string) {
  return useQuery({
    queryKey: ['ai-models', providerId, updatedAt], enabled: !!providerId, staleTime: 5 * 60 * 1000, retry: false,
    queryFn: async () => (await apiClient.get<ModelCatalog>(`/ai-providers/${providerId}/models`, { timeout: 25000, params: { refresh: 1 } })).data
  });
}
export function useDiscoverAIModels() {
  return useMutation({
    mutationFn: async (config: { providerId?: string; type: string; apiUrl: string; apiKey?: string; model?: string; modelCapabilities?: Record<string, boolean> }) =>
      (await apiClient.post<ModelCatalog>('/ai-providers/models-config', config, { timeout: 25000 })).data
  });
}

export interface AIConversation {
  id: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// 获取 AI 配置列表
export function useAIProviders() {
  return useQuery({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      const { data } = await apiClient.get<AIProvider[]>('/ai-providers');
      return data;
    }
  });
}

// 创建 AI 配置
export function useCreateAIProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: Partial<AIProvider>) => {
      const { data } = await apiClient.post<AIProvider>('/ai-providers', provider);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      queryClient.invalidateQueries({ queryKey: ['ai-models'] });
    }
  });
}

// 更新 AI 配置
export function useUpdateAIProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AIProvider> & { id: string }) => {
      const { data } = await apiClient.put<AIProvider>(`/ai-providers/${id}`, updates);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      queryClient.invalidateQueries({ queryKey: ['ai-models'] });
    }
  });
}

// 删除 AI 配置
export function useDeleteAIProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/ai-providers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      queryClient.invalidateQueries({ queryKey: ['ai-models'] });
    }
  });
}

// 测试已保存的 AI 连接（by ID）
export function useTestAIProvider() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<{ success: boolean }>(`/ai-providers/${id}/test`);
      return data;
    }
  });
}

// 测试未保存的 AI 配置（直接传参数，不需要先保存）
export function useTestAIProviderConfig() {
  return useMutation({
    mutationFn: async (config: { providerId?: string; type: string; apiUrl: string; apiKey?: string; model?: string }) => {
      const { data } = await apiClient.post<{ success: boolean }>('/ai-providers/test-config', config);
      return data;
    }
  });
}

// 获取对话历史列表
export function useAIConversations() {
  return useQuery({
    queryKey: ['ai-conversations'],
    queryFn: async () => {
      const { data } = await apiClient.get<AIConversation[]>('/ai-chat/conversations');
      return data;
    }
  });
}

// 获取单个对话详情
export function useAIConversation(id: string | null) {
  return useQuery({
    queryKey: ['ai-conversation', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await apiClient.get(`/ai-chat/conversations/${id}`);
      return data;
    },
    enabled: !!id
  });
}

// 删除对话
export function useDeleteAIConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/ai-chat/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    }
  });
}
