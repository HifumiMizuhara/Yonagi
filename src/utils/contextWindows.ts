import { normalizeModelId } from './tokens.ts';

/**
 * Default input context-window sizes (tokens) per model. Matched loosely by
 * substring against the model id, same convention as DEFAULT_MODEL_PRICING in
 * tokens.ts. Users can override / extend this table in Settings.
 */
export const DEFAULT_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o-mini': 128_000,
  'gpt-4o': 128_000,
  'gpt-4.1-mini': 1_047_576,
  'gpt-4.1': 1_047_576,
  'gpt-5': 400_000,
  'o1': 200_000,
  'o3-mini': 200_000,
  'claude-3-5-haiku': 200_000,
  'claude-3-5-sonnet': 200_000,
  'claude-3-7-sonnet': 200_000,
  'claude-sonnet': 200_000,
  'claude-opus': 200_000,
  'claude-haiku': 200_000,
  'gemini-1.5-flash': 1_000_000,
  'gemini-1.5-pro': 2_000_000,
  'gemini-2.0-flash': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.5-pro': 1_000_000,
  'gemini-3.5-flash': 1_000_000,
  'deepseek-chat': 64_000,
  'deepseek-reasoner': 64_000,
};

// Used when a model doesn't match anything in the table above.
export const FALLBACK_CONTEXT_WINDOW = 128_000;

/**
 * Resolve the context window (input token limit) for a model id from a
 * (user-merged) table. Exact match wins; otherwise the longest substring key
 * that matches; otherwise the fallback.
 */
export function resolveContextWindow(
  modelId: string,
  table: Record<string, number> = DEFAULT_CONTEXT_WINDOWS
): number {
  if (!modelId) return FALLBACK_CONTEXT_WINDOW;
  if (table[modelId]) return table[modelId];
  const lower = normalizeModelId(modelId);
  let best: { key: string; window: number } | null = null;
  for (const [key, window] of Object.entries(table)) {
    const normalizedKey = normalizeModelId(key);
    if (lower === normalizedKey || lower.includes(normalizedKey)) {
      if (!best || key.length > best.key.length) best = { key, window };
    }
  }
  return best ? best.window : FALLBACK_CONTEXT_WINDOW;
}
