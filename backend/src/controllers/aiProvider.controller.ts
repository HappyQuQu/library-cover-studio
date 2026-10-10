import { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../config/database.js';
import { aiProviders } from '../config/schema.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { createAIProvider as createAIClient } from '../services/ai/aiClient.service.js';

import { listProviderModels, parseModelCapabilities } from '../services/ai/modelCatalog.service.js';

// 获取用户的 AI 配置列表
export async function getAIProviders(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const providers = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.userId, userId));

    // 解密 API Key（只返回前几位），解密失败时标记为已损坏
    const result = providers.map(p => {
      let apiKeyPreview: string | undefined;
      if (p.apiKeyEncrypted) {
        try {
          apiKeyPreview = `${decrypt(p.apiKeyEncrypted).substring(0, 8)}...`;
        } catch {
          apiKeyPreview = '[密钥已损坏，请重新填写]';
        }
      }
      return { ...p, apiKey: apiKeyPreview, apiKeyEncrypted: undefined, modelCapabilities: parseModelCapabilities(p.modelCapabilities) };
    });

    res.json(result);
  } catch (error: any) {
    console.error('Failed to get AI providers:', error);
    res.status(500).json({ error: error.message });
  }
}

// 创建 AI 配置
export async function createAIProvider(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { name, type, apiUrl, apiKey, model, modelCapabilities, isDefault } = req.body;

    // 验证必需字段
    if (!name || !type || !apiUrl) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 如果设置为默认，取消其他默认配置
    if (isDefault) {
      await db
        .update(aiProviders)
        .set({ isDefault: 0, updatedAt: new Date().toISOString() })
        .where(and(eq(aiProviders.userId, userId), eq(aiProviders.isDefault, 1)));
    }

    const id = nanoid();
    const now = new Date().toISOString();

    const newProvider = {
      id,
      name,
      type,
      apiUrl,
      apiKeyEncrypted: apiKey ? encrypt(apiKey) : null,
      model: model || null,
      modelCapabilities: JSON.stringify(parseModelCapabilities(modelCapabilities)),
      isActive: 1,
      isDefault: isDefault ? 1 : 0,
      userId,
      createdAt: now,
      updatedAt: now
    };

    await db.insert(aiProviders).values(newProvider);

    res.status(201).json({
      ...newProvider,
      apiKey: apiKey ? `${apiKey.substring(0, 8)}...` : undefined,
      apiKeyEncrypted: undefined, modelCapabilities: parseModelCapabilities(newProvider.modelCapabilities)
    });
  } catch (error: any) {
    console.error('Failed to create AI provider:', error);
    res.status(500).json({ error: error.message });
  }
}

// 更新 AI 配置
export async function updateAIProvider(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const providerId = Array.isArray(id) ? id[0] : id;
    const { name, type, apiUrl, apiKey, model, modelCapabilities, isActive, isDefault } = req.body;

    // 检查权限
    const existing = await db
      .select()
      .from(aiProviders)
      .where(and(eq(aiProviders.id, providerId), eq(aiProviders.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'AI provider not found' });
    }

    // 如果设置为默认，取消其他默认配置
    if (isDefault) {
      await db
        .update(aiProviders)
        .set({ isDefault: 0, updatedAt: new Date().toISOString() })
        .where(and(eq(aiProviders.userId, userId), eq(aiProviders.isDefault, 1)));
    }

    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (apiUrl !== undefined) updates.apiUrl = apiUrl;
    if (apiKey !== undefined) updates.apiKeyEncrypted = encrypt(apiKey);
    if (model !== undefined) updates.model = model;
    if (modelCapabilities !== undefined) updates.modelCapabilities = JSON.stringify(parseModelCapabilities(modelCapabilities));
    if (isActive !== undefined) updates.isActive = isActive ? 1 : 0;
    if (isDefault !== undefined) updates.isDefault = isDefault ? 1 : 0;

    await db
      .update(aiProviders)
      .set(updates)
      .where(eq(aiProviders.id, providerId));

    const updated = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, providerId))
      .limit(1);

    res.json({
      ...updated[0],
      apiKey: updated[0].apiKeyEncrypted ? `${decrypt(updated[0].apiKeyEncrypted).substring(0, 8)}...` : undefined,
      apiKeyEncrypted: undefined, modelCapabilities: parseModelCapabilities(updated[0].modelCapabilities)
    });
  } catch (error: any) {
    console.error('Failed to update AI provider:', error);
    res.status(500).json({ error: error.message });
  }
}

