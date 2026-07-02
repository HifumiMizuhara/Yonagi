import type { Chat, Message } from '../services/db';

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function estimateObjectBytes(value: unknown): number {
  try {
    return utf8ByteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
}

export function estimateMessageBytes(message: Message): number {
  return estimateObjectBytes(message);
}

export function estimateChatBytes(chat: Chat): number {
  return estimateObjectBytes(chat);
}

export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  const rounded = value >= 100 || unitIndex === 0
    ? Math.round(value).toString()
    : value.toFixed(fractionDigits);
  return `${rounded} ${units[unitIndex]}`;
}

export function formatPercent(part: number, total: number): string {
  if (!total) return '0%';
  return `${Math.min(100, Math.round((part / total) * 100))}%`;
}
