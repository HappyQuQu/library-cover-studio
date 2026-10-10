import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Send, Loader2, Sparkles, RefreshCw, CheckCircle, Layers, Square, Settings2, ArrowRight, Lock, X, ImagePlus } from 'lucide-react';
import { useAIProviders, useAIProviderModels, modelImageLabel, type AIModel } from '@/api/ai';
import { useCanvasStore } from '@/stores/canvasStore';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/api/client';
import { toast } from '@/components/ui/use-toast';
import { CANVAS_PROPERTIES, constrainDesign, describeChanges, isLocked, summarizeCanvas } from '@/lib/aiDesign';
import type { CanvasJSON, DesignScope } from '@/lib/aiDesign';
import { readSSE } from '@/lib/sse';
import { DesignPreview, normalizeDesignAssets } from './DesignPreview';
import { MAX_REFERENCE_IMAGES, prepareReferenceImage, type ReferenceImage } from '@/lib/referenceImages';

interface ChatMessage {
  role: 'user' | 'assistant'; content: string; prompt?: string; error?: boolean;
  canvasJson?: CanvasJSON; baseline?: CanvasJSON; originSnapshot?: string;
  changes?: string[]; applied?: boolean; width?: number; height?: number;
  referenceImages?: ReferenceImage[]; referenceAnalysis?: string;
}
interface StreamChunk { type: 'chunk' | 'status' | 'complete' | 'error' | 'conversation_id'; content?: string; canvasJson?: CanvasJSON; error?: string; id?: string; }

