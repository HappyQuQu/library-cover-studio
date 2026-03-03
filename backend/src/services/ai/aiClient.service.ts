export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface TemplateContext {
  conversationHistory?: Message[];
  currentCanvas?: any;
  canvasSize?: { width: number; height: number };
  editMode?: boolean;
}

export interface StreamChunk {
  type: 'chunk' | 'complete' | 'error';
  content?: string;
  canvasJson?: any;
  error?: string;
}

export interface AIProvider {
  /**
   * 生成模板（流式响应）
   */
  generateTemplate(
    prompt: string,
    context?: TemplateContext
  ): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * 测试连接
   */
  testConnection(): Promise<boolean>;
}

export interface AIProviderConfig {
  type: 'claude' | 'openai' | 'ollama' | 'custom';
  apiUrl: string;
  apiKey?: string;
  model?: string;
}

/**
 * 创建 AI Provider 实例
 */
export async function createAIProvider(config: AIProviderConfig): Promise<AIProvider> {
  switch (config.type) {
    case 'claude': {
      const { ClaudeProvider } = await import('./providers/claude.provider.js');
      return new ClaudeProvider(config);
    }
    case 'openai': {
      const { OpenAIProvider } = await import('./providers/openai.provider.js');
      return new OpenAIProvider(config);
    }
    case 'ollama': {
      const { OllamaProvider } = await import('./providers/ollama.provider.js');
      return new OllamaProvider(config);
    }
    case 'custom': {
      // 自定义类型兼容 OpenAI API 格式，复用 OpenAIProvider（使用自定义 baseURL）
      const { OpenAIProvider } = await import('./providers/openai.provider.js');
      return new OpenAIProvider(config);
    }
    default:
      throw new Error(`Unsupported AI provider type: ${config.type}`);
  }
}
