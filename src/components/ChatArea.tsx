import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore, type ChatState } from '../store/useChatStore';
import { useTranslation } from '../hooks/useTranslation';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { db, type Attachment, type Citation, type TokenUsage, type ModelPrice, type Message } from '../services/db';
import {
  extractTextFromPdf,
  readFileAsText,
  readFileAsBase64,
  FileParseError,
  MAX_ATTACHMENT_COUNT,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
} from '../utils/fileParser';
import { estimateTokens, formatCost, DEFAULT_MODEL_PRICING, selectUsageCost } from '../utils/tokens';
import { claudeSupportsXHigh } from '../utils/providerCompatibility';
import { buildContextMessages, estimateContextUsage } from '../utils/contextBuilder';
import { resolveContextWindow } from '../utils/contextWindows';
import { isTouchPrimaryDevice } from '../utils/device';
import { SafeMarkdownLink } from '../utils/markdownComponents';
import { sanitizeHref } from '../utils/safeUrl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/common';
import {
  Paperclip, Send, Square, Copy, RotateCcw, FileText, X, ChevronDown, Check, User, Search, Pencil,
  ChevronLeft, ChevronRight, Columns, Scale, GitFork, Globe, Pin, EyeOff, Eye, PinOff, Sparkles,
  SlidersHorizontal
} from 'lucide-react';
import { ModelIcon } from './ModelIcon';

interface HeaderDropdownPortalProps {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  desktopWidth: number;
  className?: string;
  children: React.ReactNode;
}

const HeaderDropdownPortal: React.FC<HeaderDropdownPortalProps> = ({
  anchorRef,
  panelRef,
  open,
  desktopWidth,
  className = '',
  children,
}) => {
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const margin = 12;
      const top = rect.bottom + 6;

      if (window.innerWidth < 768) {
        setStyle({
          position: 'fixed',
          top,
          left: margin,
          right: margin,
          maxHeight: Math.max(160, viewportHeight - top - margin),
          zIndex: 70,
        });
        return;
      }

      const width = Math.min(desktopWidth, viewportWidth - margin * 2);
      setStyle({
        position: 'fixed',
        top,
        left: Math.max(margin, Math.min(rect.left, viewportWidth - width - margin)),
        width,
        maxHeight: Math.max(160, viewportHeight - top - margin),
        zIndex: 70,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [anchorRef, desktopWidth, open]);

  if (!open || !style) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={style}
      className={`overflow-y-auto bg-card-light/97 dark:bg-[#1a1a1e]/97 backdrop-blur-2xl border border-border-light dark:border-white/8 shadow-2xl shadow-black/15 animate-scale-up ${className}`}
    >
      {children}
    </div>,
    document.body
  );
};

