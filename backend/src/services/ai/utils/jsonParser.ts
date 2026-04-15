/**
 * 从 AI 回复文本中提取 JSON
 * 支持：纯 JSON、```json 代码块、``` 代码块、JSON 片段（查找首尾花括号）
 */
export function extractJSON(text: string): any {
  // 1. 尝试从 markdown 代码块中提取
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                    text.match(/```\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // 继续尝试其他方式
    }
  }

  // 2. 尝试直接解析整个文本
  try {
    return JSON.parse(text);
  } catch {
    // 继续
  }

  // 3. 查找首尾花括号，尝试提取 JSON 片段
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.substring(firstBrace, lastBrace + 1));
    } catch {
      throw new Error('响应中包含 JSON 但格式无效，请重试');
    }
  }

  throw new Error('AI 响应中未找到有效的 JSON');
}
