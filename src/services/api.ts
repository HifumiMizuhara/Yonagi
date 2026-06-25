import { type ProviderConfig } from './db';

export type ApiErrorCode =
  | 'providerDisabled'
  | 'missingGeminiApiKey'
  | 'missingClaudeApiKey'
  | 'missingBaseUrl'
  | 'apiRequestFailed'
  | 'emptyResponseBody';

export class ApiError extends Error {
  code: ApiErrorCode;
  values: Record<string, string | number>;

  constructor(
    code: ApiErrorCode,
    message: string,
    values: Record<string, string | number> = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.values = values;
  }
}

export interface StreamParams {
  providerConfig: ProviderConfig;
  modelId: string;
  messages: Array<{
    role: string;
    content: string;
    attachments?: Array<{
      name: string;
      type: 'image' | 'pdf' | 'text';
      content: string;
      size: number;
    }>;
  }>;
  systemPrompt: string;
  temperature: number;
  effort?: string;
  webSearch?: boolean;
}

/**
 * Normalizes messages and formats attachments (e.g. appends file text or returns image objects)
 */
function prepareContext(params: StreamParams, format: 'openai' | 'claude' | 'gemini') {
  const allMessages = [...params.messages];

  return allMessages.map((msg) => {
    const images = msg.attachments?.filter((a) => a.type === 'image') || [];
    const filesText = msg.attachments
      ?.filter((a) => a.type === 'pdf' || a.type === 'text')
      .map((f) => `[添付ファイル: ${f.name}]\n${f.content}\n---`)
      .join('\n') || '';

    const textContent = filesText
      ? `${filesText}\n\n${msg.content}`
      : msg.content;

    if (msg.role === 'system') {
      return { role: 'system', content: textContent };
    }

    if (format === 'gemini') {
      const parts: any[] = [];

      images.forEach((img) => {
        const matches = img.content.match(/^data:(image\/\w+);base64,(.+)$/);
        if (matches) {
          parts.push({
            inlineData: {
              mimeType: matches[1],
              data: matches[2],
            },
          });
        }
      });

      parts.push({ text: textContent || ' ' });

      return {
        role: msg.role === 'user' ? 'user' : 'model',
        parts,
      };
    }

    if (format === 'claude') {
      if (images.length === 0) {
        return { role: msg.role, content: textContent };
      }

      const contentArray: any[] = [];

      images.forEach((img) => {
        const matches = img.content.match(/^data:(image\/\w+);base64,(.+)$/);
        if (matches) {
          contentArray.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: matches[1],
              data: matches[2],
            },
          });
        }
      });

      contentArray.push({ type: 'text', text: textContent || ' ' });

      return {
        role: msg.role,
        content: contentArray,
      };
    }

    // Default: OpenAI format
    if (images.length === 0) {
      return { role: msg.role, content: textContent };
    }

    const contentArray: any[] = [
      { type: 'text', text: textContent },
      ...images.map((img) => ({
        type: 'image_url',
        image_url: { url: img.content },
      })),
    ];

    return {
      role: msg.role,
      content: contentArray,
    };
  });
}

/**
 * Entrypoint for streaming AI response.
 */
