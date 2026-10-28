import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  streamMessage,
  WEB_SEARCH_TOOL,
  type StreamEvent,
  type StreamParams,
} from './claude-client';
import { ApiError } from './errors';

const encoder = new TextEncoder();

/** Encode Messages API stream payloads as SSE; the event name mirrors the payload type. */
function sseBody(events: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
  const text = events
    .map((data) => `event: ${String(data.type)}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function params(overrides: Partial<StreamParams> = {}): StreamParams {
  return {
    apiKey: 'sk-ant-test',
    model: 'claude-haiku-5-5',
    system: 'You are a test.',
    messages: [{ role: 'user', content: 'When was Claude Shannon born?' }],
    maxTokens: 64,
    ...overrides,
  };
}

async function collect(p: StreamParams): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of streamMessage(p)) events.push(event);
  return events;
}

function stubFetch(events: Array<Record<string, unknown>>) {
  const fetchMock = vi.fn(async () => new Response(sseBody(events), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

const WIKI = 'https://en.wikipedia.org/wiki/Claude_Shannon';
const BRITANNICA = 'https://www.britannica.com/biography/Claude-Shannon';

/**
 * Shaped after the web search tool docs: a leading text block, the server_tool_use block with
 * its input streamed as partial JSON, the complete web_search_tool_result in one
 * content_block_start, then cited text blocks whose citations arrive as citations_delta.
 */
const WEB_SEARCH_STREAM: Array<Record<string, unknown>> = [
  {
    type: 'message_start',
    message: { id: 'msg_abc123', usage: { input_tokens: 6039, output_tokens: 1 } },
  },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Checking. ' } },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: { type: 'server_tool_use', id: 'srvtoolu_xyz789', name: 'web_search' },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: '{"query":"claude shannon birth date"}' },
  },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'content_block_start',
    index: 2,
    content_block: {
      type: 'web_search_tool_result',
      tool_use_id: 'srvtoolu_xyz789',
      content: [
        {
          type: 'web_search_result',
          url: WIKI,
          title: 'Claude Shannon - Wikipedia',
          encrypted_content: 'EqgfCioIARgBIiQ3YTAwMjY1Mi1mZjM5LTQ1NGUtODgxNC1kNjNjNTk1ZWI3Y...',
          page_age: 'April 30, 2025',
        },
        {
          type: 'web_search_result',
          url: BRITANNICA,
          title: 'Claude Shannon | Biography',
          encrypted_content: 'EqgfCioIARgBIiQ3YTAw...',
          page_age: null,
        },
      ],
    },
  },
  { type: 'content_block_stop', index: 2 },
  { type: 'content_block_start', index: 3, content_block: { type: 'text', text: '' } },
  {
    type: 'content_block_delta',
    index: 3,
    delta: { type: 'text_delta', text: 'Claude Shannon was born on April 30, 1916' },
  },
  {
    type: 'content_block_delta',
    index: 3,
    delta: {
      type: 'citations_delta',
      citation: {
        type: 'web_search_result_location',
        url: WIKI,
        title: 'Claude Shannon - Wikipedia',
        encrypted_index: 'Eo8BCioIAhgBIiQyYjQ0OWJmZi1lNm..',
        cited_text:
          'Claude Elwood Shannon (April 30, 1916 – February 24, 2001) was an American mathematician',
      },
    },
  },
  { type: 'content_block_stop', index: 3 },
  { type: 'content_block_start', index: 4, content_block: { type: 'text', text: '' } },
  {
    type: 'content_block_delta',
    index: 4,
    delta: { type: 'text_delta', text: ', in Petoskey, Michigan.' },
  },
  {
    type: 'content_block_delta',
    index: 4,
    delta: {
      type: 'citations_delta',
      citation: {
        type: 'web_search_result_location',
        url: BRITANNICA,
        title: 'Claude Shannon | Biography',
        encrypted_index: 'Eo8BCioIAhgBIiQ...',
        cited_text: 'born April 30, 1916, Petoskey, Michigan',
      },
    },
  },
  {
    // Same page cited twice: collected once.
    type: 'content_block_delta',
    index: 4,
    delta: {
      type: 'citations_delta',
      citation: {
        type: 'web_search_result_location',
        url: WIKI,
        title: 'Claude Shannon - Wikipedia',
        encrypted_index: 'Eo8BCioIAhgBIiQ...',
        cited_text: 'Petoskey, Michigan',
      },
    },
  },
  { type: 'content_block_stop', index: 4 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 931, server_tool_use: { web_search_requests: 1 } },
  },
  { type: 'message_stop' },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamMessage with web search', () => {
  it('sends exactly the documented tool definition when enabled, and no tools otherwise', async () => {
    const enabled = stubFetch(WEB_SEARCH_STREAM);
    await collect(params({ webSearch: true }));
    expect(requestBody(enabled).tools).toEqual([
      { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
    ]);
    expect(requestBody(enabled).tools).toEqual([WEB_SEARCH_TOOL]);
    vi.unstubAllGlobals();

    const disabled = stubFetch(WEB_SEARCH_STREAM);
    await collect(params({ webSearch: false }));
    expect(requestBody(disabled)).not.toHaveProperty('tools');
    vi.unstubAllGlobals();

    const omitted = stubFetch(WEB_SEARCH_STREAM);
    await collect(params());
    expect(requestBody(omitted)).not.toHaveProperty('tools');
  });

  it('surfaces searching, streams text across blocks, and collects unique sources on done', async () => {
    stubFetch(WEB_SEARCH_STREAM);

    const events = await collect(params({ webSearch: true }));

    expect(events).toEqual([
      { type: 'text', text: 'Checking. ' },
      { type: 'searching' },
      { type: 'text', text: 'Claude Shannon was born on April 30, 1916' },
      { type: 'text', text: ', in Petoskey, Michigan.' },
      {
        type: 'done',
        usage: { input_tokens: 6039, output_tokens: 931 },
        sources: [
          { url: WIKI, title: 'Claude Shannon - Wikipedia' },
          { url: BRITANNICA, title: 'Claude Shannon | Biography' },
        ],
      },
    ]);
  });

  it('also reads citations attached to a text block at its start', async () => {
    stubFetch([
      { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 1 } } },
      {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: '',
          citations: [{ type: 'web_search_result_location', url: WIKI, title: 'Wiki' }],
        },
      },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '1916.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_stop' },
    ]);

    const events = await collect(params({ webSearch: true }));
    expect(events.at(-1)).toEqual({
      type: 'done',
      usage: { input_tokens: 1, output_tokens: 1 },
      sources: [{ url: WIKI, title: 'Wiki' }],
    });
  });

  it('maps a 400 that rejects the web search tool to a clear message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'error',
              error: {
                type: 'invalid_request_error',
                message: 'tools.0: web search is not enabled for this organization',
              },
            }),
            { status: 400 },
          ),
      ),
    );

    const error = await collect(params({ webSearch: true })).then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('unknown');
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).message).toBe("Web search isn't available for this model or key");
  });
});
