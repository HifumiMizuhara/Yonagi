import { create } from 'zustand';
import { db, type Chat, type Message, type Attachment } from '../services/db';
import { streamChatCompletion } from '../services/api';

interface ChatState {
  // Data State
  chats: Chat[];
  messages: Message[];
  activeChatId: string | null;
  activeModelId: string;
  
  // Settings State
  geminiKey: string;
  openaiKey: string;
  claudeKey: string;
  customEndpoint: string;
  customKey: string;
  customModels: string[];
  corsProxy: string;
  globalSystemPrompt: string;
  theme: 'light' | 'dark' | 'system';
  
  // UI State
  sidebarOpen: boolean;
  settingsOpen: boolean;
  isGenerating: boolean;
  abortController: AbortController | null;
  
  // Actions
  init: () => Promise<void>;
  updateSetting: (key: string, value: any) => Promise<void>;
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

// Helpers for settings DB mapping
const DEFAULT_SETTINGS: Record<string, any> = {
  geminiKey: '',
  openaiKey: '',
  claudeKey: '',
  customEndpoint: '',
  customKey: '',
  customModels: ['llama3', 'gemma2', 'phi3'],
  corsProxy: '',
  globalSystemPrompt: 'You are a helpful assistant.',
  theme: 'dark',
  activeModelId: 'gemini-1.5-flash',
  sidebarOpen: 'true',
};

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  messages: [],
  activeChatId: null,
  activeModelId: 'gemini-1.5-flash',
  
  geminiKey: '',
  openaiKey: '',
  claudeKey: '',
  customEndpoint: '',
  customKey: '',
  customModels: ['llama3', 'gemma2', 'phi3'],
  corsProxy: '',
  globalSystemPrompt: 'You are a helpful assistant.',
  theme: 'dark',
  
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

    set({
      geminiKey: getSetting('geminiKey'),
      openaiKey: getSetting('openaiKey'),
      claudeKey: getSetting('claudeKey'),
      customEndpoint: getSetting('customEndpoint'),
      customKey: getSetting('customKey'),
      customModels: getSetting('customModels'),
      corsProxy: getSetting('corsProxy'),
      globalSystemPrompt: getSetting('globalSystemPrompt'),
      theme,
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
    
    // Update local chat title if it's the first message
    const activeChat = get().chats.find(c => c.id === chatId);
    if (activeChat && activeChat.title === 'New Chat') {
      const rawTitle = content.trim().slice(0, 30);
      const title = rawTitle ? (rawTitle + (content.length > 30 ? '...' : '')) : 'New Chat';
      await db.chats.update(chatId, { title });
    }
    
    await db.chats.update(chatId, { updatedAt: Date.now() });
    await get().loadChats();

    // Refresh messages array from db
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
      timestamp: Date.now() + 1, // Ensure it's after user message
    };

    await db.messages.add(assistantMsg);
    
    // Add to UI state immediately
    set({ 
      messages: [...messagesSoFar, assistantMsg],
      isGenerating: true 
    });

    // 3. Initiate API Call
    const controller = new AbortController();
    set({ abortController: controller });

    try {
      const keys = {
        gemini: get().geminiKey,
        openai: get().openaiKey,
        claude: get().claudeKey,
        custom: get().customKey,
      };

      const customEndpoint = get().customEndpoint;
      const corsProxy = get().corsProxy;
      const systemPrompt = activeChat?.systemPrompt || get().globalSystemPrompt;
      const temperature = activeChat?.temperature ?? 0.7;

      // Extract system instructions and construct conversation context
      const chatContext = messagesSoFar.map(m => {
        // Handle image attachment formatting for APIs if applicable
        return {
          role: m.role,
          content: m.content,
          attachments: m.attachments,
        };
      });

      let accumulatedText = '';
      
      await streamChatCompletion(
        {
          modelId: assistantMsg.modelUsed || get().activeModelId,
          messages: chatContext,
          newMessage: { content, attachments },
          systemPrompt,
          temperature,
          keys,
          customEndpoint,
          corsProxy,
          customModels: get().customModels,
        },
        async (chunk) => {
          accumulatedText += chunk;
          
          // Update Zustand UI state reactively
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
            ),
          }));

          // Debounced or direct update to IndexedDB to avoid excessive writes
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

    // Stop current generation if any
    get().stopGeneration();

    const messages = [...get().messages];
    
    // We expect the target to be an assistant message, and we truncate everything from this index onwards
    // Find the last user message before this index
    let lastUserIndex = -1;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) return;

    // Delete messages from index onwards in DB
    const idsToDelete = messages.slice(lastUserIndex + 1).map(m => m.id);
    await db.messages.bulkDelete(idsToDelete);

    // Grab user content
    const userMsg = messages[lastUserIndex];

    // Reset messages in state to only include everything up to userMsg
    const truncatedMessages = messages.slice(0, lastUserIndex + 1);
    set({ messages: truncatedMessages });

    // Call sendMessage with user content
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
