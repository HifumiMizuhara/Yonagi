import { db, type Message } from '../services/db';
import {
  estimateChatBytes,
  estimateMessageBytes,
  estimateObjectBytes,
} from './storageSize';

export interface ChatStorageEntry {
  chatId: string;
  title: string;
  updatedAt: number;
  chatBytes: number;
  messageBytes: number;
  totalBytes: number;
  messageCount: number;
}

export interface StorageSummary {
  chats: ChatStorageEntry[];
  chatDataBytes: number;
  settingsBytes: number;
  foldersBytes: number;
  totalAppBytes: number;
  browserUsage?: number;
  browserQuota?: number;
}

export async function getBrowserStorageEstimate(): Promise<{ usage?: number; quota?: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return {};
  }
  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage,
      quota: estimate.quota,
    };
  } catch {
    return {};
  }
}

export async function computeStorageSummary(): Promise<StorageSummary> {
  const [chats, allMessages, settings, folders] = await Promise.all([
    db.chats.toArray(),
    db.messages.toArray(),
    db.settings.toArray(),
    db.folders.toArray(),
  ]);

  const messagesByChat = new Map<string, Message[]>();
  for (const msg of allMessages) {
    const list = messagesByChat.get(msg.chatId) ?? [];
    list.push(msg);
    messagesByChat.set(msg.chatId, list);
  }

  const chatEntries: ChatStorageEntry[] = chats.map((chat) => {
    const messages = messagesByChat.get(chat.id) ?? [];
    const chatBytes = estimateChatBytes(chat);
    const messageBytes = messages.reduce((sum, message) => sum + estimateMessageBytes(message), 0);
    return {
      chatId: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
      chatBytes,
      messageBytes,
      totalBytes: chatBytes + messageBytes,
      messageCount: messages.length,
    };
  });

  chatEntries.sort((a, b) => b.totalBytes - a.totalBytes);

  const chatDataBytes = chatEntries.reduce((sum, entry) => sum + entry.totalBytes, 0);
  const settingsBytes = settings.reduce((sum, setting) => sum + estimateObjectBytes(setting), 0);
  const foldersBytes = folders.reduce((sum, folder) => sum + estimateObjectBytes(folder), 0);
  const totalAppBytes = chatDataBytes + settingsBytes + foldersBytes;
  const browser = await getBrowserStorageEstimate();

  return {
    chats: chatEntries,
    chatDataBytes,
    settingsBytes,
    foldersBytes,
    totalAppBytes,
    browserUsage: browser.usage,
    browserQuota: browser.quota,
  };
}
