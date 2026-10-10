import axios from 'axios';
import { createHash } from 'node:crypto';
import type { AIProviderConfig } from './aiClient.service.js';

export interface AIModel { id: string; name: string; imageInput: boolean | null; capabilitySource: 'api' | 'official' | 'manual' | 'unknown'; }
export type ModelCapabilities = Record<string, boolean>;
export interface ModelCatalog { models: AIModel[]; source: 'api' | 'configured'; warning?: string; }
type CatalogConfig = AIProviderConfig & { modelCapabilities?: ModelCapabilities };
const cache = new Map<string, { expires: number; models: AIModel[] }>();

export function parseModelCapabilities(value: unknown): ModelCapabilities {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return {}; } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, supported]) => id.length > 0 && id.length <= 200 && typeof supported === 'boolean').slice(0, 200)) as ModelCapabilities;
}

export function describeModel(config: CatalogConfig, raw: any): AIModel {
  const id = raw.id || raw.model || raw.name;
  const model: AIModel = { id, name: typeof raw.display_name === 'string' ? raw.display_name : typeof raw.name === 'string' ? raw.name : id, imageInput: null, capabilitySource: 'unknown' };
  const explicit = raw.capabilities?.image_input?.supported ?? raw.capabilities?.vision?.supported ?? raw.supports_vision ?? raw.vision;
  if (typeof explicit === 'boolean') { model.imageInput = explicit; model.capabilitySource = 'api'; }
  else if (Array.isArray(raw.capabilities)) { model.imageInput = raw.capabilities.includes('vision'); model.capabilitySource = 'api'; }
  else {
    const inputs = raw.architecture?.input_modalities ?? raw.input_modalities ?? raw.modalities?.input;
    if (Array.isArray(inputs)) { model.imageInput = inputs.includes('image'); model.capabilitySource = 'api'; }
  }
  // The OpenAI-compatible /models response often contains IDs only. Keep this
  // fallback narrow and scoped to the official endpoint, rather than guessing.
  // https://mimo.mi.com/docs/zh-CN/quick-start/summary/model
  if (model.imageInput === null && new URL(config.apiUrl).hostname === 'api.xiaomimimo.com') {
    if (['mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.6-pro-ultraspeed', 'mimo-v2.5'].includes(id)) model.imageInput = true;
    if (['mimo-v2.5-pro', 'mimo-v2-flash'].includes(id)) model.imageInput = false;
    if (model.imageInput !== null) model.capabilitySource = 'official';
  }
  if (model.imageInput === null && new URL(config.apiUrl).hostname === 'api.openai.com') {
    // https://developers.openai.com/api/docs/models/gpt-4o and /gpt-4.1
    if (/^gpt-(?:4o(?:-mini)?|4\.1(?:-(?:mini|nano))?)(?:-\d{4}-\d{2}-\d{2})?$/.test(id)) model.imageInput = true;
    if (/^gpt-(3\.5-turbo|4)(?:-\d{4}|-\d+k)?$/.test(id)) model.imageInput = false;
    if (model.imageInput !== null) model.capabilitySource = 'official';
  }
  if (Object.hasOwn(config.modelCapabilities || {}, id)) {
    model.imageInput = config.modelCapabilities![id]; model.capabilitySource = 'manual';
  }
  return model;
}

function modelsURL(config: AIProviderConfig): string {
  const url = new URL(config.apiUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请填写有效的 HTTP(S) API 基础路径');
  url.search = ''; url.hash = '';
  let path = url.pathname.replace(/\/$/, '');
  if (config.type === 'ollama') path = path.replace(/\/(api|v1)$/, '') + '/api/tags';
  else if (config.type === 'claude') path = path.replace(/\/v1$/, '') + '/v1/models';
  else path += '/models';
  url.pathname = path;
  return url.toString();
}

function isDesignModel(raw: any): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const id = raw.id || raw.model || raw.name;
  if (typeof id !== 'string' || !id || id.length > 200 || raw.lifecycle === 'retired') return false;
  const outputs = raw.architecture?.output_modalities ?? raw.output_modalities;
  if (Array.isArray(outputs) && !outputs.includes('text')) return false;
  return !/(?:^|[-/])(?:embedding|whisper|tts|asr|dall-e|realtime|transcribe|moderation)(?:[-/]|$)/i.test(id) && !/^gpt-image-/i.test(id);
}

