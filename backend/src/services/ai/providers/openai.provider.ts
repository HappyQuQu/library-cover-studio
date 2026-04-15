import OpenAI from 'openai';
import type { AIProvider, AIProviderConfig, TemplateContext, StreamChunk } from '../aiClient.service.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/templateGenerator.js';
import { extractJSON } from '../utils/jsonParser.js';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiUrl || 'https://api.openai.com/v1'
    });

    this.model = config.model || 'gpt-4-turbo-preview';
  }

  async *generateTemplate(
    prompt: string,
    context?: TemplateContext
  ): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const systemPrompt = context?.systemPrompt || SYSTEM_PROMPT;

      // 构建消息历史
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt }
      ];

      // 添加历史对话
      if (context?.conversationHistory) {
        for (const msg of context.conversationHistory) {
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          });
        }
      }

      // 添加当前用户消息
      messages.push({
        role: 'user',
        content: buildUserPrompt(prompt, {
          currentCanvas: context?.currentCanvas,
          canvasSize: context?.canvasSize,
          editMode: context?.editMode,
          runtimeConfig: context?.runtimeConfig
        })
      });

      // 调用 OpenAI API（流式）
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
        max_tokens: 4096
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullResponse += content;

          yield {
            type: 'chunk',
            content
          };
        }
      }

      // 解析 JSON
      const canvasJson = extractJSON(fullResponse);

      yield {
        type: 'complete',
        content: fullResponse,
        canvasJson
      };
    } catch (error: any) {
      yield {
        type: 'error',
        error: error.message || 'Failed to generate template'
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 10
      });
      return true;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }

}
