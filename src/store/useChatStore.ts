import { create } from 'zustand';
import { db, type Chat, type Message, type MessageVariant, type Attachment, type ProviderConfig, type Citation, type TokenUsage, type PromptPreset, type ModelPrice, type Folder } from '../services/db';
import { ApiError, streamChatCompletion } from '../services/api';
import { buildApiUrl, migrateProviderModels, replaceRetiredModel, stripProviderKeys } from '../utils/providerCompatibility';
import { encryptString, decryptString, type EncryptedPayload } from '../utils/crypto';
import { translations } from '../utils/i18n';
import { estimateTokens } from '../utils/tokens';
import { isQuotaExceededError, runDbWrite } from '../utils/dbWrite';
import { buildContextMessages, messagesEligibleForSummary } from '../utils/contextBuilder';

export interface SearchResult {
  chatId: string;
  chatTitle: string;
  messageId: string;
  role: string;
  snippet: string;
  timestamp: number;
}

const formatTranslation = (template: string, values: Record<string, string | number> = {}) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));

const getLocalizedErrorMessage = (error: unknown, language: ChatState['language']) => {
  const t = translations[language] || translations.ja;

  if (error instanceof ApiError) {
    const keyByCode: Record<typeof error.code, keyof typeof translations.ja> = {
      providerDisabled: 'providerDisabledError',
      missingGeminiApiKey: 'missingGeminiApiKeyError',
      missingClaudeApiKey: 'missingClaudeApiKeyError',
      missingBaseUrl: 'missingBaseUrlError',
      apiRequestFailed: 'apiRequestFailedError',
      emptyResponseBody: 'emptyResponseBodyError',
    };
    return formatTranslation(t[keyByCode[error.code]], error.values);
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return t.generateResponseError;
};

const createChatTitle = (content: string) => {
  const rawTitle = content.trim().slice(0, 30);
  return rawTitle ? (rawTitle + (content.length > 30 ? '...' : '')) : 'New Chat';
};

const getActiveMessageContent = (message: Message) => {
  if (message.role === 'assistant' && message.variants && message.activeVariantIndex !== undefined) {
    const activeVariant = message.variants[message.activeVariantIndex];
    if (activeVariant) {
      return activeVariant.content;
    }
  }
  return message.content;
};

const buildChatContext = (messages: Message[]) =>
  messages.map((message) => ({
    role: message.role,
    content: getActiveMessageContent(message),
    attachments: message.attachments,
  }));

const getSearchableMessageText = (message: Message) => {
  const chunks = [
    message.content,
    message.thinking || '',
    ...(message.attachments || []).map((attachment) =>
      attachment.type === 'image' ? attachment.name : `${attachment.name}\n${attachment.content}`
    ),
    ...(message.citations || []).map((citation) => `${citation.title || ''}\n${citation.url}`),
    ...(message.variants || []).flatMap((variant) => [
      variant.content,
      variant.thinking || '',
      ...(variant.citations || []).map((citation) => `${citation.title || ''}\n${citation.url}`),
    ]),
  ];
  return chunks.filter(Boolean).join('\n');
};

const findProviderForModel = (
  providers: Record<string, ProviderConfig>,
  modelId: string,
  providerId?: string
) => {
  if (providerId && providers[providerId]) {
    return providers[providerId];
  }

  const enabledProvider = Object.values(providers).find(
    (provider) => provider.enabled && provider.models.includes(modelId)
  );
  if (enabledProvider) {
    return enabledProvider;
  }

  return Object.values(providers).find((provider) => provider.models.includes(modelId));
};

export interface ChatState {
  // Data State
  chats: Chat[];
  trashedChats: Chat[];
  messages: Message[];
  folders: Folder[];
  activeChatId: string | null;
  activeProviderId: string;
  activeModelId: string;
  activeEffort: string;
  activeWebSearch: boolean;

  // Settings State
  providers: Record<string, ProviderConfig>;
  globalSystemPrompt: string;
  theme: 'light' | 'dark' | 'system';
  language: 'ja' | 'en' | 'zh';
  promptPresets: PromptPreset[];
  modelPricing: Record<string, ModelPrice>;
  contextWindowOverrides: Record<string, number>;
  defaultHistoryWindowLimit: number | null;
  summarizingChatId: string | null;

  // Key encryption State
  keyEncryptionEnabled: boolean;
  keysLocked: boolean;           // true when encryption is on but keys not yet unlocked
  unlockPromptOpen: boolean;
  sessionPassphrase: string | null; // held in memory only

  // UI State
  sidebarOpen: boolean;
  settingsOpen: boolean;
  searchOpen: boolean;
  scrollTargetMessageId: string | null;
  activeGenerations: Record<string, { generationId: string; abortController: AbortController }>;
  storageNotice: string | null;
  
  // Actions
  init: () => Promise<void>;
  updateSetting: (key: string, value: unknown) => Promise<void>;
  updateProvider: (providerId: string, config: Partial<ProviderConfig>) => Promise<void>;
  addProvider: (name: string, baseUrl: string) => Promise<void>;
  deleteProvider: (providerId: string) => Promise<void>;
  testProviderConnection: (providerId: string) => Promise<boolean>;
  addModelToProvider: (providerId: string, modelId: string) => Promise<void>;
  removeModelFromProvider: (providerId: string, modelId: string) => Promise<void>;
  fetchModelsForProvider: (providerId: string) => Promise<void>;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setActiveModelId: (modelId: string, providerId?: string) => Promise<void>;
  setActiveEffort: (effort: string) => Promise<void>;
  setActiveWebSearch: (enabled: boolean) => Promise<void>;

  // Chat Actions
  loadChats: () => Promise<void>;
  selectChat: (chatId: string | null) => Promise<void>;
  createChat: (modelId?: string, providerId?: string) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  restoreChat: (chatId: string) => Promise<void>;
  permanentlyDeleteChat: (chatId: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  renameChat: (chatId: string, title: string) => Promise<void>;
  clearAllChats: () => Promise<void>;
  createBranch: (messageIndex: number) => Promise<void>;
  
  // Messaging Actions
  sendMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  editUserMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  rewindToMessage: (messageId: string) => Promise<void>;
  regenerateResponse: (messageIndex: number, targetModelId?: string, targetProviderId?: string) => Promise<void>;
  switchMessageVariant: (messageId: string, variantIndex: number) => Promise<void>;
  stopGeneration: () => void;
  isChatGenerating: (chatId?: string | null) => boolean;
  clearStorageNotice: () => void;
  toggleSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setScrollTargetMessageId: (messageId: string | null) => void;

  // Search
  searchMessages: (query: string) => Promise<SearchResult[]>;

  // Prompt presets
  addPromptPreset: (name: string, content: string) => Promise<void>;
  updatePromptPreset: (id: string, name: string, content: string) => Promise<void>;
  deletePromptPreset: (id: string) => Promise<void>;

  // Pricing
  setModelPrice: (modelId: string, price: ModelPrice) => Promise<void>;
  removeModelPrice: (modelId: string) => Promise<void>;

  // Context management
  setContextWindowOverride: (modelId: string, contextWindow: number) => Promise<void>;
  removeContextWindowOverride: (modelId: string) => Promise<void>;
  toggleMessageExcluded: (messageId: string) => Promise<void>;
  toggleMessagePinned: (messageId: string) => Promise<void>;
  updateChatMemoryNote: (chatId: string, memoryNote: string) => Promise<void>;
  updateChatHistoryWindowLimit: (chatId: string, limit: number | null) => Promise<void>;
  summarizeChat: (chatId: string, keepRecent?: number) => Promise<void>;
  clearChatSummary: (chatId: string) => Promise<void>;

  // Folders
  loadFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<string>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveChatToFolder: (chatId: string, folderId: string | null) => Promise<void>;

  // Key encryption
  persistProviders: () => Promise<void>;
  enableKeyEncryption: (passphrase: string) => Promise<void>;
  disableKeyEncryption: () => Promise<void>;
  unlockKeys: (passphrase: string) => Promise<boolean>;
  dismissUnlockPrompt: () => void;
  openUnlockPrompt: () => void;
}

const DEFAULT_PROVIDERS: Record<string, ProviderConfig> = {
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    enabled: true,
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKey: '',
    models: ['gemini-3.5-flash', 'gemini-2.5-pro'],
    corsProxy: '',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    enabled: false,
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    models: ['gpt-5.2', 'gpt-5-mini', 'gpt-4.1-mini'],
    corsProxy: '',
  },
  claude: {
    id: 'claude',
    name: 'Claude (Anthropic)',
    enabled: false,
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    corsProxy: '',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    enabled: false,
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    models: ['deepseek-chat', 'deepseek-coder'],
    corsProxy: '',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    enabled: false,
    baseUrl: 'https://openrouter.ai/api',
    apiKey: '',
    models: [],
    corsProxy: '',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    enabled: true,
    baseUrl: 'http://localhost:11434',
    apiKey: '',
    models: ['llama3', 'gemma2', 'phi3'],
    corsProxy: '',
  },
  custom: {
    id: 'custom',
    name: 'Custom Provider',
    enabled: false,
    baseUrl: '',
    apiKey: '',
    models: [],
    corsProxy: '',
  },
};

const DEFAULT_SETTINGS: Record<string, unknown> = {
  providers: DEFAULT_PROVIDERS,
  globalSystemPrompt: 'You are a helpful assistant.',
  theme: 'system',
  language: 'ja',
  activeProviderId: 'gemini',
  activeModelId: 'gemini-3.5-flash',
  activeEffort: 'none',
  activeWebSearch: false,
  sidebarOpen: 'true',
  promptPresets: [],
  modelPricing: {},
  contextWindowOverrides: {},
  defaultHistoryWindowLimit: null,
  keyEncryptionEnabled: false,
};

let removeSystemThemeListener: (() => void) | null = null;

export const useChatStore = create<ChatState>((set, get) => {
  const reportStorageError = (error: unknown): boolean => {
    if (!isQuotaExceededError(error)) return false;
    const language = get().language;
    const t = translations[language] || translations.ja;
    set({ storageNotice: t.storageQuotaError });
    return true;
  };

  const reportHistoryLoadError = (error: unknown): void => {
    console.error('Failed to initialize local database:', error);
    const language = get().language;
    const t = translations[language] || translations.ja;
    set({ storageNotice: t.historyLoadError });
  };

  const persistMessageWrite = async (operation: () => Promise<unknown>): Promise<boolean> => {
    try {
      await runDbWrite(operation);
      return true;
    } catch (error) {
      if (reportStorageError(error)) return false;
      throw error;
    }
  };

  const streamAssistantReply = async ({
    chatId,
    assistantMessageId,
    providerId,
    modelId,
    contextMessages,
    variantIndex,
    systemPrompt,
    temperature,
    abortLog,
    errorLog,
    memoryNote,
    historyWindowLimit,
    summaryContent,
    summaryUpToMessageId,
  }: {
    chatId: string;
    assistantMessageId: string;
    providerId?: string;
    modelId: string;
    contextMessages: Message[];
    variantIndex: number;
    systemPrompt: string;
    temperature: number;
    abortLog: string;
    errorLog: string;
    memoryNote?: string;
    historyWindowLimit?: number;
    summaryContent?: string;
    summaryUpToMessageId?: string;
  }) => {
    const providerConfig = findProviderForModel(get().providers, modelId, providerId) || get().providers.custom;
    const controller = new AbortController();
    const myGenId = crypto.randomUUID();
    set((state) => ({
      activeGenerations: {
        ...state.activeGenerations,
        [chatId]: { generationId: myGenId, abortController: controller },
      },
    }));

    const isCurrentGeneration = () => get().activeGenerations[chatId]?.generationId === myGenId;

    const clearGeneration = () => {
      set((state) => {
        if (state.activeGenerations[chatId]?.generationId !== myGenId) return state;
        const next = { ...state.activeGenerations };
        delete next[chatId];
        return { activeGenerations: next };
      });
    };

    let dbWriteTimer: ReturnType<typeof setTimeout> | null = null;
    let uiUpdateTimer: ReturnType<typeof setTimeout> | null = null;
    const storedAssistantMessage = await db.messages.get(assistantMessageId);
    if (!storedAssistantMessage) {
      clearGeneration();
      return;
    }
    let currentAssistantMessage: Message = storedAssistantMessage;

    const flushMessageToDb = async () => {
      if (!isCurrentGeneration()) return;
      try {
        await runDbWrite(() => db.messages.put(currentAssistantMessage));
      } catch (error) {
        reportStorageError(error);
      }
    };

    const commitVisibleMessage = () => {
      uiUpdateTimer = null;
      if (!isCurrentGeneration() || get().activeChatId !== chatId) return;
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === assistantMessageId ? currentAssistantMessage : message
        ),
      }));
    };

    // Keep every chunk in the local message, but batch React and IndexedDB work.
    // Re-rendering a long Markdown history for every network chunk is needlessly costly.
    const updateAssistantMessage = async (transform: (message: Message) => Message) => {
      if (!isCurrentGeneration()) return;
      currentAssistantMessage = transform(currentAssistantMessage);
      if (!uiUpdateTimer) {
        uiUpdateTimer = setTimeout(commitVisibleMessage, 80);
      }

      if (dbWriteTimer) clearTimeout(dbWriteTimer);
      dbWriteTimer = setTimeout(flushMessageToDb, 200);
    };

    const updateVariant = (
      message: Message,
      transform: (variant: MessageVariant) => MessageVariant
    ) => {
      const updatedVariants = [...(message.variants || [])];
      if (updatedVariants[variantIndex]) {
        updatedVariants[variantIndex] = transform(updatedVariants[variantIndex]);
      }
      return updatedVariants;
    };

    try {
      let accumulatedText = '';
      let accumulatedThinking = '';
      const accumulatedCitations: Citation[] = [];
      let accumulatedUsage: TokenUsage | null = null;

      const applyUsage = async (usage: TokenUsage) => {
        accumulatedUsage = { ...usage };
        await updateAssistantMessage((message) => ({
          ...message,
          usage: accumulatedUsage!,
          variants: updateVariant(message, (variant) => ({
            ...variant,
            usage: accumulatedUsage!,
          })),
        }));
      };

      const effectiveContextMessages = buildContextMessages(contextMessages, {
        memoryNote,
        historyWindowLimit,
        summaryContent,
        summaryUpToMessageId,
      });
      const streamChat = await db.chats.get(chatId);
      const streamProject = streamChat?.folderId ? await db.folders.get(streamChat.folderId) : undefined;
      const projectKnowledge = streamProject?.knowledgeFiles?.length
        ? `[Project knowledge]\n${streamProject.knowledgeFiles.map((file) => `## ${file.name}\n${file.content}`).join('\n\n')}`
        : '';
      const systemSections = [systemPrompt, streamProject?.systemPrompt ? `[Project instructions]\n${streamProject.systemPrompt}` : '', projectKnowledge];
      if (memoryNote) systemSections.push(`[Persistent memory note]\n${memoryNote}`);
      if (summaryContent) systemSections.push(`[Summary of earlier conversation]\n${summaryContent}`);
      const effectiveSystemPrompt = systemSections.filter(Boolean).join('\n\n');

      await streamChatCompletion(
        {
          providerConfig,
          modelId,
          messages: buildChatContext(effectiveContextMessages),
          systemPrompt: effectiveSystemPrompt,
          temperature,
          effort: get().activeEffort,
          webSearch: get().activeWebSearch,
        },
        async (chunk) => {
          accumulatedText += chunk;
          await updateAssistantMessage((message) => ({
            ...message,
            content: accumulatedText,
            variants: updateVariant(message, (variant) => ({
              ...variant,
              content: accumulatedText,
            })),
          }));
        },
        async (thinkingChunk) => {
          accumulatedThinking += thinkingChunk;
          await updateAssistantMessage((message) => ({
            ...message,
            thinking: accumulatedThinking,
            variants: updateVariant(message, (variant) => ({
              ...variant,
              thinking: accumulatedThinking,
            })),
          }));
        },
        controller.signal,
        async (citations) => {
          for (const citation of citations) {
            if (!accumulatedCitations.some((existing) => existing.url === citation.url)) {
              accumulatedCitations.push(citation);
            }
          }

          await updateAssistantMessage((message) => ({
            ...message,
            citations: [...accumulatedCitations],
            variants: updateVariant(message, (variant) => ({
              ...variant,
              citations: [...accumulatedCitations],
            })),
          }));
        },
        applyUsage
      );

      // If the provider didn't return usage stats (e.g. Gemini via OpenRouter),
      // fall back to a local token estimate so the cost badge still appears.
      if (accumulatedUsage === null && accumulatedText.length > 0) {
        const inputText = (effectiveSystemPrompt || '') + effectiveContextMessages.map((m) => m.content || '').join(' ');
        const estimatedUsage: TokenUsage = {
          inputTokens: estimateTokens(inputText),
          outputTokens: estimateTokens(accumulatedText),
          responseModel: modelId,
          estimated: true,
        };
        accumulatedUsage = estimatedUsage;
        await updateAssistantMessage((message) => ({
          ...message,
          usage: estimatedUsage,
          variants: updateVariant(message, (variant) => ({
            ...variant,
            usage: estimatedUsage,
          })),
        }));
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(abortLog);
      } else {
        console.error(errorLog, error);
        const errorMessage = getLocalizedErrorMessage(error, get().language);

        await updateAssistantMessage((message) => ({
          ...message,
          error: errorMessage,
          variants: updateVariant(message, (variant) => ({
            ...variant,
            error: errorMessage,
          })),
        }));
      }
    } finally {
      const stillCurrent = isCurrentGeneration();
      try {
        // Flush any pending debounced DB write before updating chat metadata.
        if (dbWriteTimer) {
          clearTimeout(dbWriteTimer);
          dbWriteTimer = null;
        }
        if (uiUpdateTimer) {
          clearTimeout(uiUpdateTimer);
          uiUpdateTimer = null;
        }
        if (stillCurrent) {
          commitVisibleMessage();
          await flushMessageToDb();
          try {
            await runDbWrite(() => db.chats.update(chatId, { updatedAt: Date.now() }));
            await get().loadChats();
          } catch (error) {
            reportStorageError(error);
          }
        }
      } catch (e) {
        console.error('Failed to update chat metadata:', e);
      } finally {
        if (isCurrentGeneration()) {
          clearGeneration();
        }
      }
    }
  };

  return ({
  chats: [],
  trashedChats: [],
  messages: [],
  folders: [],
  activeChatId: null,
  activeProviderId: 'gemini',
  activeModelId: 'gemini-3.5-flash',
  activeEffort: 'none',
  activeWebSearch: false,

  providers: DEFAULT_PROVIDERS,
  globalSystemPrompt: 'You are a helpful assistant.',
  theme: 'system',
  language: 'ja',
  promptPresets: [],
  modelPricing: {},
  contextWindowOverrides: {},
  defaultHistoryWindowLimit: null,
  summarizingChatId: null,

  keyEncryptionEnabled: false,
  keysLocked: false,
  unlockPromptOpen: false,
  sessionPassphrase: null,

  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  settingsOpen: false,
  searchOpen: false,
  scrollTargetMessageId: null,
  activeGenerations: {},
  storageNotice: null,

  init: async () => {
    try {
      // 1. Load settings from DB
      const settingsList = await db.settings.toArray();
      const settingsMap: Record<string, unknown> = {};
      settingsList.forEach(s => {
        settingsMap[s.key] = s.value;
      });

      const getSetting = <T>(key: string): T =>
        (settingsMap[key] !== undefined ? settingsMap[key] : DEFAULT_SETTINGS[key]) as T;

      const theme = getSetting<'system' | 'light' | 'dark'>('theme');
      const storedActiveModelId = getSetting<string>('activeModelId');
      const activeModelId = replaceRetiredModel(storedActiveModelId);
      const activeEffort = getSetting<string>('activeEffort') || 'none';
      const activeWebSearch = getSetting<unknown>('activeWebSearch') === true || getSetting<unknown>('activeWebSearch') === 'true';
      // Always start closed on phones — the sidebar renders as a full-screen
      // overlay there, so honoring a stored "open" value would greet the user
      // with the chat list covering the whole screen on every launch.
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const sidebarRaw = isMobile
        ? 'false'
        : (settingsMap['sidebarOpen'] !== undefined ? settingsMap['sidebarOpen'] : DEFAULT_SETTINGS['sidebarOpen']);

      let loadedProviders = getSetting<Record<string, ProviderConfig>>('providers');
      if (!loadedProviders || typeof loadedProviders !== 'object') {
        loadedProviders = DEFAULT_PROVIDERS;
      } else {
        // Fix #10: merge at field level so new fields (e.g. corsProxy) are backfilled
        Object.keys(DEFAULT_PROVIDERS).forEach((key) => {
          if (!loadedProviders[key]) {
            loadedProviders[key] = { ...DEFAULT_PROVIDERS[key] };
          } else {
            loadedProviders[key] = { ...DEFAULT_PROVIDERS[key], ...loadedProviders[key] };
          }
        });
      }
      loadedProviders = migrateProviderModels(loadedProviders);

      const storedProviderId = getSetting<string>('activeProviderId');
      const activeProviderId =
        storedProviderId && loadedProviders[storedProviderId]
          ? storedProviderId
          : (findProviderForModel(loadedProviders, activeModelId)?.id || 'gemini');

      // Read the raw stored value (not getSetting) so an absent setting stays
      // undefined and triggers browser-language detection. getSetting would fall
      // back to DEFAULT_SETTINGS.language ('ja') and the detection never ran.
      let loadedLanguage = settingsMap['language'] as string | undefined;
      if (!loadedLanguage) {
        const browserLang = navigator.language || '';
        if (browserLang.startsWith('ja')) {
          loadedLanguage = 'ja';
        } else if (browserLang.startsWith('zh')) {
          loadedLanguage = 'zh';
        } else {
          loadedLanguage = 'en';
        }
        await db.settings.put({ key: 'language', value: loadedLanguage });
      }

      const promptPresets = getSetting<PromptPreset[]>('promptPresets') || [];
      const modelPricing = getSetting<Record<string, ModelPrice>>('modelPricing') || {};
      const contextWindowOverrides = getSetting<Record<string, number>>('contextWindowOverrides') || {};
      const defaultHistoryWindowLimit = getSetting<number | null>('defaultHistoryWindowLimit') ?? null;
      const keyEncryptionEnabled = getSetting<unknown>('keyEncryptionEnabled') === true;
      const encryptedKeys = settingsMap['encryptedKeys'];
      // If encryption is on and an encrypted blob exists, keys live only inside it;
      // the providers loaded from DB have empty apiKey until the user unlocks.
      const keysLocked = keyEncryptionEnabled && !!encryptedKeys;
      if (keysLocked) {
        loadedProviders = stripProviderKeys(loadedProviders);
      }

      await db.settings.put({ key: 'providers', value: loadedProviders });
      if (activeModelId !== storedActiveModelId) {
        await db.settings.put({ key: 'activeModelId', value: activeModelId });
      }

      // Defensive migration: older DBs may contain malformed chat records.
      try {
        await db.chats.toCollection().modify((chat) => {
          if (typeof (chat as { modelId?: unknown }).modelId !== 'string' || !chat.modelId) {
            chat.modelId = activeModelId;
          } else {
            chat.modelId = replaceRetiredModel(chat.modelId);
          }
        });
      } catch (e) {
        console.warn('Chat migration failed; continuing without modify:', e);
      }

      set({
        providers: loadedProviders,
        globalSystemPrompt: getSetting<string>('globalSystemPrompt'),
        theme,
        language: loadedLanguage as ChatState['language'],
        activeProviderId,
        activeModelId,
        activeEffort,
        activeWebSearch,
        promptPresets,
        modelPricing,
        contextWindowOverrides,
        defaultHistoryWindowLimit,
        keyEncryptionEnabled,
        keysLocked,
        unlockPromptOpen: keysLocked,
        sessionPassphrase: null,
        sidebarOpen: sidebarRaw === 'true' || sidebarRaw === true,
      });

      // Apply theme
      get().setTheme(theme);
      document.documentElement.lang = loadedLanguage;

      // 2. Load chats list
      await get().loadChats();
      await get().loadFolders();
      const expiredTrashIds = get().trashedChats
        .filter((chat) => (chat.deletedAt || 0) < Date.now() - 30 * 24 * 60 * 60 * 1000)
        .map((chat) => chat.id);
      if (expiredTrashIds.length) {
        await db.transaction('rw', [db.chats, db.messages], async () => {
          await db.messages.where('chatId').anyOf(expiredTrashIds).delete();
          await db.chats.bulkDelete(expiredTrashIds);
        });
        await get().loadChats();
      }
    } catch (error) {
      reportHistoryLoadError(error);
      // Best-effort: still try to populate the chat list if possible.
      try {
        await get().loadChats();
      } catch (e) {
        console.error('Failed to load chats after init failure:', e);
      }
    }
  },

  updateSetting: async (key: string, value: unknown) => {
    await db.settings.put({ key, value });
    set({ [key]: value } as Partial<ChatState>);
    
    if (key === 'theme') {
      get().setTheme(value as 'system' | 'light' | 'dark');
    }
    if (key === 'language') {
      document.documentElement.lang = value as string;
    }
  },

  updateProvider: async (providerId, config) => {
    if ('apiKey' in config && get().keysLocked) return;
    const currentProviders = { ...get().providers };
    if (!currentProviders[providerId]) return;

    currentProviders[providerId] = {
      ...currentProviders[providerId],
      ...config,
    };

    set({ providers: currentProviders });
    await get().persistProviders();
  },

  addProvider: async (name, baseUrl) => {
    const id = `custom_${crypto.randomUUID().slice(0, 8)}`;
    const newProvider: ProviderConfig = {
      id,
      name,
      enabled: true,
      baseUrl,
      apiKey: '',
      models: [],
      corsProxy: '',
    };

    const currentProviders = { ...get().providers };
    currentProviders[id] = newProvider;

    set({ providers: currentProviders });
    await get().persistProviders();
  },

  deleteProvider: async (providerId) => {
    const protectedIds = ['gemini', 'openai', 'claude', 'deepseek', 'openrouter', 'ollama', 'custom'];
    if (protectedIds.includes(providerId)) return;

    const currentProviders = { ...get().providers };
    delete currentProviders[providerId];

    set({ providers: currentProviders });
    await get().persistProviders();
  },

  testProviderConnection: async (providerId) => {
    const prov = get().providers[providerId];
    if (!prov) return false;

    let url: string;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const corsPrefix = prov.corsProxy ? `${prov.corsProxy.replace(/\/$/, '')}/` : '';

    if (providerId === 'gemini') {
      if (!prov.apiKey) return false;
      url = `${corsPrefix}${buildApiUrl(prov.baseUrl || 'https://generativelanguage.googleapis.com', 'v1beta', 'models')}`;
      headers['x-goog-api-key'] = prov.apiKey;
    } else if (providerId === 'ollama') {
      url = `${corsPrefix}${prov.baseUrl.replace(/\/$/, '')}/api/tags`;
    } else if (providerId === 'claude') {
      if (!prov.apiKey) return false;
      url = `${corsPrefix}${buildApiUrl(prov.baseUrl || 'https://api.anthropic.com', 'v1', 'models')}`;
      headers['x-api-key'] = prov.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      // openai, deepseek, openrouter, custom
      if (!prov.baseUrl) return false;
      url = `${corsPrefix}${buildApiUrl(prov.baseUrl, 'v1', 'models')}`;
      if (prov.apiKey) {
        headers['Authorization'] = `Bearer ${prov.apiKey}`;
      }
    }

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000), // 5s timeout
      });
      return res.ok;
    } catch (e) {
      console.error('Connection test failed:', e);
      return false;
    }
  },

  addModelToProvider: async (providerId, modelId) => {
    const prov = get().providers[providerId];
    if (!prov) return;

    if (prov.models.includes(modelId)) return;

    const newModels = [...prov.models, modelId];
    await get().updateProvider(providerId, { models: newModels });
  },

  removeModelFromProvider: async (providerId, modelId) => {
    const prov = get().providers[providerId];
    if (!prov) return;

    const newModels = prov.models.filter((m) => m !== modelId);
    await get().updateProvider(providerId, { models: newModels });
  },

  fetchModelsForProvider: async (providerId: string) => {
    const prov = get().providers[providerId];
    if (!prov) return;

    let url: string;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const corsPrefix = prov.corsProxy ? `${prov.corsProxy.replace(/\/$/, '')}/` : '';

    if (providerId === 'gemini') {
      if (!prov.apiKey) throw new Error('APIキーが入力されていません。');
      url = `${corsPrefix}${buildApiUrl(prov.baseUrl || 'https://generativelanguage.googleapis.com', 'v1beta', 'models')}`;
      headers['x-goog-api-key'] = prov.apiKey;
    } else if (providerId === 'ollama') {
      url = `${corsPrefix}${prov.baseUrl.replace(/\/$/, '')}/api/tags`;
    } else if (providerId === 'claude') {
      if (!prov.apiKey) throw new Error('APIキーが入力されていません。');
      url = `${corsPrefix}${buildApiUrl(prov.baseUrl || 'https://api.anthropic.com', 'v1', 'models')}`;
      headers['x-api-key'] = prov.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      // openai, deepseek, openrouter, custom
      if (!prov.baseUrl) throw new Error('ベースURLが入力されていません。');
      url = `${corsPrefix}${buildApiUrl(prov.baseUrl, 'v1', 'models')}`;
      if (prov.apiKey) {
        headers['Authorization'] = `Bearer ${prov.apiKey}`;
      }
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      let text = '';
      try { text = await res.text(); } catch { /* ignore */ }
      throw new Error(`モデル一覧の取得に失敗しました (${res.status}): ${text || res.statusText}`);
    }

    const data = await res.json();
    let fetchedModels: string[] = [];

    if (providerId === 'gemini') {
      if (data.models && Array.isArray(data.models)) {
        fetchedModels = (data.models as Array<{ name: string }>)
          .map((m) => m.name.replace(/^models\//, ''))
          .filter((name) => name.startsWith('gemini-'));
      }
    } else if (providerId === 'ollama') {
      if (data.models && Array.isArray(data.models)) {
        fetchedModels = (data.models as Array<{ name: string }>).map((m) => m.name);
      }
    } else if (providerId === 'claude') {
      if (data.data && Array.isArray(data.data)) {
        fetchedModels = (data.data as Array<{ id: string }>).map((m) => m.id);
      }
    } else {
      // openai, deepseek, openrouter, custom
      if (data.data && Array.isArray(data.data)) {
        fetchedModels = (data.data as Array<{ id: string }>).map((m) => m.id);
      }
    }

    if (fetchedModels.length === 0) {
      throw new Error('返されたモデルリストが空です。形式が合わないか、モデルがありません。');
    }

    await get().updateProvider(providerId, { models: fetchedModels });
  },

  setTheme: (theme) => {
    const root = window.document.documentElement;
    removeSystemThemeListener?.();
    removeSystemThemeListener = null;

    const applyResolvedTheme = (resolvedTheme: 'light' | 'dark') => {
      root.classList.remove('light', 'dark');
      root.classList.add(resolvedTheme);
    };

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const applySystemTheme = () => applyResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      applySystemTheme();
      mediaQuery.addEventListener('change', applySystemTheme);
      removeSystemThemeListener = () => mediaQuery.removeEventListener('change', applySystemTheme);
    } else {
      applyResolvedTheme(theme);
    }
  },

  setActiveModelId: async (modelId, providerId) => {
    const resolvedProviderId = providerId || findProviderForModel(get().providers, modelId)?.id || get().activeProviderId;
    set({ activeModelId: modelId, activeProviderId: resolvedProviderId });
    await db.settings.put({ key: 'activeProviderId', value: resolvedProviderId });
    await db.settings.put({ key: 'activeModelId', value: modelId });
  },

  setActiveEffort: async (effort) => {
    set({ activeEffort: effort });
    await db.settings.put({ key: 'activeEffort', value: effort });

    const activeChatId = get().activeChatId;
    if (activeChatId) {
      await db.chats.update(activeChatId, { effort });
      // Fix #14: update in-memory list directly instead of triggering a full loadChats reload
      set(state => ({
        chats: state.chats.map(c => c.id === activeChatId ? { ...c, effort } : c),
      }));
    }
  },

  setActiveWebSearch: async (enabled) => {
    set({ activeWebSearch: enabled });
    await db.settings.put({ key: 'activeWebSearch', value: enabled });

    const activeChatId = get().activeChatId;
    if (activeChatId) {
      await db.chats.update(activeChatId, { webSearch: enabled });
      set(state => ({
        chats: state.chats.map(c => c.id === activeChatId ? { ...c, webSearch: enabled } : c),
      }));
    }
  },

  loadChats: async () => {
    const chatsList = await db.chats.orderBy('updatedAt').reverse().toArray();
    set({
      chats: chatsList.filter((chat) => !chat.deletedAt),
      trashedChats: chatsList.filter((chat) => !!chat.deletedAt).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0)),
    });
  },

  loadFolders: async () => {
    const foldersList = await db.folders.orderBy('order').toArray();
    set({ folders: foldersList });
  },

  createFolder: async (name) => {
    const folders = get().folders;
    const maxOrder = folders.length > 0 ? Math.max(...folders.map(f => f.order)) : 0;
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name,
      color: '#f59e0b', // amber-500 default
      order: maxOrder + 1,
    };
    await db.folders.add(newFolder);
    await get().loadFolders();
    return newFolder.id;
  },

  renameFolder: async (folderId, name) => {
    await db.folders.update(folderId, { name });
    await get().loadFolders();
  },

  deleteFolder: async (folderId) => {
    // Move all chats in this folder to uncategorized
    await db.chats.where('folderId').equals(folderId).modify({ folderId: undefined });
    await db.folders.delete(folderId);
    await get().loadFolders();
    await get().loadChats();
  },

  moveChatToFolder: async (chatId, folderId) => {
    const folder = folderId ? await db.folders.get(folderId) : undefined;
    await db.chats.update(chatId, {
      folderId: folderId ?? undefined,
      ...(folder?.modelId ? { modelId: folder.modelId, providerId: folder.providerId } : {}),
    });
    await get().loadChats();
  },

  selectChat: async (chatId) => {
    set({ activeChatId: chatId });
    if (chatId) {
      // Fix #12: query DB directly instead of stale in-memory chats list
      const chat = await db.chats.get(chatId);
      const chatMessages = await db.messages
        .where('chatId')
        .equals(chatId)
        .sortBy('timestamp');
      set({ 
        messages: chatMessages,
        activeProviderId: chat?.providerId || findProviderForModel(get().providers, chat?.modelId || get().activeModelId)?.id || get().activeProviderId,
        activeModelId: chat?.modelId || get().activeModelId,
        activeEffort: chat?.effort || 'none',
        activeWebSearch: chat?.webSearch ?? false,
      });
    } else {
      set({ messages: [] });
    }
  },

  createChat: async (modelId, providerId) => {
    const resolvedModelId = modelId || get().activeModelId;
    const resolvedProviderId =
      providerId ||
      (modelId ? findProviderForModel(get().providers, modelId)?.id : get().activeProviderId) ||
      get().activeProviderId;
    const newChat: Chat = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      providerId: resolvedProviderId,
      modelId: resolvedModelId,
      temperature: 0.7,
      effort: get().activeEffort,
      webSearch: get().activeWebSearch,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.chats.add(newChat);
    await get().loadChats();
    await get().selectChat(newChat.id);
    return newChat.id;
  },

  deleteChat: async (chatId) => {
    const generation = get().activeGenerations[chatId];
    if (generation) {
      generation.abortController.abort();
      set((state) => {
        const next = { ...state.activeGenerations };
        delete next[chatId];
        return { activeGenerations: next };
      });
    }
    await db.chats.update(chatId, { deletedAt: Date.now() });
    
    await get().loadChats();
    
    if (get().activeChatId === chatId) {
      const remainingChats = get().chats;
      if (remainingChats.length > 0) {
        await get().selectChat(remainingChats[0].id);
      } else {
        await get().selectChat(null);
      }
    }
  },

  restoreChat: async (chatId) => {
    await db.chats.update(chatId, { deletedAt: undefined, updatedAt: Date.now() });
    await get().loadChats();
  },

  permanentlyDeleteChat: async (chatId) => {
    await db.transaction('rw', [db.chats, db.messages], async () => {
      await db.messages.where('chatId').equals(chatId).delete();
      await db.chats.delete(chatId);
    });
    await get().loadChats();
  },

  emptyTrash: async () => {
    const ids = get().trashedChats.map((chat) => chat.id);
    if (!ids.length) return;
    await db.transaction('rw', [db.chats, db.messages], async () => {
      await db.messages.where('chatId').anyOf(ids).delete();
      await db.chats.bulkDelete(ids);
    });
    await get().loadChats();
  },

  renameChat: async (chatId, title) => {
    await db.chats.update(chatId, { title, updatedAt: Date.now() });
    await get().loadChats();
  },

  clearAllChats: async () => {
    Object.values(get().activeGenerations).forEach((generation) => generation.abortController.abort());
    set({ activeGenerations: {} });
    await db.transaction('rw', [db.chats, db.messages], async () => {
      await db.chats.clear();
      await db.messages.clear();
    });
    set({ chats: [], messages: [], activeChatId: null });
  },

  sendMessage: async (content, attachments = []) => {
    let chatId = get().activeChatId;
    if (!chatId) {
      chatId = await get().createChat();
    }
    if (get().activeGenerations[chatId]) return;

    // 1. Create and save user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      chatId,
      role: 'user',
      content,
      attachments,
      timestamp: Date.now(),
    };

    if (!(await persistMessageWrite(() => db.messages.add(userMsg)))) return;

    const currentChat = get().chats.find((chat) => chat.id === chatId);
    if (currentChat && currentChat.title === 'New Chat') {
      try {
        await runDbWrite(() => db.chats.update(chatId, { title: createChatTitle(content) }));
      } catch (error) {
        if (reportStorageError(error)) return;
        throw error;
      }
    }

    try {
      await runDbWrite(() => db.chats.update(chatId, { updatedAt: Date.now() }));
    } catch (error) {
      if (reportStorageError(error)) return;
      throw error;
    }
    await get().loadChats();

    const messagesSoFar = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
    set({ messages: messagesSoFar });

    const activeChat = await db.chats.get(chatId);

    // 2. Prepare Assistant response placeholder with initial variant
    const assistantMsgId = crypto.randomUUID();
    const activeModelId = activeChat?.modelId || get().activeModelId;
    const activeProviderId =
      activeChat?.providerId ||
      findProviderForModel(get().providers, activeModelId, get().activeProviderId)?.id ||
      get().activeProviderId;

    const initialVariant: MessageVariant = {
      id: crypto.randomUUID(),
      content: '',
      thinking: '',
      modelProviderId: activeProviderId,
      modelUsed: activeModelId,
      timestamp: Date.now(),
    };

    const assistantMsg: Message = {
      id: assistantMsgId,
      chatId,
      role: 'assistant',
      content: '',
      thinking: '',
      modelProviderId: activeProviderId,
      modelUsed: activeModelId,
      timestamp: Date.now() + 1,
      variants: [initialVariant],
      activeVariantIndex: 0,
    };

    if (!(await persistMessageWrite(() => db.messages.add(assistantMsg)))) return;

    set({
      messages: [...messagesSoFar, assistantMsg],
    });

    await streamAssistantReply({
      chatId,
      assistantMessageId: assistantMsgId,
      providerId: activeProviderId,
      modelId: activeModelId,
      contextMessages: messagesSoFar,
      variantIndex: 0,
      systemPrompt: activeChat?.systemPrompt || get().globalSystemPrompt,
      temperature: activeChat?.temperature ?? 0.7,
      abortLog: 'Generation aborted',
      errorLog: 'Error generating response:',
      memoryNote: activeChat?.memoryNote,
      historyWindowLimit: activeChat?.historyWindowLimit ?? get().defaultHistoryWindowLimit ?? undefined,
      summaryContent: activeChat?.summaryContent,
      summaryUpToMessageId: activeChat?.summaryUpToMessageId,
    });
  },

  editUserMessage: async (messageId, content) => {
    const chatId = get().activeChatId;
    if (!chatId || get().activeGenerations[chatId]) return;

    const messages = [...get().messages];
    const messageIndex = messages.findIndex((message) => message.id === messageId);
    if (messageIndex === -1) return;

    const targetMessage = messages[messageIndex];
    if (targetMessage.role !== 'user') return;

    const updatedUserMessage: Message = {
      ...targetMessage,
      content,
    };
    if (!(await persistMessageWrite(() => db.messages.put(updatedUserMessage)))) return;

    const followingMessageIds = messages.slice(messageIndex + 1).map((message) => message.id);
    if (followingMessageIds.length > 0) {
      if (!(await persistMessageWrite(() => db.messages.bulkDelete(followingMessageIds)))) return;
    }

    const baseMessages = messages
      .slice(0, messageIndex + 1)
      .map((message) => (message.id === messageId ? updatedUserMessage : message));

    const activeChat = await db.chats.get(chatId);
    const firstUserMessage = messages.find((message) => message.role === 'user');
    const previousAutoTitle = createChatTitle(targetMessage.content);
    const shouldRetitle =
      firstUserMessage?.id === messageId &&
      !!activeChat &&
      (activeChat.title === 'New Chat' || activeChat.title === previousAutoTitle);

    const chatUpdates: Partial<Chat> = { updatedAt: Date.now() };
    if (shouldRetitle) {
      chatUpdates.title = createChatTitle(content);
    }

    // The edited message may fall inside the range already folded into the chat's
    // summary; if so, that summary no longer reflects the conversation and must be dropped.
    if (activeChat?.summaryUpToMessageId) {
      const summaryIdx = messages.findIndex((message) => message.id === activeChat.summaryUpToMessageId);
      if (summaryIdx === -1 || summaryIdx >= messageIndex) {
        chatUpdates.summaryContent = undefined;
        chatUpdates.summaryUpToMessageId = undefined;
        activeChat.summaryContent = undefined;
        activeChat.summaryUpToMessageId = undefined;
      }
    }

    try {
      await runDbWrite(() => db.chats.update(chatId, chatUpdates));
    } catch (error) {
      if (reportStorageError(error)) return;
      throw error;
    }
    await get().loadChats();

    const responseModelId =
      (messages[messageIndex + 1]?.role === 'assistant' && messages[messageIndex + 1].modelUsed) ||
      activeChat?.modelId ||
      get().activeModelId;
    const responseProviderId =
      (messages[messageIndex + 1]?.role === 'assistant' && messages[messageIndex + 1].modelProviderId) ||
      activeChat?.providerId ||
      findProviderForModel(get().providers, responseModelId, get().activeProviderId)?.id ||
      get().activeProviderId;

    const assistantMsgId = crypto.randomUUID();
    const initialVariant: MessageVariant = {
      id: crypto.randomUUID(),
      content: '',
      thinking: '',
      modelProviderId: responseProviderId,
      modelUsed: responseModelId,
      timestamp: Date.now(),
    };

    const assistantMsg: Message = {
      id: assistantMsgId,
      chatId,
      role: 'assistant',
      content: '',
      thinking: '',
      modelProviderId: responseProviderId,
      modelUsed: responseModelId,
      timestamp: Date.now() + 1,
      variants: [initialVariant],
      activeVariantIndex: 0,
    };

    if (!(await persistMessageWrite(() => db.messages.add(assistantMsg)))) return;
    set({
      messages: [...baseMessages, assistantMsg],
    });

    await streamAssistantReply({
      chatId,
      assistantMessageId: assistantMsgId,
      providerId: responseProviderId,
      modelId: responseModelId,
      contextMessages: baseMessages,
      variantIndex: 0,
      systemPrompt: activeChat?.systemPrompt || get().globalSystemPrompt,
      temperature: activeChat?.temperature ?? 0.7,
      abortLog: 'Edited message regeneration aborted',
      errorLog: 'Error regenerating edited message response:',
      memoryNote: activeChat?.memoryNote,
      historyWindowLimit: activeChat?.historyWindowLimit ?? get().defaultHistoryWindowLimit ?? undefined,
      summaryContent: activeChat?.summaryContent,
      summaryUpToMessageId: activeChat?.summaryUpToMessageId,
    });
  },

  deleteMessage: async (messageId) => {
    const target = get().messages.find((message) => message.id === messageId);
    if (!target || get().activeGenerations[target.chatId]) return;
    await db.messages.delete(messageId);
    const messages = get().messages.filter((message) => message.id !== messageId);
    set({ messages });
    await db.chats.update(target.chatId, { updatedAt: Date.now(), summaryContent: undefined, summaryUpToMessageId: undefined });
    await get().loadChats();
  },

  rewindToMessage: async (messageId) => {
    const messages = get().messages;
    const index = messages.findIndex((message) => message.id === messageId);
    const chatId = get().activeChatId;
    if (index < 0 || !chatId || get().activeGenerations[chatId]) return;
    const ids = messages.slice(index + 1).map((message) => message.id);
    if (ids.length) await db.messages.bulkDelete(ids);
    set({ messages: messages.slice(0, index + 1) });
    await db.chats.update(chatId, { updatedAt: Date.now(), summaryContent: undefined, summaryUpToMessageId: undefined });
    await get().loadChats();
  },

  regenerateResponse: async (messageIndex, targetModelId, targetProviderId) => {
    const chatId = get().activeChatId;
    if (!chatId || messageIndex < 0 || messageIndex >= get().messages.length) return;

    // Fix #2: abort the old stream without resetting state; the old finally will see
    // a mismatched generationId and skip its reset, so the new generation runs cleanly.
    const existingGeneration = get().activeGenerations[chatId];
    if (existingGeneration) existingGeneration.abortController.abort();

    const messages = [...get().messages];
    const assistantMsg = messages[messageIndex];
    if (assistantMsg.role !== 'assistant') return;

    // 1. Find the last user message index before this assistant message
    let lastUserIndex = -1;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) return;

    // 2. Prepare new response variant
    const modelUsed = targetModelId || assistantMsg.modelUsed || get().activeModelId;
    const providerUsed =
      targetProviderId ||
      assistantMsg.modelProviderId ||
      findProviderForModel(get().providers, modelUsed, get().activeProviderId)?.id ||
      get().activeProviderId;
    const newVariant: MessageVariant = {
      id: crypto.randomUUID(),
      content: '',
      thinking: '',
      modelProviderId: providerUsed,
      modelUsed,
      timestamp: Date.now(),
    };

    // If variants array is empty, initialize it with the current message contents as the first variant
    const existingVariants = assistantMsg.variants ? [...assistantMsg.variants] : [];
    if (existingVariants.length === 0) {
      existingVariants.push({
        id: crypto.randomUUID(),
        content: assistantMsg.content,
        thinking: assistantMsg.thinking || '',
        modelProviderId: assistantMsg.modelProviderId,
        modelUsed: assistantMsg.modelUsed,
        timestamp: assistantMsg.timestamp,
      });
    }

    const newVariants = [...existingVariants, newVariant];
    const newActiveIndex = newVariants.length - 1;

    const updatedAssistantMsg = {
      ...assistantMsg,
      content: '', // Start empty for streaming
      thinking: '',
      error: undefined,
      modelProviderId: providerUsed,
      modelUsed,
      variants: newVariants,
      activeVariantIndex: newActiveIndex,
    };

    if (!(await persistMessageWrite(() => db.messages.put(updatedAssistantMsg)))) return;

    const updatedMessages = messages.map((m, idx) => 
      idx === messageIndex ? updatedAssistantMsg : m
    );
    set({ messages: updatedMessages });

    // 3. Prepare chat context up to the user message
    const messagesBefore = messages.slice(0, lastUserIndex + 1);
    const activeChat = await db.chats.get(chatId);

    await streamAssistantReply({
      chatId,
      assistantMessageId: assistantMsg.id,
      providerId: providerUsed,
      modelId: modelUsed,
      contextMessages: messagesBefore,
      variantIndex: newActiveIndex,
      systemPrompt: activeChat?.systemPrompt || get().globalSystemPrompt,
      temperature: activeChat?.temperature ?? 0.7,
      abortLog: 'Regeneration aborted',
      errorLog: 'Error regenerating response:',
      memoryNote: activeChat?.memoryNote,
      historyWindowLimit: activeChat?.historyWindowLimit ?? get().defaultHistoryWindowLimit ?? undefined,
      summaryContent: activeChat?.summaryContent,
      summaryUpToMessageId: activeChat?.summaryUpToMessageId,
    });
  },

  switchMessageVariant: async (messageId, variantIndex) => {
    const messages = [...get().messages];
    const msgIndex = messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const msg = messages[msgIndex];
    if (!msg.variants || variantIndex < 0 || variantIndex >= msg.variants.length) return;

    const variant = msg.variants[variantIndex];
    const updatedMsg: Message = {
      ...msg,
      activeVariantIndex: variantIndex,
      content: variant.content,
      thinking: variant.thinking || '',
      modelProviderId: variant.modelProviderId,
      modelUsed: variant.modelUsed,
      citations: variant.citations || [],
      usage: variant.usage,
      error: variant.error,
    };

    await db.messages.put(updatedMsg);

    const updatedMessages = messages.map((m) => 
      m.id === messageId ? updatedMsg : m
    );
    set({ messages: updatedMessages });
  },

  createBranch: async (messageIndex) => {
    const activeChatId = get().activeChatId;
    if (!activeChatId || messageIndex < 0 || messageIndex >= get().messages.length) return;

    const activeChat = get().chats.find(c => c.id === activeChatId);
    if (!activeChat) return;

    // 1. Create a new chat
    const newChatId = crypto.randomUUID();
    const branchChat: Chat = {
      id: newChatId,
      title: `${activeChat.title} (Branch)`,
      systemPrompt: activeChat.systemPrompt,
      providerId: activeChat.providerId,
      modelId: activeChat.modelId,
      temperature: activeChat.temperature,
      effort: activeChat.effort,
      webSearch: activeChat.webSearch,
      memoryNote: activeChat.memoryNote,
      historyWindowLimit: activeChat.historyWindowLimit,
      // Summary is intentionally not copied: it references message ids from the
      // original chat, and the branch gets freshly-generated ids for its copies.
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.chats.add(branchChat);

    // 2. Copy messages up to the selected index
    const messagesToCopy = get().messages.slice(0, messageIndex + 1);
    const copiedMessages: Message[] = messagesToCopy.map((m) => ({
      id: crypto.randomUUID(),
      chatId: newChatId,
      role: m.role,
      content: m.content,
      attachments: m.attachments ? [...m.attachments] : undefined,
      modelProviderId: m.modelProviderId,
      modelUsed: m.modelUsed,
      timestamp: m.timestamp,
      variants: m.variants ? m.variants.map((variant) => ({ ...variant })) : undefined,
      activeVariantIndex: m.activeVariantIndex,
      thinking: m.thinking,
      citations: m.citations ? [...m.citations] : undefined,
      usage: m.usage ? { ...m.usage } : undefined,
      excludedFromContext: m.excludedFromContext,
      pinnedInContext: m.pinnedInContext,
    }));

    if (copiedMessages.length > 0) {
      await db.messages.bulkAdd(copiedMessages);
    }

    // 3. Reload list and select the new branched chat
    await get().loadChats();
    await get().selectChat(newChatId);
  },

  stopGeneration: () => {
    const chatId = get().activeChatId;
    if (!chatId) return;
    const generation = get().activeGenerations[chatId];
    if (generation) {
      generation.abortController.abort();
    }
  },

  isChatGenerating: (chatId) => {
    const id = chatId ?? get().activeChatId;
    return !!(id && get().activeGenerations[id]);
  },

  clearStorageNotice: () => {
    set({ storageNotice: null });
  },

  toggleSidebar: async () => {
    const newVal = !get().sidebarOpen;
    set({ sidebarOpen: newVal });
    await db.settings.put({ key: 'sidebarOpen', value: newVal ? 'true' : 'false' });
  },

  setSettingsOpen: (open) => {
    set({ settingsOpen: open });
  },

  setSearchOpen: (open) => {
    set({ searchOpen: open });
  },

  setScrollTargetMessageId: (messageId) => {
    set({ scrollTargetMessageId: messageId });
  },

  // ---- Search ----
  searchMessages: async (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // Load chat titles up-front (small table, always needed for results).
    const chatTitles: Record<string, string> = {};
    (await db.chats.toArray()).forEach((c) => { chatTitles[c.id] = c.title; });

    const results: SearchResult[] = [];
    // Use a cursor via .each() to avoid materialising the entire messages table
    // into memory at once. Early-exit once the 100-result cap is reached.
    await db.messages.toCollection().until(() => results.length >= 100).each((m) => {
      const content = getSearchableMessageText(m);
      const idx = content.toLowerCase().indexOf(q);
      if (idx === -1) return;

      const start = Math.max(0, idx - 40);
      const end = Math.min(content.length, idx + q.length + 60);
      const snippet = (start > 0 ? '…' : '') + content.slice(start, end).replace(/\n/g, ' ') + (end < content.length ? '…' : '');

      results.push({
        chatId: m.chatId,
        chatTitle: chatTitles[m.chatId] || 'Chat',
        messageId: m.id,
        role: m.role,
        snippet,
        timestamp: m.timestamp,
      });
    });

    results.sort((a, b) => b.timestamp - a.timestamp);
    return results;
  },

  // ---- Prompt presets ----
  addPromptPreset: async (name, content) => {
    const preset: PromptPreset = { id: crypto.randomUUID(), name, content };
    const presets = [...get().promptPresets, preset];
    set({ promptPresets: presets });
    await db.settings.put({ key: 'promptPresets', value: presets });
  },

  updatePromptPreset: async (id, name, content) => {
    const presets = get().promptPresets.map((p) => p.id === id ? { ...p, name, content } : p);
    set({ promptPresets: presets });
    await db.settings.put({ key: 'promptPresets', value: presets });
  },

  deletePromptPreset: async (id) => {
    const presets = get().promptPresets.filter((p) => p.id !== id);
    set({ promptPresets: presets });
    await db.settings.put({ key: 'promptPresets', value: presets });
  },

  // ---- Pricing ----
  setModelPrice: async (modelId, price) => {
    const pricing = { ...get().modelPricing, [modelId]: price };
    set({ modelPricing: pricing });
    await db.settings.put({ key: 'modelPricing', value: pricing });
  },

  removeModelPrice: async (modelId) => {
    const pricing = { ...get().modelPricing };
    delete pricing[modelId];
    set({ modelPricing: pricing });
    await db.settings.put({ key: 'modelPricing', value: pricing });
  },

  // ---- Context management ----
  setContextWindowOverride: async (modelId, contextWindow) => {
    const overrides = { ...get().contextWindowOverrides, [modelId]: contextWindow };
    set({ contextWindowOverrides: overrides });
    await db.settings.put({ key: 'contextWindowOverrides', value: overrides });
  },

  removeContextWindowOverride: async (modelId) => {
    const overrides = { ...get().contextWindowOverrides };
    delete overrides[modelId];
    set({ contextWindowOverrides: overrides });
    await db.settings.put({ key: 'contextWindowOverrides', value: overrides });
  },

  toggleMessageExcluded: async (messageId) => {
    const messages = get().messages;
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    const updated: Message = { ...target, excludedFromContext: !target.excludedFromContext };
    await db.messages.put(updated);

    const chat = await db.chats.get(target.chatId);
    if (chat?.summaryUpToMessageId) {
      const chronological = await db.messages.where('chatId').equals(target.chatId).sortBy('timestamp');
      const targetIndex = chronological.findIndex((m) => m.id === messageId);
      const boundaryIndex = chronological.findIndex((m) => m.id === chat.summaryUpToMessageId);
      if (boundaryIndex === -1 || (targetIndex !== -1 && targetIndex <= boundaryIndex)) {
        await db.chats.update(target.chatId, { summaryContent: undefined, summaryUpToMessageId: undefined });
        set((state) => ({
          chats: state.chats.map((c) => c.id === target.chatId
            ? { ...c, summaryContent: undefined, summaryUpToMessageId: undefined }
            : c),
        }));
      }
    }

    set((state) => ({ messages: state.messages.map((m) => (m.id === messageId ? updated : m)) }));
  },

  toggleMessagePinned: async (messageId) => {
    const messages = get().messages;
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    const updated: Message = { ...target, pinnedInContext: !target.pinnedInContext };
    await db.messages.put(updated);
    set({ messages: messages.map((m) => (m.id === messageId ? updated : m)) });
  },

  updateChatMemoryNote: async (chatId, memoryNote) => {
    await db.chats.update(chatId, { memoryNote });
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, memoryNote } : c)),
    }));
  },

  updateChatHistoryWindowLimit: async (chatId, limit) => {
    const historyWindowLimit = limit ?? undefined;
    await db.chats.update(chatId, { historyWindowLimit });
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, historyWindowLimit } : c)),
    }));
  },

  summarizeChat: async (chatId, keepRecent = 6) => {
    if (get().summarizingChatId || get().activeGenerations[chatId]) return;
    set({ summarizingChatId: chatId });
    try {
      const messages = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
      const eligible = messagesEligibleForSummary(messages, keepRecent);
      if (eligible.length === 0) return;

      const chat = await db.chats.get(chatId);
      const modelId = chat?.modelId || get().activeModelId;
      const providerId = chat?.providerId || findProviderForModel(get().providers, modelId, get().activeProviderId)?.id || get().activeProviderId;
      const providerConfig = findProviderForModel(get().providers, modelId, providerId) || get().providers.custom;

      const transcript = eligible
        .map((m) => `${m.role}: ${getActiveMessageContent(m)}`)
        .join('\n');

      const summaryText = await streamChatCompletion(
        {
          providerConfig,
          modelId,
          messages: [{
            role: 'user',
            content: `Summarize the following conversation concisely, preserving facts, decisions, and open questions the assistant still needs to remember. Respond with the summary only, no preamble.\n\n${transcript}`,
          }],
          systemPrompt: 'You are a precise conversation summarizer.',
          temperature: 0.3,
        },
        () => {},
        () => {},
        new AbortController().signal
      );

      const summaryUpToMessageId = eligible[eligible.length - 1].id;
      await db.chats.update(chatId, { summaryContent: summaryText, summaryUpToMessageId });
      set((state) => ({
        chats: state.chats.map((c) => (c.id === chatId ? { ...c, summaryContent: summaryText, summaryUpToMessageId } : c)),
      }));
    } catch (error) {
      console.error('Failed to summarize chat:', error);
    } finally {
      set((state) => (state.summarizingChatId === chatId ? { summarizingChatId: null } : state));
    }
  },

  clearChatSummary: async (chatId) => {
    await db.chats.update(chatId, { summaryContent: undefined, summaryUpToMessageId: undefined });
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, summaryContent: undefined, summaryUpToMessageId: undefined } : c)),
    }));
  },

  // ---- Key encryption ----
  persistProviders: async () => {
    const { providers, keyEncryptionEnabled, sessionPassphrase } = get();

    if (keyEncryptionEnabled) {
      const stripped = stripProviderKeys(providers);
      if (sessionPassphrase) {
        const keyMap = Object.fromEntries(Object.entries(providers).map(([id, p]) => [id, p.apiKey || '']));
        const blob = await encryptString(JSON.stringify(keyMap), sessionPassphrase);
        await db.transaction('rw', db.settings, async () => {
          await db.settings.put({ key: 'providers', value: stripped });
          await db.settings.put({ key: 'encryptedKeys', value: blob });
        });
      } else {
        await db.settings.put({ key: 'providers', value: stripped });
      }
      return;
    }
    await db.settings.put({ key: 'providers', value: providers });
  },

  enableKeyEncryption: async (passphrase) => {
    if (!passphrase) return;
    const providers = get().providers;
    const keyMap = Object.fromEntries(Object.entries(providers).map(([id, provider]) => [id, provider.apiKey || '']));
    const blob = await encryptString(JSON.stringify(keyMap), passphrase);
    const stripped = stripProviderKeys(providers);
    await db.transaction('rw', db.settings, async () => {
      await db.settings.put({ key: 'keyEncryptionEnabled', value: true });
      await db.settings.put({ key: 'providers', value: stripped });
      await db.settings.put({ key: 'encryptedKeys', value: blob });
    });
    set({ keyEncryptionEnabled: true, sessionPassphrase: passphrase, keysLocked: false, unlockPromptOpen: false });
  },

  disableKeyEncryption: async () => {
    // Requires keys to be unlocked so we can write them back as plaintext.
    if (get().keysLocked) return;
    const providers = get().providers;
    await db.transaction('rw', db.settings, async () => {
      await db.settings.put({ key: 'keyEncryptionEnabled', value: false });
      await db.settings.delete('encryptedKeys');
      await db.settings.put({ key: 'providers', value: providers });
    });
    set({ keyEncryptionEnabled: false, sessionPassphrase: null, keysLocked: false, unlockPromptOpen: false });
  },

  unlockKeys: async (passphrase) => {
    const blob = (await db.settings.get('encryptedKeys'))?.value as EncryptedPayload | undefined;
    if (!blob) {
      set({ keysLocked: false, unlockPromptOpen: false });
      return true;
    }
    try {
      const json = await decryptString(blob, passphrase);
      const keyMap = JSON.parse(json) as Record<string, string>;
      const providers = { ...get().providers };
      for (const [id, key] of Object.entries(keyMap)) {
        if (providers[id]) providers[id] = { ...providers[id], apiKey: key };
      }
      set({ providers, keysLocked: false, unlockPromptOpen: false, sessionPassphrase: passphrase });
      return true;
    } catch {
      return false; // wrong passphrase (AES-GCM auth failure)
    }
  },
  dismissUnlockPrompt: () => set({ unlockPromptOpen: false }),
  openUnlockPrompt: () => {
    if (get().keysLocked) set({ unlockPromptOpen: true });
  },
  });
});
