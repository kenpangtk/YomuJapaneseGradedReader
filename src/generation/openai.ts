import { buildSystemPrompt, buildUserPrompt } from './prompt';
import type { GenerationRequest, Provider } from './types';
import { abortError } from './types';

interface OpenAiOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface ChatChoice {
  delta?: {
    content?: string | null;
    reasoning_content?: string | null;
    reasoning?: string | null;
  };
  message?: { content?: string | null };
  text?: string | null;
  finish_reason?: string | null;
}

interface ChatChunk {
  choices?: ChatChoice[];
  error?: { message?: string };
}

function chatUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

function networkError(baseUrl: string): Error {
  return new Error(
    `Could not reach ${baseUrl}. This is usually a CORS rejection, blocked network, mixed content, or an unreachable/self-signed endpoint. The provider must allow browser POST requests to /chat/completions with an Authorization header. Check the browser DevTools Console and Network panel.`,
  );
}

async function readError(response: Response): Promise<string> {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 400);
  } catch {
    detail = '';
  }
  return `Provider request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''})${detail ? `: ${detail}` : '.'}`;
}

export class OpenAiProvider implements Provider {
  kind = 'openai' as const;
  private options: OpenAiOptions;

  constructor(options: OpenAiOptions) {
    this.options = options;
  }

  async generate(
    request: GenerationRequest,
    onText: (chunk: string) => void,
    signal: AbortSignal,
  ): Promise<string> {
    if (!this.options.apiKey) {
      throw new Error('No API key is configured. Add one in Settings or switch to the offline mock provider.');
    }
    if (!this.options.baseUrl.trim() || !this.options.model.trim()) {
      throw new Error('Configure the provider endpoint and model in Settings.');
    }
    if (signal.aborted) throw abortError();

    let response: Response;
    try {
      response = await fetch(chatUrl(this.options.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          stream: true,
          temperature: 0.8,
          max_tokens: 8000,
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserPrompt(request) },
          ],
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw abortError();
      }
      throw networkError(this.options.baseUrl);
    }

    if (!response.ok) throw new Error(await readError(response));
    if (!response.body) throw new Error('Provider returned no response body.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const contentType = response.headers.get('content-type');
    let buffer = '';
    let rawBody = '';
    let text = '';
    let sawReasoning = false;
    let finishReason: string | null = null;

    const processPayload = (chunk: ChatChunk): void => {
      if (chunk.error?.message) throw new Error(`Provider error: ${chunk.error.message}`);
      const choice = chunk.choices?.[0];
      if (!choice) return;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      if (choice.delta?.reasoning_content || choice.delta?.reasoning) sawReasoning = true;
      const content =
        choice.delta?.content ??
        choice.message?.content ??
        choice.text ??
        null;
      if (typeof content === 'string' && content) {
        text += content;
        onText(content);
      }
    };

    const processLine = (rawLine: string): void => {
      const line = rawLine.trim();
      if (!line) return;
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        try {
          processPayload(JSON.parse(payload) as ChatChunk);
        } catch (error) {
          if (error instanceof SyntaxError) return;
          throw error;
        }
        return;
      }
      // Some OpenAI-compatible endpoints ignore stream:true and return JSON.
      if (line.startsWith('{')) {
        try {
          processPayload(JSON.parse(line) as ChatChunk);
        } catch (error) {
          if (error instanceof SyntaxError) return;
          throw error;
        }
      }
    };

    try {
      while (true) {
        let readResult: ReadableStreamReadResult<Uint8Array>;
        try {
          readResult = await reader.read();
        } catch (error) {
          if (signal.aborted) throw abortError();
          throw new Error(
            `The provider connection failed while streaming from ${this.options.baseUrl}. Check the DevTools Network panel and provider logs.`,
          );
        }
        const { done, value } = readResult;
        if (done) break;
        const decoded = decoder.decode(value, { stream: true });
        rawBody += decoded;
        buffer += decoded;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) processLine(line);
      }
      const tail = decoder.decode();
      rawBody += tail;
      buffer += tail;
      if (buffer.trim()) processLine(buffer);
    } finally {
      reader.releaseLock();
    }

    if (text.trim()) return text;

    // Last chance: parse a complete non-SSE JSON response. This also surfaces
    // provider error objects that were returned with HTTP 200.
    const complete = rawBody.trim().replace(/^\uFEFF/, '');
    if (complete) {
      try {
        const parsed = JSON.parse(complete) as ChatChunk;
        if (parsed.error?.message) throw new Error(`Provider error: ${parsed.error.message}`);
        const content =
          parsed.choices?.[0]?.message?.content ??
          parsed.choices?.[0]?.text ??
          parsed.choices?.[0]?.delta?.content ??
          null;
        if (typeof content === 'string' && content.trim()) {
          onText(content);
          return content;
        }
        if (parsed.choices?.[0]?.delta?.reasoning_content || parsed.choices?.[0]?.delta?.reasoning) {
          sawReasoning = true;
        }
        if (parsed.choices?.[0]?.finish_reason) finishReason = parsed.choices[0].finish_reason;
      } catch (error) {
        if (error instanceof SyntaxError) {
          // It was probably an SSE body; the preview below helps diagnose it.
        } else {
          throw error;
        }
      }
    }

    const detail = sawReasoning
      ? 'The model returned reasoning content but no final story content. This often happens when a reasoning model exhausts max_tokens before answering; try deepseek-chat or another non-reasoning model.'
      : `Response preview: ${complete.slice(0, 300) || '(empty body)'}`;
    throw new Error(
      `Provider returned no story text (content-type: ${contentType ?? 'unknown'}; finish_reason: ${finishReason ?? 'unknown'}). ${detail}`,
    );
  }

  async testConnection(signal?: AbortSignal): Promise<string> {
    if (!this.options.apiKey) throw new Error('Add an API key first.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      let response: Response;
      try {
        response = await fetch(chatUrl(this.options.baseUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify({
            model: this.options.model,
            stream: false,
            temperature: 0,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Reply with OK.' }],
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error('Connection test timed out after 15 seconds. Check the endpoint URL and network.');
        }
        throw networkError(this.options.baseUrl);
      }
      if (!response.ok) throw new Error(await readError(response));
      return 'Connection succeeded. Chat-completions endpoint responded.';
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
