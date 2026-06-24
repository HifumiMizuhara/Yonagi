import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { db, type Attachment } from '../services/db';
import { extractTextFromPdf, readFileAsText, readFileAsBase64 } from '../utils/fileParser';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Paperclip, Send, Square, Copy, RotateCcw, FileText, X, ChevronDown, Sparkles, Check, User
} from 'lucide-react';

// List of standard predefined models
const PREDEFINED_MODELS = [
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Google)', group: 'Google' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Google)', group: 'Google' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (OpenAI)', group: 'OpenAI' },
  { id: 'gpt-4o', name: 'GPT-4o (OpenAI)', group: 'OpenAI' },
  { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (Anthropic)', group: 'Anthropic' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Anthropic)', group: 'Anthropic' },
];

export const ChatArea: React.FC = () => {
  const store = useChatStore();
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [store.messages]);

  // Handle outside click for model dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
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

  // List all available models: predefined + custom models from settings
  const getAvailableModels = () => {
    const models = [...PREDEFINED_MODELS];
    
    // Add custom models
    store.customModels.forEach((mId) => {
      if (!models.some(m => m.id === mId)) {
        models.push({
          id: mId,
          name: `${mId} (カスタム/ローカル)`,
          group: store.customEndpoint ? 'Custom API' : 'Local Ollama',
        });
      }
    });

    return models;
  };

  const allModels = getAvailableModels();
  const activeModel = allModels.find(m => m.id === store.activeModelId) || {
    id: store.activeModelId,
    name: store.activeModelId,
    group: 'Unknown',
  };

  const handleModelSelect = async (modelId: string) => {
    store.setActiveModelId(modelId);
    
    // If there is an active chat session, update its modelId in DB too
    if (store.activeChatId) {
      await db.chats.update(store.activeChatId, { modelId });
      await store.loadChats();
    }

    setShowModelDropdown(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setIsUploading(true);
    const newAttachments: Attachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
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
          // Standard text file or fallback
          const text = await readFileAsText(file);
          newAttachments.push({
            name: file.name,
            type: 'text',
            content: text,
            size: file.size,
          });
        }
      } catch (err: any) {
        alert(err.message || `${file.name} の読み込みに失敗しました。`);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setIsUploading(false);
    
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  // Click quick suggestion card
  const handleSuggestionClick = (text: string) => {
    setInputText(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-bg-light dark:bg-bg-dark text-gray-800 dark:text-gray-100 relative overflow-hidden">
      
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark px-4 py-3 h-[57px] select-none shrink-0 pl-16 md:pl-4">
        
        {/* Model Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            className="flex items-center space-x-1.5 px-3 py-1.5 hover:bg-border-light/40 dark:hover:bg-border-dark/40 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
          >
            <span>{activeModel.name}</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {showModelDropdown && (
            <div className="absolute left-0 mt-1.5 w-72 bg-bg-light dark:bg-sidebar-dark border border-border-light dark:border-border-dark rounded-xl shadow-xl z-50 py-1 max-h-[350px] overflow-y-auto">
              {/* Group models */}
              {['Google', 'OpenAI', 'Anthropic', 'Custom API', 'Local Ollama'].map((group) => {
                const groupModels = allModels.filter(m => m.group === group);
                if (groupModels.length === 0) return null;
                
                return (
                  <div key={group} className="py-1">
                    <div className="px-3 py-1 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      {group}
                    </div>
                    {groupModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => handleModelSelect(model.id)}
                        className={`w-full text-left px-4 py-2 text-xs hover:bg-border-light/30 dark:hover:bg-border-dark/30 flex items-center justify-between cursor-pointer ${
                          store.activeModelId === model.id ? 'text-accent-blue font-semibold bg-accent-blue/5' : ''
                        }`}
                      >
                        <span className="truncate">{model.name}</span>
                        {store.activeModelId === model.id && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action icons / details */}
        <div className="text-xs text-gray-400 dark:text-gray-500 font-mono hidden sm:block">
          {store.isGenerating ? '回答生成中...' : '待機中'}
        </div>

      </div>

      {/* Main Message History Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
        
        {store.messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center min-h-[70%] max-w-xl mx-auto text-center space-y-8 animate-fade-in py-10">
            <div className="w-14 h-14 rounded-full bg-accent-blue/10 flex items-center justify-center text-accent-blue animate-pulse">
              <Sparkles className="w-7 h-7" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                どのようなお手伝いをしましょうか？
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                モデルを選択し、質問の入力やファイルを添付して会話を始めましょう。
              </p>
            </div>

            {/* Suggestions Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-4">
              {[
                { title: '実装サポート', prompt: 'JavaScriptでクイックソートアルゴリズムの実装コードを書き、仕組みを説明してください。' },
                { title: '文章作成・推敲', prompt: 'プロジェクトの進捗報告メールを作成してください。トーンは丁寧かつ簡潔に。' },
                { title: '要約・分析', prompt: '「タイムマネジメント」に関する主要な3つのメリットをまとめ、リストにしてください。' },
                { title: '学習アシスタント', prompt: 'WebGPUとは何ですか？フロントエンド開発におけるメリットを分かりやすく教えて。' },
              ].map((card, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(card.prompt)}
                  className="p-4 text-left border border-border-light dark:border-border-dark bg-card-light/40 dark:bg-sidebar-dark/20 hover:bg-border-light/40 dark:hover:bg-border-dark/40 rounded-xl transition-all cursor-pointer group hover:scale-[1.01]"
                >
                  <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-200 mb-1 group-hover:text-accent-blue transition-colors">
                    {card.title}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {card.prompt}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Conversation Flow */
          <div className="max-w-3xl mx-auto space-y-6">
            {store.messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              
              return (
                <div key={msg.id} className={`flex space-x-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  
                  {/* Left Avatar (Assistant only) */}
                  {!isUser && (
                    <div className="w-8 h-8 rounded-lg bg-accent-blue/15 border border-accent-blue/20 flex items-center justify-center text-accent-blue font-bold text-xs shrink-0 select-none">
                      AI
                    </div>
                  )}

                  {/* Message Bubble wrapper */}
                  <div className={`flex flex-col space-y-1.5 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                    
                    {/* Role header / model tag */}
                    <div className="flex items-center space-x-1.5 text-[10px] text-gray-400 font-semibold px-1">
                      <span>{isUser ? 'あなた' : msg.modelUsed || 'Assistant'}</span>
                    </div>

                    {/* Content Box */}
                    <div className={`px-4 py-2.5 rounded-2xl text-[14.5px] leading-relaxed break-words border ${
                      isUser
                        ? 'bg-card-light/60 dark:bg-card-dark border-border-light dark:border-border-dark text-gray-900 dark:text-gray-100 rounded-tr-none'
                        : 'bg-transparent border-transparent text-gray-800 dark:text-gray-100 rounded-tl-none prose prose-slate dark:prose-invert max-w-none'
                    }`}>
                      
                      {/* Attached files previews in message */}
                      {isUser && msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-col space-y-1.5 mb-2">
                          {msg.attachments.map((att, attIdx) => (
                            <div key={attIdx} className="flex items-center space-x-2 bg-border-light/40 dark:bg-border-dark/40 px-2.5 py-1.5 rounded-lg border border-border-light dark:border-border-dark max-w-sm">
                              {att.type === 'image' ? (
                                <img src={att.content} alt={att.name} className="w-8 h-8 rounded object-cover" />
                              ) : (
                                <FileText className="w-4 h-4 text-accent-blue" />
                              )}
                              <span className="text-[11px] font-medium truncate max-w-[200px]">{att.name}</span>
                            </div>
                          ))}
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
                                <CodeBlock lang={lang} code={codeVal} />
                              ) : (
                                <code className="bg-card-light dark:bg-card-dark px-1.5 py-0.5 rounded text-xs text-red-500 dark:text-red-400 font-mono break-all" {...props}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {msg.content || '...'}
                        </ReactMarkdown>
                      )}
                    </div>

                    {/* Bottom Action strip (Assistant only, non-empty) */}
                    {!isUser && msg.content && (
                      <div className="flex space-x-1.5 px-1 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
                        <ActionButton
                          icon={<Copy className="w-3 h-3" />}
                          label="コピー"
                          onClick={() => navigator.clipboard.writeText(msg.content)}
                        />
                        <ActionButton
                          icon={<RotateCcw className="w-3 h-3" />}
                          label="再生成"
                          onClick={() => store.regenerateResponse(index)}
                        />
                      </div>
                    )}

                  </div>

                  {/* Right Avatar (User only) */}
                  {isUser && (
                    <div className="w-8 h-8 rounded-lg bg-border-light dark:bg-card-dark flex items-center justify-center text-gray-500 dark:text-gray-400 font-bold text-xs shrink-0 select-none border border-border-light dark:border-border-dark">
                      <User className="w-4 h-4" />
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
      <div className="border-t border-border-light dark:border-border-dark p-4 shrink-0 bg-bg-light dark:bg-bg-dark">
        <div className="max-w-3xl mx-auto relative flex flex-col border border-border-light dark:border-border-dark rounded-2xl bg-card-light/40 dark:bg-sidebar-dark/20 focus-within:border-accent-blue transition-colors">
          
          {/* File attachments list above text field */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 border-b border-border-light/60 dark:border-border-dark/60">
              {attachments.map((att, idx) => (
                <div key={idx} className="flex items-center space-x-1.5 bg-border-light/65 dark:bg-border-dark/65 px-2.5 py-1 rounded-lg border border-border-light dark:border-border-dark text-xs relative animate-scale-up">
                  {att.type === 'image' ? (
                    <img src={att.content} alt={att.name} className="w-6 h-6 rounded object-cover" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-accent-blue" />
                  )}
                  <span className="max-w-[130px] truncate text-[11px]">{att.name}</span>
                  <button
                    onClick={() => removeAttachment(idx)}
                    className="p-0.5 rounded-full hover:bg-border-light dark:hover:bg-border-dark text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input field + upload trigger + send action button */}
          <div className="flex items-end px-3 py-2.5">
            {/* Paperclip upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-border-light/35 dark:hover:bg-border-dark/35 transition-colors cursor-pointer shrink-0"
              title="ファイルを添付する (PDF, 画像, テキスト)"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              accept="image/*,.pdf,.txt,.js,.ts,.html,.css,.json,.md"
              className="hidden"
            />

            {/* Input textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="メッセージを入力... (Shift+Enterで改行)"
              className="flex-1 px-3 py-2 bg-transparent focus:outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none max-h-[200px]"
            />

            {/* Send or Stop Generation */}
            {store.isGenerating ? (
              <button
                onClick={store.stopGeneration}
                className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer shrink-0"
                title="生成停止"
              >
                <Square className="w-4 h-4 fill-white text-white" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputText.trim() && attachments.length === 0}
                className={`p-2 rounded-lg transition-colors shrink-0 ${
                  inputText.trim() || attachments.length > 0
                    ? 'bg-accent-blue text-white cursor-pointer hover:bg-accent-blue/90'
                    : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                }`}
                title="送信"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>

        </div>

        {/* Small prompt disclaimer */}
        <p className="text-[10px] text-gray-400 text-center mt-2 font-sans select-none">
          AI answers can be incorrect. Verify important info. Project Minase.
        </p>
      </div>

    </div>
  );
};

// Sub-components to keep layout neat
const ActionButton: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({
  icon,
  label,
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
      className="flex items-center space-x-1 px-2 py-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-border-light/30 dark:hover:bg-border-dark/30 rounded transition-colors cursor-pointer font-sans"
    >
      {clicked ? <Check className="w-2.5 h-2.5 text-accent-green animate-scale-up" /> : icon}
      <span>{clicked ? '完了!' : label}</span>
    </button>
  );
};

const CodeBlock = ({ lang, code }: { lang: string; code: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-border-light dark:border-border-dark bg-card-light dark:bg-[#1e1e1e] text-left">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-[#2d2d2d] text-[11px] text-gray-500 dark:text-gray-400 font-mono select-none border-b border-border-light dark:border-border-dark">
        <span className="font-semibold uppercase">{lang || 'text'}</span>
        <button
          onClick={handleCopy}
          className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex items-center space-x-1 cursor-pointer font-sans"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : null}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-gray-800 dark:text-[#d4d4d4]">
        <code>{code}</code>
      </pre>
    </div>
  );
};
