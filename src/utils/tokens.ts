import type { ModelPrice } from '../services/db';

/**
 * Lightweight local token estimator.
 *
 * Exact tokenization differs per model and the real tokenizers are heavy, so we
 * use a character-class heuristic. CJK characters are ~1 token each (a bit less),
 * while latin text averages ~4 chars/token. This is only used for pre-send
 * previews and as a fallback — the authoritative numbers come from the API
 * `usage` payload whenever available.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    // CJK Unified, Hiragana, Katakana, Hangul, fullwidth, CJK symbols
    if (
      (code >= 0x3040 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      cjk++;
    } else {
      other++;
    }
  }
  return Math.ceil(cjk / 1.5 + other / 4);
}

/**
 * Default per-1M-token prices (USD). Matched loosely by substring against the
 * model id. Users can override / extend this table in Settings.
 */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPrice> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'o1': { input: 15, output: 60 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-3-7-sonnet': { input: 3, output: 15 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-sonnet': { input: 3, output: 15 },
  'claude-opus': { input: 15, output: 75 },
  'claude-haiku': { input: 0.8, output: 4 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
};

export function normalizeModelId(modelId: string): string {
  return modelId
    .trim()
    .toLowerCase()
    .replace(/^[^/\s]+\/+/, '')
    .replace(/[:@].*$/, '')
    .replace(/[-_](20\d{6}|\d{8})$/g, '');
}

/**
 * Resolve a price for a model id from a (user-merged) pricing table.
 * Exact match wins; otherwise the longest substring key that matches.
 */
export function resolvePrice(
  modelId: string,
  table: Record<string, ModelPrice>
): ModelPrice | null {
  if (!modelId) return null;
  if (table[modelId]) return table[modelId];
  const lower = normalizeModelId(modelId);
  let best: { key: string; price: ModelPrice } | null = null;
  for (const [key, price] of Object.entries(table)) {
    const normalizedKey = normalizeModelId(key);
    if (lower === normalizedKey || lower.includes(normalizedKey)) {
      if (!best || key.length > best.key.length) best = { key, price };
    }
  }
  return best ? best.price : null;
}

/**
 * Compute USD cost for a usage pair. Returns null if no price is known.
 */
export function computeCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  table: Record<string, ModelPrice>
): number | null {
  const price = resolvePrice(modelId, table);
  if (!price) return null;
  return (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output;
}

export function selectUsageCost(
  modelId: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    providerReportedCost?: number;
  },
  table: Record<string, ModelPrice>
): { cost: number | null; estimated: boolean } {
  if (typeof usage.providerReportedCost === 'number') {
    return { cost: usage.providerReportedCost, estimated: false };
  }
  return {
    cost: computeCost(modelId, usage.inputTokens, usage.outputTokens, table),
    estimated: true,
  };
}

export function formatCost(cost: number): string {
  if (cost === 0) return '$0';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}
