import { streamMessage } from '../api/claude-client';
import { toApiError } from '../api/errors';
import { getSettings } from '../storage/settings';
import type { AskMessage, BackgroundToContent, TestConnectionResponse } from './protocol';

/** Stream an answer for an "ask" message, forwarding deltas via `post`. */
export async function handleAsk(
  msg: AskMessage,
  post: (out: BackgroundToContent) => void,
  inFlight: Map<string, AbortController>,
): Promise<void> {
  const controller = new AbortController();
  inFlight.set(msg.requestId, controller);
  try {
    const settings = await getSettings();
    const stream = streamMessage({
      apiKey: settings.apiKey,
      model: settings.model,
      system: msg.system,
      messages: msg.messages,
      maxTokens: msg.maxTokens,
      signal: controller.signal,
    });
    for await (const event of stream) {
      if (event.type === 'text') {
        post({ type: 'delta', requestId: msg.requestId, text: event.text });
      } else {
        post({ type: 'done', requestId: msg.requestId, usage: event.usage });
      }
    }
  } catch (err) {
    const apiError = toApiError(err);
    post({
      type: 'error',
      requestId: msg.requestId,
      error: { kind: apiError.kind, message: apiError.message, status: apiError.status },
    });
  } finally {
    inFlight.delete(msg.requestId);
  }
}

/** Run the options-page "Test connection" round trip against the API. */
export async function handleTestConnection(): Promise<TestConnectionResponse> {
  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      return {
        ok: false,
        error: { kind: 'auth', message: 'No API key saved. Add one and press Save first.' },
      };
    }
    let sample = '';
    const stream = streamMessage({
      apiKey: settings.apiKey,
      model: settings.model,
      system: '',
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      maxTokens: 10,
    });
    for await (const event of stream) {
      if (event.type === 'text') sample += event.text;
    }
    return { ok: true, model: settings.model, sample: sample.trim() };
  } catch (err) {
    const apiError = toApiError(err);
    return {
      ok: false,
      error: { kind: apiError.kind, message: apiError.message, status: apiError.status },
    };
  }
}