function ResultCard({ message, onApply, onContinue, applying }: {
  message: ChatMessage; onApply: () => void; onContinue: () => void; applying: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [ready, setReady] = useState(false);
  const setPreviewReady = useCallback((value: boolean) => setReady(value), []);
  return <div className="ai-result">
    {message.referenceAnalysis && <div className="ai-reference-analysis"><strong><Sparkles size={13} />参考图分析</strong><p>{message.referenceAnalysis}</p></div>}
    <div className="ai-result-heading"><span>封面方案</span><div className="segmented compact" aria-label="预览对比">
      <button type="button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>生成结果</button>
      <button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>修改前</button>
    </div></div>
    <div hidden={showOriginal}><DesignPreview json={message.canvasJson!} width={message.width!} height={message.height!} onReady={setPreviewReady} /></div>
    {showOriginal && <DesignPreview json={message.baseline!} width={message.width!} height={message.height!} />}
    <ul className="ai-change-list">{message.changes?.map(change => <li key={change}><CheckCircle size={13} />{change}</li>)}</ul>
    <div className="ai-result-actions">
      {message.applied ? <span className="ai-applied"><CheckCircle size={14} />已应用，可在编辑器撤销</span>
        : <button type="button" className="studio-primary" disabled={!ready || applying} onClick={onApply}>
          {applying ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}应用到画布</button>}
      <button type="button" className="studio-secondary" disabled={applying} onClick={onContinue}>继续调整<ArrowRight size={13} /></button>
    </div>
  </div>;
}

export function AIChatPanel({ onApplied, width = 1920, height = 1080 }: { onApplied?: () => void; width?: number; height?: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  const [scope, setScope] = useState<DesignScope>('canvas');
  const [selectedProvider, setSelectedProvider] = useState<string>();
  const [selectedModel, setSelectedModel] = useState<string>();
  const [conversationId, setConversationId] = useState<string>();
  const [draft, setDraft] = useState<{ json: CanvasJSON; originSnapshot: string } | null>(null);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [showReferenceImages, setShowReferenceImages] = useState(true);
  const [isPreparingImages, setIsPreparingImages] = useState(false);
  const [draggingImages, setDraggingImages] = useState(false);
  const imageUploadRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const { data: providers, isLoading, isError, refetch } = useAIProviders();
  const activeProviders = providers?.filter(provider => provider.isActive);
  const canvas = useCanvasStore(state => state.canvas);
  const selectedObject = useCanvasStore(state => state.selectedObject);
  const applyCanvasJSON = useCanvasStore(state => state.applyCanvasJSON);
  const currentProvider = activeProviders?.find(provider => provider.id === selectedProvider);
  const modelCatalog = useAIProviderModels(currentProvider?.id, currentProvider?.updatedAt);
  const availableModels = [...new Map([
    ...(currentProvider?.model || '').split(',').map(id => id.trim()).filter(Boolean).map(id => ({ id, name: id,
      imageInput: currentProvider?.modelCapabilities?.[id] ?? null, capabilitySource: 'unknown' } as AIModel)),
    ...(modelCatalog.data?.models || [])
  ].map(model => [model.id, model])).values()];
  const modelInfo = availableModels.find(model => model.id === selectedModel);
  const supportsImages = modelInfo?.imageInput === true;
  const imageCapabilityHint = modelCatalog.isFetching ? '正在读取模型图片能力…' : supportsImages ? '支持拖入或粘贴'
    : modelInfo?.imageInput === false ? '当前模型不支持图片，请切换图片模型'
    : '图片能力待确认，可在 AI 配置中确认';

  const snapshot = useCallback(() => ({ ...(canvas?.toObject(CANVAS_PROPERTIES) || { objects: [] }), width, height } as CanvasJSON), [canvas, width, height]);
  useEffect(() => {
    if (activeProviders?.length && !activeProviders.some(provider => provider.id === selectedProvider)) {
      setSelectedProvider((activeProviders.find(provider => provider.isDefault) || activeProviders[0]).id);
    }
  }, [providers, selectedProvider]);
  useEffect(() => { setSelectedModel(currentProvider?.model?.split(',')[0].trim() || undefined); }, [selectedProvider, currentProvider?.model]);
  useEffect(() => {
    if (!selectedModel && availableModels.length) setSelectedModel(availableModels[0].id);
  }, [selectedModel, modelCatalog.data]);
  useEffect(() => { latestMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [messages]);
  useEffect(() => () => { requestRef.current?.abort(); }, []);

  const selectedIds = selectedObject ? (selectedObject.type.toLowerCase() === 'activeselection'
    ? (selectedObject as any).getObjects().map((object: any) => object.id)
    : [(selectedObject as any).id]).filter(Boolean) as string[] : [];

  const addReferenceImages = async (files: File[]) => {
    if (!supportsImages && files.length) {
      toast({ title: '当前模型尚未支持参考图上传', description: imageCapabilityHint, variant: 'destructive' }); return;
    }
    if (!files.length || imageUploadRef.current || isGenerating || applyingIndex !== null) return;
    if (referenceImages.length + files.length > MAX_REFERENCE_IMAGES) {
      toast({ title:'最多添加 3 张参考图', description:'请移除已有图片后再添加', variant:'destructive' }); return;
    }
    imageUploadRef.current = true; setIsPreparingImages(true);
    try {
      const prepared = await Promise.all(files.map(prepareReferenceImage));
      setReferenceImages(previous => [...previous, ...prepared]);
      setShowReferenceImages(true);
    } catch (error: any) { toast({ title:'参考图添加失败', description:error.message, variant:'destructive' }); }
    finally { imageUploadRef.current = false; setIsPreparingImages(false); }
  };

  const handleSend = async (retryPrompt?: string, retryImages?: ReferenceImage[]) => {
    const sentImages = retryImages || referenceImages;
    if (sentImages.length && !supportsImages) {
      toast({ title: '请切换支持图片理解的模型', description: '参考图已保留，也可以移除图片后继续文字生成', variant: 'destructive' }); return;
    }
    const prompt = (retryPrompt || input).trim() || (sentImages.length ? '分析参考图的配色、构图和文字层级，参考其风格设计一张媒体库海报，保留主副标题变量。' : '');
    if (!prompt || imageUploadRef.current || requestRef.current || !currentProvider || !canvas) return;
    const live = snapshot();
    const liveSignature = JSON.stringify(live);
    if (draft && draft.originSnapshot !== liveSignature) {
      toast({ title: '画布已发生变化', description: '请关闭待调整方案，再基于当前画布生成', variant: 'destructive' }); return;
    }
    const baseline = draft?.json || live;
    if (scope === 'selection' && (!selectedIds.length || selectedIds.some(id => isLocked(baseline.objects.find(object => object.id === id) || {})))) {
      toast({ title: '请选择可编辑的图层', description: '锁定图层会保持原样', variant: 'destructive' }); return;
    }
    const controller = new AbortController(); requestRef.current = controller;
    const assistantIndex = messages.length + 1;
    const update = (message: ChatMessage) => {
      if (requestRef.current === controller) setMessages(previous => previous.map((item, index) => index === assistantIndex ? message : item));
    };
    setMessages(previous => [...previous, { role: 'user', content: prompt, referenceImages:sentImages }, { role: 'assistant', content: sentImages.length ? '正在分析参考图…' : '正在分析设计需求…' }]);
    setInput(''); setIsGenerating(true);
    setShowReferenceImages(false);
    let completed = false;
    let generationLabel = sentImages.length ? '正在分析参考图并生成海报方案…' : '正在生成封面方案…';
    try {
      const token = useAuthStore.getState().token;
      if (!token) throw new Error('登录已失效，请重新登录');
      const constraints = scope === 'selection'
        ? `仅修改这些图层 ID：${selectedIds.join('、')}。保留这些 ID，返回完整画布 JSON。其他图层和背景必须原样保留。`
        : scope === 'new' ? '生成新的封面设计，保留上下文中的锁定图层。' : '在当前设计上优化，保留所有现有图层 ID、图片素材和变量绑定。';
      const response = await fetch(`${apiClient.defaults.baseURL}/ai-chat/generate`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: `${prompt}\n\n设计约束：${constraints}\n所有锁定图层保持原样。`, conversationId, providerId: selectedProvider,
          model: selectedModel, currentCanvas: summarizeCanvas(baseline), canvasSize: { width, height }, editMode: scope !== 'new',
          referenceImages:sentImages.map(image => ({dataUrl:image.dataUrl})) })
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(typeof detail.error === 'string' ? detail.error : detail.error?.message || '请求失败，请检查 AI 服务配置');
      }
      if (!response.body) throw new Error('未收到生成结果，请重试');
      for await (const event of readSSE<StreamChunk>(response.body)) {
        if (controller.signal.aborted) break;
        if (event.type === 'status') { generationLabel = event.content || '正在校正设计格式…'; update({ role: 'assistant', content: generationLabel }); }
        if (event.type === 'chunk') update({ role: 'assistant', content: generationLabel });
        if (event.type === 'error') throw new Error(event.error || '生成失败，请重试');
        if (event.type === 'conversation_id' && requestRef.current === controller) setConversationId(event.id);
        if (event.type === 'complete') {
          const { referenceAnalysis, ...design } = event.canvasJson!;
          const candidate = normalizeDesignAssets(constrainDesign(design as CanvasJSON, baseline, scope, selectedIds));
          update({ role: 'assistant', content: '方案已生成，预览后应用', canvasJson: candidate, baseline,
            originSnapshot: draft?.originSnapshot || liveSignature, width, height, changes: describeChanges(baseline, candidate, scope),
            referenceAnalysis: typeof referenceAnalysis === 'string' ? referenceAnalysis.slice(0, 1200) : undefined });
          completed = true; setDraft(null);
        }
      }
      if (!completed && !controller.signal.aborted) throw new Error('连接提前结束，未收到完整设计，请重试');
    } catch (error: any) {
      update({ role: 'assistant', content: controller.signal.aborted ? '已停止生成，需求与参考图已保留' : error.message, error: !controller.signal.aborted, prompt, referenceImages:sentImages });
      if (!completed) { setInput(prompt); setShowReferenceImages(true); }
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setIsGenerating(false); }
    }
  };

  const apply = async (message: ChatMessage, index: number) => {
    if (JSON.stringify(snapshot()) !== message.originSnapshot) {
      toast({ title: '画布已发生变化', description: '请基于当前画布重新生成，避免覆盖后续修改', variant: 'destructive' }); return;
    }
    setApplyingIndex(index);
    try {
      await applyCanvasJSON(message.canvasJson!);
      setMessages(previous => previous.map((item, messageIndex) => messageIndex === index ? { ...item, applied: true } : item));
      setDraft(null); onApplied?.();
      toast({ title: '设计已应用', description: '可以使用编辑器的撤销恢复原设计' });
    } catch {
      toast({ title: '应用失败', description: '原设计已保留，请检查素材或重新生成', variant: 'destructive' });
    } finally { setApplyingIndex(null); }
  };

  if (isLoading) return <div className="ai-empty"><Loader2 size={24} className="animate-spin" /><p>正在加载 AI 服务</p></div>;
  if (isError) return <div className="ai-empty"><p>AI 服务加载失败</p><button className="studio-secondary" onClick={() => void refetch()}>重新加载</button></div>;
  if (!activeProviders?.length) return <div className="ai-empty"><Sparkles size={32} /><strong>连接你的 AI 设计助手</strong>
    <p>配置 AI 服务后，即可生成封面、优化排版和调整选中图层。</p><Link to="/settings" className="studio-primary">前往配置<ArrowRight size={14} /></Link></div>;

  return <div className="ai-panel">
    <div className="ai-panel-header"><div><Sparkles size={16} /><strong>设计助手</strong></div>
      <button type="button" className="studio-icon" title="新建会话" aria-label="新建会话" disabled={isGenerating || applyingIndex !== null || isPreparingImages}
        onClick={() => { setMessages([]); setConversationId(undefined); setInput(''); setDraft(null); setReferenceImages([]); }}><RefreshCw size={15} /></button></div>
    <details className="ai-model-settings"><summary><Settings2 size={13} /><span>{currentProvider?.name} · {selectedModel || '默认模型'}</span></summary>
      <div><label>AI 服务<select className="studio-input" aria-label="AI 服务" value={selectedProvider || ''} disabled={isGenerating || isPreparingImages}
        onChange={event => { setSelectedProvider(event.target.value); setConversationId(undefined); }}>{activeProviders.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
        <label>模型<select className="studio-input" aria-label="模型" value={selectedModel || ''} disabled={isGenerating || isPreparingImages || !availableModels.length} onChange={event => setSelectedModel(event.target.value)}>
          {availableModels.length ? availableModels.map(model => <option key={model.id} value={model.id}>{model.id} · {modelImageLabel(model)}</option>) : <option value="">默认模型</option>}</select></label></div>
      <div className="ai-model-status">
        <span>{modelImageLabel(modelInfo)}</span>
        <button type="button" className="studio-secondary" disabled={modelCatalog.isFetching || isGenerating} onClick={() => void modelCatalog.refetch()}><RefreshCw size={12} />刷新模型</button>
        {!supportsImages && <Link to="/settings">配置图片能力</Link>}
        {(modelCatalog.data?.warning || modelCatalog.isError) && <p>{modelCatalog.data?.warning || '获取列表失败，已保留配置模型'}</p>}
      </div>
    </details>
    <div className="ai-scope"><span className="studio-label">操作范围</span><div className="segmented">
      {([{ value: 'canvas', label: '优化设计' }, { value: 'selection', label: '选中图层' }, { value: 'new', label: '新模板' }] as const).map(item =>
        <button type="button" key={item.value} aria-pressed={scope === item.value} disabled={isGenerating || (item.value === 'selection' && !selectedIds.length)}
          onClick={() => { setScope(item.value); setDraft(null); }}>{item.label}</button>)}
    </div><p><Lock size={11} />{scope === 'selection' ? selectedIds.length ? `仅修改选中的 ${selectedIds.length} 个图层` : '请先在画布或图层面板选择要调整的图层' : scope === 'new' ? '重新设计封面，保留锁定图层' : '基于当前画布优化，保留锁定图层'}</p></div>
    <div className="ai-messages" aria-live="polite" aria-busy={isGenerating}>
      {!messages.length && <div className="ai-welcome"><div className="ai-welcome-icon"><Sparkles size={25} /></div><strong>让封面更有设计感</strong>
        <p>描述想调整的地方，或从下面的快捷操作开始。生成后可先对比，再应用。</p>
        <div className="ai-shortcuts">{['优化标题排版', '调整海报排列', '提升文字可读性', '统一封面配色'].map(prompt =>
          <button type="button" key={prompt} onClick={() => { setInput(prompt); inputRef.current?.focus(); }}>{prompt}<ArrowRight size={12} /></button>)}</div></div>}
      {messages.map((message, index) => <div key={index} ref={index === messages.length - 1 ? latestMessageRef : undefined} className={`ai-message ${message.role}`}>
        {message.role === 'user' && !!message.referenceImages?.length && <div className="ai-sent-references">{message.referenceImages.map((image, imageIndex) =>
          <img key={image.id} src={image.dataUrl} alt={`已发送的参考图 ${imageIndex + 1}`} />)}</div>}
        {message.canvasJson ? <ResultCard message={message} applying={applyingIndex !== null || isGenerating}
          onApply={() => void apply(message, index)} onContinue={() => {
            setDraft({ json: message.canvasJson!, originSnapshot: message.applied ? JSON.stringify(snapshot()) : message.originSnapshot! });
            setScope('canvas'); setInput('在这个方案基础上，'); inputRef.current?.focus();
          }} /> : <><p>{message.content}</p>{message.error && <button type="button" className="studio-secondary" disabled={isGenerating}
            onClick={() => void handleSend(message.prompt, message.referenceImages)}><RefreshCw size={12} />重试</button>}</>}
      </div>)}
    </div>
    <div className={`ai-composer${draggingImages ? ' dragging-images' : ''}`}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); if (supportsImages) setDraggingImages(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingImages(false); }}
      onDrop={event => { event.preventDefault(); setDraggingImages(false); void addReferenceImages(Array.from(event.dataTransfer.files)); }}
      onPaste={event => { const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/')); if (images.length) { event.preventDefault(); void addReferenceImages(images); } }}>
      {draft && <div className="ai-draft">正在调整上一个方案<button type="button" className="studio-icon" aria-label="关闭待调整方案" onClick={() => setDraft(null)} disabled={isGenerating}><X size={13} /></button></div>}
      <div className="ai-reference-toolbar"><button type="button" className="studio-secondary" disabled={!supportsImages || isGenerating || applyingIndex !== null || isPreparingImages || referenceImages.length >= MAX_REFERENCE_IMAGES}
        onClick={() => fileInputRef.current?.click()}>{isPreparingImages ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}添加参考图</button>
        {referenceImages.length ? <button type="button" className="ai-reference-toggle" aria-expanded={showReferenceImages}
          onClick={() => setShowReferenceImages(value => !value)}>{referenceImages.length} / {MAX_REFERENCE_IMAGES} 张 · {showReferenceImages ? '收起参考图' : '展开参考图'}</button>
          : <span>{imageCapabilityHint}</span>}
        <input ref={fileInputRef} type="file" aria-label="上传参考图" accept="image/jpeg,image/png,image/webp" multiple hidden
          onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void addReferenceImages(files); }} /></div>
      {!!referenceImages.length && !supportsImages && <p className="ai-reference-hint">请切换支持图片理解的模型，或移除参考图后继续。</p>}
      {showReferenceImages && !!referenceImages.length && <div className="ai-reference-list">{referenceImages.map((image, imageIndex) => <div key={image.id} className="ai-reference-item">
        <img src={image.dataUrl} alt={`参考图 ${imageIndex + 1}：${image.name}`} /><span title={image.name}>参考图 {imageIndex + 1}</span>
        <button type="button" className="studio-icon" aria-label={`移除参考图 ${imageIndex + 1}`} disabled={isGenerating || applyingIndex !== null || isPreparingImages}
          onClick={() => setReferenceImages(previous => previous.filter(item => item.id !== image.id))}><X size={12} /></button></div>)}</div>}
      {showReferenceImages && !!referenceImages.length && <p className="ai-reference-hint">分析配色、排版与构图，生成可编辑海报。图片将在生成时发送给所选 AI 服务。</p>}
      <textarea ref={inputRef} aria-label="设计需求" placeholder={scope === 'selection' ? '例如：把选中的标题放大，保留位置…' : '例如：标题放在左侧，海报整齐排列，整体用深色…'}
        value={input} onChange={event => setInput(event.target.value)} rows={referenceImages.length ? 2 : 3} disabled={isGenerating || applyingIndex !== null || isPreparingImages}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void handleSend(); } }} />
      <div className="ai-composer-footer"><span>Enter 发送 · Shift + Enter 换行</span>{isGenerating
        ? <button type="button" className="studio-secondary" onClick={() => requestRef.current?.abort()}><Square size={12} />停止生成</button>
        : <button type="button" className="studio-primary" disabled={(!!referenceImages.length && !supportsImages) || (!input.trim() && !referenceImages.length) || isPreparingImages || !currentProvider || !canvas || applyingIndex !== null || (scope === 'selection' && !selectedIds.length)} onClick={() => void handleSend()}><Send size={13} />{referenceImages.length ? '参考生成海报' : '生成方案'}</button>}</div>
    </div>
  </div>;
}
