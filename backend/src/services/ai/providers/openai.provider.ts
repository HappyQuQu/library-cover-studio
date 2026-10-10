import OpenAI from 'openai';
import type { AIProvider, AIProviderConfig, TemplateContext, StreamChunk } from '../aiClient.service.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/templateGenerator.js';
import { AIResponseError, parseTemplateResponse } from '../utils/jsonParser.js';
import { referenceImageError } from '../utils/referenceImages.js';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private mimoOfficial: boolean;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiUrl || 'https://api.openai.com/v1'
    });

    this.model = config.model || 'gpt-4-turbo-preview';
    this.mimoOfficial = new URL(config.apiUrl || 'https://api.openai.com/v1').hostname === 'api.xiaomimimo.com';
  }

  async *generateTemplate(
    prompt: string,
    context?: TemplateContext
  ): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const systemPrompt = context?.systemPrompt || SYSTEM_PROMPT;

      // 构建消息历史
      const messages: OpenAI.ChatCompletionMessageParam[] = [
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
      const userPrompt = buildUserPrompt(prompt, {
          currentCanvas: context?.currentCanvas,
          canvasSize: context?.canvasSize,
          editMode: context?.editMode,
          runtimeConfig: context?.runtimeConfig,
          referenceImageCount: context?.referenceImages?.length
        });
      messages.push({ role:'user', content: context?.referenceImages?.length
        ? [...context.referenceImages.map(image => ({ type:'image_url' as const, image_url:{url:image.dataUrl} })), {type:'text', text:userPrompt}]
        : userPrompt });

      // Leave room for a multi-layer canvas. MiMo shares its budget between reasoning and output.
      let jsonMode = true;
      for (let attempt = 0; attempt < 2; attempt++) {
        const parameters: OpenAI.ChatCompletionCreateParamsStreaming & { thinking?: { type: 'disabled' } } = {
          model: this.model, messages, stream: true,
          ...(this.mimoOfficial ? { max_completion_tokens: attempt ? 32768 : 16384, thinking: { type: 'disabled' as const } }
            : { max_tokens: this.model === 'gpt-4-turbo-preview' ? 4096 : attempt ? 16384 : 8192 }),
          ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {})
        };
        let stream;
        try { stream = await this.client.chat.completions.create(parameters, { signal: context?.signal }); }
        catch (error: any) {
          // Some compatible gateways do not implement JSON mode. Only relax that one parameter.
          if (!jsonMode || ![400, 422].includes(error.status) || !/response_format|json_object/i.test(error.message || '')) throw error;
          jsonMode = false; delete parameters.response_format;
          stream = await this.client.chat.completions.create(parameters, { signal: context?.signal });
        }
        let fullResponse = '', finishReason: string | null = null;
        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const content = choice?.delta?.content;
          if (content) { fullResponse += content; yield { type: 'chunk', content }; }
        }
        try {
          const canvasJson = parseTemplateResponse(fullResponse, finishReason);
          yield { type: 'complete', content: fullResponse, canvasJson };
          return;
        } catch (error) {
          if (context?.signal?.aborted || attempt || !(error instanceof AIResponseError)
              || !['AI_RESPONSE_TRUNCATED', 'AI_INVALID_JSON', 'AI_INVALID_CANVAS'].includes(error.code)) throw error;
          yield { type: 'status', content: error.code === 'AI_RESPONSE_TRUNCATED'
            ? '设计输出被截断，正在重新生成更紧凑的完整方案…' : '正在校正设计格式并重新生成完整方案…' };
          messages.push({ role: 'user', content: '上次输出未通过画布 JSON 或图片校验。请重新输出完整且紧凑的 JSON 对象，不要续写上次内容。保留原需求、画布尺寸、锁定图层与编辑范围；必须包含完整 objects 数组、唯一图层 id 和有效 type，所有坐标和角度直接写数字，不要写计算表达式、注释或省略号。不要生成 SVG data URL；背景使用 background 纯色或 Fabric 渐变对象，装饰使用 Rect/Circle 等图层。已有图片 src 与 [original-asset] 必须保持原样。' });
        }
      }
    } catch (error: any) {
      yield {
        type: 'error',
        error: referenceImageError(error, !!context?.referenceImages?.length)
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
