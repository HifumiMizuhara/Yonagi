import test from 'node:test';
import assert from 'node:assert/strict';
import type { Message } from '../src/services/db.ts';
import {
  buildContextMessages,
  estimateContextUsage,
  messagesEligibleForSummary,
} from '../src/utils/contextBuilder.ts';

const msg = (id: string, overrides: Partial<Message> = {}): Message => ({
  id,
  chatId: 'chat-1',
  role: 'user',
  content: id,
  timestamp: Number(id.replace(/\D/g, '')) || 0,
  ...overrides,
});

test('buildContextMessages drops excluded messages', () => {
  const messages = [msg('m1'), msg('m2', { excludedFromContext: true }), msg('m3')];
  const result = buildContextMessages(messages, {});
  assert.deepEqual(result.map((m) => m.id), ['m1', 'm3']);
});

test('buildContextMessages applies a history window while keeping pinned messages', () => {
  const messages = [
    msg('m1', { pinnedInContext: true }),
    msg('m2'),
    msg('m3'),
    msg('m4'),
    msg('m5'),
  ];
  const result = buildContextMessages(messages, { historyWindowLimit: 2 });
  // pinned m1 survives, plus the last 2 non-pinned messages (m4, m5)
  assert.deepEqual(result.map((m) => m.id), ['m1', 'm4', 'm5']);
});

test('buildContextMessages substitutes a summary for older messages', () => {
  const messages = [msg('m1'), msg('m2', { pinnedInContext: true }), msg('m3'), msg('m4')];
  const result = buildContextMessages(messages, {
    summaryContent: 'earlier discussion recap',
    summaryUpToMessageId: 'm3',
  });
  // The summary itself is merged into the provider-level system prompt by the
  // caller; only pinned messages inside the summarized range remain verbatim.
  assert.deepEqual(result.map((m) => m.id), ['m2', 'm4']);
});

test('estimateContextUsage computes a usage ratio against the context window', () => {
  const messages = [msg('m1', { content: 'hello world' })];
  const usage = estimateContextUsage(messages, 'system prompt', undefined, 100, (m) => m.content);
  assert.ok(usage.estimatedTokens > 0);
  assert.equal(usage.contextWindow, 100);
  assert.ok(usage.usageRatio > 0 && usage.usageRatio < 1);
});

test('estimateContextUsage includes summary content', () => {
  const withoutSummary = estimateContextUsage([], '', undefined, 100, (m) => m.content);
  const withSummary = estimateContextUsage([], '', undefined, 100, (m) => m.content, 'a retained summary');
  assert.ok(withSummary.estimatedTokens > withoutSummary.estimatedTokens);
});

test('messagesEligibleForSummary keeps recent messages and skips pinned/excluded ones', () => {
  const messages = [
    msg('m1'),
    msg('m2', { pinnedInContext: true }),
    msg('m3'),
    msg('m4', { excludedFromContext: true }),
    msg('m5'),
  ];
  const eligible = messagesEligibleForSummary(messages, 1);
  // keepRecent=1 keeps the last non-pinned/non-excluded candidate (m5); m1 and m3 are eligible
  assert.deepEqual(eligible.map((m) => m.id), ['m1', 'm3']);
});
