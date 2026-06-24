import { create } from 'zustand';
import { db, type Chat, type Message, type Attachment, type ProviderConfig } from '../services/db';
import { streamChatCompletion } from '../services/api';

interface ChatState {
  // Data State
  chats: Chat[];
  messages: Message[];
  activeChatId: string | null;
  activeModelId: string;
  
  // Settings State
  providers: Record<string, ProviderConfig>;
  globalSystemPrompt: string;
  theme: 'light' | 'dark' | 'system';
  language: 'ja' | 'en' | 'zh';
  
  // UI State
  sidebarOpen: boolean;
  settingsOpen: boolean;
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
  setActiveModelId: (modelId: string) => void;
  
  // Chat Actions
  loadChats: () => Promise<void>;
  selectChat: (chatId: string | null) => Promise<void>;
  createChat: (modelId?: string) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, title: string) => Promise<void>;
  clearAllChats: () => Promise<void>;
  
  // Messaging Actions
  sendMessage: (content: string, attachments?: Attachment[]) => Promise<void>;
  regenerateResponse: (messageIndex: number) => Promise<void>;
  stopGeneration: () => void;
  toggleSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
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
  sidebarOpen: 'true',
};

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messages: [],
  activeChatId: null,
  activeModelId: 'gemini-1.5-flash',
  
  providers: DEFAULT_PROVIDERS,
  globalSystemPrompt: 'You are a helpful assistant.',
  theme: 'dark',
  language: 'ja',
  
  sidebarOpen: true,
  settingsOpen: false,
  isGenerating: false,
  abortController: null,

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
    const sidebarOpenVal = getSetting('sidebarOpen');
    
    let loadedProviders = getSetting('providers');
    if (!loadedProviders || typeof loadedProviders !== 'object') {
      loadedProviders = DEFAULT_PROVIDERS;
    } else {
      // Merge with default config to ensure missing keys are populated
      Object.keys(DEFAULT_PROVIDERS).forEach((key) => {
        if (!loadedProviders[key]) {
          loadedProviders[key] = DEFAULT_PROVIDERS[key];
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

    set({
      providers: loadedProviders,
      globalSystemPrompt: getSetting('globalSystemPrompt'),
      theme,
      language: loadedLanguage,
      activeModelId,
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
    await db.settings.put({ key: 'providers', value: currentProviders });
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
    await db.settings.put({ key: 'providers', value: currentProviders });
  },

  deleteProvider: async (providerId) => {
    const protectedIds = ['gemini', 'openai', 'claude', 'deepseek', 'openrouter', 'ollama', 'custom'];
    if (protectedIds.includes(providerId)) return;

    const currentProviders = { ...get().providers };
    delete currentProviders[providerId];

    set({ providers: currentProviders });
    await db.settings.put({ key: 'providers', value: currentProviders });
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
      url = `${corsPrefix}https://generativelanguage.googleapis.com/v1beta/models?key=${prov.apiKey}`;
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
      url = `${corsPrefix}https://generativelanguage.googleapis.com/v1beta/models?key=${prov.apiKey}`;
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

  loadChats: async () => {
    const chatsList = await db.chats.orderBy('updatedAt').reverse().toArray();
    set({ chats: chatsList });
  },

  selectChat: async (chatId) => {
    set({ activeChatId: chatId });
    if (chatId) {
      const chatMessages = await db.messages
        .where('chatId')
        .equals(chatId)
        .sortBy('timestamp');
      set({ messages: chatMessages });
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

    // 2. Prepare Assistant response placeholder
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantMsgId,
      chatId,
      role: 'assistant',
      content: '',
      modelUsed: activeChat?.modelId || get().activeModelId,
      timestamp: Date.now() + 1,
    };

    await db.messages.add(assistantMsg);
    
    set({ 
      messages: [...messagesSoFar, assistantMsg],
      isGenerating: true 
    });

    const activeModelId = assistantMsg.modelUsed || get().activeModelId;
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
    set({ abortController: controller });

    try {
      const systemPrompt = activeChat?.systemPrompt || get().globalSystemPrompt;
      const temperature = activeChat?.temperature ?? 0.7;

      const chatContext = messagesSoFar.map(m => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
      }));

      let accumulatedText = '';
      
      await streamChatCompletion(
        {
          providerConfig,
          modelId: activeModelId,
          messages: chatContext,
          newMessage: { content, attachments },
          systemPrompt,
          temperature,
        },
        async (chunk) => {
          accumulatedText += chunk;
          
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
            ),
          }));

          await db.messages.update(assistantMsgId, { content: accumulatedText });
        },
        controller.signal
      );

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Generation aborted');
      } else {
        console.error('Error generating response:', error);
        const errMsg = `\n\n*(Error: ${error.message || 'Failed to generate response. Please check your API keys, network, or CORS settings.'})*`;
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === assistantMsgId ? { ...m, content: m.content + errMsg } : m
          ),
        }));
        await db.messages.update(assistantMsgId, { 
          content: (get().messages.find(m => m.id === assistantMsgId)?.content || '') + errMsg 
        });
      }
    } finally {
      set({ isGenerating: false, abortController: null });
      await db.chats.update(chatId, { updatedAt: Date.now() });
      await get().loadChats();
    }
  },

  regenerateResponse: async (messageIndex) => {
    const chatId = get().activeChatId;
    if (!chatId || messageIndex < 0 || messageIndex >= get().messages.length) return;

    get().stopGeneration();

    const messages = [...get().messages];
    let lastUserIndex = -1;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) return;

    const idsToDelete = messages.slice(lastUserIndex + 1).map(m => m.id);
    await db.messages.bulkDelete(idsToDelete);

    const userMsg = messages[lastUserIndex];

    const truncatedMessages = messages.slice(0, lastUserIndex + 1);
    set({ messages: truncatedMessages });

    await get().sendMessage(userMsg.content, userMsg.attachments);
  },

  stopGeneration: () => {
    const controller = get().abortController;
    if (controller) {
      controller.abort();
    }
    set({ isGenerating: false, abortController: null });
  },

  toggleSidebar: async () => {
    const newVal = !get().sidebarOpen;
    set({ sidebarOpen: newVal });
    await db.settings.put({ key: 'sidebarOpen', value: newVal ? 'true' : 'false' });
  },

  setSettingsOpen: (open) => {
    set({ settingsOpen: open });
  },
}));
