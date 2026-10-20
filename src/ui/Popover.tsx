import { useEffect, useRef, useState } from 'preact/hooks';
import type { Mode } from '../lib/api/prompts';
import { buildRequest } from '../lib/api/prompts';
import type { ExtractedContext } from '../lib/context/adapter';
import type { SideExchange } from '../lib/context/budget';
import { streamAsk } from '../lib/messaging/port';
import type { ErrorMessage } from '../lib/messaging/protocol';
import { sendGetConfig, sendOpenOptions } from '../lib/messaging/protocol';
import { isEditableTarget } from './dom';
import { installInputGuard } from './input-guard';
import type { AnchorRect } from './types';

const MARGIN = 12;
const MAX_WIDTH = 440;
const GAP = 8;
const HEADER_HIGHLIGHT_CHARS = 60;

type Status = 'input' | 'waiting' | 'streaming' | 'done' | 'error';
type StreamError = ErrorMessage['error'];

interface Props {
  mode: Mode;
  ctx: ExtractedContext;
  rect: AnchorRect;
  onClose: () => void;
}

export function Popover({ mode, ctx, rect, onClose }: Props) {
  const [status, setStatus] = useState<Status>(mode === 'ask' ? 'input' : 'waiting');
  // The side thread: completed exchanges plus (while streaming) the pending one.
  const [thread, setThread] = useState<SideExchange[]>([]);
  const [error, setError] = useState<StreamError | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, bumpReposition] = useState(0);

  // Deliberately NOT memoized: each render's `start` closes over the current
  // thread, and submits go through submitRef (updated every render).
  const start = async (askQuestion?: string) => {
    const completed = thread; // all exchanges are complete when a submit is possible
    setStatus('waiting');
    setError(null);
    setThread([...completed, { question: askQuestion, answer: '' }]);
    try {
      const config = await sendGetConfig();
      const request = buildRequest(ctx, mode, askQuestion, config.maxContextTokens, completed);
      abortRef.current = streamAsk(request, {
        onDelta: (text) => {
          setStatus('streaming');
          setThread((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last) next[next.length - 1] = { ...last, answer: last.answer + text };
            return next;
          });
        },
        onDone: () => {
          abortRef.current = null;
          setStatus('done');
        },
        onError: (streamError) => {
          abortRef.current = null;
          setThread((prev) => prev.slice(0, -1)); // drop the failed pending exchange
          setError(streamError);
          setStatus('error');
        },
      });
    } catch {
      setThread((prev) => prev.slice(0, -1));
      setError({ kind: 'unknown', message: 'Could not reach the extension background worker' });
      setStatus('error');
    }
  };

  // Explain streams immediately; Ask waits for the question. Cleanup aborts in-flight.
  useEffect(() => {
    if (mode === 'explain') void start();
    return () => {
      abortRef.current?.();
      abortRef.current = null;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [status]);

  // The window-capture input guard stops events before they reach our input,
  // so the input is uncontrolled and Enter/Escape are handled here via refs
  // (the guard is installed once; refs keep the handlers current).
  const inputVisible = status === 'input' || status === 'done' || status === 'error';
  const submitQuestion = () => {
    const value = inputRef.current?.value.trim();
    if (!value || !inputVisible) return;
    if (inputRef.current) inputRef.current.value = '';
    void start(value);
  };
  const submitRef = useRef(submitQuestion);
  submitRef.current = submitQuestion;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const root = containerRef.current?.getRootNode();
    const host = root instanceof ShadowRoot ? (root.host as HTMLElement) : null;
    if (!host) return;
    return installInputGuard(host, {
      onEnter: () => submitRef.current(),
      onEscape: () => closeRef.current(),
    });
  }, []);

  useEffect(() => {
    const onResize = () => bumpReposition((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const stop = () => {
    abortRef.current?.();
    abortRef.current = null;
    setStatus('done'); // the partial answer stays in the thread
  };

  const lastAnswer = thread.length > 0 ? thread[thread.length - 1]!.answer : '';

  // --- positioning: fixed, near the selection, clamped to the viewport ---
  const width = Math.min(MAX_WIDTH, window.innerWidth - 2 * MARGIN);
  const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - width - MARGIN);
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeBelow = spaceBelow >= 240 || spaceBelow >= rect.top;
  const style: Record<string, string> = { left: `${left}px`, width: `${width}px` };
  if (placeBelow) {
    style.top = `${Math.max(MARGIN, Math.min(rect.bottom + GAP, window.innerHeight - MARGIN - 160))}px`;
  } else {
    style.bottom = `${Math.max(MARGIN, Math.min(window.innerHeight - rect.top + GAP, window.innerHeight - MARGIN - 160))}px`;
  }

  const headerText =
    ctx.highlight.length > HEADER_HIGHLIGHT_CHARS
      ? ctx.highlight.slice(0, HEADER_HIGHLIGHT_CHARS) + '…'
      : ctx.highlight;

  return (
    <div
      ref={containerRef}
      class="sq-popover"
      style={style}
      // Keep the page selection alive, but never block focus on editable targets.
      onMouseDown={(e) => {
        if (!isEditableTarget(e)) e.preventDefault();
      }}
    >
      <header class="sq-header">
        <span class="sq-highlight" title={headerText}>
          {headerText}
        </span>
        <button type="button" class="sq-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>

      <div class="sq-body">
        {thread.map((exchange, i) => (
          <div class="sq-exchange" key={i}>
            {exchange.question && <div class="sq-q">{exchange.question}</div>}
            {exchange.answer && <div class="sq-answer">{exchange.answer}</div>}
          </div>
        ))}

        {status === 'waiting' && <div class="sq-pending">…</div>}

        {status === 'error' && error && <ErrorView error={error} />}

        {inputVisible && (
          // Uncontrolled on purpose: the input guard stops key/input events
          // at window capture, so onInput/onKeyDown here would never fire.
          // Enter is handled by the guard; the value is read from the ref.
          <input
            ref={inputRef}
            class="sq-question"
            type="text"
            placeholder={thread.length === 0 ? 'Ask about this…' : 'Ask a follow-up…'}
          />
        )}
      </div>

      {(status === 'streaming' || (status === 'done' && lastAnswer)) && (
        <footer class="sq-footer">
          {status === 'streaming' ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(lastAnswer).catch(() => {})}
            >
              Copy
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

function ErrorView({ error }: { error: StreamError }) {
  const { text, settings } = friendlyError(error);
  return (
    <div class="sq-error">
      <p>{text}</p>
      {settings && (
        <button type="button" onClick={() => sendOpenOptions()}>
          Open settings
        </button>
      )}
    </div>
  );
}

function friendlyError(error: StreamError): { text: string; settings: boolean } {
  switch (error.kind) {
    case 'auth':
      return { text: 'API key missing or invalid', settings: true };
    case 'credit':
      return { text: 'Out of API credits', settings: true };
    case 'rate_limit':
      return { text: 'Rate limited — try again in a moment', settings: false };
    case 'network':
    case 'server':
      return { text: "Couldn't reach Claude — try again", settings: false };
    default:
      return { text: error.message, settings: false };
  }
}
