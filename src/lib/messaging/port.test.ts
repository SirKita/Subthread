import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamAsk } from './port';
import type { AbortMessage, AskMessage, BackgroundToContent } from './protocol';

function makeFakePort() {
  const messageListeners: Array<(msg: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  return {
    posted: [] as unknown[],
    disconnect: vi.fn(),
    postMessage(msg: unknown) {
      this.posted.push(msg);
    },
    onMessage: { addListener: (l: (msg: unknown) => void) => messageListeners.push(l) },
    onDisconnect: { addListener: (l: () => void) => disconnectListeners.push(l) },
    emit(msg: BackgroundToContent) {
      for (const l of messageListeners) l(msg);
    },
    emitDisconnect() {
      for (const l of disconnectListeners) l();
    },
  };
}

const REQUEST = {
  system: 'system prompt',
  messages: [{ role: 'user' as const, content: 'question' }],
  maxTokens: 1024,
};

function callbacks() {
  return { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
}

const originalConnect = chrome.runtime.connect;

afterEach(() => {
  chrome.runtime.connect = originalConnect;
});

describe('streamAsk', () => {
  it('posts the ask, routes deltas/done for its own requestId, then disconnects', () => {
    const port = makeFakePort();
    chrome.runtime.connect = (() => port) as unknown as typeof chrome.runtime.connect;
    const cb = callbacks();

    streamAsk(REQUEST, cb);

    const ask = port.posted[0] as AskMessage;
    expect(ask.type).toBe('ask');
    expect(ask.system).toBe('system prompt');
    expect(ask.maxTokens).toBe(1024);

    port.emit({ type: 'delta', requestId: 'someone-else', text: 'ignored' });
    port.emit({ type: 'delta', requestId: ask.requestId, text: 'Hel' });
    port.emit({ type: 'done', requestId: ask.requestId });

    expect(cb.onDelta).toHaveBeenCalledExactlyOnceWith('Hel');
    expect(cb.onDone).toHaveBeenCalledOnce();
    expect(cb.onError).not.toHaveBeenCalled();
    expect(port.disconnect).toHaveBeenCalledOnce();
  });

  it('abort (the close/Escape path) sends the abort message, disconnects, and silences callbacks', () => {
    const port = makeFakePort();
    chrome.runtime.connect = (() => port) as unknown as typeof chrome.runtime.connect;
    const cb = callbacks();

    const abort = streamAsk(REQUEST, cb);
    const ask = port.posted[0] as AskMessage;

    abort();

    const abortMsg = port.posted[1] as AbortMessage;
    expect(abortMsg).toEqual({ type: 'abort', requestId: ask.requestId });
    expect(port.disconnect).toHaveBeenCalledOnce();

    // Anything arriving after abort is ignored — no late UI updates.
    port.emit({ type: 'delta', requestId: ask.requestId, text: 'late' });
    port.emit({ type: 'done', requestId: ask.requestId });
    expect(cb.onDelta).not.toHaveBeenCalled();
    expect(cb.onDone).not.toHaveBeenCalled();

    // Aborting twice is a no-op.
    abort();
    expect(port.posted).toHaveLength(2);
  });

  it('surfaces an unexpected background disconnect as a network error', () => {
    const port = makeFakePort();
    chrome.runtime.connect = (() => port) as unknown as typeof chrome.runtime.connect;
    const cb = callbacks();

    streamAsk(REQUEST, cb);
    port.emitDisconnect();

    expect(cb.onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: 'network' }),
    );
  });
});
