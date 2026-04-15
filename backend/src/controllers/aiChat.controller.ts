import { Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../config/database.js';
import { aiProviders, aiConversations } from '../config/schema.js';
import { decrypt } from '../utils/crypto.js';
import { createAIProvider } from '../services/ai/aiClient.service.js';
import type { Message } from '../services/ai/aiClient.service.js';

// 生成模板（SSE 流式响应）
export async function generateTemplate(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { prompt, conversationId, providerId, currentCanvas, canvasSize, editMode, model: customModel } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // 获取 AI Provider 配置
    let provider;
    if (providerId) {
      const providers = await db
        .select()
        .from(aiProviders)
        .where(and(eq(aiProviders.id, providerId), eq(aiProviders.userId, userId)))
        .limit(1);

      if (providers.length === 0) {
        return res.status(404).json({ error: 'AI provider not found' });
      }
      provider = providers[0];
    } else {
      // 使用默认配置
      const providers = await db
        .select()
        .from(aiProviders)
        .where(and(eq(aiProviders.userId, userId), eq(aiProviders.isDefault, 1)))
        .limit(1);

      if (providers.length === 0) {
        return res.status(400).json({ error: 'No default AI provider configured' });
      }
      provider = providers[0];
    }

    // 获取对话历史
    let conversationHistory: Message[] = [];
    let conversation: typeof import('../config/schema.js').aiConversations.$inferSelect | undefined;

    if (conversationId) {
      const conversations = await db
        .select()
        .from(aiConversations)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
        .limit(1);

      if (conversations.length > 0) {
        conversation = conversations[0];
        conversationHistory = JSON.parse(conversation.messages);
      }
    }

    // 创建 AI 客户端
    const aiClient = await createAIProvider({
      type: provider.type as any,
      apiUrl: provider.apiUrl,
      apiKey: provider.apiKeyEncrypted ? decrypt(provider.apiKeyEncrypted) : undefined,
      model: customModel || provider.model || undefined
    });

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 添加用户消息到历史
    conversationHistory.push({
      role: 'user',
      content: prompt
    });

    let fullResponse = '';
    let canvasJson: any = null;

    try {
      // 流式生成
      for await (const chunk of aiClient.generateTemplate(prompt, {
        conversationHistory,
        currentCanvas,
        canvasSize,
        editMode: !!editMode
      })) {
        if (chunk.type === 'chunk') {
          fullResponse += chunk.content || '';
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        } else if (chunk.type === 'complete') {
          canvasJson = chunk.canvasJson;
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        } else if (chunk.type === 'error') {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      }

      // 助手消息存摘要而非完整 JSON，避免多轮对话 token 爆炸
      const assistantSummary = canvasJson
        ? `[已生成模板：${canvasJson.objects?.length ?? 0} 个对象]`
        : fullResponse.substring(0, 500);

      conversationHistory.push({
        role: 'assistant',
        content: assistantSummary
      });

      // 历史最多保留最近 10 条消息（5轮对话），防止 context 过长
      if (conversationHistory.length > 10) {
        conversationHistory = conversationHistory.slice(-10);
      }

      // 保存或更新对话
      const now = new Date().toISOString();

      if (conversation) {
        await db
          .update(aiConversations)
          .set({
            messages: JSON.stringify(conversationHistory),
            generatedJson: canvasJson ? JSON.stringify(canvasJson) : null,
            updatedAt: now
          })
          .where(eq(aiConversations.id, conversation.id));
      } else {
        const newConversationId = nanoid();
        await db.insert(aiConversations).values({
          id: newConversationId,
          userId,
          templateId: null,
          providerId: provider.id,
          messages: JSON.stringify(conversationHistory),
          generatedJson: canvasJson ? JSON.stringify(canvasJson) : null,
          createdAt: now,
          updatedAt: now
        });

        res.write(`data: ${JSON.stringify({ type: 'conversation_id', id: newConversationId })}\n\n`);
      }

      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error('Failed to generate template:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}

// 获取对话历史列表
export async function getConversations(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversations = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.updatedAt));

    // 只返回摘要信息
    const result = conversations.map(c => {
      const messages = JSON.parse(c.messages);
      const firstUserMessage = messages.find((m: Message) => m.role === 'user');

      return {
        id: c.id,
        preview: firstUserMessage?.content.substring(0, 100) || '',
        messageCount: messages.length,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      };
    });

    res.json(result);
  } catch (error: any) {
    console.error('Failed to get conversations:', error);
    res.status(500).json({ error: error.message });
  }
}

// 获取单个对话详情
export async function getConversation(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const conversationId = Array.isArray(id) ? id[0] : id;

    const conversations = await db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
      .limit(1);

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conversation = conversations[0];

    res.json({
      ...conversation,
      messages: JSON.parse(conversation.messages),
      generatedJson: conversation.generatedJson ? JSON.parse(conversation.generatedJson) : null
    });
  } catch (error: any) {
    console.error('Failed to get conversation:', error);
    res.status(500).json({ error: error.message });
  }
}

// 删除对话
export async function deleteConversation(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const conversationId = Array.isArray(id) ? id[0] : id;

    const conversations = await db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
      .limit(1);

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await db.delete(aiConversations).where(eq(aiConversations.id, conversationId));

    res.json({ message: 'Conversation deleted' });
  } catch (error: any) {
    console.error('Failed to delete conversation:', error);
    res.status(500).json({ error: error.message });
  }
}
