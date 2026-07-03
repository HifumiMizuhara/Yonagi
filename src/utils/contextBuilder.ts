import type { Message } from '../services/db.ts';
import { estimateTokens } from './tokens.ts';

/** Prefix marking the id of a synthetic summary message injected in place of older history. */
export const SUMMARY_MESSAGE_PREFIX = 'summary:';

const isSummaryPlaceholder = (id: string) => id.startsWith(SUMMARY_MESSAGE_PREFIX);

export interface ContextBuildOptions {
  memoryNote?: string;
  historyWindowLimit?: number;
  summaryContent?: string;
  summaryUpToMessageId?: string;
}

/**
 * Applies exclude, summary-substitution, and history-window rules to a
 * chronologically-sorted message list, producing the array that should
 * actually be sent to the model. Pure function — no DB/store access.
 */
export function buildContextMessages(messages: Message[], options: ContextBuildOptions): Message[] {
  let working = messages.filter((m) => !m.excludedFromContext);

  if (options.summaryContent && options.summaryUpToMessageId) {
    const idx = working.findIndex((m) => m.id === options.summaryUpToMessageId);
    if (idx !== -1) {
      const before = working.slice(0, idx + 1);
      const after = working.slice(idx + 1);
      const pinnedBefore = before.filter((m) => m.pinnedInContext);
      const summaryMessage: Message = {
        id: `${SUMMARY_MESSAGE_PREFIX}${options.summaryUpToMessageId}`,
        chatId: working[0]?.chatId ?? '',
        role: 'system',
        content: `[Summary of earlier conversation]\n${options.summaryContent}`,
        timestamp: 0,
      };
      working = [summaryMessage, ...pinnedBefore, ...after];
    }
  }

  const limit = options.historyWindowLimit;
  if (limit && limit > 0) {
    const protectedIds = new Set(
      working.filter((m) => m.pinnedInContext || isSummaryPlaceholder(m.id)).map((m) => m.id)
    );
    const rest = working.filter((m) => !protectedIds.has(m.id));
    const keptRestIds = new Set(rest.slice(-limit).map((m) => m.id));
    working = working.filter((m) => protectedIds.has(m.id) || keptRestIds.has(m.id));
  }

  return working;
}

export interface ContextUsage {
  estimatedTokens: number;
  contextWindow: number;
  usageRatio: number;
}

/** Estimates how much of the model's context window the given payload would use. */
export function estimateContextUsage(
  messages: Message[],
  systemPrompt: string,
  memoryNote: string | undefined,
  contextWindow: number,
  getContent: (message: Message) => string
): ContextUsage {
  const text = systemPrompt + (memoryNote || '') + messages.map(getContent).join('\n');
  const estimatedTokens = estimateTokens(text);
  return {
    estimatedTokens,
    contextWindow,
    usageRatio: contextWindow > 0 ? estimatedTokens / contextWindow : 0,
  };
}

/**
 * Selects the messages that would be folded into a new summary if the user
 * triggers summarization now: everything except pinned/excluded messages and
 * the most recent `keepRecent` messages, which stay verbatim.
 */
export function messagesEligibleForSummary(messages: Message[], keepRecent: number): Message[] {
  const candidates = messages.filter((m) => !m.excludedFromContext && !m.pinnedInContext && !isSummaryPlaceholder(m.id));
  if (candidates.length <= keepRecent) return [];
  return candidates.slice(0, candidates.length - keepRecent);
}
