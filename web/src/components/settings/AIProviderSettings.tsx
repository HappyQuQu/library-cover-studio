import { modelCatalogWarning } from '@/lib/modelCatalogDisplay';
import i18n from '@/lib/i18n';
import { getLocalizedApiError } from '@/lib/apiError';
import { ErrorDetails } from '@/components/ErrorDetails';
import { LanguageSelect } from '@/components/LanguageSelect';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Check, ChevronDown, ChevronUp, FileText, Save, RotateCcw, Edit2, Zap, Star, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
  useAIProviders,
  useCreateAIProvider,
  useUpdateAIProvider,
  useDeleteAIProvider,
  useTestAIProvider,
  useTestAIProviderConfig,
  useDiscoverAIModels, useAIProviderModels, modelImageLabel,
  type ModelCatalog, type AIModel,
} from '@/api/ai';
import { apiClient } from '@/api/client';


function getProviderOptions() { return [
  { value: 'claude', label: 'Claude (Anthropic)', apiUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022', group: i18n.t('aiSettings.international') },
  { value: 'openai', label: 'OpenAI', apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o', group: i18n.t('aiSettings.international') },
  { value: 'ollama', label: i18n.t('aiSettings.ollama'), apiUrl: 'http://localhost:11434', model: '', group: i18n.t('aiSettings.local') },
  { value: 'mimo', label: i18n.t('aiSettings.mimo'), apiUrl: 'https://api.xiaomimimo.com/v1', model: '', group: i18n.t('aiSettings.china') },
  { value: 'deepseek', label: '🐋 DeepSeek', apiUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', group: i18n.t('aiSettings.china') },
  { value: 'qwen', label: i18n.t('aiSettings.qwen'), apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-max', group: i18n.t('aiSettings.china') },
  { value: 'ernie', label: i18n.t('aiSettings.ernie'), apiUrl: 'https://qianfan.baidubce.com/v2', model: 'ernie-4.5-8k', group: i18n.t('aiSettings.china') },
  { value: 'zhipu', label: i18n.t('aiSettings.glm'), apiUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', group: i18n.t('aiSettings.china') },
  { value: 'moonshot', label: '🌙 Moonshot (Kimi)', apiUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', group: i18n.t('aiSettings.china') },
  { value: 'stepfun', label: i18n.t('aiSettings.step'), apiUrl: 'https://api.stepfun.com/v1', model: 'step-1-8k', group: i18n.t('aiSettings.china') },
  { value: 'custom', label: i18n.t('aiSettings.custom'), apiUrl: '', model: '', group: i18n.t('aiSettings.custom') },
] as const; }

function toBackendType(value: string): 'claude' | 'openai' | 'ollama' | 'custom' {
  if (value === 'claude') return 'claude';
  if (value === 'openai') return 'openai';
  if (value === 'ollama') return 'ollama';
  return 'custom';
}

function getProviderLabel(apiUrl: string, type: string): string {
  const match = getProviderOptions().find(o => o.apiUrl && apiUrl?.includes(
    new URL(o.apiUrl.startsWith('http') ? o.apiUrl : 'http://' + o.apiUrl).hostname
  ));
  if (match && match.value !== 'custom') return match.label;
  return type === 'ollama' ? 'Ollama' : type === 'claude' ? 'Claude' : type === 'openai' ? 'OpenAI' : i18n.t('aiSettings.custom');
}

export function AIProviderSettings() {
  const { t } = useTranslation();
  const [failure, setFailure] = useState<unknown>(null);
  const promptLoaded = useRef(false);
  const isAdmin = useAuthStore(s => s.user?.role === 'admin');
  const { toast } = useToast();
  const { data: providers = [], isLoading, isError, error, refetch } = useAIProviders();
  const createMutation = useCreateAIProvider();
  const updateMutation = useUpdateAIProvider();
  const deleteMutation = useDeleteAIProvider();
  const testMutation = useTestAIProvider();
  const testConfigMutation = useTestAIProviderConfig();

  // 'list' | 'add' | 'edit'
  const [formMode, setFormMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedValue, setSelectedValue] = useState('deepseek');

  const defaultForm = {
    name: '',
    type: 'custom' as 'claude' | 'openai' | 'ollama' | 'custom',
    apiUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    modelCapabilities: {} as Record<string, boolean>
  };
  const [formData, setFormData] = useState(defaultForm);
  const discoverMutation = useDiscoverAIModels();
  const savedProvider = providers.find(provider => provider.id === editingId);
  const savedModels = useAIProviderModels(formMode === 'edit' ? editingId || undefined : undefined, savedProvider?.updatedAt);
  const [discovered, setDiscovered] = useState<{ fingerprint: string; result: ModelCatalog } | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const fingerprint = JSON.stringify([editingId, formData.type, formData.apiUrl, formData.apiKey]);
  const catalog = discovered?.fingerprint === fingerprint ? discovered.result
    : savedProvider?.apiUrl === formData.apiUrl && savedProvider.type === formData.type && !formData.apiKey ? savedModels.data : undefined;
  const modelOptions = [...new Map([
    ...formData.model.split(',').map(id => id.trim()).filter(Boolean).map(id => ({ id, name: id, imageInput: null, capabilitySource: 'unknown' } as AIModel)),
    ...(catalog?.models || [])
  ].map(model => [model.id, Object.hasOwn(formData.modelCapabilities, model.id)
    ? { ...model, imageInput: formData.modelCapabilities[model.id], capabilitySource: 'manual' as const } : model])).values()];
  const primaryModel = formData.model.split(',')[0].trim();
  const selectedModelInfo = modelOptions.find(model => model.id === primaryModel);
  const fetchModels = async () => {
    setFailure(null);
    try {
      const result = await discoverMutation.mutateAsync({ ...formData, providerId: editingId || undefined, apiKey: formData.apiKey || undefined });
      setDiscovered({ fingerprint, result });
      if (!formData.model && result.models.length) setFormData(previous =>
        JSON.stringify([editingId, previous.type, previous.apiUrl, previous.apiKey]) === fingerprint ? { ...previous, model: result.models[0].id } : previous);
    } catch (error: any) {
      setFailure(error);
      toast({ title: i18n.t('aiSettings.modelsFailed'), description: getLocalizedApiError(error, 'ai'), variant: 'destructive' });
    }
  };

  // 提示词编辑
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [builtInPrompt, setBuiltInPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);

  useEffect(() => {
    if (promptExpanded && !promptLoaded.current && !promptLoading) {
      loadSystemPrompt();
    }
    if (promptExpanded && !builtInPrompt) {
      apiClient.get('/settings/default-prompt').then(r => setBuiltInPrompt(r.data?.defaultPrompt || '')).catch(error => setFailure(error));
    }
  }, [promptExpanded]);

  const loadSystemPrompt = async () => {
    setPromptLoading(true);
    try {
      const res = await apiClient.get('/settings');
      setSystemPrompt(res.data?.['ai.systemPrompt'] || '');
      promptLoaded.current = true;
    } catch (error) {
      setFailure(error);
    } finally {
      setPromptLoading(false);
    }
  };

  const saveSystemPrompt = async () => {
    setFailure(null);
    setPromptSaving(true);
    try {
      await apiClient.post('/settings', { 'ai.systemPrompt': systemPrompt });
      toast({ title: i18n.t('aiSettings.promptSaved') });
    } catch {
      toast({ title: i18n.t('aiSettings.saveFailed'), variant: 'destructive' });
    } finally {
      setPromptSaving(false);
    }
  };

  const resetSystemPrompt = async () => {
    if (!confirm(t('aiSettings.resetConfirm'))) return;
    try {
      await apiClient.post('/settings', { 'ai.systemPrompt': '' });
      setSystemPrompt('');
      toast({ title: i18n.t('aiSettings.resetDone') });
    } catch {
      toast({ title: i18n.t('aiSettings.resetFailed'), variant: 'destructive' });
    }
  };

  const copyBuiltInToEdit = () => {
    if (builtInPrompt) {
      setSystemPrompt(builtInPrompt);
      toast({ title: i18n.t('aiSettings.copiedPrompt') });
    }
  };

  const handleProviderSelect = (value: string) => {
    setSelectedValue(value);
    setModelSearch('');
    const opt = getProviderOptions().find(o => o.value === value);
    if (opt) {
      setFormData(prev => ({
        ...prev,
        type: toBackendType(value),
        apiUrl: opt.apiUrl,
        model: opt.model,
        modelCapabilities: {},
        name: prev.name || opt.label.replace(/^[^\s]+ /, '')
      }));
    }
  };

  const handleEdit = (provider: any) => {
    setFormMode('edit');
    setModelSearch('');
    setEditingId(provider.id);
    // 尝试推断 selectedValue
    const match = getProviderOptions().find(o => o.apiUrl && provider.apiUrl?.includes(
      new URL(o.apiUrl.startsWith('http') ? o.apiUrl : 'http://' + o.apiUrl).hostname
    ));
    setSelectedValue(match ? match.value : provider.type);

    setFormData({
      name: provider.name,
      type: provider.type,
      apiUrl: provider.apiUrl,
      apiKey: '', // 编辑时不显示 key，除非重新输入
      model: provider.model || '',
      modelCapabilities: provider.modelCapabilities || {}
    });
  };

  const handleSave = async () => {
    setFailure(null);
    if (!formData.name || !formData.apiUrl) {
      toast({ title: i18n.t('aiSettings.nameUrlRequired'), variant: 'destructive' });
      return;
    }
    if (!formData.model.trim()) {
      toast({ title: i18n.t('aiSettings.modelRequired'), variant: 'destructive' });
      return;
    }
    if (formMode === 'add' && formData.type !== 'ollama' && !formData.apiKey) {
      toast({ title: i18n.t('aiSettings.keyRequired'), variant: 'destructive' });
      return;
    }

    try {
      if (formMode === 'edit' && editingId) {
        // 编辑模式下如果没有填写 apiKey 则不更新密码字段
        const payload: any = { id: editingId, ...formData };
        if (!formData.apiKey) delete payload.apiKey;
        await updateMutation.mutateAsync(payload);
        toast({ title: i18n.t('aiSettings.updated') });
      } else {
        await createMutation.mutateAsync({ ...formData, isDefault: providers.length === 0 });
        toast({ title: i18n.t('aiSettings.added') });
      }

      setFormMode('list');
      setEditingId(null);
      setFormData(defaultForm);
      setSelectedValue('deepseek');
    } catch (error: any) {
      setFailure(error);
      toast({ title: i18n.t('aiSettings.saveFailed'), description: getLocalizedApiError(error, 'ai'), variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('aiSettings.deleteConfirm'))) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: i18n.t('aiSettings.deleted') });
    } catch (error: any) {
      setFailure(error);
      toast({ title: i18n.t('aiSettings.deleteFailed'), description: getLocalizedApiError(error, 'ai'), variant: 'destructive' });
    }
  };

  const handleTest = async (id: string) => {
    setFailure(null);
    try {
      const result = await testMutation.mutateAsync(id);
      toast({ title: result.success ? i18n.t('aiSettings.connectionSuccess') : i18n.t('aiSettings.connectionFailed'), variant: result.success ? 'default' : 'destructive' });
    } catch (error: any) {
      setFailure(error);
      toast({ title: i18n.t('aiSettings.testFailed'), description: getLocalizedApiError(error, 'ai'), variant: 'destructive' });
    }
  };

  const handleSetDefault = async (id: string) => {
    setFailure(null);
    try {
      await updateMutation.mutateAsync({ id, isDefault: true });
      toast({ title: i18n.t('aiSettings.defaultSet') });
    } catch (error: any) {
      setFailure(error);
      toast({ title: i18n.t('aiSettings.defaultFailed'), description: getLocalizedApiError(error, 'ai'), variant: 'destructive' });
    }
  };

  if (isError) return <div className="card card-body" role="alert"><p>{t('aiSettings.loadFailed')}</p><ErrorDetails error={error} /><Button onClick={() => void refetch()}>{t('common.retry')}</Button></div>;
  if (isLoading) return <div className="p-4 text-sm text-(--text-secondary)">{t('aiSettings.loading')}</div>;

  const groups = [t('aiSettings.international'), t('aiSettings.local'), t('aiSettings.china'), t('aiSettings.custom')];

  return (
    <div className="space-y-6">
      <LanguageSelect compact />
      {Boolean(failure) && <div className="card card-body" role="alert"><p>{getLocalizedApiError(failure, 'ai')}</p><ErrorDetails error={failure} /></div>}
      {/* ── 已配置的 Provider 列表 ── */}
      {providers.length > 0 && formMode === 'list' && (
        <div className="space-y-3">
          {providers.map((provider) => (
            <div key={provider.id} className="p-4 bg-(--bg-primary) border border-(--border-color) rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="ai-provider-row flex items-center justify-between">
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-(--text-primary) truncate">{provider.name}</h3>
                    {provider.isDefault && (
                      <span className="text-[10px] bg-(--primary) text-white px-2 py-0.5 rounded-full font-medium inline-block shrink-0 shadow-sm opacity-90">
                        {t('aiSettings.currentDefault')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-(--text-secondary) font-medium mb-1">
                    {getProviderLabel(provider.apiUrl || '', provider.type)}
                    {provider.model && <span className="opacity-75 font-normal ml-1">({provider.model})</span>}
                  </p>
                  <p className="text-[11px] text-(--text-tertiary) truncate select-all font-mono">{provider.apiUrl}</p>
                </div>
                <div className="flex gap-1.5 shrink-0 bg-(--bg-secondary) p-1 rounded-lg border border-(--border-color)">
                  {!provider.isDefault && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-(--text-secondary) hover:text-(--primary) hover:bg-(--primary)/10"
                      onClick={() => handleSetDefault(provider.id)}
                      title={t('aiSettings.setDefault')}
                    >
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-(--text-secondary) hover:text-green-600 hover:bg-green-50"
                    onClick={() => handleTest(provider.id)}
                    disabled={testMutation.isPending}
                    title={t('aiSettings.test')}
                  >
                    <Zap className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-(--text-secondary) hover:text-blue-600 hover:bg-blue-50"
                    onClick={() => handleEdit(provider)}
                    title={t('aiSettings.edit')}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-(--text-secondary) hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(provider.id)}
                    title={t('aiSettings.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 添加 / 编辑配置 ── */}
      {formMode !== 'list' ? (
        <div className="p-5 bg-(--bg-primary) border border-(--border-color) rounded-xl shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-(--text-primary) border-b border-(--border-color) pb-3 flex items-center gap-2">
            {formMode === 'add' ? <Plus className="w-4 h-4 text-(--primary)" /> : <Edit2 className="w-4 h-4 text-(--primary)" />}
            {formMode === 'add' ? t('aiSettings.addTitle') : t('aiSettings.editTitle')}
          </h3>

          <div className="space-y-4 pt-1 text-(--text-primary)">
            <div>
              <label className="text-xs font-medium text-(--text-secondary) mb-1.5 block">{t('aiSettings.provider')}</label>
              <select
                className="w-full px-3 py-2 text-sm bg-(--bg-primary) border border-(--border-color) rounded-lg focus:outline-none focus:ring-2 focus:ring-(--primary) focus:border-transparent transition-all"
                aria-label={t('aiSettings.provider')} value={selectedValue}
                onChange={(e) => handleProviderSelect(e.target.value)}
              >
                {groups.map((group, index) => {
                  const opts = getProviderOptions().filter(o => o.group === group);
                  return (
                    <optgroup key={index} label={group} className="font-semibold text-(--text-primary)">
                      {opts.map(opt => (
                        <option key={opt.value} value={opt.value} className="font-normal">{opt.label}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-(--text-secondary) mb-1.5 block">{t('aiSettings.name')}</label>
              <Input
                placeholder={t('aiSettings.namePlaceholder')}
                aria-label={t('aiSettings.name')} value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-(--bg-primary) border-(--border-color) text-sm focus-visible:ring-(--primary)"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-(--text-secondary) mb-1.5 block">{t('aiSettings.baseUrl')}</label>
              <Input
                placeholder={t('aiSettings.urlPlaceholder')}
                aria-label={t('aiSettings.baseUrl')} value={formData.apiUrl}
                onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                className="bg-(--bg-primary) border-(--border-color) text-sm font-mono focus-visible:ring-(--primary)"
              />
            </div>

            {formData.type !== 'ollama' && (
              <div>
                <label className="text-xs font-medium text-(--text-secondary) mb-1.5 block">{t('aiSettings.key')} {formMode === 'edit' ? t('aiSettings.keepKey') : '*'}</label>
                <Input
                  placeholder="sk-..."
                  type="password"
                  aria-label={t('aiSettings.key')} value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  className="bg-(--bg-primary) border-(--border-color) text-sm font-mono focus-visible:ring-(--primary)"
                />
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label htmlFor="provider-model" className="text-xs font-medium text-(--text-secondary)">{t('aiSettings.defaultModel')}</label>
                <Button variant="outline" size="sm" onClick={() => void fetchModels()} disabled={discoverMutation.isPending || !formData.apiUrl}>
                  {discoverMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                  {catalog?.source === 'api' ? t('aiSettings.refreshModels') : t('aiSettings.fetchModels')}
                </Button>
              </div>
              {modelOptions.length > 8 && <Input aria-label={t('aiSettings.searchModels')} placeholder={t('aiSettings.searchPlaceholder')} value={modelSearch} onChange={event => setModelSearch(event.target.value)} className="mb-2" />}
              <select id="provider-model" className="studio-input w-full" value={primaryModel} onChange={event => setFormData({ ...formData, model: event.target.value })} disabled={discoverMutation.isPending}>
                {!primaryModel && <option value="">{t('aiSettings.selectModel')}</option>}
                {modelOptions.filter(model => model.id === primaryModel || model.id.toLowerCase().includes(modelSearch.toLowerCase())).map(model =>
                  <option key={model.id} value={model.id}>{model.id} · {modelImageLabel(model)}</option>)}
              </select>
              <p className="text-xs text-(--text-secondary) mt-2" role="status">
                {discoverMutation.isPending || savedModels.isFetching ? t('aiSettings.fetchingModels') : (catalog?.warning ? modelCatalogWarning(catalog) : '') || (catalog?.source === 'api' ? t('aiSettings.modelsReady', { count: modelOptions.length }) : t('aiSettings.fetchModelsHint'))}
              </p>
              {catalog?.warning && <ErrorDetails error={{ message: catalog.warning }} />}
              {savedModels.isError && !catalog && <p className="text-xs text-red-500 mt-1">{t('aiSettings.modelsFallback')}</p>}
              <details className="mt-3 text-xs text-(--text-secondary)">
                <summary className="cursor-pointer">{t('aiSettings.manual')}</summary>
                <div className="space-y-2 mt-2">
                  <label htmlFor="manual-model" className="block">{t('aiSettings.manualHint')}</label>
                  <Input id="manual-model" placeholder={t('aiSettings.modelId')} value={formData.model} onChange={event => setFormData({ ...formData, model: event.target.value })} />
                  <label htmlFor="model-vision" className="block">{t('aiSettings.imageCapability')}</label>
                  <select id="model-vision" className="studio-input w-full" disabled={!primaryModel} value={Object.hasOwn(formData.modelCapabilities, primaryModel) ? String(formData.modelCapabilities[primaryModel]) : 'auto'}
                    onChange={event => {
                      const capabilities = { ...formData.modelCapabilities };
                      if (event.target.value === 'auto') delete capabilities[primaryModel]; else capabilities[primaryModel] = event.target.value === 'true';
                      setFormData({ ...formData, modelCapabilities: capabilities });
                    }}>
                    <option value="auto">{t('aiSettings.autoCapability', { capability: modelImageLabel(selectedModelInfo) })}</option>
                    <option value="true">{t('aiSettings.confirmVision')}</option><option value="false">{t('aiSettings.noVision')}</option>
                  </select>
                  <p>{t('aiSettings.visionHint')}</p>
                </div>
              </details>
            </div>

            <div className="flex flex-wrap gap-2 pt-4 border-t border-(--border-color)">
              <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="h-9 px-5 bg-(--primary) hover:opacity-90 text-white font-medium">
                <Check className="w-4 h-4 mr-2" />
                {formMode === 'add' ? t('aiSettings.addSave') : t('aiSettings.saveChanges')}
              </Button>
              <Button
                variant="outline"
                className="h-9 px-5 border-(--border-color) text-green-600 hover:text-green-700 hover:bg-green-50 hover:border-green-300"
                disabled={testConfigMutation.isPending || !formData.apiUrl}
                onClick={async () => {
                  setFailure(null);
                  try {
                    const result = await testConfigMutation.mutateAsync({
                      providerId: editingId || undefined,
                      type: formData.type,
                      apiUrl: formData.apiUrl,
                      apiKey: formData.apiKey || undefined,
                      model: formData.model || undefined
                    });
                    toast({ title: result.success ? i18n.t('aiSettings.connectionSuccess') : i18n.t('aiSettings.connectionFailed'), variant: result.success ? 'default' : 'destructive' });
                  } catch (error: any) {
                    setFailure(error);
                    toast({ title: i18n.t('aiSettings.testFailed'), description: getLocalizedApiError(error, 'ai'), variant: 'destructive' });
                  }
                }}
              >
                {testConfigMutation.isPending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Zap className="w-4 h-4 mr-2" />}
                {t('aiSettings.test')}
              </Button>
              <Button variant="outline" className="h-9 px-5 border-(--border-color) text-(--text-primary) hover:bg-(--bg-secondary)" onClick={() => { setFormMode('list'); setEditingId(null); }}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button onClick={() => { setFormMode('add'); setFormData(defaultForm); setSelectedValue('deepseek'); }} className="h-10 w-full sm:w-auto bg-(--primary) hover:opacity-90 text-white font-medium shadow-sm">
          <Plus className="w-4 h-4 mr-2" />{t('aiSettings.addProvider')}
        </Button>
      )}

      {/* ── 提示词编辑 ── */}
      <div className="bg-(--bg-primary) border border-(--border-color) rounded-xl overflow-hidden shadow-sm">
        <button
          onClick={() => setPromptExpanded(prev => !prev)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-bold text-(--text-primary) hover:bg-(--bg-secondary) transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-(--primary)" />
            {t('aiSettings.systemPrompt')}
          </div>
          {promptExpanded ? <ChevronUp className="w-5 h-5 text-(--text-secondary)" /> : <ChevronDown className="w-5 h-5 text-(--text-secondary)" />}
        </button>

        {promptExpanded && (
          <div className="p-5 border-t border-(--border-color) space-y-4 bg-(--bg-secondary)/30">
            <p className="text-xs text-(--text-secondary) leading-relaxed">
              {t('aiSettings.systemPromptHint')}
            </p>
            {promptLoading ? (
              <div className="text-xs text-(--text-tertiary) py-6 flex justify-center items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('aiSettings.loading')}
              </div>
            ) : (
              <div className="relative group">
                <textarea
                  readOnly={!isAdmin}
                  aria-label={t('aiSettings.systemPrompt')} value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder={builtInPrompt || t('aiSettings.promptLoading')}
                  className="w-full h-64 px-4 py-3 text-[13px] bg-(--bg-primary) border border-(--border-color) rounded-lg focus:outline-none focus:ring-2 focus:ring-(--primary) font-mono resize-y text-(--text-primary) shadow-inner placeholder:text-(--text-tertiary)"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1 border-t border-(--border-color) mt-2 pt-4">
              <Button
                onClick={saveSystemPrompt}
                disabled={!isAdmin || promptSaving}
                className="h-9 px-4 bg-(--primary) hover:opacity-90 text-white font-medium shadow-sm"
              >
                <Save className="w-4 h-4 mr-2" />
                {promptSaving ? t('aiSettings.saving') : t('aiSettings.savePrompt')}
              </Button>
              <Button
                variant="outline"
                disabled={!isAdmin || promptSaving}
                onClick={copyBuiltInToEdit}
                className="h-9 px-4 border-(--border-color) text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-secondary)"
                title={t('aiSettings.copyPromptHint')}
              >
                <FileText className="w-4 h-4 mr-2" />
                {t('aiSettings.copyPrompt')}
              </Button>
              <Button
                variant="outline"
                disabled={!isAdmin || promptSaving}
                onClick={resetSystemPrompt}
                className="h-9 px-4 border-red-200 text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto"
                title={t('aiSettings.clearPromptHint')}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                {t('aiSettings.clearPrompt')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