// 删除 AI 配置
export async function deleteAIProvider(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const providerId = Array.isArray(id) ? id[0] : id;

    // 检查权限
    const existing = await db
      .select()
      .from(aiProviders)
      .where(and(eq(aiProviders.id, providerId), eq(aiProviders.userId, userId)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: 'AI provider not found' });
    }

    await db.delete(aiProviders).where(eq(aiProviders.id, providerId));

    res.json({ message: 'AI provider deleted' });
  } catch (error: any) {
    console.error('Failed to delete AI provider:', error);
    res.status(500).json({ error: error.message });
  }
}

// 测试未保存的配置（不需要 ID，直接传入配置参数）
export async function testAIProviderConfig(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { type, apiUrl, model, providerId } = req.body;
    let apiKey = req.body.apiKey;
    if (providerId && !apiKey) {
      const [saved] = await db.select().from(aiProviders).where(and(eq(aiProviders.id, providerId), eq(aiProviders.userId, userId))).limit(1);
      if (!saved) return res.status(404).json({ error: 'AI provider not found' });
      if (saved.apiUrl.replace(/\/$/, '') !== apiUrl?.replace(/\/$/, '') || saved.type !== type) return res.status(400).json({ error: '修改 API 地址后需要重新输入密钥' });
      apiKey = saved.apiKeyEncrypted ? decrypt(saved.apiKeyEncrypted) : undefined;
    }
    if (!type || !apiUrl) {
      return res.status(400).json({ error: 'type 和 apiUrl 为必填项' });
    }

    const client = await createAIClient({
      type: type as any,
      apiUrl,
      apiKey: apiKey || undefined,
      model: model?.split(',')[0].trim() || undefined
    });

    const success = await client.testConnection();
    res.json({ success });
  } catch (error: any) {
    console.error('Failed to test AI provider config:', error);
    res.status(500).json({ error: error.message, success: false });
  }
}

// 测试 AI 连接
export async function testAIProvider(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const providerId = Array.isArray(id) ? id[0] : id;

    // 获取配置
    const providers = await db
      .select()
      .from(aiProviders)
      .where(and(eq(aiProviders.id, providerId), eq(aiProviders.userId, userId)))
      .limit(1);

    if (providers.length === 0) {
      return res.status(404).json({ error: 'AI provider not found' });
    }

    const provider = providers[0];

    // 创建客户端并测试
    let apiKey: string | undefined;
    if (provider.apiKeyEncrypted) {
      try {
        apiKey = decrypt(provider.apiKeyEncrypted);
      } catch {
        return res.status(400).json({ success: false, error: 'API 密钥已损坏，请重新编辑并填写新密钥' });
      }
    }
    const client = await createAIClient({
      type: provider.type as any,
      apiUrl: provider.apiUrl,
      apiKey,
      model: provider.model?.split(',')[0].trim() || undefined
    });

    const success = await client.testConnection();

    res.json({ success });
  } catch (error: any) {
    console.error('Failed to test AI provider:', error);
    res.status(500).json({ error: error.message, success: false });
  }
}

// Discover an unsaved configuration, or reuse its owner's stored key when editing.
export async function getAIProviderModels(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = req.params.id || req.body.providerId;
    let saved;
    if (id) {
      [saved] = await db.select().from(aiProviders).where(and(eq(aiProviders.id, id), eq(aiProviders.userId, userId))).limit(1);
      if (!saved) return res.status(404).json({ error: 'AI provider not found' });
    }
    const body = req.method === 'GET' ? {} : req.body;
    const type = body.type || saved?.type;
    const apiUrl = body.apiUrl || saved?.apiUrl;
    if (!['claude', 'openai', 'ollama', 'custom'].includes(type) || typeof apiUrl !== 'string') return res.status(400).json({ error: '请填写服务类型和 API 基础路径' });
    // Never send a stored credential to an edited endpoint. A new endpoint needs a new key.
    const sameEndpoint = saved && apiUrl.replace(/\/$/, '') === saved.apiUrl.replace(/\/$/, '') && type === saved.type;
    const apiKey = body.apiKey || (sameEndpoint && saved?.apiKeyEncrypted ? decrypt(saved.apiKeyEncrypted) : undefined);
    if (type !== 'ollama' && !apiKey) return res.status(400).json({ error: '请填写 API Key；修改 API 地址后需要重新输入密钥' });
    const result = await listProviderModels({ type, apiUrl, apiKey, model: body.model ?? saved?.model ?? undefined,
      modelCapabilities: parseModelCapabilities(body.modelCapabilities ?? saved?.modelCapabilities) }, req.method === 'POST' || req.query.refresh === '1');
    res.json(result);
  } catch {
    res.status(400).json({ error: '获取模型列表失败，请检查 API 地址和密钥；已保存的密钥不会显示在页面上' });
  }
}