export async function streamChatCompletion(
  params: StreamParams,
  // Fix #4: callbacks may be async (DB writes inside); declare return type accordingly
  onChunk: (text: string) => void | Promise<void>,
  onThinkingChunk: (text: string) => void | Promise<void>,
  signal: AbortSignal,
  onCitations?: (citations: Array<{ url: string; title?: string }>) => void | Promise<void>,
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void | Promise<void>
): Promise<string> {
  const { providerConfig, modelId } = params;

  if (!providerConfig.enabled) {
    throw new ApiError('providerDisabled', 'Provider is disabled.', { name: providerConfig.name });
  }

  // 1. Prepare Endpoint and Headers based on Provider
  let url = '';
  let headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  let body: any = {};

  const corsPrefix = providerConfig.corsProxy ? `${providerConfig.corsProxy.replace(/\/$/, '')}/` : '';

  if (providerConfig.id === 'gemini') {
    if (!providerConfig.apiKey) {
      throw new ApiError('missingGeminiApiKey', 'Gemini API key is missing.');
    }

    // Fix #15: pass API key in header (not URL) so it is not exposed to CORS proxies
    url = `${corsPrefix}https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`;
    headers['x-goog-api-key'] = providerConfig.apiKey;

    const formattedMessages = prepareContext(params, 'gemini');

    // Map app effort levels to Gemini thinkingLevel enum (low/medium/high).
    // 'minimal' and 'xhigh' are clamped to the nearest supported value.
    const effortToThinkingLevel: Record<string, string> = {
      minimal: 'low',
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'high',
    };
    const thinkingLevel = params.effort ? effortToThinkingLevel[params.effort.toLowerCase()] : undefined;

    body = {
      contents: formattedMessages,
      systemInstruction: params.systemPrompt ? {
        parts: [{ text: params.systemPrompt }]
      } : undefined,
      generationConfig: {
        temperature: params.temperature,
        ...(thinkingLevel ? { thinkingLevel } : {}),
      },
    };

    // Built-in web search (Google Search grounding)
    if (params.webSearch) {
      body.tools = [{ google_search: {} }];
    }
  }
  else if (providerConfig.id === 'claude') {
    if (!providerConfig.apiKey) {
      throw new ApiError('missingClaudeApiKey', 'Claude API key is missing.');
    }

    const targetUrl = 'https://api.anthropic.com/v1/messages';
    url = corsPrefix ? `${corsPrefix}${targetUrl}` : targetUrl;

    headers['x-api-key'] = providerConfig.apiKey;
    headers['anthropic-version'] = '2023-06-01';

    const messagesWithoutSystem = prepareContext(params, 'claude').filter(m => m.role !== 'system');

    body = {
      model: modelId,
      messages: messagesWithoutSystem,
      system: params.systemPrompt || undefined,
      max_tokens: 4096,
      stream: true,
    };

    // Fix #3: use correct extended thinking API (type:'enabled', budget_tokens, anthropic-beta header)
    if (params.effort && params.effort !== 'none') {
      const budgetMap: Record<string, number> = { low: 2000, medium: 8000, high: 16000, xhigh: 32000, max: 60000 };
      const budgetTokens = budgetMap[params.effort.toLowerCase()] ?? 8000;
      body.thinking = { type: 'enabled', budget_tokens: budgetTokens };
      headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
      body.temperature = 1.0;
    } else {
      body.temperature = params.temperature;
    }

    // Built-in web search tool
    if (params.webSearch) {
      body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }
  }
  else if (providerConfig.id === 'ollama') {
    const base = providerConfig.baseUrl || 'http://localhost:11434';
    url = `${corsPrefix}${base.replace(/\/$/, '')}/api/chat`;
    const formattedMessages = prepareContext(params, 'openai');

    if (params.systemPrompt && !formattedMessages.some(m => m.role === 'system')) {
      formattedMessages.unshift({ role: 'system', content: params.systemPrompt });
    }

    body = {
      model: modelId,
      messages: formattedMessages,
      options: {
        temperature: params.temperature,
      },
      stream: true,
    };
  }
  else {
    // OpenAI, DeepSeek, Custom OpenAI-compatible endpoints
    if (!providerConfig.baseUrl) {
      throw new ApiError('missingBaseUrl', 'Provider base URL is missing.', { name: providerConfig.name });
    }

    const base = providerConfig.baseUrl.replace(/\/$/, '');
    const path = base.includes('/v1') ? '/chat/completions' : '/v1/chat/completions';
    url = `${corsPrefix}${base}${path}`;

    if (providerConfig.apiKey) {
      headers['Authorization'] = `Bearer ${providerConfig.apiKey}`;
    }

    const formattedMessages = prepareContext(params, 'openai');
    if (params.systemPrompt && !formattedMessages.some(m => m.role === 'system')) {
      formattedMessages.unshift({ role: 'system', content: params.systemPrompt });
    }

    body = {
      model: modelId,
      messages: formattedMessages,
      temperature: params.temperature,
      stream: true,
      // Request usage stats in the stream (final chunk carries `usage`)
      stream_options: { include_usage: true },
    };

    if (params.effort && params.effort !== 'none') {
      const effVal = params.effort.toLowerCase();
      body.reasoning_effort = effVal;
      body.reasoning = {
        effort: effVal
      };
    }

    // Built-in web search. OpenAI uses `web_search_options`; OpenRouter-style
    // gateways accept a `web` plugin. Send both so compatible endpoints pick up
    // whichever they support.
    if (params.webSearch) {
      if (providerConfig.id === 'openai') {
        body.web_search_options = {};
      } else {
        body.plugins = [{ id: 'web' }];
      }
    }
  }

  // 2. Perform fetch
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let errText = '';
    try {
      errText = await response.text();
    } catch (_) {}
    throw new ApiError('apiRequestFailed', 'API request failed.', {
      status: response.status,
      details: errText || response.statusText,
    });
  }

  if (!response.body) {
    throw new ApiError('emptyResponseBody', 'Response body is empty.');
  }

  // 3. Read stream and trigger onChunk
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponseText = '';
  // Claude reports input tokens once (message_start) and output tokens
  // cumulatively (message_delta); keep them so we can emit the combined usage.
  let claudeInput = 0;
  let claudeOutput = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      // Fix #5: when done, flush the decoder so multi-byte sequences are not lost;
      // do NOT discard the remaining buffer — process it before breaking.
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = done ? '' : (lines.pop() || '');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (providerConfig.id === 'gemini') {
          // Fix #9: only strip lines that are SOLELY '[', ']', or ','
          // Previously, startsWith/endsWith checks corrupted JSON content.
          let cleanLine = trimmed;
          if (cleanLine === '[' || cleanLine === ']') continue;
          if (cleanLine.startsWith(',')) cleanLine = cleanLine.substring(1).trim();

          if (!cleanLine) continue;

          try {
            const parsed = JSON.parse(cleanLine);

            // Token usage (Gemini reports cumulative counts per chunk)
            if (onUsage && parsed.usageMetadata) {
              await onUsage({
                inputTokens: parsed.usageMetadata.promptTokenCount || 0,
                outputTokens: parsed.usageMetadata.candidatesTokenCount || 0,
              });
            }

            // Web search grounding sources
            const groundingChunks = parsed.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (onCitations && Array.isArray(groundingChunks)) {
              const cites: Array<{ url: string; title?: string }> = [];
              for (const c of groundingChunks) {
                if (c.web?.uri) cites.push({ url: c.web.uri, title: c.web.title });
              }
              if (cites.length > 0) await onCitations(cites);
            }

            const parts = parsed.candidates?.[0]?.content?.parts;
            if (parts && Array.isArray(parts)) {
              // Fix #4: use for...of (not forEach) so we can await the callbacks
              for (const part of parts) {
                if (part.text) {
                  if (part.thought) {
                    await onThinkingChunk(part.text);
                  } else {
                    await onChunk(part.text);
                    fullResponseText += part.text;
                  }
                }
              }
            } else {
              const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textChunk) {
                await onChunk(textChunk);
                fullResponseText += textChunk;
              }
            }
          } catch (_) {}
        }
        else if (providerConfig.id === 'ollama') {
          try {
            const parsed = JSON.parse(trimmed);
            const textChunk = parsed.message?.content;
            if (textChunk) {
              await onChunk(textChunk);
              fullResponseText += textChunk;
            }
            // Ollama reports counts on the final done message
            if (onUsage && parsed.done && (parsed.prompt_eval_count || parsed.eval_count)) {
              await onUsage({
                inputTokens: parsed.prompt_eval_count || 0,
                outputTokens: parsed.eval_count || 0,
              });
            }
          } catch (_) {}
        }
        else if (providerConfig.id === 'claude') {
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.substring(5).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'message_start' && parsed.message?.usage) {
                claudeInput = parsed.message.usage.input_tokens || 0;
                claudeOutput = parsed.message.usage.output_tokens || 0;
                if (onUsage) await onUsage({ inputTokens: claudeInput, outputTokens: claudeOutput });
              } else if (parsed.type === 'message_delta' && parsed.usage) {
                claudeOutput = parsed.usage.output_tokens || claudeOutput;
                if (onUsage) await onUsage({ inputTokens: claudeInput, outputTokens: claudeOutput });
              }
              if (parsed.type === 'content_block_delta') {
                if (parsed.delta?.text) {
                  const textChunk = parsed.delta.text;
                  await onChunk(textChunk);
                  fullResponseText += textChunk;
                } else if (parsed.delta?.thinking) {
                  await onThinkingChunk(parsed.delta.thinking);
                } else if (parsed.delta?.type === 'citations_delta' && parsed.delta.citation) {
                  const c = parsed.delta.citation;
                  if (onCitations && c.url) await onCitations([{ url: c.url, title: c.title }]);
                }
              } else if (parsed.type === 'content_block_start' &&
                         parsed.content_block?.type === 'web_search_tool_result') {
                const results = parsed.content_block.content;
                if (onCitations && Array.isArray(results)) {
                  const cites = results
                    .filter((r: any) => r.type === 'web_search_result' && r.url)
                    .map((r: any) => ({ url: r.url, title: r.title }));
                  if (cites.length > 0) await onCitations(cites);
                }
              }
            } catch (_) {}
          }
        }
        else {
          // openai, deepseek, custom SSE
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.substring(5).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              // Usage arrives on the final chunk (choices may be empty there)
              if (onUsage && parsed.usage) {
                await onUsage({
                  inputTokens: parsed.usage.prompt_tokens || 0,
                  outputTokens: parsed.usage.completion_tokens || 0,
                });
              }
              const delta = parsed.choices?.[0]?.delta;
              if (delta) {
                // Web search citations (OpenAI / OpenRouter url_citation annotations)
                if (onCitations && Array.isArray(delta.annotations)) {
                  const cites = delta.annotations
                    .filter((a: any) => a.type === 'url_citation' && a.url_citation?.url)
                    .map((a: any) => ({ url: a.url_citation.url, title: a.url_citation.title }));
                  if (cites.length > 0) await onCitations(cites);
                }
                if (delta.content) {
                  await onChunk(delta.content);
                  fullResponseText += delta.content;
                } else if (delta.reasoning_content) {
                  await onThinkingChunk(delta.reasoning_content);
                } else if (delta.reasoning) {
                  await onThinkingChunk(delta.reasoning);
                } else if (delta.thinking) {
                  await onThinkingChunk(delta.thinking);
                }
              }
            } catch (_) {}
          }
        }
      }

      // Fix #5: break AFTER processing the remaining lines (not before)
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }

  return fullResponseText;
}
