import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIProviderConfig, TemplateContext, StreamChunk } from '../aiClient.service.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/templateGenerator.js';

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new Error('Claude API key is required');
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.apiUrl || 'https://api.anthropic.com'
    });

    this.model = config.model || 'claude-3-5-sonnet-20241022';
  }

  async *generateTemplate(
    prompt: string,
    context?: TemplateContext
  ): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      // 构建消息历史
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      // 添加历史对话
      if (context?.conversationHistory) {
        for (const msg of context.conversationHistory) {
          if (msg.role !== 'system') {
            messages.push({
              role: msg.role,
              content: msg.content
            });
          }
        }
      }

      // 添加当前用户消息
      messages.push({
        role: 'user',
        content: buildUserPrompt(prompt, {
          currentCanvas: context?.currentCanvas,
          canvasSize: context?.canvasSize,
          editMode: context?.editMode
        })
      });

      // 调用 Claude API（流式）
      const stream = await this.client.messages.stream({
        model: this.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          const text = chunk.delta.text;
          fullResponse += text;

          yield {
            type: 'chunk',
            content: text
          };
        }
      }

      // 解析 JSON
      const canvasJson = this.extractJSON(fullResponse);

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
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }]
      });
      return true;
    } catch (error) {
      console.error('Claude connection test failed:', error);
      return false;
    }
  }

  private extractJSON(text: string): any {
    // 尝试提取 JSON（可能被包裹在 markdown 代码块中）
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);

    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e) {
        // 继续尝试直接解析
      }
    }

    // 尝试直接解析整个文本
    try {
      return JSON.parse(text);
    } catch (e) {
      // 尝试找到第一个 { 和最后一个 }
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1) {
        try {
          return JSON.parse(text.substring(firstBrace, lastBrace + 1));
        } catch (e2) {
          throw new Error('Failed to parse JSON from response');
        }
      }

      throw new Error('No valid JSON found in response');
    }
  }
}
