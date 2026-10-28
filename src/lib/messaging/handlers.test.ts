import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEB_SEARCH_TOOL } from '../api/claude-client';
import { setSettings } from '../storage/settings';
import { handleAsk, handleGetConfig, handleTestConnection } from './handlers';
import type { AskMessage, BackgroundToContent } from './protocol';

const encoder = new TextEncoder();

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

const TEXT_ONLY = [
  { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
  { type: 'message_stop' },
];

const WITH_SEARCH = [
  { type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 1 } } },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search' },
  },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Found.' } },
  {
    type: 'content_block_delta',
    index: 1,
    delta: {
      type: 'citations_delta',
      citation: {
        type: 'web_search_result_location',
        url: 'https://example.com/page',
        title: 'Example page',
        encrypted_index: 'abc',
        cited_text: 'Found.',
      },
    },
  },
  { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
  { type: 'message_stop' },
];

function stubFetch(events: Array<Record<string, unknown>>) {
  const fetchMock = vi.fn(async () => new Response(sseBody(events), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

const ASK: AskMessage = {
  type: 'ask',
  requestId: 'req-1',
  system: 'sys',
  messages: [{ role: 'user', content: 'What is new?' }],
  maxTokens: 256,
};

async function runAsk(): Promise<BackgroundToContent[]> {
  const posted: BackgroundToContent[] = [];
  await handleAsk(ASK, (out) => posted.push(out), new Map());
  return posted;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleAsk', () => {
  it('offers the web search tool when the setting is on and relays searching + sources', async () => {
    await setSettings({ apiKey: 'sk-ant-test', webSearch: true });
    const fetchMock = stubFetch(WITH_SEARCH);

    const posted = await runAsk();

    expect(requestBody(fetchMock).tools).toEqual([WEB_SEARCH_TOOL]);
    expect(posted).toEqual([
      { type: 'searching', requestId: 'req-1' },
      { type: 'delta', requestId: 'req-1', text: 'Found.' },
      {
        type: 'done',
        requestId: 'req-1',
        usage: { input_tokens: 5, output_tokens: 3 },
        sources: [{ url: 'https://example.com/page', title: 'Example page' }],
      },
    ]);
  });

  it('sends no tools when web search is off', async () => {
    await setSettings({ apiKey: 'sk-ant-test', webSearch: false });
    const fetchMock = stubFetch(TEXT_ONLY);

    const posted = await runAsk();

    expect(requestBody(fetchMock)).not.toHaveProperty('tools');
    expect(posted.at(-1)).toEqual({
      type: 'done',
      requestId: 'req-1',
      usage: { input_tokens: 5, output_tokens: 2 },
      sources: [],
    });
  });

  it('reports a missing key without calling the API', async () => {
    const fetchMock = stubFetch(TEXT_ONLY);
    const posted = await runAsk();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(posted).toEqual([
      { type: 'error', requestId: 'req-1', error: { kind: 'auth', message: expect.any(String) } },
    ]);
  });
});

describe('handleTestConnection', () => {
  it('never includes the web search tool, even when the setting is on', async () => {
    await setSettings({ apiKey: 'sk-ant-test', webSearch: true });
    const fetchMock = stubFetch(TEXT_ONLY);

    const result = await handleTestConnection();

    expect(result).toEqual({ ok: true, model: 'claude-haiku-5-5', sample: 'OK' });
    expect(requestBody(fetchMock)).not.toHaveProperty('tools');
  });
});

describe('handleGetConfig', () => {
  it('returns non-secret settings only', async () => {
    await setSettings({ apiKey: 'sk-ant-secret', maxContextTokens: 4000 });
    const config = await handleGetConfig();
    expect(config).toEqual({ model: 'claude-haiku-5-5', maxContextTokens: 4000 });
    expect(JSON.stringify(config)).not.toContain('sk-ant');
  });
});
