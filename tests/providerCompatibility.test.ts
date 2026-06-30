import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApiUrl,
  getClaudeThinkingConfig,
  getGeminiThinkingConfig,
  migrateProviderModels,
  normalizeOpenAiEffort,
  parseSseDataLine,
  replaceRetiredModel,
  stripProviderKeys,
  supportsOpenAiReasoning,
} from '../src/utils/providerCompatibility.ts';

test('buildApiUrl handles versioned bases and full endpoints', () => {
  assert.equal(buildApiUrl('https://api.openai.com', 'v1', 'chat/completions'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(buildApiUrl('https://proxy.example/v1', 'v1', 'models'), 'https://proxy.example/v1/models');
  assert.equal(buildApiUrl('https://proxy.example/v1/chat/completions', 'v1', 'models'), 'https://proxy.example/v1/models');
  assert.equal(buildApiUrl('https://v1.example.com', 'v1', 'models'), 'https://v1.example.com/v1/models');
});

test('Gemini streaming lines and model-specific thinking are normalized', () => {
  assert.equal(parseSseDataLine('data: {"ok":true}'), '{"ok":true}');
  assert.equal(parseSseDataLine('data: [DONE]'), null);
  assert.deepEqual(getGeminiThinkingConfig('gemini-2.5-flash', 'low'), {
    thinkingBudget: 2048,
    includeThoughts: true,
  });
  assert.deepEqual(getGeminiThinkingConfig('gemini-3.5-flash', 'minimal'), {
    thinkingLevel: 'minimal',
    includeThoughts: true,
  });
});

test('Claude adaptive and manual thinking remain valid', () => {
  const adaptive = getClaudeThinkingConfig('claude-sonnet-4-6', 'xhigh');
  assert.deepEqual(adaptive.thinking, { type: 'adaptive', display: 'summarized' });
  assert.deepEqual(adaptive.outputConfig, { effort: 'high' });

  const manual = getClaudeThinkingConfig('claude-haiku-4-5-20251001', 'max');
  assert.equal(manual.thinking?.type, 'enabled');
  assert.ok((manual.thinking?.budget_tokens ?? 0) < manual.maxTokens);
});

test('OpenAI reasoning capabilities clamp unsupported effort', () => {
  assert.equal(supportsOpenAiReasoning('gpt-5.2'), true);
  assert.equal(supportsOpenAiReasoning('o4-mini'), true);
  assert.equal(supportsOpenAiReasoning('gpt-4.1-mini'), false);
  assert.equal(supportsOpenAiReasoning('openai/gpt-4.1-mini'), false);
  assert.equal(normalizeOpenAiEffort('gpt-5.1', 'xhigh'), 'high');
  assert.equal(normalizeOpenAiEffort('gpt-5.2', 'xhigh'), 'xhigh');
});

test('retired default models are migrated without duplicates', () => {
  assert.equal(replaceRetiredModel('gemini-1.5-flash'), 'gemini-3.5-flash');
  const migrated = migrateProviderModels({
    gemini: { models: ['gemini-1.5-flash', 'gemini-3.5-flash'], enabled: true },
  });
  assert.deepEqual(migrated.gemini.models, ['gemini-3.5-flash']);
  assert.equal(migrated.gemini.enabled, true);
});

test('encrypted provider persistence always strips plaintext keys', () => {
  const stripped = stripProviderKeys({
    openai: { apiKey: 'sk-secret', models: ['gpt-5.2'] },
  });
  assert.equal(stripped.openai.apiKey, '');
  assert.deepEqual(stripped.openai.models, ['gpt-5.2']);
});
