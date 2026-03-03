import { useState, useEffect } from 'react';
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
} from '@/api/ai';
import { apiClient } from '@/api/client';


const PROVIDER_OPTIONS = [
  { value: 'claude', label: 'Claude (Anthropic)', apiUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022', group: '国际服务' },
  { value: 'openai', label: 'OpenAI', apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o', group: '国际服务' },
  { value: 'ollama', label: 'Ollama (本地)', apiUrl: 'http://localhost:11434', model: '', group: '本地部署' },
  { value: 'deepseek', label: '🐋 DeepSeek', apiUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', group: '国产模型' },
  { value: 'qwen', label: '🌐 通义千问 (Qwen)', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-max', group: '国产模型' },
  { value: 'ernie', label: '🌊 文心一言 (ERNIE)', apiUrl: 'https://qianfan.baidubce.com/v2', model: 'ernie-4.5-8k', group: '国产模型' },
  { value: 'zhipu', label: '🧠 智谱 GLM', apiUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', group: '国产模型' },
  { value: 'moonshot', label: '🌙 Moonshot (Kimi)', apiUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', group: '国产模型' },
  { value: 'stepfun', label: '⭐ 阶跃星辰 (Step)', apiUrl: 'https://api.stepfun.com/v1', model: 'step-1-8k', group: '国产模型' },
  { value: 'custom', label: '自定义', apiUrl: '', model: '', group: '自定义' },
] as const;

function toBackendType(value: string): 'claude' | 'openai' | 'ollama' | 'custom' {
  if (value === 'claude') return 'claude';
  if (value === 'openai') return 'openai';
  if (value === 'ollama') return 'ollama';
  return 'custom';
}

function getProviderLabel(apiUrl: string, type: string): string {
  const match = PROVIDER_OPTIONS.find(o => o.apiUrl && apiUrl?.includes(
    new URL(o.apiUrl.startsWith('http') ? o.apiUrl : 'http://' + o.apiUrl).hostname
  ));
  if (match && match.value !== 'custom') return match.label;
  return type === 'ollama' ? 'Ollama' : type === 'claude' ? 'Claude' : type === 'openai' ? 'OpenAI' : '自定义';
}

export function AIProviderSettings() {
  const { toast } = useToast();
  const { data: providers = [], isLoading } = useAIProviders();
  const createMutation = useCreateAIProvider();
  const updateMutation = useUpdateAIProvider();
  const deleteMutation = useDeleteAIProvider();
  const testMutation = useTestAIProvider();

  // 'list' | 'add' | 'edit'
  const [formMode, setFormMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedValue, setSelectedValue] = useState('deepseek');

  const defaultForm = {
    name: '',
    type: 'custom' as 'claude' | 'openai' | 'ollama' | 'custom',
    apiUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat'
  };
  const [formData, setFormData] = useState(defaultForm);

  // 提示词编辑
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [builtInPrompt, setBuiltInPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);

  useEffect(() => {
    if (promptExpanded && !systemPrompt && !promptLoading) {
      loadSystemPrompt();
    }
    if (promptExpanded && !builtInPrompt) {
      apiClient.get('/settings/default-prompt').then(r => setBuiltInPrompt(r.data?.defaultPrompt || ''));
    }
  }, [promptExpanded]);

  const loadSystemPrompt = async () => {
    setPromptLoading(true);
    try {
      const res = await apiClient.get('/settings');
      setSystemPrompt(res.data?.['ai.systemPrompt'] || '');
    } catch {
      // 忽略
    } finally {
      setPromptLoading(false);
    }
  };

  const saveSystemPrompt = async () => {
    setPromptSaving(true);
    try {
      await apiClient.post('/settings', { 'ai.systemPrompt': systemPrompt });
      toast({ title: '提示词已保存' });
    } catch {
      toast({ title: '保存失败', variant: 'destructive' });
    } finally {
      setPromptSaving(false);
    }
  };

  const resetSystemPrompt = async () => {
    if (!confirm('确定要清空自定义提示词，恢复系统默认吗？')) return;
    setSystemPrompt('');
    try {
      await apiClient.post('/settings', { 'ai.systemPrompt': '' });
      toast({ title: '已清空并恢复默认' });
    } catch {
      toast({ title: '重置失败', variant: 'destructive' });
    }
  };

  const copyBuiltInToEdit = () => {
    if (builtInPrompt) {
      setSystemPrompt(builtInPrompt);
      toast({ title: '已将默认模版填入编辑框' });
    }
  };

  const handleProviderSelect = (value: string) => {
    setSelectedValue(value);
    const opt = PROVIDER_OPTIONS.find(o => o.value === value);
    if (opt) {
      setFormData(prev => ({
        ...prev,
        type: toBackendType(value),
        apiUrl: opt.apiUrl,
        model: opt.model,
        name: prev.name || opt.label.replace(/^[^\s]+ /, '')
      }));
    }
  };

  const handleEdit = (provider: any) => {
    setFormMode('edit');
    setEditingId(provider.id);
    // 尝试推断 selectedValue
    const match = PROVIDER_OPTIONS.find(o => o.apiUrl && provider.apiUrl?.includes(
      new URL(o.apiUrl.startsWith('http') ? o.apiUrl : 'http://' + o.apiUrl).hostname
    ));
    setSelectedValue(match ? match.value : provider.type);

    setFormData({
      name: provider.name,
      type: provider.type,
      apiUrl: provider.apiUrl,
      apiKey: '', // 编辑时不显示 key，除非重新输入
      model: provider.model || ''
    });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.apiUrl) {
      toast({ title: '请填写配置名称和 API URL', variant: 'destructive' });
      return;
    }
    if (formData.type === 'ollama' && !formData.model) {
      toast({ title: 'Ollama 需要指定模型名称', variant: 'destructive' });
      return;
    }
    if (formMode === 'add' && formData.type !== 'ollama' && !formData.apiKey) {
      toast({ title: '请填写 API Key', variant: 'destructive' });
      return;
    }

    try {
      if (formMode === 'edit' && editingId) {
        // 编辑模式下如果没有填写 apiKey 则不更新密码字段
        const payload: any = { id: editingId, ...formData };
        if (!formData.apiKey) delete payload.apiKey;
        await updateMutation.mutateAsync(payload);
        toast({ title: 'AI 配置已更新' });
      } else {
        await createMutation.mutateAsync({ ...formData, isDefault: providers.length === 0 });
        toast({ title: 'AI 配置已添加' });
      }

      setFormMode('list');
      setEditingId(null);
      setFormData(defaultForm);
      setSelectedValue('deepseek');
    } catch (error: any) {
      toast({ title: '保存失败', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此 AI 配置吗？')) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: 'AI 配置已删除' });
    } catch (error: any) {
      toast({ title: '删除失败', description: error.message, variant: 'destructive' });
    }
  };

  const handleTest = async (id: string) => {
    try {
      const result = await testMutation.mutateAsync(id);
      toast({ title: result.success ? '连接成功 ✓' : '连接失败', variant: result.success ? 'default' : 'destructive' });
    } catch (error: any) {
      toast({ title: '测试失败', description: error.message, variant: 'destructive' });
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await updateMutation.mutateAsync({ id, isDefault: true });
      toast({ title: '已设为默认' });
    } catch (error: any) {
      toast({ title: '设置失败', description: error.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <div className="p-4 text-sm text-(--text-secondary)">加载中...</div>;

  const groups = ['国际服务', '本地部署', '国产模型', '自定义'];

  return (
    <div className="space-y-6">
      {/* ── 已配置的 Provider 列表 ── */}
      {providers.length > 0 && formMode === 'list' && (
        <div className="space-y-3">
          {providers.map((provider) => (
            <div key={provider.id} className="p-4 bg-(--bg-primary) border border-(--border-color) rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-(--text-primary) truncate">{provider.name}</h3>
                    {provider.isDefault && (
                      <span className="text-[10px] bg-(--primary) text-white px-2 py-0.5 rounded-full font-medium inline-block shrink-0 shadow-sm opacity-90">
                        当前默认
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
                      title="设为默认"
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
                    title="测试连接"
                  >
                    <Zap className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-(--text-secondary) hover:text-blue-600 hover:bg-blue-50"
                    onClick={() => handleEdit(provider)}
                    title="编辑"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-(--text-secondary) hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(provider.id)}
                    title="删除"
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
            {formMode === 'add' ? '新增 AI 配置' : '编辑 AI 配置'}
          </h3>

          <div className="space-y-4 pt-1 text-(--text-primary)">
            <div>
              <label className="text-xs font-medium text-(--text-secondary) mb-1.5 block">服务商架构 *</label>
              <select
                className="w-full px-3 py-2 text-sm bg-(--bg-primary) border border-(--border-color) rounded-lg focus:outline-none focus:ring-2 focus:ring-(--primary) focus:border-transparent transition-all"
                value={selectedValue}
                onChange={(e) => handleProviderSelect(e.target.value)}
              >
                {groups.map(group => {
                  const opts = PROVIDER_OPTIONS.filter(o => o.group === group);
                  return (
                    <optgroup key={group} label={group} className="font-semibold text-(--text-primary)">
                      {opts.map(opt => (
                        <option key={opt.value} value={opt.value} className="font-normal">{opt.label}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-(--text-secondary) mb-1.5 block">自定义配置名称 *</label>
              <Input
                placeholder="如：DeepSeek-主账号"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-(--bg-primary) border-(--border-color) text-sm focus-visible:ring-(--primary)"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-(--text-secondary) mb-1.5 block">API 基础路径 (Base URL) *</label>
              <Input
                placeholder="API 地址"
                value={formData.apiUrl}
                onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                className="bg-(--bg-primary) border-(--border-color) text-sm font-mono focus-visible:ring-(--primary)"
              />
            </div>

            {formData.type !== 'ollama' && (
              <div>
                <label className="text-xs font-medium text-(--text-secondary) mb-1.5 block">接口密钥 (API Key) {formMode === 'edit' ? '(留空不修改)' : '*'}</label>
                <Input
                  placeholder="sk-..."
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  className="bg-(--bg-primary) border-(--border-color) text-sm font-mono focus-visible:ring-(--primary)"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-(--text-secondary) mb-1.5 block">
                模型名称配置 {formData.type === 'ollama' ? '*' : '(选填，支持配置多模型自动切换)'}
              </label>
              <Input
                placeholder={formData.type === 'ollama' ? '如: qwen2.5:7b,llama3' : '如: gpt-4o,gpt-4-turbo...'}
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="bg-(--bg-primary) border-(--border-color) text-sm font-mono focus-visible:ring-(--primary)"
              />
              <p className="text-[10px] text-(--text-tertiary) mt-1.5 ml-1 leading-relaxed">多个模型请使用英文逗号 `,` 隔开。在聊天面板右侧会自动出现快捷切换这些模型的菜单。<br />如果不填，将使用服务商或 SDK 默认模型兜底请求。</p>
            </div>

            <div className="flex gap-2 pt-4 border-t border-(--border-color)">
              <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="h-9 px-5 bg-(--primary) hover:opacity-90 text-white font-medium">
                <Check className="w-4 h-4 mr-2" />
                {formMode === 'add' ? '新增并保存' : '保存修改'}
              </Button>
              <Button variant="outline" className="h-9 px-5 border-(--border-color) text-(--text-primary) hover:bg-(--bg-secondary)" onClick={() => { setFormMode('list'); setEditingId(null); }}>
                取消
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button onClick={() => { setFormMode('add'); setFormData(defaultForm); setSelectedValue('deepseek'); }} className="h-10 w-full sm:w-auto bg-(--primary) hover:opacity-90 text-white font-medium shadow-sm">
          <Plus className="w-4 h-4 mr-2" />新增 AI 服务提供商
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
            自定义默认系统指令 (System Prompt)
          </div>
          {promptExpanded ? <ChevronUp className="w-5 h-5 text-(--text-secondary)" /> : <ChevronDown className="w-5 h-5 text-(--text-secondary)" />}
        </button>

        {promptExpanded && (
          <div className="p-5 border-t border-(--border-color) space-y-4 bg-(--bg-secondary)/30">
            <p className="text-xs text-(--text-secondary) leading-relaxed">
              这是发送给 AI 画布助手的系统指令约束。当你留空时，AI 生成将自动使用系统的内置最佳实践长文本模板；如果你想微调生成风格（例如指定某种语言、指定避免的主题等），可以在下方进行补充或覆写。
            </p>
            {promptLoading ? (
              <div className="text-xs text-(--text-tertiary) py-6 flex justify-center items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
              </div>
            ) : (
              <div className="relative group">
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder={builtInPrompt || '加载默认提示文案中...'}
                  className="w-full h-64 px-4 py-3 text-[13px] bg-(--bg-primary) border border-(--border-color) rounded-lg focus:outline-none focus:ring-2 focus:ring-(--primary) font-mono resize-y text-(--text-primary) shadow-inner placeholder:text-(--text-tertiary)"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1 border-t border-(--border-color) mt-2 pt-4">
              <Button
                onClick={saveSystemPrompt}
                disabled={promptSaving}
                className="h-9 px-4 bg-(--primary) hover:opacity-90 text-white font-medium shadow-sm"
              >
                <Save className="w-4 h-4 mr-2" />
                {promptSaving ? '保存中...' : '保存自定义指令'}
              </Button>
              <Button
                variant="outline"
                onClick={copyBuiltInToEdit}
                className="h-9 px-4 border-(--border-color) text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-secondary)"
                title="将系统目前后台自带的版本完整的带入编辑框，方便在其基础上做小修改"
              >
                <FileText className="w-4 h-4 mr-2" />
                基于系统模板衍生
              </Button>
              <Button
                variant="outline"
                onClick={resetSystemPrompt}
                className="h-9 px-4 border-red-200 text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto"
                title="清除输入框内容并恢复由系统控制指令"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                清空并恢复默认
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
