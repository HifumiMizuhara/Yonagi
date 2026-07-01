export function supportsOpenAiReasoning(modelId: string) {
  const lower = modelId.toLowerCase();
  const unqualified = lower.split('/').pop() || lower;
  return /^o(?:1|3|4)(?:-|$)/.test(unqualified) || lower.includes('gpt-5') || lower.includes('reason');
}

export function buildApiUrl(baseUrl: string, version: 'v1' | 'v1beta', resource: string) {
  let base = baseUrl.trim().replace(/\/+$/, '');
  for (const suffix of ['/chat/completions', '/messages', '/models']) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  if (base.endsWith(`/${version}`)) return `${base}/${resource}`;
  return `${base}/${version}/${resource}`;
}

export function parseSseDataLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) return null;
  const data = trimmed.startsWith('data:') ? trimmed.substring(5).trim() : trimmed;
  return !data || data === '[DONE]' ? null : data;
}

export function getGeminiThinkingConfig(modelId: string, effort?: string) {
  const normalized = effort?.toLowerCase();
  if (!normalized || normalized === 'none') return undefined;

  const lower = modelId.toLowerCase();
  if (lower.includes('gemini-2.5')) {
    const budgetByEffort: Record<string, number> = {
      minimal: 1024,
      low: 2048,
      medium: 8192,
      high: 24576,
      xhigh: 24576,
      max: 24576,
    };
    return { thinkingBudget: budgetByEffort[normalized] ?? 8192, includeThoughts: true };
  }

  if (lower.includes('gemini-3')) {
    const requested = ['minimal', 'low', 'medium', 'high'].includes(normalized) ? normalized : 'medium';
    const thinkingLevel = requested === 'minimal' && !lower.includes('flash') ? 'low' : requested;
    return { thinkingLevel, includeThoughts: true };
  }

  return undefined;
}

function isClaudeAdaptiveModel(modelId: string) {
  return /claude-(?:opus-(?:4-[678])|sonnet-4-6|fable-5|mythos)/.test(modelId.toLowerCase());
}

export function claudeSupportsXHigh(modelId: string) {
  return /claude-(?:opus-(?:4-[78])|fable-5|mythos)/.test(modelId.toLowerCase());
}

function normalizeClaudeEffort(modelId: string, effort: string) {
  const normalized = effort.toLowerCase();
  if (normalized === 'xhigh' && !claudeSupportsXHigh(modelId)) return 'high';
  return ['low', 'medium', 'high', 'xhigh', 'max'].includes(normalized) ? normalized : 'medium';
}

export function getClaudeThinkingConfig(modelId: string, effort?: string) {
  const normalized = effort?.toLowerCase();
  if (!normalized || normalized === 'none') return { maxTokens: 8192 };

  if (isClaudeAdaptiveModel(modelId)) {
    const alwaysAdaptive = /claude-(?:fable-5|mythos)/.test(modelId.toLowerCase());
    return {
      maxTokens: 16000,
      thinking: alwaysAdaptive ? undefined : { type: 'adaptive', display: 'summarized' },
      outputConfig: { effort: normalizeClaudeEffort(modelId, normalized) },
    };
  }

  const budgetByEffort: Record<string, number> = {
    low: 1024,
    medium: 4096,
    high: 8192,
    xhigh: 16384,
    max: 32768,
  };
  const modelOutputLimit = modelId.toLowerCase().includes('claude-3') ? 8192 : 64000;
  const budgetTokens = Math.min(budgetByEffort[normalized] ?? 4096, modelOutputLimit - 4096);
  return {
    maxTokens: Math.min(modelOutputLimit, budgetTokens + 4096),
    thinking: { type: 'enabled', budget_tokens: budgetTokens },
  };
}

export function normalizeOpenAiEffort(modelId: string, effort: string) {
  const lower = modelId.toLowerCase();
  const normalized = effort.toLowerCase();
  if (normalized === 'xhigh' && !lower.includes('gpt-5.2') && !lower.includes('codex-max')) return 'high';
  if (normalized === 'minimal' && (lower.includes('gpt-5.1') || lower.includes('gpt-5.2'))) return 'low';
  return normalized;
}

export const RETIRED_MODEL_REPLACEMENTS: Record<string, string> = {
  'gemini-1.5-flash': 'gemini-3.5-flash',
  'gemini-1.5-pro': 'gemini-2.5-pro',
  'claude-3-5-sonnet-20240620': 'claude-sonnet-4-6',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-4-6',
  'claude-3-5-haiku-20241022': 'claude-haiku-4-5-20251001',
};

export const replaceRetiredModel = (modelId: string) => RETIRED_MODEL_REPLACEMENTS[modelId] || modelId;

export function migrateProviderModels<T extends { models: string[] }>(providers: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(providers).map(([id, provider]) => [
      id,
      { ...provider, models: [...new Set(provider.models.map(replaceRetiredModel))] },
    ])
  );
}

export function stripProviderKeys<T extends { apiKey: string }>(providers: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(providers).map(([id, provider]) => [id, { ...provider, apiKey: '' }])
  );
}
