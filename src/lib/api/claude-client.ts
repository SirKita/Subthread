import { t } from '../i18n';
import { ApiError, apiErrorFromResponse, toApiError } from './errors';
import { parseSse } from './sse';

export interface StreamParams {
  apiKey: string;
  model: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
  /** Offer the server-side web search tool (at most WEB_SEARCH_MAX_USES searches per answer). */
  webSearch?: boolean;
  signal?: AbortSignal;
}

/** A web page the answer cited. Collected from citations, unique by URL, in first-seen order. */
export interface Source {
  url: string;
  title: string;
}

export type StreamEvent =
  | { type: 'text'; text: string }
  /** The model started a web search (may repeat within one answer). */
  | { type: 'searching' }
  | { type: 'done'; usage?: { input_tokens: number; output_tokens: number }; sources: Source[] };

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export const WEB_SEARCH_MAX_USES = 3;

/**
 * The server-side web search tool (docs: agents-and-tools/tool-use/web-search-tool). Three
 * versions are current; the basic one is deliberate: web_search_20260209 and _20260318 add
 * dynamic filtering, which routes each search through code execution (extra latency, requires
 * programmatic tool calling on the model, not ZDR-eligible). A side answer wants the direct,
 * fastest path. Equivalent alternative if the newest version string is ever required:
 * { type: 'web_search_20260318', name: 'web_search', max_uses, allowed_callers: ['direct'] }.
 */
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: WEB_SEARCH_MAX_USES,
} as const;

interface MessagesApiSsePayload {
  type?: string;
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  content_block?: { type?: string; name?: string; citations?: unknown };
  delta?: { type?: string; text?: string; citation?: unknown; stop_reason?: string };
  usage?: { output_tokens?: number };
  error?: { type?: string; message?: string };
}

/**
 * Stream one message from the Anthropic Messages API.
 * Yields "text" for each text delta, "searching" when a server tool call starts, and a final
 * "done" with usage and the cited sources. Stream events this code does not know are ignored
 * (the API adds event, block and delta types over time); a web search error result (for
 * example max_uses_exceeded) is just another ignored block, and the text that follows is the
 * answer. Throws ApiError on HTTP/network errors; an abort ends iteration silently.
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
  if (params.webSearch) body.tools = [WEB_SEARCH_TOOL];

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
    throw new ApiError('network', err instanceof Error ? err.message : t('errorNetwork'));
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw apiErrorFromResponse(response.status, text);
  }
  if (!response.body) {
    throw new ApiError('unknown', t('errorNoBody'));
  }

  let usage: { input_tokens: number; output_tokens: number } | undefined;
  const sources = new Map<string, Source>();
  const addSource = (citation: unknown): void => {
    const source = sourceFromCitation(citation);
    if (source && !sources.has(source.url)) sources.set(source.url, source);
  };
  const done = (): StreamEvent => ({ type: 'done', usage, sources: [...sources.values()] });

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
        case 'content_block_start': {
          const block = payload.content_block;
          if (block?.type === 'server_tool_use') {
            yield { type: 'searching' };
          } else if (block?.type === 'text' && Array.isArray(block.citations)) {
            for (const citation of block.citations) addSource(citation);
          }
          // web_search_tool_result (results, or an error object such as max_uses_exceeded),
          // thinking, and anything newer: nothing to display.
          break;
        }
        case 'content_block_delta': {
          const delta = payload.delta;
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            yield { type: 'text', text: delta.text };
          } else if (delta?.type === 'citations_delta') {
            addSource(delta.citation);
          }
          // input_json_delta (the search query), thinking/signature deltas: ignored.
          break;
        }
        case 'message_delta':
          if (typeof payload.usage?.output_tokens === 'number') {
            usage = {
              input_tokens: usage?.input_tokens ?? 0,
              output_tokens: payload.usage.output_tokens,
            };
          }
          break;
        case 'message_stop':
          yield done();
          return;
        case 'error':
          throw new ApiError(
            payload.error?.type === 'overloaded_error' ? 'server' : 'unknown',
            payload.error?.message ?? t('errorStream'),
          );
        // ping / content_block_stop / unknown event types are intentionally ignored
      }
    }
    // The connection ended without message_stop: finish with whatever arrived.
    yield done();
  } catch (err) {
    if (isAbortError(err) || params.signal?.aborted) return;
    throw toApiError(err);
  } finally {
    // Stop the download if iteration ended before the stream was fully consumed.
    await response.body.cancel().catch(() => {});
  }
}

/** A citation with a URL (web_search_result_location today) becomes a Source; anything else is skipped. */
function sourceFromCitation(citation: unknown): Source | undefined {
  if (!citation || typeof citation !== 'object') return undefined;
  const { url, title } = citation as { url?: unknown; title?: unknown };
  if (typeof url !== 'string' || url === '') return undefined;
  return { url, title: typeof title === 'string' ? title : '' };
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}
