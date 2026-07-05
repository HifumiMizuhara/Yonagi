import Dexie, { type Table } from 'dexie';

export interface Folder {
  id: string;
  name: string;
  color: string;
  order: number;
  systemPrompt?: string;
  providerId?: string;
  modelId?: string;
  knowledgeFiles?: Array<{ name: string; content: string; size: number }>;
}

export interface Chat {
  id: string;
  title: string;
  systemPrompt?: string;
  providerId?: string;
  modelId: string;
  temperature: number;
  createdAt: number;
  updatedAt: number;
  effort?: string;
  webSearch?: boolean;
  folderId?: string;
  deletedAt?: number;
  // Context management
  memoryNote?: string; // persistent note injected into every request, independent of systemPrompt
  historyWindowLimit?: number; // max non-pinned messages sent as context; unset = unlimited
  summaryContent?: string; // LLM-generated summary standing in for older messages
  summaryUpToMessageId?: string; // last message id covered by summaryContent
}

export interface Attachment {
  name: string;
  type: 'image' | 'pdf' | 'text';
  content: string; // base64 data URL for images, raw text for text/pdf
  size: number;
}

export interface Citation {
  url: string;
  title?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  responseModel?: string;
  providerReportedCost?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  reasoningTokens?: number;
  estimated?: boolean; // true when derived locally (no API usage returned)
}

export interface MessageVariant {
  id: string;
  content: string;
  thinking?: string;
  modelProviderId?: string;
  modelUsed?: string;
  timestamp: number;
  citations?: Citation[];
  usage?: TokenUsage;
  error?: string;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Attachment[];
  modelProviderId?: string;
  modelUsed?: string;
  timestamp: number;
  variants?: MessageVariant[];
  activeVariantIndex?: number;
  thinking?: string;
  citations?: Citation[];
  usage?: TokenUsage;
  error?: string;
  // Context management
  excludedFromContext?: boolean; // kept in the UI but skipped when building the API payload
  pinnedInContext?: boolean; // always sent even if the history window/summary would otherwise drop it
}

export interface PromptPreset {
  id: string;
  name: string;
  content: string;
}

export interface ModelPrice {
  input: number;  // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface ProviderConfig {
  id: string; // 'gemini' | 'openai' | 'claude' | 'deepseek' | 'ollama' | 'custom'
  name: string;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  models: string[];
  corsProxy: string;
}

class YonagiDatabase extends Dexie {
  chats!: Table<Chat, string>;
  messages!: Table<Message, string>;
  settings!: Table<Setting, string>;
  folders!: Table<Folder, string>;

  constructor() {
    // Keep the historical IndexedDB name (predates the Himawari -> Yonagi rebrand) so existing local data remains readable.
    super('MinaseDatabase');
    this.version(1).stores({
      chats: 'id, title, modelId, createdAt, updatedAt',
      messages: 'id, chatId, role, timestamp',
      settings: 'key',
    });
    this.version(2).stores({
      chats: 'id, title, providerId, modelId, createdAt, updatedAt',
      messages: 'id, chatId, role, timestamp',
      settings: 'key',
    });
    this.version(3).stores({
      chats: 'id, title, providerId, modelId, createdAt, updatedAt, folderId',
      messages: 'id, chatId, role, timestamp',
      settings: 'key',
      folders: 'id, name, order',
    });
    this.version(4).stores({
      chats: 'id, title, providerId, modelId, createdAt, updatedAt, folderId, deletedAt',
      messages: 'id, chatId, role, timestamp',
      settings: 'key',
      folders: 'id, name, order',
    });
  }
}

export const db = new YonagiDatabase();