function discoveryError(error: any): string {
  const status = error.response?.status;
  if (status === 401 || status === 403) return '模型列表认证失败，请检查 API Key 和访问权限';
  if (status === 404 || status === 405) return '此服务未提供模型列表接口，可手动填写模型';
  if (status === 429) return '模型列表请求过于频繁，请稍后刷新';
  if (error.code === 'ERR_CANCELED' || error.code === 'ECONNABORTED') return '获取模型列表超时，请稍后刷新';
  return '无法获取模型列表，请检查 API 地址或网络；已保留配置中的模型';
}

export async function listProviderModels(config: CatalogConfig, refresh = false): Promise<ModelCatalog> {
  const url = modelsURL(config);
  const key = createHash('sha256').update(JSON.stringify([config.type, url, config.apiKey])).digest('hex');
  const cached = cache.get(key);
  let models = !refresh && cached && cached.expires > Date.now() ? cached.models : undefined;
  let warning: string | undefined;
  if (!models) {
    try {
      const signal = AbortSignal.timeout(20000);
      const headers = config.type === 'claude'
        ? { 'x-api-key': config.apiKey || '', 'anthropic-version': '2023-06-01' }
        : config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
      const rawModels: any[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
        const response = await axios.get(url, { headers, signal, timeout: 15000, maxRedirects: 0, maxContentLength: 4 * 1024 * 1024,
          params: config.type === 'claude' ? { limit: 100, ...(cursor ? { after_id: cursor } : {}) } : undefined });
        const rows = config.type === 'ollama' ? response.data.models : response.data.data;
        if (!Array.isArray(rows)) throw new Error('invalid model list');
        rawModels.push(...rows.filter(isDesignModel));
        if (!response.data.has_more || typeof response.data.last_id !== 'string' || response.data.last_id === cursor) break;
        cursor = response.data.last_id;
      }
      if (config.type === 'ollama') {
        // /api/tags omits capabilities; /api/show exposes the vision flag.
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(4, rawModels.length) }, async () => {
          while (next < rawModels.length) {
            const raw = rawModels[next++];
            try {
              const response = await axios.post(url.replace(/\/tags$/, '/show'), { model: raw.model || raw.name }, { headers, signal, timeout: 10000, maxRedirects: 0 });
              raw.capabilities = response.data.capabilities;
            } catch { /* An older Ollama server may not expose capabilities. */ }
          }
        }));
      }
      const unique = new Map<string, AIModel>();
      for (const raw of rawModels) {
        const model = describeModel({ ...config, modelCapabilities: {} }, raw);
        if (!unique.has(model.id) || unique.get(model.id)!.imageInput === null) unique.set(model.id, model);
      }
      models = [...unique.values()];

      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + 5 * 60 * 1000, models });
    } catch (error) { warning = discoveryError(error); models = undefined; }
  }
  if (models && !models.length) warning = '接口没有返回可用于海报设计的模型，可手动填写模型';
  const source = models ? 'api' : 'configured';
  const merged = new Map<string, AIModel>();
  for (const id of (config.model || '').split(',').map(id => id.trim()).filter(Boolean)) merged.set(id, describeModel(config, { id }));
  for (const model of models || []) merged.set(model.id, Object.hasOwn(config.modelCapabilities || {}, model.id)
    ? { ...model, imageInput: config.modelCapabilities![model.id], capabilitySource: 'manual' } : model);
  return { models: [...merged.values()], source, ...(warning ? { warning } : {}) };
}

export async function requireImageModel(config: CatalogConfig, model?: string): Promise<void> {
  const selected = model || (config.model || '').split(',')[0].trim();
  if (selected && config.modelCapabilities && Object.hasOwn(config.modelCapabilities, selected)) {
    if (config.modelCapabilities[selected]) return;
    throw Object.assign(new Error('所选模型不支持图片输入，请切换到支持图片理解的模型'), { statusCode: 400 });
  }
  const capability = selected ? (await listProviderModels(config)).models.find(item => item.id === selected)?.imageInput ?? describeModel(config, { id: selected }).imageInput : null;
  if (capability !== true) throw Object.assign(new Error(capability === false
    ? '所选模型不支持图片输入，请切换到支持图片理解的模型'
    : '尚未确认此模型的图片能力，请刷新模型列表或在 AI 配置中确认图片输入能力'), { statusCode: 400 });
}
