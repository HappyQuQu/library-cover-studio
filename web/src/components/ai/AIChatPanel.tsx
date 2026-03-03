import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { useAIProviders } from '../../api/ai';
import type { Message } from '../../api/ai';
import { useCanvasStore } from '../../stores/canvasStore';
import { useAuthStore } from '../../stores/authStore';
import { apiClient } from '../../api/client';

interface StreamChunk {
  type: 'chunk' | 'complete' | 'error' | 'conversation_id';
  content?: string;
  canvasJson?: any;
  error?: string;
  id?: string;
}

/** 精简 canvas JSON，去掉 base64 大数据，只保留 AI 需要的结构信息 */
function summarizeCanvas(canvasJson: any): any {
  if (!canvasJson) return null;
  return {
    version: canvasJson.version,
    width: canvasJson.width,
    height: canvasJson.height,
    background: canvasJson.background,
    backgroundImage: canvasJson.backgroundImage ? {
      type: canvasJson.backgroundImage.type,
      width: canvasJson.backgroundImage.width,
      height: canvasJson.backgroundImage.height,
      src: canvasJson.backgroundImage.src?.startsWith('data:')
        ? `[SVG/base64 pattern, ${Math.round((canvasJson.backgroundImage.src?.length || 0) / 1024)}KB]`
        : canvasJson.backgroundImage.src
    } : undefined,
    objects: (canvasJson.objects || []).map((obj: any) => ({
      id: obj.id,
      type: obj.type,
      left: Math.round(obj.left),
      top: Math.round(obj.top),
      width: obj.width,
      height: obj.height,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      angle: obj.angle,
      fill: typeof obj.fill === 'string' ? obj.fill : '[pattern/gradient]',
      opacity: obj.opacity,
      ...(obj.type === 'IText' || obj.type === 'i-text' ? {
        text: obj.text,
        fontSize: obj.fontSize,
        fontFamily: obj.fontFamily,
        fontWeight: obj.fontWeight,
        textAlign: obj.textAlign,
      } : {}),
      ...(obj.type === 'Image' ? {
        src: obj.src?.startsWith('data:') ? '[base64 image]' : obj.src,
        posterVar: obj.posterVar,
        clipPath: obj.clipPath ? { rx: obj.clipPath.rx, ry: obj.clipPath.ry } : undefined,
      } : {}),
      ...(obj.type === 'Rect' ? { rx: obj.rx, ry: obj.ry } : {}),
    }))
  };
}

export function AIChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>();
  const [selectedModel, setSelectedModel] = useState<string>();
  const [conversationId, setConversationId] = useState<string>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: providers } = useAIProviders();
  const canvas = useCanvasStore(state => state.canvas);
  const saveToHistory = useCanvasStore(state => state.saveToHistory);
  const token = useAuthStore(state => state.token);

  useEffect(() => {
    if (providers && !selectedProvider) {
      const defaultProvider = providers.find(p => p.isDefault);
      if (defaultProvider) {
        setSelectedProvider(defaultProvider.id);
      } else if (providers.length > 0) {
        setSelectedProvider(providers[0].id);
      }
    }
  }, [providers, selectedProvider]);

  // 当 provider 变更时，更新可用的 models 和选中 model
  const currentProvider = providers?.find(p => p.id === selectedProvider);
  const availableModels = (currentProvider?.model || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  useEffect(() => {
    if (availableModels.length > 0) {
      if (!selectedModel || !availableModels.includes(selectedModel)) {
        setSelectedModel(availableModels[0]);
      }
    } else {
      setSelectedModel(undefined);
    }
  }, [selectedProvider, availableModels.join(',')]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isGenerating || !selectedProvider) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);

    try {
      // 始终传入当前画布（精简版），画布为空时传 null
      let currentCanvas: any = null;
      let editMode = false;
      try {
        const rawJson = canvas?.toJSON();
        if (rawJson && (rawJson.objects?.length > 0 || rawJson.backgroundImage)) {
          currentCanvas = summarizeCanvas(rawJson);
          editMode = true;
        }
      } catch { /* 忽略 */ }

      const canvasSize = canvas
        ? { width: canvas.width || 1920, height: canvas.height || 1080 }
        : { width: 1920, height: 1080 };

      if (!token) throw new Error('未登录，请先登录');

      const response = await fetch(`${apiClient.defaults.baseURL}/ai-chat/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: userMessage.content,
          conversationId,
          providerId: selectedProvider,
          model: selectedModel,
          currentCanvas,
          canvasSize,
          editMode
        })
      });

      if (!response.ok) throw new Error('Failed to generate template');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let assistantMessage = '';
      let assistantMessageIndex = messages.length + 1;

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

        for (const line of lines) {
          try {
            const data: StreamChunk = JSON.parse(line.substring(5).trim());
            if (data.type === 'chunk') {
              assistantMessage += data.content || '';
              setMessages(prev => {
                const newMessages = [...prev];
                newMessages[assistantMessageIndex] = { role: 'assistant', content: assistantMessage };
                return newMessages;
              });
            } else if (data.type === 'complete') {
              if (data.canvasJson && canvas) {
                saveToHistory();
                await canvas.loadFromJSON(data.canvasJson);
                canvas.renderAll();
              }
            } else if (data.type === 'error') {
              setMessages(prev => [...prev, { role: 'assistant', content: `错误: ${data.error}` }]);
            } else if (data.type === 'conversation_id') {
              setConversationId(data.id);
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `错误: ${error.message}` }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setConversationId(undefined);
    setInput('');
  };

  if (!providers || providers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <Sparkles className="w-12 h-12 mb-4 text-gray-400" />
        <p className="text-sm text-gray-600 mb-2">未配置 AI 服务</p>
        <p className="text-xs text-gray-500">请前往设置页面配置 AI 服务提供商</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部：Provider 选择 + 新建会话 */}
      <div className="p-2 border-b border-gray-200 flex gap-2">
        <select
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
          className="w-1/2 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 truncate"
          disabled={isGenerating}
        >
          {providers.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} {p.isDefault && '(默认)'}
            </option>
          ))}
        </select>

        {availableModels.length > 0 ? (
          <select
            value={selectedModel || ''}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 truncate"
            disabled={isGenerating || availableModels.length <= 1}
            title={availableModels.length <= 1 ? "该服务仅配置了此模型" : "切换模型"}
          >
            {availableModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <div className="flex-1 px-2 py-1.5 text-xs border border-gray-200 bg-gray-50 text-gray-400 rounded-md flex items-center truncate">
            默认模型
          </div>
        )}

        {messages.length > 0 && (
          <button
            onClick={handleNewConversation}
            title="新建会话"
            className="px-2 py-1.5 shrink-0 text-xs border border-gray-300 rounded-md hover:bg-gray-50 text-gray-600"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles className="w-10 h-10 mb-3 text-blue-500" />
            <p className="text-xs text-gray-600 mb-1 font-medium">AI 模板生成助手</p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              描述你想要的设计，画布有内容时 AI 会在现有基础上修改
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] px-3 py-2 rounded-lg text-xs leading-relaxed ${msg.role === 'user'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-900'
              }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="p-2 border-t border-gray-200">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想要的设计，或如何修改当前模版..."
            className="flex-1 px-2.5 py-2 text-xs border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            disabled={isGenerating}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isGenerating || !selectedProvider}
            className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