export const ChatArea: React.FC = () => {
  const store = useChatStore();
  const { t } = useTranslation();
  const isActiveChatGenerating = store.isChatGenerating(store.activeChatId);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showEffortDropdown, setShowEffortDropdown] = useState(false);
  const [showPromptDropdown, setShowPromptDropdown] = useState(false);
  const [showContextDropdown, setShowContextDropdown] = useState(false);
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);

  const [compareStates, setCompareStates] = useState<Record<string, boolean>>({});
  const [compareDropdownOpen, setCompareDropdownOpen] = useState<string | null>(null);
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [compareSearchQuery, setCompareSearchQuery] = useState('');
  const [customEffortVisible, setCustomEffortVisible] = useState(false);
  const [customEffortValue, setCustomEffortValue] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const effortDropdownRef = useRef<HTMLDivElement>(null);
  const promptDropdownRef = useRef<HTMLDivElement>(null);
  const contextDropdownRef = useRef<HTMLDivElement>(null);
  const moreDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownPanelRef = useRef<HTMLDivElement>(null);
  const effortDropdownPanelRef = useRef<HTMLDivElement>(null);
  const promptDropdownPanelRef = useRef<HTMLDivElement>(null);
  const contextDropdownPanelRef = useRef<HTMLDivElement>(null);
  const moreDropdownPanelRef = useRef<HTMLDivElement>(null);
  const dropdownCompareRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  useDialogAccessibility(confirmDialogRef, () => setConfirmDialog(null), !!confirmDialog);

  const markdownComponents = useMemo(() => ({
    a: SafeMarkdownLink,
    code({ node: _node, className, children, ...props }: React.ComponentProps<'code'> & { node?: unknown }) {
      const match = /language-(\w+)/.exec(className || '');
      const lang = match ? match[1] : '';
      const rawCode = String(children);
      const codeVal = rawCode.replace(/\n$/, '');
      const isInline = !match && !rawCode.endsWith('\n');

      return !isInline ? (
        <CodeBlock lang={lang} code={codeVal} copyLabel={t.copy} copiedLabel={t.copied} />
      ) : (
        <code className="bg-blue-500/8 dark:bg-blue-500/12 border border-blue-500/15 px-1.5 py-0.5 rounded-md text-[0.84em] text-blue-700 dark:text-sky-300 font-mono break-all font-medium" {...props}>
          {children}
        </code>
      );
    },
  }), [t.copy, t.copied]);

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 100;
  };

  useEffect(() => {
    if (store.messages.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    if (isAtBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [store.messages]);

  useEffect(() => {
    if (!store.scrollTargetMessageId) return;
    const target = document.getElementById(`message-${store.scrollTargetMessageId}`);
    const container = messagesContainerRef.current;
    if (!target || !container) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    setHighlightedMessageId(store.scrollTargetMessageId);
    const timeout = window.setTimeout(() => setHighlightedMessageId(null), 1800);
    store.setScrollTargetMessageId(null);
    return () => window.clearTimeout(timeout);
  }, [store, store.messages, store.scrollTargetMessageId]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        !modelDropdownPanelRef.current?.contains(target)
      ) {
        setShowModelDropdown(false);
      }
      if (
        effortDropdownRef.current &&
        !effortDropdownRef.current.contains(target) &&
        !effortDropdownPanelRef.current?.contains(target)
      ) {
        setShowEffortDropdown(false);
      }
      if (
        promptDropdownRef.current &&
        !promptDropdownRef.current.contains(target) &&
        !promptDropdownPanelRef.current?.contains(target)
      ) {
        setShowPromptDropdown(false);
      }
      if (dropdownCompareRef.current && !dropdownCompareRef.current.contains(target)) {
        setCompareDropdownOpen(null);
      }
      if (
        contextDropdownRef.current &&
        !contextDropdownRef.current.contains(target) &&
        !contextDropdownPanelRef.current?.contains(target)
      ) {
        setShowContextDropdown(false);
      }
      if (
        moreDropdownRef.current &&
        !moreDropdownRef.current.contains(target) &&
        !moreDropdownPanelRef.current?.contains(target)
      ) {
        setShowMoreDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputText]);

  const allModels = useMemo(() => {
    const models: Array<{ id: string; providerId: string; name: string; group: string }> = [];
    Object.values(store.providers).forEach((prov) => {
      if (prov.enabled) {
        prov.models.forEach((mId) => {
          models.push({ id: mId, providerId: prov.id, name: mId, group: prov.name });
        });
      }
    });
    return models;
  }, [store.providers]);

  const getFilteredModels = () => {
    if (!modelSearchQuery.trim()) return allModels;
    return allModels.filter(m => m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()));
  };

  const filteredModels = getFilteredModels();

  const activeModel = allModels.find(m => m.id === store.activeModelId && m.providerId === store.activeProviderId) ||
    allModels.find(m => m.id === store.activeModelId) || {
      id: store.activeModelId,
      providerId: store.activeProviderId,
      name: store.activeModelId,
      group: 'Unknown',
    };

  const compareDropdownPanelClass =
    'fixed left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[70] w-auto max-h-[calc(100dvh-8rem)] overflow-y-auto bg-card-light/97 dark:bg-[#1a1a1e]/97 backdrop-blur-2xl border border-border-light dark:border-white/8 rounded-2xl shadow-2xl shadow-black/15 animate-scale-up md:absolute md:left-0 md:right-auto md:bottom-full md:mb-1.5 md:w-60 md:max-h-[220px] md:z-50';

  const messageActionStripClass =
    'message-action-strip flex items-center space-x-0.5 px-1 transition-opacity duration-200 mt-1.5';

  const pricing: Record<string, ModelPrice> = useMemo(
    () => ({ ...DEFAULT_MODEL_PRICING, ...store.modelPricing }),
    [store.modelPricing]
  );

  const activeChat = useMemo(
    () => store.chats.find((c) => c.id === store.activeChatId) || null,
    [store.chats, store.activeChatId]
  );

  const contextWindow = useMemo(
    () => resolveContextWindow(activeModel.id, store.contextWindowOverrides),
    [activeModel.id, store.contextWindowOverrides]
  );

  const contextUsage = useMemo(() => {
    const effectiveMessages = buildContextMessages(store.messages, {
      memoryNote: activeChat?.memoryNote,
      historyWindowLimit: activeChat?.historyWindowLimit ?? store.defaultHistoryWindowLimit ?? undefined,
      summaryContent: activeChat?.summaryContent,
      summaryUpToMessageId: activeChat?.summaryUpToMessageId,
    });
    return estimateContextUsage(
      effectiveMessages,
      activeChat?.systemPrompt || store.globalSystemPrompt,
      activeChat?.memoryNote,
      contextWindow,
      (m) => m.content
    );
  }, [store.messages, activeChat, store.defaultHistoryWindowLimit, store.globalSystemPrompt, contextWindow]);

  const estimatedInputTokens = (() => {
    let text = inputText;
    for (const a of attachments) {
      if (a.type !== 'image') text += '\n' + a.content;
    }
    return estimateTokens(text);
  })();

  const supportsWebSearch = (() => {
    const modelId = activeModel.id.toLowerCase();
    if (activeModel.providerId === 'gemini' || activeModel.providerId === 'claude' || activeModel.providerId === 'openrouter') {
      return true;
    }
    if (activeModel.providerId === 'openai') {
      return modelId.includes('search');
    }
    return false;
  })();

  const getEffortOptions = () => {
    let baseOptions: { value: string; label: string }[];
    if (activeModel.providerId === 'gemini') {
      baseOptions = [
        { value: 'minimal', label: 'Minimal' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'none', label: t.effortNone }
      ];
    } else if (activeModel.providerId === 'claude') {
      const supportsXHigh = claudeSupportsXHigh(activeModel.id);
      baseOptions = [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        ...(supportsXHigh ? [{ value: 'xhigh', label: 'xHigh' }] : []),
        { value: 'max', label: 'Max' },
        { value: 'none', label: t.effortNone }
      ];
    } else if (activeModel.providerId === 'openai' || activeModel.providerId === 'openrouter') {
      const lower = activeModel.id.toLowerCase();
      const supportsMinimal = lower.includes('gpt-5') && !lower.includes('gpt-5.1') && !lower.includes('gpt-5.2');
      const supportsXHigh = lower.includes('gpt-5.2') || lower.includes('codex-max');
      baseOptions = [
        ...(supportsMinimal ? [{ value: 'minimal', label: 'Minimal' }] : []),
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        ...(supportsXHigh ? [{ value: 'xhigh', label: 'xHigh' }] : []),
        { value: 'none', label: t.effortNone }
      ];
    } else {
      baseOptions = [
        { value: 'none', label: t.effortNone }
      ];
    }
    return [...baseOptions, { value: 'custom_input', label: t.effortCustom }];
  };

  const renderEffortOptions = (onSelected: () => void) =>
    getEffortOptions().map((opt) =>
      opt.value === 'custom_input' ? (
        customEffortVisible ? (
          <form
            key="custom_form"
            onSubmit={(e) => {
              e.preventDefault();
              store.setActiveEffort(customEffortValue.trim() || 'none');
              setCustomEffortVisible(false);
              setCustomEffortValue('');
              onSelected();
            }}
            className="p-1.5 flex space-x-1"
          >
            <input
              type="text"
              value={customEffortValue}
              onChange={(e) => setCustomEffortValue(e.target.value)}
              placeholder={t.effortCustomPlaceholder}
              className="flex-1 px-2 py-1 text-xs bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              autoFocus
            />
            <button
              type="submit"
              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
            >
              OK
            </button>
          </form>
        ) : (
          <button
            key={opt.value}
            onClick={() => setCustomEffortVisible(true)}
            className="w-full text-left px-3.5 py-2 rounded-lg text-xs hover:bg-blue-500/6 dark:hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-sky-400 transition-colors cursor-pointer text-gray-700 dark:text-gray-300"
          >
            {opt.label}
          </button>
        )
      ) : (
        <button
          key={opt.value}
          onClick={() => {
            store.setActiveEffort(opt.value);
            onSelected();
          }}
          className={`w-full text-left px-3.5 py-2 rounded-lg text-xs hover:bg-blue-500/6 dark:hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-sky-400 flex items-center justify-between transition-colors cursor-pointer ${
            store.activeEffort === opt.value
              ? 'text-blue-600 dark:text-sky-400 font-semibold bg-blue-500/6 dark:bg-blue-500/10'
              : 'text-gray-700 dark:text-gray-300'
          }`}
        >
          <span>{opt.label}</span>
          {store.activeEffort === opt.value && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />}
        </button>
      )
    );

  const contextPanelContent = (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold text-gray-700 dark:text-gray-300">
          <span>{t.contextUsage}</span>
          <span className="font-mono text-gray-400">
            {contextUsage.estimatedTokens.toLocaleString()} / {contextUsage.contextWindow.toLocaleString()}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-bg-light dark:bg-bg-dark overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${contextUsage.usageRatio >= 0.8 ? 'bg-amber-500' : 'bg-blue-500'}`}
            style={{ width: `${Math.min(100, contextUsage.usageRatio * 100)}%` }}
          />
        </div>
      </div>

      {activeChat && (
        <>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">{t.memoryNote}</label>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">{t.memoryNoteDesc}</p>
            <textarea
              rows={3}
              value={activeChat.memoryNote || ''}
              onChange={(e) => store.updateChatMemoryNote(activeChat.id, e.target.value)}
              placeholder={t.memoryNotePlaceholder}
              className="w-full px-3 py-2 text-xs bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-blue-500 dark:text-gray-100 resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">{t.historyWindowLimit}</label>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">{t.historyWindowLimitDesc}</p>
            <input
              type="number"
              min={1}
              value={activeChat.historyWindowLimit ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                store.updateChatHistoryWindowLimit(activeChat.id, raw === '' ? null : Math.max(1, Number(raw)));
              }}
              placeholder={String(store.defaultHistoryWindowLimit ?? '')}
              className="w-full px-3 py-2 text-xs bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-blue-500 dark:text-gray-100"
            />
          </div>

          <div className="space-y-2 border-t border-border-light dark:border-border-dark pt-3">
            {activeChat.summaryContent ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">{t.summaryActive}</span>
                <button
                  onClick={() => store.clearChatSummary(activeChat.id)}
                  className="px-2.5 py-1 text-[10px] font-bold text-gray-500 dark:text-gray-400 hover:text-red-500 rounded-md cursor-pointer transition-colors"
                >
                  {t.clearSummary}
                </button>
              </div>
            ) : (
              <button
                onClick={() => store.summarizeChat(activeChat.id)}
                disabled={store.summarizingChatId === activeChat.id}
                className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-50 text-blue-600 dark:text-sky-400 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{store.summarizingChatId === activeChat.id ? t.summarizing : t.summarizeNow}</span>
              </button>
            )}
          </div>
        </>
      )}
    </>
  );

  const handleModelSelect = async (providerId: string, modelId: string) => {
    await store.setActiveModelId(modelId, providerId);
    if (store.activeChatId) {
      await db.chats.update(store.activeChatId, { providerId, modelId });
      await store.loadChats();
    }
    setShowModelDropdown(false);
    setModelSearchQuery('');
  };

  const applyPromptPreset = async (content: string) => {
    let chatId = store.activeChatId;
    if (!chatId) chatId = await store.createChat();
    await db.chats.update(chatId, { systemPrompt: content });
    await store.loadChats();
    setShowPromptDropdown(false);
  };

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploading(true);
    setFileUploadError(null);
    const newAttachments: Attachment[] = [];
    const errors: string[] = [];
    let totalBytes = attachments.reduce((sum, attachment) => sum + attachment.size, 0);

    for (const file of fileArray) {
      if (attachments.length + newAttachments.length >= MAX_ATTACHMENT_COUNT) {
        errors.push(t.tooManyAttachments);
        break;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name}: ${t.fileTooLarge}`);
        continue;
      }
      if (totalBytes + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
        errors.push(`${file.name}: ${t.attachmentsTooLarge}`);
        continue;
      }
      try {
        if (file.type.startsWith('image/')) {
          const base64 = await readFileAsBase64(file);
          newAttachments.push({ name: file.name, type: 'image', content: base64, size: file.size });
        } else if (file.name.toLowerCase().endsWith('.pdf')) {
          const text = await extractTextFromPdf(file);
          newAttachments.push({ name: file.name, type: 'pdf', content: text, size: file.size });
        } else {
          const text = await readFileAsText(file);
          newAttachments.push({ name: file.name, type: 'text', content: text, size: file.size });
        }
        totalBytes += file.size;
      } catch (err) {
        const message = err instanceof FileParseError ? t[err.code] : t.fileLoadError;
        errors.push(`${file.name}: ${message}`);
      }
    }

    if (errors.length > 0) setFileUploadError(errors.join('\n'));
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
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
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

  const handleStartEdit = (messageId: string, content: string) => {
    if (isActiveChatGenerating) return;
    setEditingMessageId(messageId);
    setEditingText(content);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const saveEditedMessage = async (messageId: string) => {
    const nextContent = editingText;
    handleCancelEdit();
    await store.editUserMessage(messageId, nextContent);
  };

  const handleSaveEdit = async (messageId: string, messageIndex: number) => {
    if (!editingText.trim() || isActiveChatGenerating) return;
    if (messageIndex < store.messages.length - 1) {
      setConfirmDialog({
        message: t.editMessageConfirm,
        confirmLabel: t.saveAndRegenerate,
        onConfirm: () => saveEditedMessage(messageId),
      });
      return;
    }
    await saveEditedMessage(messageId);
  };

  const handleSend = async () => {
    if (!inputText.trim() && attachments.length === 0) return;
    if (isActiveChatGenerating) return;

    const content = inputText;
    const currentAttachments = [...attachments];
    setInputText('');
    setAttachments([]);
    isAtBottomRef.current = true;
    await store.sendMessage(content, currentAttachments);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    // On touch devices there's no practical Shift+Enter, so Enter should
    // insert a newline like any other soft-keyboard app; only devices with a
    // real keyboard get Enter-to-send.
    if (e.key === 'Enter' && !e.shiftKey && !isTouchPrimaryDevice()) {
      e.preventDefault();
      handleSend();
    }
  };

  // `touch-manipulation` opts these buttons out of Android Chrome's tap/scroll
  // disambiguation. Without it, a tap that starts inside the horizontally
  // scrollable toolbar strip (or that jitters a pixel while the `active:scale`
  // transform fires) can be reinterpreted as a scroll, and Chrome silently
  // cancels the click — which is what made the web search toggle unresponsive.
  const toolbarBtnClass = 'gemini-chip min-h-11 flex items-center space-x-1.5 px-3.5 py-1.5 hover:bg-white/90 dark:hover:bg-white/6 text-gray-700 dark:text-gray-200 rounded-full text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer select-none touch-manipulation backdrop-blur-xl';
  const isEmptyChat = store.messages.length === 0;

  const composerBox = (
    <div
      className={`relative flex w-full flex-col border rounded-[2rem] bg-white/88 dark:bg-[#171923]/90 shadow-[0_18px_50px_rgba(148,163,184,0.16)] dark:shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-2xl focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all duration-200 ${
        isDragging ? 'border-blue-500 ring-4 ring-blue-500/20' : 'border-white/80 dark:border-white/8'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-blue-500/8 border-2 border-dashed border-blue-500/60 pointer-events-none">
          <span className="text-blue-600 dark:text-sky-400 text-sm font-semibold">{t.dropFilesHere}</span>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 border-b border-border-light/30 dark:border-border-dark/30 rounded-t-2xl">
          {attachments.map((att, idx) => (
            <div key={idx} className="flex items-center space-x-2 bg-bg-light dark:bg-bg-dark px-3 py-1.5 rounded-xl border border-border-light dark:border-border-dark text-xs animate-scale-up shadow-sm">
              {att.type === 'image' ? (
                <img src={att.content} alt={att.name} className="w-6 h-6 rounded-md object-cover" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
              )}
              <span className="max-w-[130px] truncate text-[11px] font-medium text-gray-700 dark:text-gray-300">{att.name}</span>
              <button
                onClick={() => removeAttachment(idx)}
                aria-label={`${t.delete}: ${att.name}`}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 cursor-pointer transition-colors ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {fileUploadError && (
        <div role="alert" className="flex items-start justify-between gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-950/25 border-b border-red-200/60 dark:border-red-800/40 text-[11px] text-red-600 dark:text-red-400 rounded-t-2xl">
          <pre className="whitespace-pre-wrap font-sans">{fileUploadError}</pre>
          <button onClick={() => setFileUploadError(null)} aria-label={t.close} className="shrink-0 mt-0.5 p-0.5 hover:text-red-700 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end px-3 py-2.5">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          aria-label={t.attachFile}
          className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 rounded-xl hover:bg-bg-light/80 dark:hover:bg-bg-dark transition-colors cursor-pointer shrink-0"
          title={t.attachFile}
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
          className="flex-1 px-3 py-2 bg-transparent focus:outline-none text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none max-h-[200px]"
        />

        {isActiveChatGenerating ? (
          <button
            onClick={store.stopGeneration}
            aria-label={t.stop}
            className="min-w-11 min-h-11 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-lg shadow-red-500/20 transition-colors cursor-pointer shrink-0 active:scale-95 duration-150"
            title={t.stop}
          >
            <Square className="w-4 h-4 fill-white" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!inputText.trim() && attachments.length === 0}
            aria-label={t.send}
            className={`min-w-11 min-h-11 flex items-center justify-center rounded-2xl transition-all shrink-0 active:scale-95 duration-150 ${
              inputText.trim() || attachments.length > 0
                ? 'bg-blue-600 text-white cursor-pointer hover:bg-blue-700 shadow-md shadow-blue-500/20 hover:shadow-blue-500/30'
                : 'text-gray-300 dark:text-gray-600 bg-transparent cursor-not-allowed'
            }`}
            title={t.send}
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  const composerTokenHint = estimatedInputTokens > 0 ? (
    <p className="text-[10px] text-gray-400/60 dark:text-gray-600 text-center mt-2 font-mono select-none">
      ~{estimatedInputTokens}{t.tokens}
    </p>
  ) : null;

  return (
    <div className="flex-1 flex flex-col h-full text-gray-800 dark:text-gray-100 relative overflow-hidden md:ml-3 rounded-[2rem] bg-white/22 dark:bg-white/[0.03] border border-white/50 dark:border-white/6 shadow-[0_18px_48px_rgba(148,163,184,0.12)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">

      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-2 pr-3 md:pr-6 pt-4 pb-2 min-h-[64px] select-none shrink-0 pl-16 md:pl-6 bg-transparent z-30">

        <div className="flex flex-nowrap md:flex-wrap items-center gap-1.5 flex-1 min-w-0 overflow-x-auto md:overflow-visible no-scrollbar">

          {/* Model Dropdown */}
          <div className="relative shrink-0" ref={dropdownRef}>
            <button
              onClick={() => {
                setShowModelDropdown(!showModelDropdown);
                setModelSearchQuery('');
              }}
              aria-label={t.searchModels}
              aria-expanded={showModelDropdown}
              className={toolbarBtnClass}
            >
              <ModelIcon
                providerId={activeModel.providerId}
                providerName={activeModel.group}
                modelId={activeModel.id}
                className="w-5 h-5"
              />
              <span className="font-heading truncate max-w-[64px] sm:max-w-[200px]">{activeModel.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            </button>

            <HeaderDropdownPortal
              anchorRef={dropdownRef}
              panelRef={modelDropdownPanelRef}
              open={showModelDropdown}
              desktopWidth={304}
              className="rounded-2xl p-2"
            >
              <div className="p-1.5 border-b border-border-light/40 dark:border-white/6 relative mb-1 shrink-0">
                <input
                  type="text"
                  placeholder={t.searchModels}
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-bg-light dark:bg-bg-dark/80 text-xs border border-border-light dark:border-white/8 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                  autoFocus={!isTouchPrimaryDevice()}
                />
                <Search className="absolute left-4 top-[15px] w-3.5 h-3.5 text-gray-400" />
              </div>
              {Object.values(store.providers).map((prov) => {
                if (!prov.enabled) return null;
                const groupModels = filteredModels.filter((m) => m.group === prov.name);
                if (groupModels.length === 0) return null;
                return (
                  <div key={prov.id} className="py-1">
                    <div className="px-3 py-1.5 text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                      {prov.name}
                    </div>
                    <div className="mt-0.5 space-y-0.5">
                      {groupModels.map((model) => (
                        <button
                          key={`${model.providerId}:${model.id}`}
                          onClick={() => handleModelSelect(model.providerId, model.id)}
                          className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs hover:bg-blue-500/6 dark:hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-sky-400 flex items-center justify-between transition-colors cursor-pointer ${
                            store.activeModelId === model.id && store.activeProviderId === model.providerId
                              ? 'text-blue-600 dark:text-sky-400 font-semibold bg-blue-500/6 dark:bg-blue-500/10'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2 pr-4">
                            <ModelIcon
                              providerId={model.providerId}
                              providerName={model.group}
                              modelId={model.id}
                              className="w-4.5 h-4.5"
                            />
                            <span className="truncate font-medium">{model.name}</span>
                          </span>
                          {store.activeModelId === model.id && store.activeProviderId === model.providerId && (
                            <Check className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </HeaderDropdownPortal>
          </div>

          {/* Effort Selector — hidden on mobile, folded into the "More" menu */}
          <div className="hidden md:block relative shrink-0" ref={effortDropdownRef}>
            <button
              onClick={() => {
                setShowEffortDropdown(!showEffortDropdown);
                setCustomEffortVisible(false);
                setCustomEffortValue('');
              }}
              aria-label={t.effortLabel}
              aria-expanded={showEffortDropdown}
              className={toolbarBtnClass}
            >
              <span className="font-heading whitespace-nowrap">
                <span className="hidden sm:inline text-gray-400 dark:text-gray-500">{t.effortLabel}: </span>
                {getEffortOptions().find(o => o.value === store.activeEffort)?.label || store.activeEffort}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            </button>

            <HeaderDropdownPortal
              anchorRef={effortDropdownRef}
              panelRef={effortDropdownPanelRef}
              open={showEffortDropdown}
              desktopWidth={200}
              className="rounded-2xl p-1.5"
            >
              {renderEffortOptions(() => setShowEffortDropdown(false))}
            </HeaderDropdownPortal>
          </div>

          {/* Prompt Presets */}
          {store.promptPresets.length > 0 && (
            <div className="relative shrink-0" ref={promptDropdownRef}>
              <button
                onClick={() => setShowPromptDropdown(!showPromptDropdown)}
                title={t.promptPresets}
                aria-label={t.promptPresets}
                aria-expanded={showPromptDropdown}
                className={toolbarBtnClass}
              >
                <FileText className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-heading hidden sm:inline">{t.prompts}</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>

              <HeaderDropdownPortal
                anchorRef={promptDropdownRef}
                panelRef={promptDropdownPanelRef}
                open={showPromptDropdown}
                desktopWidth={256}
                className="rounded-2xl p-1.5"
              >
                {store.promptPresets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPromptPreset(p.content)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-500/6 dark:hover:bg-blue-500/10 transition-colors cursor-pointer"
                    title={p.content}
                  >
                    <span className="block text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{p.name}</span>
                    <span className="block text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{p.content}</span>
                  </button>
                ))}
              </HeaderDropdownPortal>
            </div>
          )}

          {/* Context management — hidden on mobile, folded into the "More" menu */}
          <div className="hidden md:block relative shrink-0" ref={contextDropdownRef}>
            <button
              onClick={() => setShowContextDropdown(!showContextDropdown)}
              title={t.contextSettings}
              aria-label={t.contextSettings}
              aria-expanded={showContextDropdown}
              className={`${toolbarBtnClass} ${contextUsage.usageRatio >= 0.8 ? 'text-amber-600 dark:text-amber-400' : ''}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="font-heading hidden sm:inline">
                {Math.round(contextUsage.usageRatio * 100)}%
              </span>
            </button>

            <HeaderDropdownPortal
              anchorRef={contextDropdownRef}
              panelRef={contextDropdownPanelRef}
              open={showContextDropdown}
              desktopWidth={320}
              className="rounded-2xl p-4 space-y-4"
            >
              {contextPanelContent}
            </HeaderDropdownPortal>
          </div>

          {/* Mobile-only combined menu: Effort + Web Search + Context management,
              so the toolbar strip doesn't need horizontal scrolling on narrow screens */}
          <div className="relative shrink-0 md:hidden" ref={moreDropdownRef}>
            <button
              onClick={() => setShowMoreDropdown(!showMoreDropdown)}
              title={t.moreOptions}
              aria-label={t.moreOptions}
              aria-expanded={showMoreDropdown}
              className={`${toolbarBtnClass} ${
                contextUsage.usageRatio >= 0.8 || store.activeWebSearch ? 'text-blue-600 dark:text-sky-400' : ''
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="font-heading">{Math.round(contextUsage.usageRatio * 100)}%</span>
            </button>

            <HeaderDropdownPortal
              anchorRef={moreDropdownRef}
              panelRef={moreDropdownPanelRef}
              open={showMoreDropdown}
              desktopWidth={320}
              className="rounded-2xl p-4 space-y-4"
            >
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{t.effortLabel}</div>
                <div className="space-y-0.5">{renderEffortOptions(() => {})}</div>
              </div>

              {supportsWebSearch && (
                <div className="flex items-center justify-between border-t border-border-light dark:border-border-dark pt-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                    <Globe className="w-3.5 h-3.5 text-gray-400" />
                    {t.webSearchLabel}
                  </span>
                  <button
                    onClick={() => store.setActiveWebSearch(!store.activeWebSearch)}
                    role="switch"
                    aria-checked={store.activeWebSearch}
                    aria-label={t.webSearchLabel}
                    className={`relative w-9 h-5 rounded-full shrink-0 transition-colors cursor-pointer ${
                      store.activeWebSearch ? 'bg-blue-600' : 'bg-gray-300 dark:bg-white/10'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        store.activeWebSearch ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                </div>
              )}

              <div className="border-t border-border-light dark:border-border-dark pt-3 space-y-4">
                <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{t.contextSettings}</div>
                {contextPanelContent}
              </div>
            </HeaderDropdownPortal>
          </div>
        </div>

        {/* Web Search Toggle (desktop) — kept outside the scrollable toolbar strip so it's
            always fully visible and never requires a scroll gesture to reach;
            a tap that starts inside a horizontally-scrolling row can be
            swallowed by the browser's scroll/tap disambiguation. Hidden on mobile,
            where it's folded into the "More" menu above. */}
        {supportsWebSearch && (
          <button
            onClick={() => store.setActiveWebSearch(!store.activeWebSearch)}
            title={t.webSearchTooltip}
            aria-label={t.webSearchLabel}
            aria-pressed={store.activeWebSearch}
            className={`${toolbarBtnClass} hidden md:flex shrink-0 ${
              store.activeWebSearch
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-sky-400'
                : ''
            }`}
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span className="font-heading hidden sm:inline">{t.webSearchLabel}</span>
          </button>
        )}

        {/* Status indicator */}
        <div aria-live="polite" className={`gemini-chip flex items-center space-x-1.5 text-[10px] font-semibold px-3 py-1.5 rounded-full hidden sm:flex transition-all ${
          isActiveChatGenerating
            ? 'text-blue-600 dark:text-sky-400'
            : 'text-gray-400 dark:text-gray-500'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActiveChatGenerating ? 'bg-blue-500 animate-ping' : 'bg-gray-300 dark:bg-gray-600'}`} />
          <span className="font-mono tracking-wide">{isActiveChatGenerating ? t.generating : t.idle}</span>
        </div>
      </div>

      {isEmptyChat ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-4 md:px-8 pb-8">
          <div className="w-full max-w-2xl space-y-6 animate-fade-in">
            <div className="text-center space-y-2 px-2">
              <h2 className="text-3xl md:text-[2.75rem] font-normal tracking-tight leading-tight text-slate-900 dark:text-white">
                {t.howCanIHelp}
              </h2>
            </div>
            {composerBox}
            {composerTokenHint}
          </div>
        </div>
      ) : (
        <>
          <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8 min-h-0">
            <div className="max-w-4xl mx-auto space-y-10 pb-10">
              {store.messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isEditing = isUser && editingMessageId === msg.id;
              const hasVariants = !isUser && msg.variants && msg.variants.length > 1;
              const activeIndex = msg.activeVariantIndex ?? 0;
              const totalVariants = msg.variants ? msg.variants.length : 1;
              const isCompareMode = !isUser && (compareStates[msg.id] || false);

              return (
                <div
                  key={msg.id}
                  id={`message-${msg.id}`}
                  className={`flex space-x-3 ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up group transition-all duration-200 ${
                    highlightedMessageId === msg.id ? 'ring-2 ring-blue-500/25 ring-offset-8 ring-offset-transparent rounded-3xl' : ''
                  } ${msg.excludedFromContext ? 'opacity-45' : ''}`}
                >

                  {/* AI Avatar — provider/model icon */}
                  {!isUser && (
                    <ModelIcon
                      providerId={msg.modelProviderId}
                      modelId={msg.modelUsed || activeModel.id}
                      className="w-8 h-8 shrink-0 mt-0.5"
                    />
                  )}

                  {/* Message bubble wrapper */}
                  <div className={`flex flex-col space-y-1.5 ${isUser ? 'max-w-[85%] items-end' : 'flex-1 max-w-[92%] items-start'}`}>

                    {/* Meta row: role label + variant switcher + compare toggle */}
                    <div className="flex items-center space-x-2 text-[11px] text-gray-400 dark:text-gray-500 font-semibold px-1 select-none w-full justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="truncate">{isUser ? t.user : (msg.modelUsed || 'Assistant')}</span>

                        {/* Variant switcher */}
                        {hasVariants && (
                          <div className="flex items-center space-x-0.5 bg-card-light dark:bg-card-dark border border-border-light/60 dark:border-border-dark/60 rounded-lg px-1.5 py-0.5 font-mono text-[9px] shadow-sm">
                            <button
                              disabled={activeIndex === 0}
                              onClick={() => store.switchMessageVariant(msg.id, activeIndex - 1)}
                              aria-label={t.previousVariant}
                              className="p-1.5 rounded hover:bg-bg-light dark:hover:bg-bg-dark transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                            <span className="px-0.5">{activeIndex + 1}/{totalVariants}</span>
                            <button
                              disabled={activeIndex === totalVariants - 1}
                              onClick={() => store.switchMessageVariant(msg.id, activeIndex + 1)}
                              aria-label={t.nextVariant}
                              className="p-1.5 rounded hover:bg-bg-light dark:hover:bg-bg-dark transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Compare toggle */}
                      {!isUser && msg.variants && msg.variants.length > 1 && (
                        <button
                          onClick={() => setCompareStates({ ...compareStates, [msg.id]: !isCompareMode })}
                          aria-label={isCompareMode ? t.normalView : t.compareView}
                          className={`flex items-center space-x-1 px-2 py-2 rounded-lg border transition-all cursor-pointer text-[9px] font-semibold ${
                            isCompareMode
                              ? 'bg-blue-500/10 text-blue-600 dark:text-sky-400 border-blue-500/25'
                              : 'bg-card-light/70 dark:bg-card-dark/60 border-border-light/50 dark:border-border-dark/50 text-gray-400 hover:text-blue-600'
                          }`}
                        >
                          <Columns className="w-2.5 h-2.5" />
                          <span>{isCompareMode ? t.normalView : t.compareView}</span>
                        </button>
                      )}
                    </div>

                    {/* Content: compare grid or standard bubble */}
                    {isCompareMode && msg.variants ? (
                      <div className="w-full mt-1">
                        <div className="flex justify-end mb-2">
                          <button
                            onClick={() => setCompareStates({ ...compareStates, [msg.id]: false })}
                            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-border-light/50 dark:border-border-dark/50 bg-card-light dark:bg-card-dark text-[10px] font-semibold text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
                          >
                            <ChevronLeft className="w-3 h-3" />
                            <span>{t.normalView}</span>
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {msg.variants.map((v, vIdx) => (
                            <div
                              key={v.id}
                              className={`p-5 rounded-2xl border transition-all ${
                                activeIndex === vIdx
                                  ? 'border-blue-500/30 bg-blue-500/[0.03] dark:bg-blue-500/[0.05] shadow-sm shadow-blue-500/8'
                                  : 'border-border-light dark:border-border-dark bg-card-light/50 dark:bg-card-dark/30 hover:border-gray-200 dark:hover:border-gray-700'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[9px] text-gray-400 font-bold mb-3 pb-2 border-b border-border-light/40 dark:border-border-dark/40 select-none">
                                <span className="flex min-w-0 items-center gap-2 truncate pr-4 font-mono">
                                  <ModelIcon
                                    providerId={v.modelProviderId}
                                    modelId={v.modelUsed}
                                    className="w-4 h-4"
                                  />
                                  <span className="truncate">{v.modelUsed || 'Model'}</span>
                                </span>
                                <div className="flex items-center space-x-2 shrink-0">
                                  <span>#{vIdx + 1}</span>
                                  {activeIndex !== vIdx && (
                                    <button
                                      onClick={() => store.switchMessageVariant(msg.id, vIdx)}
                                      aria-label={t.setActive}
                                      className="px-1.5 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-sky-400 rounded cursor-pointer transition-colors text-[8px] font-bold"
                                    >
                                      {t.setActive}
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed break-words">
                                {v.thinking && (
                                  <div className="w-full mb-3 text-xs select-none">
                                    <button
                                      type="button"
                                      onClick={() => setThinkingOpen({ ...thinkingOpen, [`${msg.id}-${vIdx}`]: !(thinkingOpen[`${msg.id}-${vIdx}`] !== undefined ? thinkingOpen[`${msg.id}-${vIdx}`] : true) })}
                                      aria-expanded={thinkingOpen[`${msg.id}-${vIdx}`] !== undefined ? thinkingOpen[`${msg.id}-${vIdx}`] : true}
                                      className="min-h-11 w-full flex items-center space-x-2 text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 cursor-pointer font-bold py-1 border-b border-border-light/30 dark:border-border-dark/30 font-sans"
                                    >
                                      <span className={`transition-transform duration-200 text-[10px] ${(thinkingOpen[`${msg.id}-${vIdx}`] !== undefined ? thinkingOpen[`${msg.id}-${vIdx}`] : true) ? 'rotate-90' : ''}`}>▶</span>
                                      <span>{t.thinkingProcess}</span>
                                    </button>
                                    {(thinkingOpen[`${msg.id}-${vIdx}`] !== undefined ? thinkingOpen[`${msg.id}-${vIdx}`] : true) && (
                                      <div className="mt-2 p-3 bg-zinc-50/80 dark:bg-zinc-900/50 text-gray-500 dark:text-gray-400 border border-border-light/40 dark:border-border-dark/40 rounded-xl max-h-40 overflow-y-auto leading-relaxed text-[11px] select-text prose dark:prose-invert prose-sm max-w-none">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{v.thinking}</ReactMarkdown>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                  {v.content || '...'}
                                </ReactMarkdown>
                                {v.error && (
                                  <p className="mt-3 text-xs text-red-600 dark:text-red-400 font-sans not-prose" role="alert">{v.error}</p>
                                )}
                                {v.citations && v.citations.length > 0 && (
                                  <Sources citations={v.citations} label={t.sourcesLabel} />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* Standard message bubble */
                      <div className={`rounded-2xl text-sm leading-relaxed break-words border w-full ${
                        isUser
                          ? 'px-5 py-4 bg-white/82 dark:bg-white/[0.06] border-white/80 dark:border-white/8 text-gray-800 dark:text-gray-100 shadow-sm backdrop-blur-xl'
                          : 'px-1 py-1 bg-transparent border-transparent text-gray-800 dark:text-gray-100 prose dark:prose-invert max-w-none shadow-none'
                      }`}>

                        {/* Attached files */}
                        {isUser && msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-col space-y-2 mb-3">
                            {msg.attachments.map((att, attIdx) => (
                              <div key={attIdx} className="flex items-center space-x-2.5 bg-white/70 dark:bg-bg-dark/50 px-3 py-2 rounded-xl border border-border-light dark:border-border-dark max-w-sm shadow-sm">
                                {att.type === 'image' ? (
                                  <img src={att.content} alt={att.name} className="w-9 h-9 rounded-lg object-cover" />
                                ) : (
                                  <FileText className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
                                )}
                                <div className="text-left min-w-0">
                                  <p className="text-[11px] font-semibold truncate max-w-[200px] text-gray-800 dark:text-gray-200">{att.name}</p>
                                  <p className="text-[9px] text-gray-400">{(att.size / 1024).toFixed(1)} KB</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Thinking accordion */}
                        {!isUser && msg.thinking && (
                          <div className="w-full mb-4 select-none not-prose">
                            <button
                              type="button"
                              onClick={() => setThinkingOpen({ ...thinkingOpen, [msg.id]: !(thinkingOpen[msg.id] !== undefined ? thinkingOpen[msg.id] : true) })}
                              aria-expanded={thinkingOpen[msg.id] !== undefined ? thinkingOpen[msg.id] : true}
                              className="flex items-center space-x-2 text-gray-400 hover:text-blue-600 dark:hover:text-sky-400 cursor-pointer font-semibold text-xs py-1.5 border-b border-border-light/30 dark:border-border-dark/30 w-full text-left font-sans transition-colors"
                            >
                              <span className={`transition-transform duration-200 text-[10px] ${(thinkingOpen[msg.id] !== undefined ? thinkingOpen[msg.id] : true) ? 'rotate-90' : ''}`}>▶</span>
                              <span>{t.thinkingProcess}</span>
                              {isActiveChatGenerating && index === store.messages.length - 1 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse ml-1 shrink-0" />
                              )}
                            </button>
                            {(thinkingOpen[msg.id] !== undefined ? thinkingOpen[msg.id] : true) && (
                              <div className="mt-2 p-3.5 bg-zinc-50/90 dark:bg-zinc-900/50 text-gray-500 dark:text-gray-400 border border-border-light/40 dark:border-border-dark/40 rounded-xl max-h-60 overflow-y-auto leading-relaxed text-[11.5px] select-text prose dark:prose-invert prose-sm max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.thinking}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Message content */}
                        {isUser ? (
                          isEditing ? (
                            <div className="space-y-3 not-prose">
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="flex flex-col space-y-2">
                                  {msg.attachments.map((att, attIdx) => (
                                    <div key={attIdx} className="flex items-center space-x-2.5 bg-white/60 dark:bg-bg-dark/50 px-3 py-2 rounded-xl border border-border-light dark:border-border-dark max-w-sm">
                                      {att.type === 'image' ? (
                                        <img src={att.content} alt={att.name} className="w-9 h-9 rounded-lg object-cover" />
                                      ) : (
                                        <FileText className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
                                      )}
                                      <div className="text-left min-w-0">
                                        <p className="text-[11px] font-semibold truncate max-w-[200px] text-gray-800 dark:text-gray-200">{att.name}</p>
                                        <p className="text-[9px] text-gray-400">{(att.size / 1024).toFixed(1)} KB</p>
                                      </div>
                                    </div>
                                  ))}
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500">{t.attachmentsPreserved}</p>
                                </div>
                              )}

                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleSaveEdit(msg.id, index);
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleCancelEdit();
                                  }
                                }}
                                rows={4}
                                autoFocus
                                className="w-full min-h-[120px] px-4 py-3 bg-white/80 dark:bg-bg-dark/60 border border-blue-500/30 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 resize-y text-gray-900 dark:text-gray-100 text-sm"
                              />

                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">{t.editShortcutHint}</span>
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={handleCancelEdit}
                                    className="px-3 py-1.5 rounded-xl border border-border-light dark:border-border-dark text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
                                  >
                                    {t.cancel}
                                  </button>
                                  <button
                                    onClick={() => void handleSaveEdit(msg.id, index)}
                                    disabled={!editingText.trim() || isActiveChatGenerating}
                                    className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {t.saveAndRegenerate}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {msg.content || '...'}
                          </ReactMarkdown>
                        )}

                        {msg.error && (
                          <p className="mt-3 text-xs text-red-600 dark:text-red-400 font-sans not-prose" role="alert">{msg.error}</p>
                        )}

                        {!isUser && msg.citations && msg.citations.length > 0 && (
                          <Sources citations={msg.citations} label={t.sourcesLabel} />
                        )}
                      </div>
                    )}

                    {/* Token usage badge */}
                    {!isUser && msg.usage && (msg.usage.inputTokens > 0 || msg.usage.outputTokens > 0) && (
                      <UsageBadge usage={msg.usage} modelId={msg.modelUsed || activeModel.id} pricing={pricing} t={t} />
                    )}

                    {/* User message actions */}
                    {isUser && msg.content && !isEditing && (
                      <div className={messageActionStripClass}>
                        <button
                          onClick={() => handleStartEdit(msg.id, msg.content)}
                          disabled={isActiveChatGenerating}
                          className="flex items-center space-x-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-card-light dark:hover:bg-card-dark rounded-lg transition-colors cursor-pointer font-sans disabled:opacity-40 disabled:cursor-not-allowed"
                          title={t.edit}
                        >
                          <Pencil className="w-3 h-3" />
                          <span>{t.edit}</span>
                        </button>
                        <ActionButton
                          icon={<Copy className="w-3 h-3" />}
                          label={t.copy}
                          successLabel={t.copied}
                          onClick={() => navigator.clipboard.writeText(msg.content)}
                        />
                        <ContextToggleButtons msg={msg} store={store} t={t} />
                      </div>
                    )}

                    {/* AI message actions */}
                    {!isUser && msg.content && (
                      <div className={`${messageActionStripClass} relative`}>
                        <ActionButton
                          icon={<Copy className="w-3 h-3" />}
                          label={t.copy}
                          successLabel={t.copied}
                          onClick={() => navigator.clipboard.writeText(msg.content)}
                        />
                        <ActionButton
                          icon={<RotateCcw className="w-3 h-3" />}
                          label={t.regenerate}
                          onClick={() => store.regenerateResponse(index)}
                        />

                        {/* Compare with another model */}
                        <div className="relative">
                          <button
                            onClick={() => {
                              setCompareSearchQuery('');
                              setCompareDropdownOpen(compareDropdownOpen === msg.id ? null : msg.id);
                            }}
                            aria-label={t.compare}
                            className="flex items-center shrink-0 space-x-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-card-light dark:hover:bg-card-dark rounded-lg transition-colors cursor-pointer font-sans whitespace-nowrap"
                            title={t.compare}
                          >
                            <Scale className="w-3 h-3" />
                            <span className="whitespace-nowrap">{t.compare}</span>
                          </button>

                          {compareDropdownOpen === msg.id && (
                            <div ref={dropdownCompareRef} className={`${compareDropdownPanelClass} p-1.5`}>
                              <div className="px-2.5 py-1.5 text-[8px] font-bold text-gray-400 uppercase tracking-wider border-b border-border-light/40 dark:border-border-dark/40 mb-1 select-none">
                                {t.compareModelSelect}
                              </div>
                              <div className="p-1 relative mb-1">
                                <input
                                  type="text"
                                  placeholder={t.searchModels}
                                  value={compareSearchQuery}
                                  onChange={(e) => setCompareSearchQuery(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full pl-7 pr-2 py-1.5 bg-bg-light dark:bg-bg-dark/80 text-[10px] border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/10 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                                  autoFocus={!isTouchPrimaryDevice()}
                                />
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                              </div>
                              {allModels
                                .filter((m) => m.name.toLowerCase().includes(compareSearchQuery.toLowerCase()))
                                .map((m) => (
                                  <button
                                    key={`${m.providerId}:${m.id}`}
                                    onClick={() => {
                                      store.regenerateResponse(index, m.id, m.providerId);
                                      setCompareDropdownOpen(null);
                                      setCompareStates({ ...compareStates, [msg.id]: true });
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded-md text-[10px] text-gray-700 dark:text-gray-300 hover:bg-blue-500/6 dark:hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-sky-400 transition-colors cursor-pointer truncate font-medium"
                                    title={m.name}
                                  >
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <ModelIcon
                                        providerId={m.providerId}
                                        providerName={m.group}
                                        modelId={m.id}
                                        className="w-4 h-4"
                                      />
                                      <span className="truncate">{m.name}</span>
                                      <span className="shrink-0 text-gray-400">({m.group})</span>
                                    </span>
                                  </button>
                                ))
                              }
                            </div>
                          )}
                        </div>

                        {/* Branch from this message */}
                        <button
                          onClick={() => setConfirmDialog({
                            message: t.branchCreateConfirm,
                            confirmLabel: t.branchCreate,
                            onConfirm: () => store.createBranch(index),
                          })}
                          className="flex items-center shrink-0 space-x-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-card-light dark:hover:bg-card-dark rounded-lg transition-colors cursor-pointer font-sans whitespace-nowrap"
                          title={t.branchCreate}
                        >
                          <GitFork className="w-3 h-3" />
                          <span className="whitespace-nowrap">{t.branchCreate}</span>
                        </button>
                        <ContextToggleButtons msg={msg} store={store} t={t} />
                      </div>
                    )}
                  </div>

                  {/* User avatar */}
                  {isUser && (
                    <div className="w-8 h-8 rounded-xl bg-card-light dark:bg-card-dark flex items-center justify-center text-gray-400 dark:text-gray-500 shrink-0 select-none border border-border-light dark:border-border-dark shadow-sm mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>

          <div className="px-3 sm:px-4 pt-3 pb-1 shrink-0">
            <div className="max-w-4xl mx-auto">
              {composerBox}
              {composerTokenHint}
            </div>
          </div>
        </>
      )}

      <footer className="shrink-0 px-4 pt-1 pb-safe text-center">
        <p className="text-[10px] text-gray-400/60 dark:text-gray-600 font-sans select-none">
          {t.disclaimer}
        </p>
      </footer>

      {/* Confirm dialog */}
      {confirmDialog && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div ref={confirmDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="chat-confirm-title" tabIndex={-1} className="w-full max-w-sm rounded-2xl border border-border-light dark:border-border-dark bg-card-light dark:bg-sidebar-dark p-5 shadow-2xl animate-scale-up">
            <p id="chat-confirm-title" className="text-sm font-semibold leading-relaxed text-gray-800 dark:text-gray-100">{confirmDialog.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="min-h-11 px-4 py-2 rounded-xl border border-border-light dark:border-border-dark text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-sky-400 cursor-pointer transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const next = confirmDialog;
                  setConfirmDialog(null);
                  await next.onConfirm();
                }}
                className="min-h-11 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white cursor-pointer transition-colors"
              >
                {confirmDialog.confirmLabel || t.ok}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Sub-components ──────────────────────────────────────────── */

const Sources: React.FC<{ citations: Citation[]; label: string }> = ({ citations, label }) => {
  if (!citations || citations.length === 0) return null;
  const hostOf = (url: string) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  };
  return (
    <div className="mt-4 pt-3 border-t border-border-light/40 dark:border-border-dark/40 select-none not-prose">
      <div className="flex items-center space-x-1.5 text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-2 font-sans uppercase tracking-wider">
        <Globe className="w-3 h-3" />
        <span>{label}</span>
        <span className="text-gray-300 dark:text-gray-600">({citations.length})</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c, i) => {
          const safeHref = sanitizeHref(c.url);
          const content = (
            <>
              <span className="text-gray-400 dark:text-gray-500 font-mono text-[9px] shrink-0">{i + 1}</span>
              <span className="truncate">{c.title || hostOf(c.url)}</span>
            </>
          );
          const className = "flex items-center space-x-1.5 max-w-[260px] px-2.5 py-2 bg-bg-light dark:bg-bg-dark border border-border-light dark:border-border-dark rounded-lg text-[11px] text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-sky-400 hover:border-blue-500/30 transition-colors";
          if (!safeHref) {
            return (
              <span key={`${c.url}-${i}`} title={c.title || c.url} className={`${className} cursor-default`}>
                {content}
              </span>
            );
          }
          return (
            <a
              key={`${c.url}-${i}`}
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              title={c.title || c.url}
              className={className}
            >
              {content}
            </a>
          );
        })}
      </div>
    </div>
  );
};

const ContextToggleButtons: React.FC<{
  msg: Message;
  store: Pick<ChatState, 'toggleMessageExcluded' | 'toggleMessagePinned'>;
  t: { excludeFromContext: string; includeInContext: string; pinInContext: string; unpinFromContext: string };
}> = ({ msg, store, t }) => (
  <>
    <button
      onClick={() => store.toggleMessagePinned(msg.id)}
      aria-pressed={!!msg.pinnedInContext}
      title={msg.pinnedInContext ? t.unpinFromContext : t.pinInContext}
      className={`flex items-center px-2 py-1.5 rounded-lg transition-colors cursor-pointer font-sans ${
        msg.pinnedInContext
          ? 'text-amber-500 dark:text-amber-400'
          : 'text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-card-light dark:hover:bg-card-dark'
      }`}
    >
      {msg.pinnedInContext ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
    </button>
    <button
      onClick={() => store.toggleMessageExcluded(msg.id)}
      aria-pressed={!!msg.excludedFromContext}
      title={msg.excludedFromContext ? t.includeInContext : t.excludeFromContext}
      className={`flex items-center px-2 py-1.5 rounded-lg transition-colors cursor-pointer font-sans ${
        msg.excludedFromContext
          ? 'text-red-500 dark:text-red-400'
          : 'text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-card-light dark:hover:bg-card-dark'
      }`}
    >
      {msg.excludedFromContext ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
    </button>
  </>
);

const UsageBadge: React.FC<{
  usage: TokenUsage;
  modelId: string;
  pricing: Record<string, ModelPrice>;
  t: { inLabel: string; outLabel: string; tokens: string };
}> = ({ usage, modelId, pricing, t }) => {
  const total = usage.inputTokens + usage.outputTokens;
  const effectiveModelId = usage.responseModel || modelId;
  const { cost, estimated: costEstimated } = selectUsageCost(effectiveModelId, usage, pricing);
  const cacheRead = usage.cacheReadInputTokens || 0;
  const cacheWrite = usage.cacheCreationInputTokens || 0;
  const reasoningTokens = usage.reasoningTokens || 0;
  return (
    <div className="flex items-center space-x-2 px-1 mt-1 text-[10px] font-mono text-gray-400/70 dark:text-gray-500/70 select-none">
      <span title={`${t.inLabel}: ${usage.inputTokens} / ${t.outLabel}: ${usage.outputTokens}`}>
        {usage.inputTokens}↑ {usage.outputTokens}↓ · {total} {t.tokens}
      </span>
      {(cacheRead > 0 || cacheWrite > 0 || reasoningTokens > 0) && (
        <span
          title={[
            cacheRead > 0 ? `cache read: ${cacheRead}` : null,
            cacheWrite > 0 ? `cache write: ${cacheWrite}` : null,
            reasoningTokens > 0 ? `reasoning: ${reasoningTokens}` : null,
          ].filter(Boolean).join(' / ')}
        >
          {cacheRead > 0 && <span>· CR {cacheRead}</span>}
          {cacheWrite > 0 && <span> · CW {cacheWrite}</span>}
          {reasoningTokens > 0 && <span> · R {reasoningTokens}</span>}
        </span>
      )}
      {cost != null && (
        <span className="text-blue-600/60 dark:text-sky-400/60">· {(usage.estimated || costEstimated) ? '~' : ''}{formatCost(cost)}</span>
      )}
    </div>
  );
};

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  successLabel?: string;
  onClick: () => Promise<void> | void;
}> = ({ icon, label, successLabel, onClick }) => {
  const [clicked, setClicked] = useState(false);

  const handleAction = async () => {
    try {
      await onClick();
      if (successLabel) {
        setClicked(true);
        setTimeout(() => setClicked(false), 2000);
      }
    } catch {
      // clipboard write failed
    }
  };

  return (
    <button
      onClick={handleAction}
      className="flex items-center shrink-0 space-x-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-card-light dark:hover:bg-card-dark rounded-lg transition-colors cursor-pointer font-sans whitespace-nowrap"
    >
      {clicked ? <Check className="w-3 h-3 text-emerald-500 animate-scale-up" /> : icon}
      <span className="whitespace-nowrap">{clicked && successLabel ? successLabel : label}</span>
    </button>
  );
};

const CodeBlock = ({
  lang,
  code,
  copyLabel,
  copiedLabel,
}: {
  lang: string;
  code: string;
  copyLabel: string;
  copiedLabel: string;
}) => {
  const [copied, setCopied] = useState(false);
  const highlightedCode = useMemo(() => {
    const language = lang.toLowerCase();

    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    }

    return language === 'text' || language === 'plaintext'
      ? hljs.highlight(code, { language: 'plaintext' }).value
      : hljs.highlightAuto(code).value;
  }, [code, lang]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard write failed
    }
  };

  return (
    <div className="code-block my-4 rounded-xl overflow-hidden text-left not-prose">
      <div className="code-block-header flex items-center justify-between px-4 py-2.5 text-[11px] font-mono select-none">
        <span className="code-block-language font-bold uppercase tracking-wider">{lang || 'text'}</span>
        <button
          onClick={handleCopy}
          className="code-block-copy flex items-center space-x-1.5 transition-colors cursor-pointer font-sans font-semibold"
          aria-label={copied ? copiedLabel : copyLabel}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? copiedLabel : copyLabel}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
      </pre>
    </div>
  );
};
