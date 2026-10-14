import { aiFailureCode } from '../utils/feedback.js';
import axios from 'axios';
import { StringDecoder } from 'node:string_decoder';
import type { AIProvider, AIProviderConfig, TemplateContext, StreamChunk } from '../aiClient.service.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/templateGenerator.js';
import { parseTemplateResponse } from '../utils/jsonParser.js';
import { referenceImageError } from '../utils/referenceImages.js';

export class OllamaProvider implements AIProvider {
  private apiUrl: string;
  private model: string;

  constructor(config: AIProviderConfig) {
    this.apiUrl = config.apiUrl || 'http://localhost:11434';
    this.model = config.model || 'llama2';
  }

  async *generateTemplate(
    prompt: string,
    context?: TemplateContext
  ): AsyncGenerator<StreamChunk, void, unknown> {
    try {
      const systemPrompt = context?.systemPrompt || SYSTEM_PROMPT;

      // 构建消息历史
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; images?: string[] }> = [
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
          runtimeConfig: context?.runtimeConfig,
          referenceImageCount: context?.referenceImages?.length
        }),
        ...(context?.referenceImages?.length ? { images:context.referenceImages.map(image => image.dataUrl.split(',')[1]) } : {})
      });

      // 调用 Ollama API（流式）
      const response = await axios.post(`${this.apiUrl}/api/chat`, {
        model: this.model,
        messages,
        stream: true,
        format: 'json', options: { num_predict: 8192 }
      }, {
        responseType: 'stream', signal: context?.signal
      });

      let fullResponse = '';
      let finishReason: string | null = null;

      const decoder = new StringDecoder('utf8');
      let pending = '';
      for await (const chunk of response.data) {
        pending += decoder.write(chunk);
        let newline: number;
        while ((newline = pending.indexOf('\n')) !== -1) {
          const line = pending.slice(0, newline).trim();
          pending = pending.slice(newline + 1);
          if (!line) continue;
          const data = JSON.parse(line);
          if (data.done) finishReason = data.done_reason || 'stop';
          if (data.error) throw new Error(data.error);
          if (data.message?.content) {
            fullResponse += data.message.content;
            yield { type: 'chunk', content: data.message.content };
          }
        }
      }
      pending += decoder.end();
      if (pending.trim()) {
        const data = JSON.parse(pending);
        if (data.done) finishReason = data.done_reason || 'stop';
        if (data.error) throw new Error(data.error);
        if (data.message?.content) fullResponse += data.message.content;
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
        error: referenceImageError(error, !!context?.referenceImages?.length),
        code: aiFailureCode(error, !!context?.referenceImages?.length)
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.apiUrl}/api/tags`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      console.error('Ollama connection test failed:', error);
      return false;
    }
  }

}
