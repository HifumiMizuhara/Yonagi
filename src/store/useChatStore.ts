import { create } from 'zustand';
import { db, type Chat, type Message, type MessageVariant, type Attachment, type ProviderConfig, type Citation, type TokenUsage, type PromptPreset, type ModelPrice } from '../services/db';
import { streamChatCompletion } from '../services/api';
import { encryptString, decryptString, type EncryptedPayload } from '../utils/crypto';

export interface SearchResult {
  chatId: string;
  chatTitle: string;
  messageId: string;
  role: string;
  snippet: string;
  timestamp: number;
}

interface ChatState {
  // Data State
  chats: Chat[];
  messages: Message[];
  activeChatId: string | null;
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

  // Key encryption State
  keyEncryptionEnabled: boolean;
  keysLocked: boolean;           // true when encryption is on but keys not yet unlocked
  sessionPassphrase: string | null; // held in memory only

  // UI State
  sidebarOpen: boolean;
  settingsOpen: boolean;
  searchOpen: boolean;
  isGenerating: boolean;
  abortController: AbortController | null;
  
  // Actions
  init: () => Promise<void>;
  updateSetting: (key: string, value: any) => Promise<void>;
  updateProvider: (providerId: string, config: Partial<ProviderConfig>) => Promise<void>;
  addProvider: (name: string, baseUrl: string) => Promise<void>;
  deleteProvider: (providerId: string) => Promise<void>;
  testProviderConnection: (providerId: string) => Promise<boolean>;
  addModelToProvider: (providerId: string, modelId: string) => Promise<void>;
  removeModelFromProvider: (providerId: string, modelId: string) => Promise<void>;
  fetchModelsForProvider: (providerId: string) => Promise<void>;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setActiveModelId: (modelId: string) => Promise<void>;
  generationId: string | null;
  setActiveEffort: (effort: string) => Promise<void>;
  setActiveWebSearch: (enabled: boolean) => Promise<void>;

  // Chat Actions
  loadChats: () => Promise<void>;
  selectChat: (chatId: string | null) => Promise<void>;
  createChat: (modelId?: string) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, title: string) => Promise<void>;
  clearAllChats: () => Promise<void>;
  createBranch: (messageIndex: number) => Promise<void>;
  
  // Messaging Actions
  sendMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  regenerateResponse: (messageIndex: number, targetModelId?: string) => Promise<void>;
  switchMessageVariant: (messageId: string, variantIndex: number) => Promise<void>;
  stopGeneration: () => void;
  toggleSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;

  // Search
  searchMessages: (query: string) => Promise<SearchResult[]>;

  // Prompt presets
  addPromptPreset: (name: string, content: string) => Promise<void>;
  updatePromptPreset: (id: string, name: string, content: string) => Promise<void>;
  deletePromptPreset: (id: string) => Promise<void>;

  // Pricing
  setModelPrice: (modelId: string, price: ModelPrice) => Promise<void>;
  removeModelPrice: (modelId: string) => Promise<void>;

  // Key encryption
  persistProviders: () => Promise<void>;
  enableKeyEncryption: (passphrase: string) => Promise<void>;
  disableKeyEncryption: () => Promise<void>;
  unlockKeys: (passphrase: string) => Promise<boolean>;
}

