import { modelCatalogWarning } from '@/lib/modelCatalogDisplay';
import { displayMessage, type DisplayMessage } from '@/lib/displayMessage';
import { feedbackForStatus, type AIStreamEvent } from '@/lib/aiFeedback';
import { CodedError } from '@/lib/codedError';
import { buildDesignPrompt, DEFAULT_REFERENCE_PROMPT } from '@/lib/aiPrompt';
import { getLocalizedApiError } from '@/lib/apiError';
import { ErrorDetails } from '@/components/ErrorDetails';
import { LanguageSelect } from '@/components/LanguageSelect';
import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Send, Loader2, Sparkles, RefreshCw, CheckCircle, Layers, Square, Settings2, ArrowRight, Lock, X, ImagePlus } from 'lucide-react';
import { useAIProviders, useAIProviderModels, modelImageLabel, type AIModel } from '@/api/ai';
import { useCanvasStore } from '@/stores/canvasStore';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/api/client';
import { toast } from '@/components/ui/use-toast';
import { CANVAS_PROPERTIES, constrainDesign, describeChangeKeys, isLocked, summarizeCanvas } from '@/lib/aiDesign';
import type { CanvasJSON, DesignScope } from '@/lib/aiDesign';
import { readSSE } from '@/lib/sse';
import { DesignPreview, normalizeDesignAssets } from './DesignPreview';
import { MAX_REFERENCE_IMAGES, prepareReferenceImage, type ReferenceImage } from '@/lib/referenceImages';

interface ChatMessage {
  role: 'user' | 'assistant'; content: string; prompt?: string; error?: boolean;
  canvasJson?: CanvasJSON; baseline?: CanvasJSON; originSnapshot?: string;
  feedback?: DisplayMessage; statusDetails?: string;
  changeKeys?: ReturnType<typeof describeChangeKeys>; applied?: boolean; width?: number; height?: number;
  referenceImages?: ReferenceImage[]; referenceAnalysis?: string;
}

function ResultCard({ message, onApply, onContinue, applying }: {
  message: ChatMessage; onApply: () => void; onContinue: () => void; applying: boolean;
}) {
  const { t } = useTranslation();
  const [showOriginal, setShowOriginal] = useState(false);
  const [ready, setReady] = useState(false);
  const setPreviewReady = useCallback((value: boolean) => setReady(value), []);
  return <div className="ai-result">
    {message.referenceAnalysis && <div className="ai-reference-analysis"><strong><Sparkles size={13} />{t('aiChat.referenceAnalysis')}</strong><p>{message.referenceAnalysis}</p></div>}
    <div className="ai-result-heading"><span>{t('aiChat.result')}</span><div className="segmented compact" aria-label={t('aiChat.comparison')}>
      <button type="button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>{t('aiChat.generated')}</button>
      <button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>{t('aiChat.original')}</button>
    </div></div>
    <div hidden={showOriginal}><DesignPreview json={message.canvasJson!} width={message.width!} height={message.height!} onReady={setPreviewReady} /></div>
    {showOriginal && <DesignPreview json={message.baseline!} width={message.width!} height={message.height!} />}
    <ul className="ai-change-list">{message.changeKeys?.map(change => <li key={change}><CheckCircle size={13} />{t(change)}</li>)}</ul>
    <div className="ai-result-actions">
      {message.applied ? <span className="ai-applied"><CheckCircle size={14} />{t('aiChat.applied')}</span>
        : <button type="button" className="studio-primary" disabled={!ready || applying} onClick={onApply}>
          {applying ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}{t('aiChat.apply')}</button>}
      <button type="button" className="studio-secondary" disabled={applying} onClick={onContinue}>{t('aiChat.continue')}<ArrowRight size={13} /></button>
    </div>
  </div>;
}

