import { describe, expect, it } from 'vitest';
import { parseSse, type SseEvent } from './sse';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of parseSse(streamFromChunks(chunks))) events.push(event);
  return events;
}

describe('parseSse', () => {
  it('parses one complete event per chunk', async () => {
    const events = await collect([
      'event: ping\ndata: {"type":"ping"}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]);
    expect(events).toEqual([
      { event: 'ping', data: '{"type":"ping"}' },
      { event: 'message_stop', data: '{"type":"message_stop"}' },
    ]);
  });

  it('parses an event split mid-line across two chunks', async () => {
    const events = await collect([
      'event: content_bl',
      'ock_delta\ndata: {"type":"content_block_delta","del',
      'ta":{"type":"text_delta","text":"hi"}}\n\n',
    ]);
    expect(events).toEqual([
      {
        event: 'content_block_delta',
        data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}',
      },
    ]);
  });

  it('parses three events arriving in a single chunk', async () => {
    const events = await collect([
      'event: a\ndata: {"n":1}\n\n' + 'event: b\ndata: {"n":2}\n\n' + 'event: c\ndata: {"n":3}\n\n',
    ]);
    expect(events.map((e) => e.event)).toEqual(['a', 'b', 'c']);
    expect(events.map((e) => JSON.parse(e.data))).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it('parses a realistic Messages API stream split at awkward byte offsets', async () => {
    const fixture = [
      [
        'message_start',
        '{"type":"message_start","message":{"id":"msg_01","usage":{"input_tokens":12,"output_tokens":1}}}',
      ],
      [
        'content_block_start',
        '{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      ],
      [
        'content_block_delta',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}',
      ],
      [
        'content_block_delta',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo "}}',
      ],
      [
        'content_block_delta',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"world"}}',
      ],
      ['content_block_stop', '{"type":"content_block_stop","index":0}'],
      [
        'message_delta',
        '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":9}}',
      ],
      ['message_stop', '{"type":"message_stop"}'],
    ] as const;
    const raw = fixture.map(([event, data]) => `event: ${event}\ndata: ${data}\n\n`).join('');

    // Chop into 7-byte chunks so boundaries land mid-field-name, mid-JSON, and mid-delimiter.
    const chunks: string[] = [];
    for (let i = 0; i < raw.length; i += 7) chunks.push(raw.slice(i, i + 7));

    const events = await collect(chunks);
    expect(events.map((e) => e.event)).toEqual(fixture.map(([event]) => event));
    expect(events.map((e) => e.data)).toEqual(fixture.map(([, data]) => data));

    const text = events
      .filter((e) => e.event === 'content_block_delta')
      .map((e) => (JSON.parse(e.data) as { delta: { text: string } }).delta.text)
      .join('');
    expect(text).toBe('Hello world');
  });
});
