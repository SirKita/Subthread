import { ApiError, apiErrorFromResponse, toApiError } from './errors';
import { parseSse } from './sse';

export interface StreamParams {
  apiKey: string;
  model: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
  signal?: AbortSignal;
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; usage?: { input_tokens: number; output_tokens: number } };

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

interface MessagesApiSsePayload {
  type?: string;
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  delta?: { type?: string; text?: string };
  usage?: { output_tokens?: number };
  error?: { type?: string; message?: string };
}

/**
 * Stream one message from the Anthropic Messages API.
 * Yields "text" for each text delta and a final "done" with usage.
 * Throws ApiError on HTTP/network errors; an abort ends iteration silently.
 */
export async function* streamMessage(
  params: StreamParams,
): AsyncGenerator<StreamEvent, void, undefined> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    max_tokens: params.maxTokens,
    stream: true,
    // Side answers should be fast and cheap. No temperature/top_p/top_k and no
    // thinking field — current models reject the former and default the latter.
    output_config: { effort: 'low' },
  };
  if (params.system) body.system = params.system;

  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': params.apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
        // Required because the service worker sends a chrome-extension:// Origin, which the
        // API treats as a browser request. Safe here: BYOK — the user's own key, stored only
        // in chrome.storage.local and sent only to api.anthropic.com.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });
  } catch (err) {
    if (isAbortError(err)) return;
    throw new ApiError('network', err instanceof Error ? err.message : 'Network request failed');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw apiErrorFromResponse(response.status, text);
  }
  if (!response.body) {
    throw new ApiError('unknown', 'Response had no body');
  }

  let usage: { input_tokens: number; output_tokens: number } | undefined;

  try {
    for await (const sseEvent of parseSse(response.body)) {
      let payload: MessagesApiSsePayload;
      try {
        payload = JSON.parse(sseEvent.data) as MessagesApiSsePayload;
      } catch {
        continue; // ignore non-JSON data (shouldn't happen on this API)
      }

      switch (payload.type) {
        case 'message_start':
          usage = {
            input_tokens: payload.message?.usage?.input_tokens ?? 0,
            output_tokens: payload.message?.usage?.output_tokens ?? 0,
          };
          break;
        case 'content_block_delta':
          if (payload.delta?.type === 'text_delta' && typeof payload.delta.text === 'string') {
            yield { type: 'text', text: payload.delta.text };
          }
          break;
        case 'message_delta':
          if (typeof payload.usage?.output_tokens === 'number') {
            usage = {
              input_tokens: usage?.input_tokens ?? 0,
              output_tokens: payload.usage.output_tokens,
            };
          }
          break;
        case 'message_stop':
          yield { type: 'done', usage };
          return;
        case 'error':
          throw new ApiError(
            payload.error?.type === 'overloaded_error' ? 'server' : 'unknown',
            payload.error?.message ?? 'Stream reported an error',
          );
        // ping / content_block_start / content_block_stop are intentionally ignored
      }
    }
  } catch (err) {
    if (isAbortError(err) || params.signal?.aborted) return;
    throw toApiError(err);
  } finally {
    // Stop the download if iteration ended before the stream was fully consumed.
    await response.body.cancel().catch(() => {});
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
