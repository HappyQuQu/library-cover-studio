import axios from 'axios';
import type { AIProvider, AIProviderConfig, TemplateContext, StreamChunk } from '../aiClient.service.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../prompts/templateGenerator.js';

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
      // 构建消息历史
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: SYSTEM_PROMPT }
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
          editMode: context?.editMode
        })
      });

      // 调用 Ollama API（流式）
      const response = await axios.post(`${this.apiUrl}/api/chat`, {
        model: this.model,
        messages,
        stream: true
      }, {
        responseType: 'stream'
      });

      let fullResponse = '';

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter((line: string) => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              const content = data.message.content;
              fullResponse += content;

              yield {
                type: 'chunk',
                content
              };
            }
          } catch (e) {
            // 忽略解析错误
          }
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
      const response = await axios.get(`${this.apiUrl}/api/tags`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      console.error('Ollama connection test failed:', error);
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
