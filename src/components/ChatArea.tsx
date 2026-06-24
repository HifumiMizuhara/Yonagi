import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useTranslation } from '../hooks/useTranslation';
import { db, type Attachment, type Citation, type TokenUsage, type ModelPrice } from '../services/db';
import { extractTextFromPdf, readFileAsText, readFileAsBase64 } from '../utils/fileParser';
import { estimateTokens, computeCost, formatCost, DEFAULT_MODEL_PRICING } from '../utils/tokens';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Paperclip, Send, Square, Copy, RotateCcw, FileText, X, ChevronDown, Check, User, Search, Code, Pencil, AlignLeft, Compass,
  ChevronLeft, ChevronRight, Columns, Scale, GitFork, Globe
} from 'lucide-react';

export const ChatArea: React.FC = () => {
  const store = useChatStore();
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showEffortDropdown, setShowEffortDropdown] = useState(false);
  const [showPromptDropdown, setShowPromptDropdown] = useState(false);
  
  // States for variant comparison and action dropdowns
  const [compareStates, setCompareStates] = useState<Record<string, boolean>>({});
  const [compareDropdownOpen, setCompareDropdownOpen] = useState<string | null>(null);
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});
  
  // Model search state
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [compareSearchQuery, setCompareSearchQuery] = useState('');

  // Fix #13: inline custom effort input (replaces browser prompt())
  const [customEffortVisible, setCustomEffortVisible] = useState(false);
  const [customEffortValue, setCustomEffortValue] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const effortDropdownRef = useRef<HTMLDivElement>(null);
  const promptDropdownRef = useRef<HTMLDivElement>(null);
  const dropdownCompareRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [store.messages]);

  // Handle outside click for model and effort dropdowns
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
      if (effortDropdownRef.current && !effortDropdownRef.current.contains(e.target as Node)) {
        setShowEffortDropdown(false);
      }
      if (promptDropdownRef.current && !promptDropdownRef.current.contains(e.target as Node)) {
        setShowPromptDropdown(false);
      }
      if (dropdownCompareRef.current && !dropdownCompareRef.current.contains(e.target as Node)) {
        setCompareDropdownOpen(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Textarea auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputText]);

  // List all available models dynamically from all enabled providers
  const getAvailableModels = () => {
    const models: Array<{ id: string; name: string; group: string }> = [];
    
    Object.values(store.providers).forEach((prov) => {
      if (prov.enabled) {
        prov.models.forEach((mId) => {
          models.push({
            id: mId,
            name: mId,
            group: prov.name,
          });
        });
      }
    });

    return models;
  };

  const allModels = getAvailableModels();
  
  // Get filtered models based on search query
  const getFilteredModels = () => {
    if (!modelSearchQuery.trim()) return allModels;
    return allModels.filter(m => m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()));
  };

  const filteredModels = getFilteredModels();

  const activeModel = allModels.find(m => m.id === store.activeModelId) || {
    id: store.activeModelId,
    name: store.activeModelId,
    group: 'Unknown',
  };

  // Merge default prices with user overrides (user wins)
  const pricing: Record<string, ModelPrice> = { ...DEFAULT_MODEL_PRICING, ...store.modelPricing };

  // Pre-send token estimate (input text + attachment text content)
  const estimatedInputTokens = (() => {
    let text = inputText;
    for (const a of attachments) {
      if (a.type !== 'image') text += '\n' + a.content;
    }
    return estimateTokens(text);
  })();

  // Whether the active model supports a built-in web search tool.
  // The request *format* is decided per-provider in api.ts (it follows the
  // endpoint you hit — e.g. Claude via OpenRouter still uses OpenAI-style),
  // but whether to even offer the toggle is best judged by model name too,
  // so custom/OpenRouter proxies (named anything) still surface it.
  const supportsWebSearch = (() => {
    const hay = `${activeModel.group} ${activeModel.id}`.toLowerCase();
    return (
      hay.includes('gemini') || hay.includes('google') ||
      hay.includes('claude') || hay.includes('anthropic') ||
      hay.includes('sonnet') || hay.includes('opus') || hay.includes('haiku') ||
      hay.includes('openai') || hay.includes('chatgpt') || hay.includes('gpt-') ||
      hay.includes('openrouter') || hay.includes('perplexity') || hay.includes('sonar') ||
      hay.includes('grok')
    );
  })();

  const getEffortOptions = () => {
    const grp = activeModel.group.toLowerCase();
    let baseOptions = [];
    if (grp.includes('gemini') || grp.includes('google')) {
      baseOptions = [
        { value: 'minimal', label: 'Minimal' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'none', label: t.effortNone }
      ];
    } else if (grp.includes('claude') || grp.includes('anthropic')) {
      baseOptions = [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'xhigh', label: 'xHigh' },
        { value: 'max', label: 'Max' },
        { value: 'none', label: t.effortNone }
      ];
    } else {
      baseOptions = [
        { value: 'minimal', label: 'Minimal' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'xhigh', label: 'xHigh' },
        { value: 'none', label: t.effortNone }
      ];
    }
    return [...baseOptions, { value: 'custom_input', label: t.effortCustom }];
  };

  const handleModelSelect = async (modelId: string) => {
    await store.setActiveModelId(modelId);  // Fix #8: await the async setter
    
    if (store.activeChatId) {
      await db.chats.update(store.activeChatId, { modelId });
      await store.loadChats();
    }

    setShowModelDropdown(false);
    setModelSearchQuery('');
  };

  // Apply a prompt preset to the current chat's system prompt (per-chat),
  // creating a chat first if none is active.
  const applyPromptPreset = async (content: string) => {
    let chatId = store.activeChatId;
    if (!chatId) {
      chatId = await store.createChat();
    }
    await db.chats.update(chatId, { systemPrompt: content });
    await store.loadChats();
    setShowPromptDropdown(false);
  };

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploading(true);
    const newAttachments: Attachment[] = [];

    for (const file of fileArray) {
      try {
        if (file.type.startsWith('image/')) {
          const base64 = await readFileAsBase64(file);
          newAttachments.push({
            name: file.name,
            type: 'image',
            content: base64,
            size: file.size,
          });
        } else if (file.name.endsWith('.pdf')) {
          const text = await extractTextFromPdf(file);
          newAttachments.push({
            name: file.name,
            type: 'pdf',
            content: text,
            size: file.size,
          });
        } else {
          const text = await readFileAsText(file);
          newAttachments.push({
            name: file.name,
            type: 'text',
            content: text,
            size: file.size,
          });
        }
      } catch (err: any) {
        alert(err.message || t.fileLoadError);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setIsUploading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(new File([file], `pasted-image-${Date.now()}.png`, { type: file.type }));
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      await processFiles(imageFiles);
    }
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) await processFiles(files);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!inputText.trim() && attachments.length === 0) return;
    if (store.isGenerating) return;

    const content = inputText;
    const currentAttachments = [...attachments];

    setInputText('');
    setAttachments([]);

    await store.sendMessage(content, currentAttachments);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (text: string) => {
    setInputText(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const getProviderColor = (group: string) => {
    const grp = group.toLowerCase();
    if (grp.includes('gemini') || grp.includes('google')) return 'bg-blue-500 shadow-blue-500/50';
    if (grp.includes('openai') || grp.includes('chatgpt')) return 'bg-emerald-500 shadow-emerald-500/50';
    if (grp.includes('claude') || grp.includes('anthropic')) return 'bg-amber-600 shadow-amber-600/50';
    if (grp.includes('deepseek')) return 'bg-cyan-500 shadow-cyan-500/50';
    if (grp.includes('ollama')) return 'bg-purple-500 shadow-purple-500/50';
    return 'bg-amber-500 shadow-amber-500/50';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-bg-light dark:bg-bg-dark text-gray-800 dark:text-gray-100 relative overflow-hidden">
      
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-border-light/80 dark:border-border-dark px-6 py-3 h-[57px] select-none shrink-0 pl-20 md:pl-6 bg-bg-light/80 dark:bg-bg-dark/80 backdrop-blur-md z-30">
        
        <div className="flex items-center space-x-3">
          {/* Model Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => {
                setShowModelDropdown(!showModelDropdown);
                setModelSearchQuery('');
              }}
              className="flex items-center space-x-2 px-3.5 py-2 hover:bg-card-light dark:hover:bg-card-dark text-gray-800 dark:text-gray-200 border border-border-light/60 dark:border-border-dark/40 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-[0.98] cursor-pointer"
            >
              <span className={`w-2 h-2 rounded-full shadow-sm animate-pulse ${getProviderColor(activeModel.group)}`} />
              <span className="font-heading">{activeModel.name}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {showModelDropdown && (
              <div className="absolute left-0 mt-2 w-76 bg-card-light/95 dark:bg-card-dark/95 backdrop-blur-xl border border-border-light dark:border-border-dark rounded-2xl shadow-2xl z-50 p-2 max-h-[350px] overflow-y-auto animate-scale-up">
                
                {/* Search bar inside model selector dropdown */}
                <div className="p-1.5 border-b border-border-light/50 dark:border-border-dark/50 relative mb-1 shrink-0">
                  <input
                    type="text"
                    placeholder={t.searchModels}
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-bg-light dark:bg-bg-dark/80 text-xs border border-border-light dark:border-border-dark rounded-xl focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                    autoFocus
                  />
                  <Search className="absolute left-4 top-[15px] w-3.5 h-3.5 text-gray-400" />
                </div>

                {/* Group models by active providers */}
                {Object.values(store.providers).map((prov) => {
                  if (!prov.enabled) return null;
                  
                  // Filter group models by query
                  const groupModels = filteredModels.filter((m) => m.group === prov.name);
                  if (groupModels.length === 0) return null;
                  
                  return (
                    <div key={prov.id} className="py-1">
                      <div className="px-3 py-1.5 text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest bg-card-light/20 dark:bg-sidebar-dark/20 rounded-md">
                        {prov.name}
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {groupModels.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => handleModelSelect(model.id)}
                            className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs hover:bg-amber-500/5 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 flex items-center justify-between transition-colors cursor-pointer ${
                              store.activeModelId === model.id ? 'text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/5 dark:bg-amber-500/10' : 'text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            <span className="truncate pr-4 font-medium">{model.name}</span>
                            {store.activeModelId === model.id && <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Effort Selector */}
          <div className="relative" ref={effortDropdownRef}>
            <button
              onClick={() => {
                setShowEffortDropdown(!showEffortDropdown);
                setCustomEffortVisible(false);
                setCustomEffortValue('');
              }}
              className="flex items-center space-x-2 px-3.5 py-2 hover:bg-card-light dark:hover:bg-card-dark text-gray-800 dark:text-gray-200 border border-border-light/60 dark:border-border-dark/40 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-[0.98] cursor-pointer"
            >
              <span className="font-heading">
                {t.effortLabel}: {getEffortOptions().find(o => o.value === store.activeEffort)?.label || store.activeEffort}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            
            {showEffortDropdown && (
              <div className="absolute left-0 mt-2 w-52 bg-card-light/95 dark:bg-card-dark/95 backdrop-blur-xl border border-border-light dark:border-border-dark rounded-2xl shadow-2xl z-50 p-1.5 animate-scale-up max-h-[320px] overflow-y-auto">
                {getEffortOptions().map((opt) =>
                  opt.value === 'custom_input' ? (
                    customEffortVisible ? (
                      /* Fix #13: inline input instead of browser prompt() */
                      <form
                        key="custom_form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          store.setActiveEffort(customEffortValue.trim() || 'none');
                          setCustomEffortVisible(false);
                          setCustomEffortValue('');
                          setShowEffortDropdown(false);
                        }}
                        className="p-1.5 flex space-x-1"
                      >
                        <input
                          type="text"
                          value={customEffortValue}
                          onChange={(e) => setCustomEffortValue(e.target.value)}
                          placeholder="例: low, 1024…"
                          className="flex-1 px-2 py-1 text-xs bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-amber-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                        >
                          OK
                        </button>
                      </form>
                    ) : (
                      <button
                        key={opt.value}
                        onClick={() => setCustomEffortVisible(true)}
                        className="w-full text-left px-3.5 py-2 rounded-lg text-xs hover:bg-amber-500/5 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 flex items-center justify-between transition-colors cursor-pointer text-gray-700 dark:text-gray-300"
                      >
                        <span>{opt.label}</span>
                      </button>
                    )
                  ) : (
                    <button
                      key={opt.value}
                      onClick={() => {
                        store.setActiveEffort(opt.value);
                        setShowEffortDropdown(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 rounded-lg text-xs hover:bg-amber-500/5 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 flex items-center justify-between transition-colors cursor-pointer ${
                        store.activeEffort === opt.value ? 'text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/5 dark:bg-amber-500/10' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {store.activeEffort === opt.value && <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Web Search Toggle */}
          {supportsWebSearch && (
            <button
              onClick={() => store.setActiveWebSearch(!store.activeWebSearch)}
              title={t.webSearchTooltip}
              className={`flex items-center space-x-2 px-3.5 py-2 border rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-[0.98] cursor-pointer ${
                store.activeWebSearch
                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-600 dark:text-amber-400'
                  : 'hover:bg-card-light dark:hover:bg-card-dark text-gray-800 dark:text-gray-200 border-border-light/60 dark:border-border-dark/40'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span className="font-heading">{t.webSearchLabel}</span>
            </button>
          )}

          {/* Prompt preset picker */}
          {store.promptPresets.length > 0 && (
            <div className="relative" ref={promptDropdownRef}>
              <button
                onClick={() => setShowPromptDropdown(!showPromptDropdown)}
                title={t.promptPresets}
                className="flex items-center space-x-2 px-3.5 py-2 hover:bg-card-light dark:hover:bg-card-dark text-gray-800 dark:text-gray-200 border border-border-light/60 dark:border-border-dark/40 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-[0.98] cursor-pointer"
              >
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="font-heading hidden sm:inline">{t.prompts}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {showPromptDropdown && (
                <div className="absolute left-0 mt-2 w-64 bg-card-light/95 dark:bg-card-dark/95 backdrop-blur-xl border border-border-light dark:border-border-dark rounded-2xl shadow-2xl z-50 p-1.5 max-h-[320px] overflow-y-auto animate-scale-up">
                  {store.promptPresets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPromptPreset(p.content)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-colors cursor-pointer"
                      title={p.content}
                    >
                      <span className="block text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{p.name}</span>
                      <span className="block text-[10px] text-gray-400 dark:text-gray-500 truncate">{p.content}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action icons / details */}
        <div className="text-[11px] text-gray-400 dark:text-gray-500 font-mono tracking-wider bg-card-light/45 dark:bg-card-dark/45 border border-border-light/40 dark:border-border-dark/40 px-2.5 py-1 rounded-full hidden sm:flex items-center space-x-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${store.isGenerating ? 'bg-amber-500 animate-ping' : 'bg-gray-300 dark:bg-gray-600'}`} />
          <span>{store.isGenerating ? t.generating : t.idle}</span>
        </div>

      </div>

      {/* Main Message History Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
        
        {store.messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center min-h-[85%] max-w-xl mx-auto text-center space-y-8 animate-fade-in py-10">
            {/* Elegant Sunflower Sparkle Icon */}
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-yellow-400/20 flex items-center justify-center text-amber-600 dark:text-amber-500 shadow-inner border border-amber-500/20 animate-pulse-slow">
              <svg viewBox="0 0 24 24" className="w-10 h-10 fill-current animate-spin" style={{ animationDuration: '30s' }} xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75ZM5.106 5.106a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06Zm11.668 11.668a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06ZM2.25 12a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75Zm15.5 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75ZM5.106 18.894a.75.75 0 0 1 0-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a.75.75 0 0 1-1.06 0Zm11.668-11.668a.75.75 0 0 1 0-1.06l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.06 1.06a.75.75 0 0 1-1.06 0Z" />
              </svg>
              <div className="absolute w-4 h-4 rounded-full bg-amber-600 border-2 border-yellow-300 shadow-sm" />
            </div>
            
            <div className="space-y-3">
              <h2 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-gray-800 to-amber-600 dark:from-white dark:via-gray-150 dark:to-amber-400 font-heading">
                {t.howCanIHelp}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                {t.howCanIHelpSub}
              </p>
            </div>

            {/* Suggestions Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full pt-4">
              {[
                { title: t.sugCodeTitle, prompt: t.sugCodePrompt, icon: <Code className="w-4.5 h-4.5 text-amber-600 dark:text-amber-500" /> },
                { title: t.sugMailTitle, prompt: t.sugMailPrompt, icon: <Pencil className="w-4.5 h-4.5 text-amber-600 dark:text-amber-500" /> },
                { title: t.sugSumTitle, prompt: t.sugSumPrompt, icon: <AlignLeft className="w-4.5 h-4.5 text-amber-600 dark:text-amber-500" /> },
                { title: t.sugWebgpuTitle, prompt: t.sugWebgpuPrompt, icon: <Compass className="w-4.5 h-4.5 text-amber-600 dark:text-amber-500" /> },
              ].map((card, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(card.prompt)}
                  className="p-4.5 text-left border border-border-light dark:border-border-dark bg-card-light/40 dark:bg-card-dark/20 hover:bg-card-light dark:hover:bg-card-dark/60 rounded-2xl transition-all duration-300 cursor-pointer group hover:scale-[1.015] hover:shadow-md hover:shadow-black/5 dark:hover:shadow-black/20 flex space-x-3 items-start"
                >
                  <div className="p-2 bg-amber-500/10 dark:bg-amber-500/15 rounded-xl shrink-0 group-hover:bg-amber-500/20 transition-colors">
                    {card.icon}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-gray-200 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                      {card.title}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                      {card.prompt}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Conversation Flow */
          <div className="max-w-3xl mx-auto space-y-8 pb-10">
            {store.messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const hasVariants = !isUser && msg.variants && msg.variants.length > 1;
              const activeIndex = msg.activeVariantIndex ?? 0;
              const totalVariants = msg.variants ? msg.variants.length : 1;
              const isCompareMode = !isUser && (compareStates[msg.id] || false);

              return (
                <div key={msg.id} className={`flex space-x-4 ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up group`}>
                  
                  {/* Left Avatar (Assistant only) */}
                  {!isUser && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-yellow-500 flex items-center justify-center text-white font-bold text-xs shrink-0 select-none shadow-md shadow-amber-500/10 border border-amber-400/20">
                      AI
                    </div>
                  )}

                  {/* Message Bubble wrapper */}
                  <div className={`flex flex-col space-y-1.5 ${isUser ? 'max-w-[85%] items-end' : 'flex-1 max-w-[90%] items-start'}`}>
                    
                    {/* Role header / model tag / Variant switcher */}
                    <div className="flex items-center space-x-3 text-[10px] text-gray-400/80 font-bold px-1 select-none w-full justify-between">
                      <div className="flex items-center space-x-2">
                        <span>{isUser ? t.user : (msg.modelUsed || 'Assistant')}</span>
                        
                        {/* Variant Switcher */}
                        {hasVariants && (
                          <div className="flex items-center space-x-1 bg-card-light dark:bg-card-dark border border-border-light/50 dark:border-border-dark/50 rounded-lg px-1.5 py-0.5 ml-2 font-mono text-[9px] shadow-sm">
                            <button
                              disabled={activeIndex === 0}
                              onClick={() => store.switchMessageVariant(msg.id, activeIndex - 1)}
                              className={`p-0.5 rounded hover:bg-bg-light dark:hover:bg-bg-dark transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                            <span>{activeIndex + 1} / {totalVariants}</span>
                            <button
                              disabled={activeIndex === totalVariants - 1}
                              onClick={() => store.switchMessageVariant(msg.id, activeIndex + 1)}
                              className={`p-0.5 rounded hover:bg-bg-light dark:hover:bg-bg-dark transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Side-by-Side Compare Toggle */}
                      {!isUser && msg.variants && msg.variants.length > 1 && (
                        <button
                          onClick={() => setCompareStates({ ...compareStates, [msg.id]: !isCompareMode })}
                          className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg border transition-all cursor-pointer text-[9px] ${
                            isCompareMode
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                              : 'bg-card-light dark:bg-card-dark border-border-light/50 dark:border-border-dark/50 text-gray-450 hover:text-amber-600'
                          }`}
                        >
                          <Columns className="w-3 h-3" />
                          <span>{isCompareMode ? t.normalView : t.compareView}</span>
                        </button>
                      )}
                    </div>

                    {/* Content Box (or Compare grid) */}
                    {isCompareMode && msg.variants ? (
                      /* Side-by-Side Compare Grid */
                      <div className="w-full mt-1.5">
                        {/* Back / exit compare mode button */}
                        <div className="flex justify-end mb-2">
                          <button
                            onClick={() => setCompareStates({ ...compareStates, [msg.id]: false })}
                            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-border-light/50 dark:border-border-dark/50 bg-card-light dark:bg-card-dark text-[10px] font-bold text-gray-450 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
                          >
                            <ChevronLeft className="w-3 h-3" />
                            <span>{t.normalView}</span>
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {msg.variants.map((v, vIdx) => (
                          <div
                            key={v.id}
                            className={`p-4 rounded-2xl border bg-card-light/40 dark:bg-card-dark/20 text-gray-800 dark:text-gray-200 transition-all ${
                              activeIndex === vIdx 
                                ? 'border-amber-500/40 shadow-sm shadow-amber-500/5 bg-amber-500/[0.01]' 
                                : 'border-border-light dark:border-border-dark hover:border-gray-300 dark:hover:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[9px] text-gray-400 font-bold mb-2 pb-1.5 border-b border-border-light/40 dark:border-border-dark/40 select-none">
                              <span className="truncate pr-4">{v.modelUsed || 'Model'}</span>
                              <div className="flex items-center space-x-2 shrink-0">
                                <span>#{vIdx + 1}</span>
                                {activeIndex !== vIdx && (
                                  <button
                                    onClick={() => store.switchMessageVariant(msg.id, vIdx)}
                                    className="px-1.5 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded cursor-pointer transition-colors text-[8px]"
                                  >
                                    {t.setActive}
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            <div className="prose dark:prose-invert max-w-none text-[13.5px] leading-relaxed break-words">
                              {/* Thinking Accordion for Compare View */}
                              {v.thinking && (
                                <div className="w-full mb-3 text-xs select-none">
                                  <div
                                    onClick={() => setThinkingOpen({ ...thinkingOpen, [`${msg.id}-${vIdx}`]: !(thinkingOpen[`${msg.id}-${vIdx}`] !== undefined ? thinkingOpen[`${msg.id}-${vIdx}`] : true) })}
                                    className="flex items-center space-x-2 text-gray-400 hover:text-amber-600 dark:text-gray-500 dark:hover:text-amber-400 cursor-pointer font-bold py-1 border-b border-border-light/30 dark:border-border-dark/30 font-sans"
                                  >
                                    <span className={`transition-transform duration-200 text-[8px] ${(thinkingOpen[`${msg.id}-${vIdx}`] !== undefined ? thinkingOpen[`${msg.id}-${vIdx}`] : true) ? 'rotate-90' : ''}`}>▶</span>
                                    <span>{t.thinkingProcess}</span>
                                  </div>
                                  {(thinkingOpen[`${msg.id}-${vIdx}`] !== undefined ? thinkingOpen[`${msg.id}-${vIdx}`] : true) && (
                                    <div className="mt-2 p-2.5 bg-zinc-50/50 dark:bg-zinc-900/40 text-gray-500 dark:text-gray-400 border border-border-light/40 dark:border-border-dark/40 rounded-xl max-h-40 overflow-y-auto leading-relaxed text-[11px] select-text prose dark:prose-invert prose-sm max-w-none">
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{v.thinking}</ReactMarkdown>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code({ node, className, children, ...props }) {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const lang = match ? match[1] : '';
                                    const codeVal = String(children).replace(/\n$/, '');
                                    const isInline = !match;

                                    return !isInline ? (
                                      <CodeBlock lang={lang} code={codeVal} copyLabel={t.copy} copiedLabel={t.copied} />
                                    ) : (
                                      <code className="bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark px-1.5 py-0.5 rounded-md text-xs text-amber-700 dark:text-amber-400 font-mono break-all font-semibold" {...props}>
                                        {children}
                                      </code>
                                    );
                                  }
                                }}
                              >
                                {v.content || '...'}
                              </ReactMarkdown>
                              {v.citations && v.citations.length > 0 && (
                                <Sources citations={v.citations} label={t.sourcesLabel} />
                              )}
                            </div>
                          </div>
                        ))}
                        </div>
                      </div>
                    ) : (
                      /* Standard Content Box */
                      <div className={`px-4.5 py-3 rounded-2xl text-[14.5px] leading-relaxed break-words border w-full ${
                        isUser
                          ? 'bg-card-light/95 dark:bg-card-dark border-border-light dark:border-border-dark text-gray-800 dark:text-gray-200 rounded-tr-none shadow-sm shadow-black/3'
                          : 'bg-transparent border-transparent text-gray-850 dark:text-gray-100 rounded-tl-none prose dark:prose-invert max-w-none pl-0'
                      }`}>
                        
                        {/* Attached files previews in message */}
                        {isUser && msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-col space-y-2 mb-2">
                            {msg.attachments.map((att, attIdx) => (
                              <div key={attIdx} className="flex items-center space-x-2.5 bg-bg-light/80 dark:bg-bg-dark/80 px-3 py-2 rounded-xl border border-border-light dark:border-border-dark max-w-sm shadow-sm">
                                {att.type === 'image' ? (
                                  <img src={att.content} alt={att.name} className="w-9 h-9 rounded-lg object-cover" />
                                ) : (
                                  <FileText className="w-4.5 h-4.5 text-amber-600 dark:text-amber-500 shrink-0" />
                                )}
                                <div className="text-left min-w-0">
                                  <p className="text-[11px] font-semibold truncate max-w-[200px] text-gray-800 dark:text-gray-200">{att.name}</p>
                                  <p className="text-[9px] text-gray-400">{(att.size / 1024).toFixed(1)} KB</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Thinking Accordion (Assistant only) */}
                        {!isUser && msg.thinking && (
                          <div className="w-full mb-4 select-none">
                            <div
                              onClick={() => setThinkingOpen({ ...thinkingOpen, [msg.id]: !(thinkingOpen[msg.id] !== undefined ? thinkingOpen[msg.id] : true) })}
                              className="flex items-center space-x-2 text-gray-400 hover:text-amber-600 dark:text-gray-500 dark:hover:text-amber-400 cursor-pointer font-bold py-1 border-b border-border-light/30 dark:border-border-dark/30 font-sans"
                            >
                              <span className={`transition-transform duration-200 text-[8px] ${(thinkingOpen[msg.id] !== undefined ? thinkingOpen[msg.id] : true) ? 'rotate-90' : ''}`}>▶</span>
                              <span>{t.thinkingProcess}</span>
                              {store.isGenerating && index === store.messages.length - 1 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse ml-1" />
                              )}
                            </div>
                            {(thinkingOpen[msg.id] !== undefined ? thinkingOpen[msg.id] : true) && (
                              <div className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-900/40 text-gray-500 dark:text-gray-400 border border-border-light/40 dark:border-border-dark/40 rounded-xl max-h-60 overflow-y-auto leading-relaxed text-[11.5px] select-text prose dark:prose-invert prose-sm max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.thinking}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Message Content rendering */}
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || '');
                                const lang = match ? match[1] : '';
                                const codeVal = String(children).replace(/\n$/, '');
                                const isInline = !match;

                                return !isInline ? (
                                  <CodeBlock lang={lang} code={codeVal} copyLabel={t.copy} copiedLabel={t.copied} />
                                ) : (
                                  <code className="bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark px-1.5 py-0.5 rounded-md text-xs text-amber-700 dark:text-amber-400 font-mono break-all font-semibold" {...props}>
                                    {children}
                                  </code>
                                );
                              }
                            }}
                          >
                            {msg.content || '...'}
                          </ReactMarkdown>
                        )}

                        {!isUser && msg.citations && msg.citations.length > 0 && (
                          <Sources citations={msg.citations} label={t.sourcesLabel} />
                        )}
                      </div>
                    )}

                    {/* Token usage / cost badge (Assistant only) */}
                    {!isUser && msg.usage && (msg.usage.inputTokens > 0 || msg.usage.outputTokens > 0) && (
                      <UsageBadge usage={msg.usage} modelId={msg.modelUsed || activeModel.id} pricing={pricing} t={t} />
                    )}

                    {/* Bottom Action strip (Assistant only, non-empty) */}
                    {!isUser && msg.content && (
                      <div className="flex items-center space-x-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-1 relative">
                        <ActionButton
                          icon={<Copy className="w-3 h-3" />}
                          label={t.copy}
                          copiedLabel={t.copied}
                          onClick={() => navigator.clipboard.writeText(msg.content)}
                        />
                        <ActionButton
                          icon={<RotateCcw className="w-3 h-3" />}
                          label={t.regenerate}
                          copiedLabel={t.copied}
                          onClick={() => store.regenerateResponse(index)}
                        />
                        
                        {/* Compare with another model button */}
                        <div className="relative">
                          <button
                            onClick={() => {
                              setCompareSearchQuery('');
                              setCompareDropdownOpen(compareDropdownOpen === msg.id ? null : msg.id);
                            }}
                            className="flex items-center space-x-1.5 px-2.5 py-1.5 text-[10px] font-bold text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-card-light dark:hover:bg-card-dark rounded-lg transition-colors cursor-pointer font-sans"
                            title={t.compare}
                          >
                            <Scale className="w-3 h-3" />
                            <span>{t.compare}</span>
                          </button>

                          {compareDropdownOpen === msg.id && (
                            <div
                              ref={dropdownCompareRef}
                              className="absolute left-0 bottom-full mb-1.5 w-60 bg-card-light/95 dark:bg-card-dark/95 backdrop-blur-xl border border-border-light dark:border-border-dark rounded-xl shadow-2xl z-50 p-1.5 max-h-[220px] overflow-y-auto animate-scale-up"
                            >
                              <div className="px-2.5 py-1 text-[8px] font-bold text-gray-400 uppercase tracking-wider border-b border-border-light/40 dark:border-border-dark/40 mb-1 select-none">
                                {t.compareModelSelect}
                              </div>
                              {/* Search bar */}
                              <div className="p-1 relative mb-1">
                                <input
                                  type="text"
                                  placeholder={t.searchModels}
                                  value={compareSearchQuery}
                                  onChange={(e) => setCompareSearchQuery(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full pl-7 pr-2 py-1.5 bg-bg-light dark:bg-bg-dark/80 text-[10px] border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                                  autoFocus
                                />
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                              </div>
                              {allModels.filter((m) => m.name.toLowerCase().includes(compareSearchQuery.toLowerCase())).map((m) => (
                                <button
                                  key={m.id}
                                  onClick={() => {
                                    store.regenerateResponse(index, m.id);
                                    setCompareDropdownOpen(null);
                                    // Automatically enable compare mode to see side-by-side
                                    setCompareStates({ ...compareStates, [msg.id]: true });
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-md text-[10px] text-gray-700 dark:text-gray-300 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer truncate font-medium"
                                  title={m.name}
                                >
                                  {m.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Create branch from this message */}
                        <button
                          onClick={() => {
                            if (confirm(t.branchCreateConfirm)) {
                              store.createBranch(index);
                            }
                          }}
                          className="flex items-center space-x-1.5 px-2.5 py-1.5 text-[10px] font-bold text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-card-light dark:hover:bg-card-dark rounded-lg transition-colors cursor-pointer font-sans"
                          title={t.branchCreate}
                        >
                          <GitFork className="w-3 h-3" />
                          <span>{t.branchCreate}</span>
                        </button>
                      </div>
                    )}

                  </div>

                  {/* Right Avatar (User only) */}
                  {isUser && (
                    <div className="w-8 h-8 rounded-xl bg-card-light dark:bg-card-dark flex items-center justify-center text-gray-500 dark:text-gray-400 font-bold text-xs shrink-0 select-none border border-border-light dark:border-border-dark shadow-sm">
                      <User className="w-4.5 h-4.5 text-gray-500" />
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input container at the bottom */}
      <div className="p-4 shrink-0 bg-transparent">
        <div
          className={`max-w-3xl mx-auto relative flex flex-col border rounded-2xl bg-card-light/90 dark:bg-card-dark/95 shadow-xl shadow-black/5 dark:shadow-black/30 backdrop-blur-xl focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-500/10 transition-all duration-300 ${isDragging ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-border-light dark:border-border-dark'}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-amber-500/10 border-2 border-dashed border-amber-500 pointer-events-none">
              <span className="text-amber-600 dark:text-amber-400 text-sm font-medium">ここにドロップ</span>
            </div>
          )}
          
          {/* File attachments list above text field */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 border-b border-border-light/40 dark:border-border-dark/40 bg-bg-light/30 dark:bg-bg-dark/30 rounded-t-2xl">
              {attachments.map((att, idx) => (
                <div key={idx} className="flex items-center space-x-2 bg-bg-light dark:bg-bg-dark px-3 py-1.5 rounded-xl border border-border-light dark:border-border-dark text-xs relative animate-scale-up shadow-sm">
                  {att.type === 'image' ? (
                    <img src={att.content} alt={att.name} className="w-6 h-6 rounded-md object-cover" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500" />
                  )}
                  <span className="max-w-[130px] truncate text-[11px] font-medium text-gray-700 dark:text-gray-300">{att.name}</span>
                  <button
                    onClick={() => removeAttachment(idx)}
                    className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 cursor-pointer transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input field + upload trigger + send action button */}
          <div className="flex items-end px-4 py-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-2 text-gray-450 hover:text-amber-600 dark:hover:text-amber-500 rounded-xl hover:bg-bg-light dark:hover:bg-bg-dark transition-colors cursor-pointer shrink-0"
              title="ファイルを添付する (PDF, 画像, テキスト)"
            >
              <Paperclip className="w-4.5 h-4.5" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              accept="image/*,.pdf,.txt,.md,.csv,.tsv,.json,.yaml,.yml,.xml,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.swift,.kt,.sh,.sql,.html,.css,.scss,.vue,.svelte,.toml,.ini,.log"
              className="hidden"
            />

            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={t.inputTextPlaceholder}
              className="flex-1 px-3 py-2 bg-transparent focus:outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none max-h-[200px]"
            />

            {store.isGenerating ? (
              <button
                onClick={store.stopGeneration}
                className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-lg shadow-red-500/20 hover:shadow-red-500/30 transition-colors cursor-pointer shrink-0 active:scale-95 duration-150"
                title={t.stop}
              >
                <Square className="w-4.5 h-4.5 fill-white text-white" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputText.trim() && attachments.length === 0}
                className={`p-2.5 rounded-xl transition-all shrink-0 active:scale-95 duration-150 ${
                  inputText.trim() || attachments.length > 0
                    ? 'bg-amber-600 text-white cursor-pointer hover:bg-amber-700 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/35'
                    : 'text-gray-300 dark:text-gray-600 bg-transparent cursor-not-allowed'
                }`}
                title={t.send}
              >
                <Send className="w-4.5 h-4.5" />
              </button>
            )}
          </div>

        </div>

        <p className="text-[10px] text-gray-400 text-center mt-2.5 font-sans select-none tracking-wide">
          {estimatedInputTokens > 0 && (
            <span className="font-mono text-gray-450 dark:text-gray-500 mr-2">
              ~{estimatedInputTokens} {t.tokens} ({t.estTokensLabel})
            </span>
          )}
          {t.disclaimer}
        </p>
      </div>

    </div>
  );
};

// Sub-components to keep layout neat
const Sources: React.FC<{ citations: Citation[]; label: string }> = ({ citations, label }) => {
  if (!citations || citations.length === 0) return null;

  const hostOf = (url: string) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  };

  return (
    <div className="mt-3 pt-2.5 border-t border-border-light/40 dark:border-border-dark/40 select-none">
      <div className="flex items-center space-x-1.5 text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1.5 font-sans uppercase tracking-wider">
        <Globe className="w-3 h-3" />
        <span>{label}</span>
        <span className="text-gray-300 dark:text-gray-600">({citations.length})</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c, i) => (
          <a
            key={`${c.url}-${i}`}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            title={c.title || c.url}
            className="flex items-center space-x-1.5 max-w-[260px] px-2.5 py-1 bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-lg text-[11px] text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/40 transition-colors"
          >
            <span className="text-gray-400 dark:text-gray-500 font-mono text-[9px]">{i + 1}</span>
            <span className="truncate">{c.title || hostOf(c.url)}</span>
          </a>
        ))}
      </div>
    </div>
  );
};

const UsageBadge: React.FC<{
  usage: TokenUsage;
  modelId: string;
  pricing: Record<string, ModelPrice>;
  t: any;
}> = ({ usage, modelId, pricing, t }) => {
  const total = usage.inputTokens + usage.outputTokens;
  const cost = computeCost(modelId, usage.inputTokens, usage.outputTokens, pricing);
  return (
    <div className="flex items-center space-x-2 px-1 mt-1 text-[10px] font-mono text-gray-400 dark:text-gray-500 select-none">
      <span title={`${t.inLabel}: ${usage.inputTokens} / ${t.outLabel}: ${usage.outputTokens}`}>
        {usage.inputTokens}↑ {usage.outputTokens}↓ · {total} {t.tokens}
      </span>
      {cost != null && (
        <span className="text-amber-600/70 dark:text-amber-500/70">· {formatCost(cost)}</span>
      )}
    </div>
  );
};

const ActionButton: React.FC<{
  icon: React.ReactNode; 
  label: string; 
  copiedLabel: string;
  onClick: () => void 
}> = ({
  icon,
  label,
  copiedLabel,
  onClick,
}) => {
  const [clicked, setClicked] = useState(false);
  
  const handleAction = () => {
    onClick();
    setClicked(true);
    setTimeout(() => setClicked(false), 2000);
  };

  return (
    <button
      onClick={handleAction}
      className="flex items-center space-x-1.5 px-2.5 py-1.5 text-[10px] font-bold text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-card-light dark:hover:bg-card-dark rounded-lg transition-colors cursor-pointer font-sans"
    >
      {clicked ? <Check className="w-3 h-3 text-emerald-500 animate-scale-up" /> : icon}
      <span>{clicked ? copiedLabel : label}</span>
    </button>
  );
};

const CodeBlock = ({ 
  lang, 
  code, 
  copyLabel, 
  copiedLabel 
}: { 
  lang: string; 
  code: string; 
  copyLabel: string; 
  copiedLabel: string 
}) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="my-4.5 rounded-xl overflow-hidden border border-border-light dark:border-border-dark bg-zinc-50 dark:bg-[#0d0d0f] text-left shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-100 dark:bg-zinc-900 text-[11px] text-gray-500 dark:text-gray-450 font-mono select-none border-b border-border-light dark:border-border-dark">
        <span className="font-bold uppercase tracking-wider">{lang || 'text'}</span>
        <button
          onClick={handleCopy}
          className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors flex items-center space-x-1.5 cursor-pointer font-sans font-semibold"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : null}
          <span>{copied ? copiedLabel : copyLabel}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-gray-800 dark:text-[#d4d4d8]">
        <code>{code}</code>
      </pre>
    </div>
  );
};
