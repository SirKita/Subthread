import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamMessage, type StreamEvent, type StreamParams } from './claude-client';
import { ApiError } from './errors';

const encoder = new TextEncoder();

function sseBody(events: Array<{ event: string; data: unknown }>): ReadableStream<Uint8Array> {
  const text = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

const happyEvents = [
  {
    event: 'message_start',
    data: { type: 'message_start', message: { usage: { input_tokens: 12, output_tokens: 1 } } },
  },
  {
    event: 'content_block_start',
    data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  },
  {
    event: 'content_block_delta',
    data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } },
  },
  {
    event: 'content_block_delta',
    data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } },
  },
  { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
  {
    event: 'message_delta',
    data: {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 5 },
    },
  },
  { event: 'message_stop', data: { type: 'message_stop' } },
];

function baseParams(): StreamParams {
  return {
    apiKey: 'sk-ant-test',
    model: 'claude-haiku-5-5',
    system: 'You are a test.',
    messages: [{ role: 'user', content: 'Say hello.' }],
    maxTokens: 64,
  };
}

async function collect(params: StreamParams = baseParams()): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of streamMessage(params)) events.push(event);
  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamMessage', () => {
  it('sends the expected headers and body shape', async () => {
    const fetchMock = vi.fn(async () => new Response(sseBody(happyEvents), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await collect();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'x-api-key': 'sk-ant-test',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'claude-haiku-5-5',
      system: 'You are a test.',
      messages: [{ role: 'user', content: 'Say hello.' }],
      max_tokens: 64,
      stream: true,
      output_config: { effort: 'low' },
    });
  });

  it('yields text deltas in order, then done with usage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(sseBody(happyEvents), { status: 200 })),
    );

    const events = await collect();
    expect(events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'done', usage: { input_tokens: 12, output_tokens: 5 } },
    ]);
  });

  it('ignores thinking and signature deltas, yielding only text', async () => {
    const thinkingEvents = [
      {
        event: 'message_start',
        data: { type: 'message_start', message: { usage: { input_tokens: 20, output_tokens: 1 } } },
      },
      {
        event: 'content_block_start',
        data: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '' },
        },
      },
      {
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'hmm…' },
        },
      },
      {
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'signature_delta', signature: 'sig==' },
        },
      },
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      {
        event: 'content_block_start',
        data: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      },
      {
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: 'Answer.' },
        },
      },
      { event: 'content_block_stop', data: { type: 'content_block_stop', index: 1 } },
      {
        event: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 11 },
        },
      },
      { event: 'message_stop', data: { type: 'message_stop' } },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(sseBody(thinkingEvents), { status: 200 })),
    );

    const events = await collect();
    expect(events).toEqual([
      { type: 'text', text: 'Answer.' },
      { type: 'done', usage: { input_tokens: 20, output_tokens: 11 } },
    ]);
  });

  it('maps 401 to an ApiError with kind "auth"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), {
            status: 401,
          }),
      ),
    );

    const error = await collect().then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('auth');
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toBe('invalid x-api-key');
  });

  it('maps 429 to an ApiError with kind "rate_limit"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 }),
      ),
    );

    const error = await collect().then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('rate_limit');
    expect((error as ApiError).status).toBe(429);
  });

  it('stops iteration when aborted mid-stream', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'event: content_block_delta\n' +
                'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}\n\n',
            ),
          );
          // Stream stays open until the request is aborted, like a real fetch.
          init?.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('The operation was aborted.', 'AbortError'));
          });
        },
      });
      return new Response(body, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const received: string[] = [];
    for await (const event of streamMessage({ ...baseParams(), signal: controller.signal })) {
      if (event.type === 'text') {
        received.push(event.text);
        controller.abort();
      }
    }

    expect(received).toEqual(['Hel']); // no further events, no throw
  });
});
