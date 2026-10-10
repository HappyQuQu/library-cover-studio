import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIProviderConfig, TemplateContext, StreamChunk } from '../aiClient.service.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/templateGenerator.js';
import { parseTemplateResponse } from '../utils/jsonParser.js';
import { referenceImageError } from '../utils/referenceImages.js';

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
      const systemPrompt = context?.systemPrompt || SYSTEM_PROMPT;

      // 构建消息历史
      const messages: Anthropic.MessageParam[] = [];

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
      const userPrompt = buildUserPrompt(prompt, {
          currentCanvas: context?.currentCanvas,
          canvasSize: context?.canvasSize,
          editMode: context?.editMode,
          runtimeConfig: context?.runtimeConfig,
          referenceImageCount: context?.referenceImages?.length
        });
      messages.push({ role:'user', content: context?.referenceImages?.length
        ? [...context.referenceImages.map(image => ({ type:'image' as const, source: {
            type:'base64' as const, media_type:'image/jpeg' as const, data:image.dataUrl.split(',')[1]
          } })), {type:'text', text:userPrompt}] : userPrompt });

      // 调用 Claude API（流式）
      const stream = await this.client.messages.stream({
        model: this.model,
        max_tokens: 8192,
        system: systemPrompt,
        messages
      }, { signal: context?.signal });

      let fullResponse = '';
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        if (chunk.type === 'message_delta' && chunk.delta.stop_reason) finishReason = chunk.delta.stop_reason;
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
      const canvasJson = parseTemplateResponse(fullResponse, finishReason);

      yield {
        type: 'complete',
        content: fullResponse,
        canvasJson
      };
    } catch (error: any) {
      yield {
        type: 'error',
        error: referenceImageError(error, !!context?.referenceImages?.length)
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

}
