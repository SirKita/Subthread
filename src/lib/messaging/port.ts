import type { StreamParams } from '../api/claude-client';
import { PORT_NAME } from './protocol';
import type { AskMessage, BackgroundToContent, ErrorMessage } from './protocol';

export interface StreamCallbacks {
  onDelta(text: string): void;
  onDone(): void;
  onError(error: ErrorMessage['error']): void;
}

/**
 * Stream one answer over a dedicated runtime port (one port per request).
 * Returns an abort function; aborting cancels the request in the background.
 * After done/error/abort the port is closed and no further callbacks fire.
 */
export function streamAsk(
  request: { system: string; messages: StreamParams['messages']; maxTokens: number },
  callbacks: StreamCallbacks,
): () => void {
  const requestId = crypto.randomUUID();
  const port = chrome.runtime.connect({ name: PORT_NAME });
  let settled = false;

  port.onMessage.addListener((raw) => {
    const msg = raw as BackgroundToContent;
    if (settled || msg.requestId !== requestId) return;
    if (msg.type === 'delta') {
      callbacks.onDelta(msg.text);
    } else if (msg.type === 'done') {
      settled = true;
      port.disconnect();
      callbacks.onDone();
    } else {
      settled = true;
      port.disconnect();
      callbacks.onError(msg.error);
    }
  });

  // Fires when the background side goes away (not on our own disconnect()).
  port.onDisconnect.addListener(() => {
    if (settled) return;
    settled = true;
    callbacks.onError({ kind: 'network', message: 'Lost connection to the extension' });
  });

  const ask: AskMessage = { type: 'ask', requestId, ...request };
  port.postMessage(ask);

  return () => {
    if (settled) return;
    settled = true;
    try {
      port.postMessage({ type: 'abort', requestId });
      port.disconnect();
    } catch {
      // port already gone — background aborts via its own onDisconnect
    }
  };
}
