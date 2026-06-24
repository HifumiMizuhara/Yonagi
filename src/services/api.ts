export interface StreamParams {
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
  newMessage: {
    content: string;
    attachments?: Array<{
      name: string;
      type: 'image' | 'pdf' | 'text';
      content: string;
      size: number;
    }>;
  };
  systemPrompt: string;
  temperature: number;
  keys: {
    gemini: string;
    openai: string;
    claude: string;
    custom: string;
  };
  customEndpoint: string;
  corsProxy: string;
  customModels: string[];
}

/**
 * Normalizes messages and formats attachments (e.g. appends file text or returns image objects)
 */
function prepareContext(params: StreamParams, format: 'openai' | 'claude' | 'gemini') {
  const allMessages = [...params.messages];
  
  // Format the messages list for API delivery
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
      
      // Images
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

      // Text part must always be present or Gemini errors
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
  onChunk: (text: string) => void,
  signal: AbortSignal
): Promise<string> {
  const { modelId, corsProxy } = params;

  // 1. Identify Provider
  let provider: 'gemini' | 'openai' | 'claude' | 'ollama' | 'custom' = 'openai';
  
  if (modelId.startsWith('gemini-')) {
    provider = 'gemini';
  } else if (modelId.startsWith('claude-')) {
    provider = 'claude';
  } else if (params.customModels.includes(modelId) && params.customEndpoint) {
    provider = 'custom';
  } else if (params.customModels.includes(modelId) && !params.customEndpoint) {
    provider = 'ollama'; // Default custom models to Ollama if no customEndpoint is specified
  }

  // 2. Prepare Endpoint and Headers
  let url = '';
  let headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  let body: any = {};

  if (provider === 'gemini') {
    const key = params.keys.gemini;
    if (!key) throw new Error('Gemini APIキーが設定されていません。設定画面でキーを入力してください。');
    
    // Gemini supports direct browser fetches
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${key}`;
    const formattedMessages = prepareContext(params, 'gemini');
    
    body = {
      contents: formattedMessages,
      systemInstruction: params.systemPrompt ? {
        parts: [{ text: params.systemPrompt }]
      } : undefined,
      generationConfig: {
        temperature: params.temperature,
      },
    };
  } 
  else if (provider === 'claude') {
    const key = params.keys.claude;
    if (!key) throw new Error('Anthropic APIキーが設定されていません。設定画面でキーを入力してください。');

    const targetUrl = 'https://api.anthropic.com/v1/messages';
    url = corsProxy ? `${corsProxy.replace(/\/$/, '')}/${targetUrl}` : targetUrl;
    
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    
    // Claude does not support the 'system' role inside the messages array,
    // it must be passed as a top-level parameter.
    const messagesWithoutSystem = prepareContext(params, 'claude').filter(m => m.role !== 'system');
    
    body = {
      model: modelId,
      messages: messagesWithoutSystem,
      system: params.systemPrompt,
      temperature: params.temperature,
      max_tokens: 4096,
      stream: true,
    };
  } 
  else if (provider === 'openai') {
    const key = params.keys.openai;
    if (!key) throw new Error('OpenAI APIキーが設定されていません。設定画面でキーを入力してください。');

    const targetUrl = 'https://api.openai.com/v1/chat/completions';
    url = corsProxy ? `${corsProxy.replace(/\/$/, '')}/${targetUrl}` : targetUrl;
    
    headers['Authorization'] = `Bearer ${key}`;
    
    const formattedMessages = prepareContext(params, 'openai');
    // Inject system prompt if not empty and not already present
    if (params.systemPrompt && !formattedMessages.some(m => m.role === 'system')) {
      formattedMessages.unshift({ role: 'system', content: params.systemPrompt });
    }

    body = {
      model: modelId,
      messages: formattedMessages,
      temperature: params.temperature,
      stream: true,
    };
  } 
  else if (provider === 'ollama') {
    // Local Ollama
    url = 'http://localhost:11434/api/chat';
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
  else if (provider === 'custom') {
    const key = params.keys.custom;
    const base = params.customEndpoint.replace(/\/$/, '');
    
    // Check if URL already has path or needs /chat/completions
    const targetUrl = base.includes('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    url = corsProxy ? `${corsProxy.replace(/\/$/, '')}/${targetUrl}` : targetUrl;

    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
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
    };
  }

  // 3. Perform fetch
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
    throw new Error(`APIリクエストがエラーを返しました (ステータス: ${response.status}): ${errText || response.statusText}`);
  }

  if (!response.body) {
    throw new Error('レスポンスボディが空です。ストリーミングを開始できません。');
  }

  // 4. Read stream and trigger onChunk
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullResponseText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (provider === 'gemini') {
          // Gemini sends a continuous stream wrapped in an array, e.g.:
          // [\n  {\n    "candidates": ...\n  },\n  {\n    "candidates": ...\n  }\n]
          // Let's strip brackets and commas to extract the JSON objects.
          let cleanLine = trimmed;
          if (cleanLine.startsWith('[')) cleanLine = cleanLine.substring(1);
          if (cleanLine.endsWith(']')) cleanLine = cleanLine.slice(0, -1);
          if (cleanLine.startsWith(',')) cleanLine = cleanLine.substring(1);
          cleanLine = cleanLine.trim();
          
          if (!cleanLine) continue;

          try {
            const parsed = JSON.parse(cleanLine);
            const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textChunk) {
              onChunk(textChunk);
              fullResponseText += textChunk;
            }
          } catch (_) {
            // Might be incomplete JSON chunk spanning lines
          }
        } 
        else if (provider === 'ollama') {
          // Ollama sends JSON objects line by line
          try {
            const parsed = JSON.parse(trimmed);
            const textChunk = parsed.message?.content;
            if (textChunk) {
              onChunk(textChunk);
              fullResponseText += textChunk;
            }
          } catch (_) {}
        } 
        else if (provider === 'claude') {
          // Claude SSE format: "event: ...", "data: ..."
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.substring(5).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                const textChunk = parsed.delta.text;
                onChunk(textChunk);
                fullResponseText += textChunk;
              }
            } catch (_) {}
          }
        } 
        else {
          // OpenAI & Custom SSE format: "data: {...}"
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.substring(5).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              const textChunk = parsed.choices?.[0]?.delta?.content;
              if (textChunk) {
                onChunk(textChunk);
                fullResponseText += textChunk;
              }
            } catch (_) {}
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullResponseText;
}
