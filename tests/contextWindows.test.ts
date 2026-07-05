import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONTEXT_WINDOWS, FALLBACK_CONTEXT_WINDOW, resolveContextWindow } from '../src/utils/contextWindows.ts';

test('resolveContextWindow matches exact and substring model ids', () => {
  assert.equal(resolveContextWindow('gpt-4o'), DEFAULT_CONTEXT_WINDOWS['gpt-4o']);
  assert.equal(resolveContextWindow('claude-3-5-sonnet-20241022'), DEFAULT_CONTEXT_WINDOWS['claude-3-5-sonnet']);
  assert.equal(resolveContextWindow('openrouter/anthropic/claude-3-5-sonnet'), DEFAULT_CONTEXT_WINDOWS['claude-3-5-sonnet']);
});

test('resolveContextWindow falls back for unknown models', () => {
  assert.equal(resolveContextWindow('some-unknown-custom-model'), FALLBACK_CONTEXT_WINDOW);
  assert.equal(resolveContextWindow(''), FALLBACK_CONTEXT_WINDOW);
});

test('resolveContextWindow honors a user-supplied override table', () => {
  const table = { ...DEFAULT_CONTEXT_WINDOWS, 'my-custom-model': 32_000 };
  assert.equal(resolveContextWindow('my-custom-model', table), 32_000);
});

test('callers can merge overrides without discarding defaults', () => {
  const table = { ...DEFAULT_CONTEXT_WINDOWS, 'gpt-4o': 64_000 };
  assert.equal(resolveContextWindow('gpt-4o', table), 64_000);
  assert.equal(resolveContextWindow('gemini-2.5-pro', table), DEFAULT_CONTEXT_WINDOWS['gemini-2.5-pro']);
});