const DEFAULT_PROVIDERS: Record<string, ProviderConfig> = {
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    enabled: true,
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKey: '',
    models: ['gemini-1.5-flash', 'gemini-1.5-pro'],
    corsProxy: '',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    enabled: false,
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    models: ['gpt-4o-mini', 'gpt-4o'],
    corsProxy: '',
  },
  claude: {
    id: 'claude',
    name: 'Claude (Anthropic)',
    enabled: false,
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    models: ['claude-3-5-sonnet-20240620', 'claude-3-5-haiku-20241022'],
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

const DEFAULT_SETTINGS: Record<string, any> = {
  providers: DEFAULT_PROVIDERS,
  globalSystemPrompt: 'You are a helpful assistant.',
  theme: 'dark',
  language: 'ja',
  activeModelId: 'gemini-1.5-flash',
  activeEffort: 'none',
  activeWebSearch: false,
  sidebarOpen: 'true',
  promptPresets: [],
  modelPricing: {},
  keyEncryptionEnabled: false,
};

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messages: [],
  activeChatId: null,
  activeModelId: 'gemini-1.5-flash',
  activeEffort: 'none',
  activeWebSearch: false,

  providers: DEFAULT_PROVIDERS,
  globalSystemPrompt: 'You are a helpful assistant.',
  theme: 'dark',
  language: 'ja',
  promptPresets: [],
  modelPricing: {},

  keyEncryptionEnabled: false,
  keysLocked: false,
  sessionPassphrase: null,

  sidebarOpen: true,
  settingsOpen: false,
  searchOpen: false,
  isGenerating: false,
  abortController: null,
  generationId: null,

  init: async () => {
    // 1. Load settings from DB
    const settingsList = await db.settings.toArray();
    const settingsMap: Record<string, any> = {};
    settingsList.forEach(s => {
      settingsMap[s.key] = s.value;
    });

    const getSetting = (key: string) => {
      return settingsMap[key] !== undefined ? settingsMap[key] : DEFAULT_SETTINGS[key];
    };

    const theme = getSetting('theme');
    const activeModelId = getSetting('activeModelId');
    const activeEffort = getSetting('activeEffort') || 'none';
    const activeWebSearch = getSetting('activeWebSearch') === true || getSetting('activeWebSearch') === 'true';
    const sidebarOpenVal = getSetting('sidebarOpen');
    
    let loadedProviders = getSetting('providers');
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

    let loadedLanguage = getSetting('language');
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

    const promptPresets = getSetting('promptPresets') || [];
    const modelPricing = getSetting('modelPricing') || {};
    const keyEncryptionEnabled = getSetting('keyEncryptionEnabled') === true;
    const encryptedKeys = settingsMap['encryptedKeys'];
    // If encryption is on and an encrypted blob exists, keys live only inside it;
    // the providers loaded from DB have empty apiKey until the user unlocks.
    const keysLocked = keyEncryptionEnabled && !!encryptedKeys;

    set({
      providers: loadedProviders,
      globalSystemPrompt: getSetting('globalSystemPrompt'),
      theme,
      language: loadedLanguage,
      activeModelId,
      activeEffort,
      activeWebSearch,
      promptPresets,
      modelPricing,
      keyEncryptionEnabled,
      keysLocked,
      sessionPassphrase: null,
      sidebarOpen: sidebarOpenVal === 'true' || sidebarOpenVal === true,
    });

    // Apply theme
    get().setTheme(theme);

    // 2. Load chats list
    await get().loadChats();
  },

  updateSetting: async (key: string, value: any) => {
    await db.settings.put({ key, value });
    set({ [key]: value } as any);
    
    if (key === 'theme') {
      get().setTheme(value);
    }
  },

  updateProvider: async (providerId, config) => {
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

    let url = '';
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const corsPrefix = prov.corsProxy ? `${prov.corsProxy.replace(/\/$/, '')}/` : '';

    if (providerId === 'gemini') {
      if (!prov.apiKey) return false;
      url = `${corsPrefix}https://generativelanguage.googleapis.com/v1beta/models`;
      headers['x-goog-api-key'] = prov.apiKey;
    } else if (providerId === 'ollama') {
      url = `${corsPrefix}${prov.baseUrl.replace(/\/$/, '')}/api/tags`;
    } else if (providerId === 'claude') {
      if (!prov.apiKey) return false;
      url = `${corsPrefix}https://api.anthropic.com/v1/models`;
      headers['x-api-key'] = prov.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      // openai, deepseek, openrouter, custom
      if (!prov.baseUrl) return false;
      const base = prov.baseUrl.replace(/\/$/, '');
      const path = base.includes('/v1') ? '/models' : '/v1/models';
      url = `${corsPrefix}${base}${path}`;
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

    let url = '';
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const corsPrefix = prov.corsProxy ? `${prov.corsProxy.replace(/\/$/, '')}/` : '';

    if (providerId === 'gemini') {
      if (!prov.apiKey) throw new Error('APIキーが入力されていません。');
      url = `${corsPrefix}https://generativelanguage.googleapis.com/v1beta/models`;
      headers['x-goog-api-key'] = prov.apiKey;
    } else if (providerId === 'ollama') {
      url = `${corsPrefix}${prov.baseUrl.replace(/\/$/, '')}/api/tags`;
    } else if (providerId === 'claude') {
      if (!prov.apiKey) throw new Error('APIキーが入力されていません。');
      url = `${corsPrefix}https://api.anthropic.com/v1/models`;
      headers['x-api-key'] = prov.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      // openai, deepseek, openrouter, custom
      if (!prov.baseUrl) throw new Error('ベースURLが入力されていません。');
      const base = prov.baseUrl.replace(/\/$/, '');
      const path = base.includes('/v1') ? '/models' : '/v1/models';
      url = `${corsPrefix}${base}${path}`;
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
      try { text = await res.text(); } catch(_) {}
      throw new Error(`モデル一覧の取得に失敗しました (${res.status}): ${text || res.statusText}`);
    }

    const data = await res.json();
    let fetchedModels: string[] = [];

    if (providerId === 'gemini') {
      if (data.models && Array.isArray(data.models)) {
        fetchedModels = data.models
          .map((m: any) => m.name.replace(/^models\//, ''))
          .filter((name: string) => name.startsWith('gemini-'));
      }
    } else if (providerId === 'ollama') {
      if (data.models && Array.isArray(data.models)) {
        fetchedModels = data.models.map((m: any) => m.name);
      }
    } else if (providerId === 'claude') {
      if (data.data && Array.isArray(data.data)) {
        fetchedModels = data.data.map((m: any) => m.id);
      }
    } else {
      // openai, deepseek, openrouter, custom
      if (data.data && Array.isArray(data.data)) {
        fetchedModels = data.data.map((m: any) => m.id);
      }
    }

    if (fetchedModels.length === 0) {
      throw new Error('返されたモデルリストが空です。形式が合わないか、モデルがありません。');
    }

    await get().updateProvider(providerId, { models: fetchedModels });
  },

  setTheme: (theme) => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  },

  setActiveModelId: async (modelId) => {
    set({ activeModelId: modelId });
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
    set({ chats: chatsList });
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
        activeModelId: chat?.modelId || get().activeModelId,
        activeEffort: chat?.effort || 'none',
        activeWebSearch: chat?.webSearch ?? false,
      });
    } else {
      set({ messages: [] });
    }
  },

  createChat: async (modelId) => {
    const newChat: Chat = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      modelId: modelId || get().activeModelId,
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
    await db.chats.delete(chatId);
    await db.messages.where('chatId').equals(chatId).delete();
    
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

  renameChat: async (chatId, title) => {
    await db.chats.update(chatId, { title, updatedAt: Date.now() });
    await get().loadChats();
  },

  clearAllChats: async () => {
    await db.chats.clear();
    await db.messages.clear();
    set({ chats: [], messages: [], activeChatId: null });
  },

  sendMessage: async (content, attachments = []) => {
    let chatId = get().activeChatId;
    if (!chatId) {
      chatId = await get().createChat();
    }

    // 1. Create and save user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      chatId,
      role: 'user',
      content,
      attachments,
      timestamp: Date.now(),
    };

    await db.messages.add(userMsg);
    
    const activeChat = get().chats.find(c => c.id === chatId);
    if (activeChat && activeChat.title === 'New Chat') {
      const rawTitle = content.trim().slice(0, 30);
      const title = rawTitle ? (rawTitle + (content.length > 30 ? '...' : '')) : 'New Chat';
      await db.chats.update(chatId, { title });
    }
    
    await db.chats.update(chatId, { updatedAt: Date.now() });
    await get().loadChats();

    const messagesSoFar = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');
    set({ messages: messagesSoFar });

    // 2. Prepare Assistant response placeholder with initial variant
    const assistantMsgId = crypto.randomUUID();
    const activeModelId = activeChat?.modelId || get().activeModelId;
    
    const initialVariant: MessageVariant = {
      id: crypto.randomUUID(),
      content: '',
      thinking: '',
      modelUsed: activeModelId,
      timestamp: Date.now(),
    };

    const assistantMsg: Message = {
      id: assistantMsgId,
      chatId,
      role: 'assistant',
      content: '',
      thinking: '',
      modelUsed: activeModelId,
      timestamp: Date.now() + 1,
      variants: [initialVariant],
      activeVariantIndex: 0,
    };

    await db.messages.add(assistantMsg);
    
    set({ 
      messages: [...messagesSoFar, assistantMsg],
      isGenerating: true 
    });

    let providerConfig: ProviderConfig | undefined;

    // Search active model among enabled providers first
    for (const prov of Object.values(get().providers)) {
      if (prov.enabled && prov.models.includes(activeModelId)) {
        providerConfig = prov;
        break;
      }
    }

    if (!providerConfig) {
      for (const prov of Object.values(get().providers)) {
        if (prov.models.includes(activeModelId)) {
          providerConfig = prov;
          break;
        }
      }
    }

    if (!providerConfig) {
      providerConfig = get().providers.custom;
    }

    const controller = new AbortController();
    // Fix #2: generation token lets the finally block skip reset if a new generation already started
    const myGenId = crypto.randomUUID();
    set({ abortController: controller, generationId: myGenId });

    try {
      const systemPrompt = activeChat?.systemPrompt || get().globalSystemPrompt;
      const temperature = activeChat?.temperature ?? 0.7;

      // Extract text content from variants for context if variants exist
      const chatContext = messagesSoFar.map(m => {
        // Use active variant content if it's an assistant message and has variants
        let msgContent = m.content;
        if (m.role === 'assistant' && m.variants && m.activeVariantIndex !== undefined) {
          const activeVar = m.variants[m.activeVariantIndex];
          if (activeVar) msgContent = activeVar.content;
        }
        return {
          role: m.role,
          content: msgContent,
          attachments: m.attachments,
        };
      });

      let accumulatedText = '';
      let accumulatedThinking = '';
      let accumulatedCitations: Citation[] = [];
      let accumulatedUsage: TokenUsage | null = null;

      const applyUsage = async (usage: { inputTokens: number; outputTokens: number }) => {
        accumulatedUsage = { ...usage };
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id === assistantMsgId) {
              const updatedVariants = [...(m.variants || [])];
              const activeIndex = m.activeVariantIndex ?? 0;
              if (updatedVariants[activeIndex]) {
                updatedVariants[activeIndex] = { ...updatedVariants[activeIndex], usage: accumulatedUsage! };
              }
              return { ...m, usage: accumulatedUsage!, variants: updatedVariants };
            }
            return m;
          }),
        }));
        const targetMsg = get().messages.find(m => m.id === assistantMsgId);
        if (targetMsg) {
          await db.messages.update(assistantMsgId, { usage: accumulatedUsage!, variants: targetMsg.variants });
        }
      };

      await streamChatCompletion(
        {
          providerConfig,
          modelId: activeModelId,
          messages: chatContext,
          newMessage: { content, attachments },
          systemPrompt,
          temperature,
          effort: get().activeEffort,
          webSearch: get().activeWebSearch,
        },
        async (chunk) => {
          accumulatedText += chunk;

          set((state) => ({
            messages: state.messages.map((m) => {
              if (m.id === assistantMsgId) {
                const updatedVariants = [...(m.variants || [])];
                const activeIndex = m.activeVariantIndex ?? 0;
                if (updatedVariants[activeIndex]) {
                  updatedVariants[activeIndex] = {
                    ...updatedVariants[activeIndex],
                    content: accumulatedText,
                  };
                }
                return {
                  ...m,
                  content: accumulatedText,
                  variants: updatedVariants,
                };
              }
              return m;
            }),
          }));

          const targetMsg = get().messages.find(m => m.id === assistantMsgId);
          if (targetMsg) {
            await db.messages.update(assistantMsgId, { 
              content: accumulatedText,
              variants: targetMsg.variants,
            });
          }
        },
        async (thinkingChunk) => {
          accumulatedThinking += thinkingChunk;

          set((state) => ({
            messages: state.messages.map((m) => {
              if (m.id === assistantMsgId) {
                const updatedVariants = [...(m.variants || [])];
                const activeIndex = m.activeVariantIndex ?? 0;
                if (updatedVariants[activeIndex]) {
                  updatedVariants[activeIndex] = {
                    ...updatedVariants[activeIndex],
                    thinking: accumulatedThinking,
                  };
                }
                return {
                  ...m,
                  thinking: accumulatedThinking,
                  variants: updatedVariants,
                };
              }
              return m;
            }),
          }));

          const targetMsg = get().messages.find(m => m.id === assistantMsgId);
          if (targetMsg) {
            await db.messages.update(assistantMsgId, {
              thinking: accumulatedThinking,
              variants: targetMsg.variants,
            });
          }
        },
        controller.signal,
        async (citations) => {
          for (const c of citations) {
            if (!accumulatedCitations.some(e => e.url === c.url)) {
              accumulatedCitations.push(c);
            }
          }

          set((state) => ({
            messages: state.messages.map((m) => {
              if (m.id === assistantMsgId) {
                const updatedVariants = [...(m.variants || [])];
                const activeIndex = m.activeVariantIndex ?? 0;
                if (updatedVariants[activeIndex]) {
                  updatedVariants[activeIndex] = {
                    ...updatedVariants[activeIndex],
                    citations: [...accumulatedCitations],
                  };
                }
                return {
                  ...m,
                  citations: [...accumulatedCitations],
                  variants: updatedVariants,
                };
              }
              return m;
            }),
          }));

          const targetMsg = get().messages.find(m => m.id === assistantMsgId);
          if (targetMsg) {
            await db.messages.update(assistantMsgId, {
              citations: [...accumulatedCitations],
              variants: targetMsg.variants,
            });
          }
        },
        applyUsage
      );

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Generation aborted');
      } else {
        console.error('Error generating response:', error);
        const errMsg = `\n\n*(Error: ${error.message || 'Failed to generate response. Please check your API keys, network, or CORS settings.'})*`;
        
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id === assistantMsgId) {
              const updatedVariants = [...(m.variants || [])];
              const activeIndex = m.activeVariantIndex ?? 0;
              const newContent = m.content + errMsg;
              if (updatedVariants[activeIndex]) {
                updatedVariants[activeIndex] = {
                  ...updatedVariants[activeIndex],
                  content: newContent,
                };
              }
              return {
                ...m,
                content: newContent,
                variants: updatedVariants,
              };
            }
            return m;
          }),
        }));

        const targetMsg = get().messages.find(m => m.id === assistantMsgId);
        if (targetMsg) {
          await db.messages.update(assistantMsgId, { 
            content: targetMsg.content,
            variants: targetMsg.variants,
          });
        }
      }
    } finally {
      // Fix #2: only reset if no newer generation has taken over
      if (get().generationId === myGenId) {
        set({ isGenerating: false, abortController: null, generationId: null });
      }
      // Fix #11: guard DB writes so errors don't escape as uncaught rejections
      try {
        await db.chats.update(chatId, { updatedAt: Date.now() });
        await get().loadChats();
      } catch (e) {
        console.error('Failed to update chat metadata:', e);
      }
    }
  },

  regenerateResponse: async (messageIndex, targetModelId) => {
    const chatId = get().activeChatId;
    if (!chatId || messageIndex < 0 || messageIndex >= get().messages.length) return;

    // Fix #2: abort the old stream without resetting state; the old finally will see
    // a mismatched generationId and skip its reset, so the new generation runs cleanly.
    const existingController = get().abortController;
    if (existingController) existingController.abort();

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
    const newVariant: MessageVariant = {
      id: crypto.randomUUID(),
      content: '',
      thinking: '',
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
      modelUsed,
      variants: newVariants,
      activeVariantIndex: newActiveIndex,
    };

    await db.messages.put(updatedAssistantMsg);

    const updatedMessages = messages.map((m, idx) => 
      idx === messageIndex ? updatedAssistantMsg : m
    );
    set({ messages: updatedMessages, isGenerating: true });

    // 3. Prepare chat context up to the user message
    const messagesBefore = messages.slice(0, lastUserIndex + 1);
    const chatContext = messagesBefore.map(m => {
      let msgContent = m.content;
      if (m.role === 'assistant' && m.variants && m.activeVariantIndex !== undefined) {
        const activeVar = m.variants[m.activeVariantIndex];
        if (activeVar) msgContent = activeVar.content;
      }
      return {
        role: m.role,
        content: msgContent,
        attachments: m.attachments,
      };
    });

    let providerConfig: ProviderConfig | undefined;
    for (const prov of Object.values(get().providers)) {
      if (prov.enabled && prov.models.includes(modelUsed)) {
        providerConfig = prov;
        break;
      }
    }

    if (!providerConfig) {
      for (const prov of Object.values(get().providers)) {
        if (prov.models.includes(modelUsed)) {
          providerConfig = prov;
          break;
        }
      }
    }

    if (!providerConfig) {
      providerConfig = get().providers.custom;
    }

    const controller = new AbortController();
    const myGenId = crypto.randomUUID();
    set({ abortController: controller, generationId: myGenId });

    try {
      const activeChat = get().chats.find(c => c.id === chatId);
      const systemPrompt = activeChat?.systemPrompt || get().globalSystemPrompt;
      const temperature = activeChat?.temperature ?? 0.7;

      let accumulatedText = '';
      let accumulatedThinking = '';
      let accumulatedCitations: Citation[] = [];
      let accumulatedUsage: TokenUsage | null = null;

      const applyUsage = async (usage: { inputTokens: number; outputTokens: number }) => {
        accumulatedUsage = { ...usage };
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id === assistantMsg.id) {
              const updatedVariants = [...(m.variants || [])];
              if (updatedVariants[newActiveIndex]) {
                updatedVariants[newActiveIndex] = { ...updatedVariants[newActiveIndex], usage: accumulatedUsage! };
              }
              return { ...m, usage: accumulatedUsage!, variants: updatedVariants };
            }
            return m;
          }),
        }));
        const targetMsg = get().messages.find(m => m.id === assistantMsg.id);
        if (targetMsg) {
          await db.messages.update(assistantMsg.id, { usage: accumulatedUsage!, variants: targetMsg.variants });
        }
      };

      await streamChatCompletion(
        {
          providerConfig,
          modelId: modelUsed,
          // Fix #1: include the full context (with user message); newMessage is unused by prepareContext
          messages: chatContext,
          newMessage: { content: '', attachments: [] },
          systemPrompt,
          temperature,
          effort: get().activeEffort,
          webSearch: get().activeWebSearch,
        },
        async (chunk) => {
          accumulatedText += chunk;

          set((state) => ({
            messages: state.messages.map((m) => {
              if (m.id === assistantMsg.id) {
                const updatedVariants = [...(m.variants || [])];
                if (updatedVariants[newActiveIndex]) {
                  updatedVariants[newActiveIndex] = {
                    ...updatedVariants[newActiveIndex],
                    content: accumulatedText,
                  };
                }
                return {
                  ...m,
                  content: accumulatedText,
                  variants: updatedVariants,
                };
              }
              return m;
            }),
          }));

          const targetMsg = get().messages.find(m => m.id === assistantMsg.id);
          if (targetMsg) {
            await db.messages.update(assistantMsg.id, {
              content: accumulatedText,
              variants: targetMsg.variants,
            });
          }
        },
        async (thinkingChunk) => {
          accumulatedThinking += thinkingChunk;

          set((state) => ({
            messages: state.messages.map((m) => {
              if (m.id === assistantMsg.id) {
                const updatedVariants = [...(m.variants || [])];
                if (updatedVariants[newActiveIndex]) {
                  updatedVariants[newActiveIndex] = {
                    ...updatedVariants[newActiveIndex],
                    thinking: accumulatedThinking,
                  };
                }
                return {
                  ...m,
                  thinking: accumulatedThinking,
                  variants: updatedVariants,
                };
              }
              return m;
            }),
          }));

          const targetMsg = get().messages.find(m => m.id === assistantMsg.id);
          if (targetMsg) {
            await db.messages.update(assistantMsg.id, {
              thinking: accumulatedThinking,
              variants: targetMsg.variants,
            });
          }
        },
        controller.signal,
        async (citations) => {
          for (const c of citations) {
            if (!accumulatedCitations.some(e => e.url === c.url)) {
              accumulatedCitations.push(c);
            }
          }

          set((state) => ({
            messages: state.messages.map((m) => {
              if (m.id === assistantMsg.id) {
                const updatedVariants = [...(m.variants || [])];
                if (updatedVariants[newActiveIndex]) {
                  updatedVariants[newActiveIndex] = {
                    ...updatedVariants[newActiveIndex],
                    citations: [...accumulatedCitations],
                  };
                }
                return {
                  ...m,
                  citations: [...accumulatedCitations],
                  variants: updatedVariants,
                };
              }
              return m;
            }),
          }));

          const targetMsg = get().messages.find(m => m.id === assistantMsg.id);
          if (targetMsg) {
            await db.messages.update(assistantMsg.id, {
              citations: [...accumulatedCitations],
              variants: targetMsg.variants,
            });
          }
        },
        applyUsage
      );
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Regeneration aborted');
      } else {
        console.error('Error regenerating response:', error);
        const errMsg = `\n\n*(Error: ${error.message || 'Failed to generate response.'})*`;
        
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id === assistantMsg.id) {
              const updatedVariants = [...(m.variants || [])];
              const newContent = m.content + errMsg;
              if (updatedVariants[newActiveIndex]) {
                updatedVariants[newActiveIndex] = {
                  ...updatedVariants[newActiveIndex],
                  content: newContent,
                };
              }
              return {
                ...m,
                content: newContent,
                variants: updatedVariants,
              };
            }
            return m;
          }),
        }));

        const targetMsg = get().messages.find(m => m.id === assistantMsg.id);
        if (targetMsg) {
          await db.messages.update(assistantMsg.id, {
            content: targetMsg.content,
            variants: targetMsg.variants,
          });
        }
      }
    } finally {
      if (get().generationId === myGenId) {
        set({ isGenerating: false, abortController: null, generationId: null });
      }
      try {
        await db.chats.update(chatId, { updatedAt: Date.now() });
        await get().loadChats();
      } catch (e) {
        console.error('Failed to update chat metadata:', e);
      }
    }
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
      modelUsed: variant.modelUsed,
      citations: variant.citations || [],
      usage: variant.usage,
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
      modelId: activeChat.modelId,
      temperature: activeChat.temperature,
      effort: activeChat.effort,
      webSearch: activeChat.webSearch,
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
      modelUsed: m.modelUsed,
      timestamp: m.timestamp,
      variants: m.variants ? [...m.variants] : undefined,
      activeVariantIndex: m.activeVariantIndex,
    }));

    if (copiedMessages.length > 0) {
      await db.messages.bulkAdd(copiedMessages);
    }

    // 3. Reload list and select the new branched chat
    await get().loadChats();
    await get().selectChat(newChatId);
  },

  stopGeneration: () => {
    const controller = get().abortController;
    if (controller) {
      controller.abort();
    }
    set({ isGenerating: false, abortController: null, generationId: null });
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

  // ---- Search ----
  searchMessages: async (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const allMessages = await db.messages.toArray();
    const chatTitles: Record<string, string> = {};
    (await db.chats.toArray()).forEach((c) => { chatTitles[c.id] = c.title; });

    const results: SearchResult[] = [];
    for (const m of allMessages) {
      const content = m.content || '';
      const idx = content.toLowerCase().indexOf(q);
      if (idx === -1) continue;

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
    }

    results.sort((a, b) => b.timestamp - a.timestamp);
    return results.slice(0, 100);
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

  // ---- Key encryption ----
  persistProviders: async () => {
    const { providers, keyEncryptionEnabled, sessionPassphrase } = get();

    if (keyEncryptionEnabled && sessionPassphrase) {
      // Store providers without plaintext keys, and the keys in an encrypted blob.
      const keyMap: Record<string, string> = {};
      const stripped: Record<string, ProviderConfig> = {};
      for (const [id, p] of Object.entries(providers)) {
        keyMap[id] = p.apiKey || '';
        stripped[id] = { ...p, apiKey: '' };
      }
      const blob = await encryptString(JSON.stringify(keyMap), sessionPassphrase);
      await db.settings.put({ key: 'providers', value: stripped });
      await db.settings.put({ key: 'encryptedKeys', value: blob });
    } else {
      await db.settings.put({ key: 'providers', value: providers });
    }
  },

  enableKeyEncryption: async (passphrase) => {
    if (!passphrase) return;
    set({ keyEncryptionEnabled: true, sessionPassphrase: passphrase, keysLocked: false });
    await db.settings.put({ key: 'keyEncryptionEnabled', value: true });
    await get().persistProviders(); // writes encrypted blob + stripped providers
  },

  disableKeyEncryption: async () => {
    // Requires keys to be unlocked so we can write them back as plaintext.
    if (get().keysLocked) return;
    set({ keyEncryptionEnabled: false, sessionPassphrase: null, keysLocked: false });
    await db.settings.put({ key: 'keyEncryptionEnabled', value: false });
    await db.settings.delete('encryptedKeys');
    await get().persistProviders(); // writes plaintext providers
  },

  unlockKeys: async (passphrase) => {
    const blob = (await db.settings.get('encryptedKeys'))?.value as EncryptedPayload | undefined;
    if (!blob) {
      set({ keysLocked: false });
      return true;
    }
    try {
      const json = await decryptString(blob, passphrase);
      const keyMap = JSON.parse(json) as Record<string, string>;
      const providers = { ...get().providers };
      for (const [id, key] of Object.entries(keyMap)) {
        if (providers[id]) providers[id] = { ...providers[id], apiKey: key };
      }
      set({ providers, keysLocked: false, sessionPassphrase: passphrase });
      return true;
    } catch {
      return false; // wrong passphrase (AES-GCM auth failure)
    }
  },
}));
