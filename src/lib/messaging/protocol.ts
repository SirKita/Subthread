import type { StreamParams } from '../api/claude-client';
import type { ApiErrorKind } from '../api/errors';

/** Name of the long-lived port used for streaming answers. */
export const PORT_NAME = 'side-question';

// ---- Content script -> background (over the port) ----

export interface AskMessage {
  type: 'ask';
  requestId: string;
  system: string;
  messages: StreamParams['messages'];
  maxTokens: number;
}

export interface AbortMessage {
  type: 'abort';
  requestId: string;
}

export type ContentToBackground = AskMessage | AbortMessage;

// ---- Background -> content script (over the port) ----

export interface DeltaMessage {
  type: 'delta';
  requestId: string;
  text: string;
}

export interface DoneMessage {
  type: 'done';
  requestId: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface ErrorMessage {
  type: 'error';
  requestId: string;
  error: { kind: ApiErrorKind; message: string; status?: number };
}

export type BackgroundToContent = DeltaMessage | DoneMessage | ErrorMessage;

// ---- One-shot runtime messages ----

export interface TestConnectionRequest {
  type: 'test-connection';
}

export type TestConnectionResponse =
  | { ok: true; model: string; sample: string }
  | { ok: false; error: { kind: ApiErrorKind; message: string; status?: number } };

export function sendTestConnection(): Promise<TestConnectionResponse> {
  const request: TestConnectionRequest = { type: 'test-connection' };
  return chrome.runtime.sendMessage(request);
}