export function AIChatPanel({ onApplied, width = 1920, height = 1080 }: { onApplied?: () => void; width?: number; height?: number }) {
  const { t, i18n } = useTranslation();
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
  const imageCapabilityHint = modelCatalog.isFetching ? t('aiChat.capabilityLoading') : supportsImages ? t('aiChat.dropPaste')
    : modelInfo?.imageInput === false ? t('aiChat.noImageModel')
    : t('aiChat.unknownImageModel');

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
      toast({ title: i18n.t('aiChat.uploadUnsupported'), description: imageCapabilityHint, variant: 'destructive' }); return;
    }
    if (!files.length || imageUploadRef.current || isGenerating || applyingIndex !== null) return;
    if (referenceImages.length + files.length > MAX_REFERENCE_IMAGES) {
      toast({ title:i18n.t('aiChat.maxReferences'), description:i18n.t('aiChat.removeFirst'), variant:'destructive' }); return;
    }
    imageUploadRef.current = true; setIsPreparingImages(true);
    try {
      const prepared = await Promise.all(files.map(prepareReferenceImage));
      setReferenceImages(previous => [...previous, ...prepared]);
      setShowReferenceImages(true);
    } catch (error: any) { toast({ title:i18n.t('aiChat.referenceFailed'), description:getLocalizedApiError(error, 'ai'), variant:'destructive' }); }
    finally { imageUploadRef.current = false; setIsPreparingImages(false); }
  };

  const handleSend = async (retryPrompt?: string, retryImages?: ReferenceImage[]) => {
    const sentImages = retryImages || referenceImages;
    if (sentImages.length && !supportsImages) {
      toast({ title: i18n.t('aiChat.switchImageModel'), description: i18n.t('aiChat.referencesRetained'), variant: 'destructive' }); return;
    }
    const prompt = (retryPrompt || input).trim() || (sentImages.length ? DEFAULT_REFERENCE_PROMPT : '');
    if (!prompt || imageUploadRef.current || requestRef.current || !currentProvider || !canvas) return;
    const live = snapshot();
    const liveSignature = JSON.stringify(live);
    if (draft && draft.originSnapshot !== liveSignature) {
      toast({ title: i18n.t('aiChat.canvasChanged'), description: i18n.t('aiChat.closeDraftHint'), variant: 'destructive' }); return;
    }
    const baseline = draft?.json || live;
    if (scope === 'selection' && (!selectedIds.length || selectedIds.some(id => isLocked(baseline.objects.find(object => object.id === id) || {})))) {
      toast({ title: i18n.t('aiChat.selectEditable'), description: i18n.t('aiChat.lockedUnchanged'), variant: 'destructive' }); return;
    }
    const controller = new AbortController(); requestRef.current = controller;
    const assistantIndex = messages.length + 1;
    const update = (message: ChatMessage) => {
      if (requestRef.current === controller) setMessages(previous => previous.map((item, index) => index === assistantIndex ? message : item));
    };
    setMessages(previous => [...previous, { role: 'user', content: prompt, referenceImages:sentImages }, { role: 'assistant', content: '', feedback: { key: sentImages.length ? 'aiChat.analyzingReferences' : 'aiChat.analyzingRequest' } }]);
    setInput(''); setIsGenerating(true);
    setShowReferenceImages(false);
    let completed = false;
    let generationFeedback: DisplayMessage = { key: sentImages.length ? 'aiChat.generatingReferences' : 'aiChat.generating' };
    let responseText = '';
    let statusDetails: string | undefined;
    try {
      const token = useAuthStore.getState().token;
      if (!token) throw new CodedError('UNAUTHORIZED');
      const response = await fetch(`${apiClient.defaults.baseURL}/ai-chat/generate`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: buildDesignPrompt(prompt, scope, selectedIds), conversationId, providerId: selectedProvider,
          model: selectedModel, currentCanvas: summarizeCanvas(baseline), canvasSize: { width, height }, editMode: scope !== 'new',
          referenceImages:sentImages.map(image => ({dataUrl:image.dataUrl})) })
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw { response: { status: response.status, data: detail } };
      }
      if (!response.body) throw new CodedError('AI_STREAM_INCOMPLETE');
      for await (const event of readSSE<AIStreamEvent>(response.body)) {
        if (controller.signal.aborted) break;
        if (!event || typeof event !== 'object') throw new CodedError('SSE_INVALID_EVENT');
        if (event.type === 'status') { responseText = ''; generationFeedback = feedbackForStatus(event); statusDetails = ['AI_RETRY_TRUNCATED', 'AI_RETRY_FORMAT'].includes(event.code || '') ? undefined : event.content; update({ role: 'assistant', content: '', feedback: generationFeedback, statusDetails }); }
        if (event.type === 'chunk') { responseText += event.content || ''; update({ role: 'assistant', content: responseText, feedback: generationFeedback, statusDetails }); }
        if (event.type === 'error') throw { code: event.code || 'AI_REQUEST_FAILED', error: event.error };
        if (event.type === 'conversation_id' && requestRef.current === controller) setConversationId(event.id);
        if (event.type === 'complete') {
          if (!event.canvasJson || typeof event.canvasJson !== 'object') throw new CodedError('AI_INVALID_CANVAS');
          const { referenceAnalysis, ...design } = event.canvasJson;
          const candidate = normalizeDesignAssets(constrainDesign(design as CanvasJSON, baseline, scope, selectedIds));
          update({ role: 'assistant', content: event.content || responseText, feedback: { key: 'aiChat.ready' }, canvasJson: candidate, baseline,
            originSnapshot: draft?.originSnapshot || liveSignature, width, height, changeKeys: describeChangeKeys(baseline, candidate, scope),
            referenceAnalysis: typeof referenceAnalysis === 'string' ? referenceAnalysis.slice(0, 1200) : undefined });
          completed = true; setDraft(null);
        }
      }
      if (!completed) throw new CodedError('AI_STREAM_INCOMPLETE');
    } catch (error: any) {
      update({ role: 'assistant', content: responseText, feedback: controller.signal.aborted ? { key: 'aiChat.stopped' } : { error, context: 'ai' }, error: !controller.signal.aborted, prompt, referenceImages:sentImages });
      if (!completed) { setInput(prompt); setShowReferenceImages(true); }
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setIsGenerating(false); }
    }
  };

  const apply = async (message: ChatMessage, index: number) => {
    if (JSON.stringify(snapshot()) !== message.originSnapshot) {
      toast({ title: i18n.t('aiChat.canvasChanged'), description: i18n.t('aiChat.regenerateHint'), variant: 'destructive' }); return;
    }
    setApplyingIndex(index);
    try {
      await applyCanvasJSON(message.canvasJson!);
      setMessages(previous => previous.map((item, messageIndex) => messageIndex === index ? { ...item, applied: true } : item));
      setDraft(null); onApplied?.();
      toast({ title: i18n.t('aiChat.applySuccess'), description: i18n.t('aiChat.undoHint') });
    } catch {
      toast({ title: i18n.t('aiChat.applyFailed'), description: i18n.t('aiChat.applyFailedHint'), variant: 'destructive' });
    } finally { setApplyingIndex(null); }
  };

  if (isLoading) return <div className="ai-empty"><Loader2 size={24} className="animate-spin" /><p>{t('aiChat.loading')}</p></div>;
  if (isError) return <div className="ai-empty"><p>{t('aiChat.loadFailed')}</p><button className="studio-secondary" onClick={() => void refetch()}>{t('aiChat.reload')}</button></div>;
  if (!activeProviders?.length) return <div className="ai-empty"><Sparkles size={32} /><strong>{t('aiChat.connectTitle')}</strong>
    <p>{t('aiChat.connectHint')}</p><Link to="/settings" className="studio-primary">{t('aiChat.configure')}<ArrowRight size={14} /></Link></div>;

  return <div className="ai-panel">
    <div className="ai-panel-header"><div><Sparkles size={16} /><strong>{t('aiChat.title')}</strong></div>
      <div className="ai-header-actions"><LanguageSelect compact /><button type="button" className="studio-icon" title={t('aiChat.newConversation')} aria-label={t('aiChat.newConversation')} disabled={isGenerating || applyingIndex !== null || isPreparingImages}
        onClick={() => { setMessages([]); setConversationId(undefined); setInput(''); setDraft(null); setReferenceImages([]); }}><RefreshCw size={15} /></button></div></div>
    <details className="ai-model-settings"><summary><Settings2 size={13} /><span>{currentProvider?.name} · {selectedModel || t('aiChat.defaultModel')}</span></summary>
      <div><label>{t('aiChat.provider')}<select className="studio-input" aria-label={t('aiChat.provider')} value={selectedProvider || ''} disabled={isGenerating || isPreparingImages}
        onChange={event => { setSelectedProvider(event.target.value); setConversationId(undefined); }}>{activeProviders.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
        <label>{t('aiChat.model')}<select className="studio-input" aria-label={t('aiChat.model')} value={selectedModel || ''} disabled={isGenerating || isPreparingImages || !availableModels.length} onChange={event => setSelectedModel(event.target.value)}>
          {availableModels.length ? availableModels.map(model => <option key={model.id} value={model.id}>{model.id} · {modelImageLabel(model)}</option>) : <option value="">{t('aiChat.defaultModel')}</option>}</select></label></div>
      <div className="ai-model-status">
        <span>{modelImageLabel(modelInfo)}</span>
        <button type="button" className="studio-secondary" disabled={modelCatalog.isFetching || isGenerating} onClick={() => void modelCatalog.refetch()}><RefreshCw size={12} />{t('aiChat.refreshModels')}</button>
        {!supportsImages && <Link to="/settings">{t('aiChat.configureImages')}</Link>}
        {modelCatalog.data?.warning && <ErrorDetails error={{ message: modelCatalog.data.warning }} />}{(modelCatalog.data?.warning || modelCatalog.isError) && <p>{modelCatalogWarning(modelCatalog.data)}</p>}
      </div>
    </details>
    <div className="ai-scope"><span className="studio-label">{t('aiChat.scope')}</span><div className="segmented">
      {([{ value: 'canvas', label: t('aiChat.optimize') }, { value: 'selection', label: t('aiChat.selection') }, { value: 'new', label: t('aiChat.newTemplate') }] as const).map(item =>
        <button type="button" key={item.value} aria-pressed={scope === item.value} disabled={isGenerating || (item.value === 'selection' && !selectedIds.length)}
          onClick={() => { setScope(item.value); setDraft(null); }}>{item.label}</button>)}
    </div><p><Lock size={11} />{scope === 'selection' ? selectedIds.length ? t('aiChat.selectedCount', { count: selectedIds.length }) : t('aiChat.selectLayersHint') : scope === 'new' ? t('aiChat.newHint') : t('aiChat.canvasHint')}</p></div>
    <div className="ai-messages" aria-live="polite" aria-busy={isGenerating}>
      {!messages.length && <div className="ai-welcome"><div className="ai-welcome-icon"><Sparkles size={25} /></div><strong>{t('aiChat.welcome')}</strong>
        <p>{t('aiChat.welcomeHint')}</p>
        <div className="ai-shortcuts">{(['aiChat.shortcutTitle', 'aiChat.shortcutPosters', 'aiChat.shortcutReadability', 'aiChat.shortcutColors'] as const).map(prompt =>
          <button type="button" key={prompt} onClick={() => { setInput(t(prompt)); inputRef.current?.focus(); }}>{t(prompt)}<ArrowRight size={12} /></button>)}</div></div>}
      {messages.map((message, index) => <div key={index} ref={index === messages.length - 1 ? latestMessageRef : undefined} className={`ai-message ${message.role}`}>
        {message.role === 'user' && !!message.referenceImages?.length && <div className="ai-sent-references">{message.referenceImages.map((image, imageIndex) =>
          <img key={image.id} src={image.dataUrl} alt={t('aiChat.sentReference', { number: imageIndex + 1 })} />)}</div>}
        {message.canvasJson ? <ResultCard message={message} applying={applyingIndex !== null || isGenerating}
          onApply={() => void apply(message, index)} onContinue={() => {
            setDraft({ json: message.canvasJson!, originSnapshot: message.applied ? JSON.stringify(snapshot()) : message.originSnapshot! });
            setScope('canvas'); setInput(t('aiChat.continuePrompt')); inputRef.current?.focus();
          }} /> : <><p>{message.feedback ? displayMessage(message.feedback) : message.content}</p>{message.feedback && 'error' in message.feedback && <ErrorDetails error={message.feedback.error} />}{message.statusDetails && <ErrorDetails error={{ message: message.statusDetails }} />}{message.error && <button type="button" className="studio-secondary" disabled={isGenerating}
            onClick={() => void handleSend(message.prompt, message.referenceImages)}><RefreshCw size={12} />{t('common.retry')}</button>}</>}
      </div>)}
    </div>
    <div className={`ai-composer${draggingImages ? ' dragging-images' : ''}`}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); if (supportsImages) setDraggingImages(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingImages(false); }}
      onDrop={event => { event.preventDefault(); setDraggingImages(false); void addReferenceImages(Array.from(event.dataTransfer.files)); }}
      onPaste={event => { const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/')); if (images.length) { event.preventDefault(); void addReferenceImages(images); } }}>
      {draft && <div className="ai-draft">{t('aiChat.draft')}<button type="button" className="studio-icon" aria-label={t('aiChat.closeDraft')} onClick={() => setDraft(null)} disabled={isGenerating}><X size={13} /></button></div>}
      <div className="ai-reference-toolbar"><button type="button" className="studio-secondary" disabled={!supportsImages || isGenerating || applyingIndex !== null || isPreparingImages || referenceImages.length >= MAX_REFERENCE_IMAGES}
        onClick={() => fileInputRef.current?.click()}>{isPreparingImages ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}{t('aiChat.addReference')}</button>
        {referenceImages.length ? <button type="button" className="ai-reference-toggle" aria-expanded={showReferenceImages}
          onClick={() => setShowReferenceImages(value => !value)}>{t('aiChat.referenceCount', { count: referenceImages.length, max: MAX_REFERENCE_IMAGES, action: showReferenceImages ? t('aiChat.collapseReferences') : t('aiChat.expandReferences') })}</button>
          : <span>{imageCapabilityHint}</span>}
        <input ref={fileInputRef} type="file" aria-label={t('aiChat.uploadReference')} accept="image/jpeg,image/png,image/webp" multiple hidden
          onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void addReferenceImages(files); }} /></div>
      {!!referenceImages.length && !supportsImages && <p className="ai-reference-hint">{t('aiChat.switchOrRemove')}</p>}
      {showReferenceImages && !!referenceImages.length && <div className="ai-reference-list">{referenceImages.map((image, imageIndex) => <div key={image.id} className="ai-reference-item">
        <img src={image.dataUrl} alt={t('aiChat.referenceAlt', { number: imageIndex + 1, name: image.name })} /><span title={image.name}>{t('aiChat.referenceNumber', { number: imageIndex + 1 })}</span>
        <button type="button" className="studio-icon" aria-label={t('aiChat.removeReference', { number: imageIndex + 1 })} disabled={isGenerating || applyingIndex !== null || isPreparingImages}
          onClick={() => setReferenceImages(previous => previous.filter(item => item.id !== image.id))}><X size={12} /></button></div>)}</div>}
      {showReferenceImages && !!referenceImages.length && <p className="ai-reference-hint">{t('aiChat.referencesHint')}</p>}
      <textarea ref={inputRef} aria-label={t('aiChat.request')} placeholder={scope === 'selection' ? t('aiChat.selectionPlaceholder') : t('aiChat.canvasPlaceholder')}
        value={input} onChange={event => setInput(event.target.value)} rows={referenceImages.length ? 2 : 3} disabled={isGenerating || applyingIndex !== null || isPreparingImages}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void handleSend(); } }} />
      <div className="ai-composer-footer"><span>{t('aiChat.keyboardHint')}</span>{isGenerating
        ? <button type="button" className="studio-secondary" onClick={() => requestRef.current?.abort()}><Square size={12} />{t('aiChat.stop')}</button>
        : <button type="button" className="studio-primary" disabled={(!!referenceImages.length && !supportsImages) || (!input.trim() && !referenceImages.length) || isPreparingImages || !currentProvider || !canvas || applyingIndex !== null || (scope === 'selection' && !selectedIds.length)} onClick={() => void handleSend()}><Send size={13} />{referenceImages.length ? t('aiChat.generateReferences') : t('aiChat.generate')}</button>}</div>
    </div>
  </div>;
}
