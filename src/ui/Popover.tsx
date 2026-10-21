import { useEffect, useRef, useState } from 'preact/hooks';
import type { Mode } from '../lib/api/prompts';
import { buildRequest } from '../lib/api/prompts';
import { BRAND } from '../lib/brand';
import type { ExtractedContext } from '../lib/context/adapter';
import type { SideExchange } from '../lib/context/budget';
import { conversationIdFromPathname } from '../lib/context/claude-ai';
import { saveThread, type SavedThread } from '../lib/history/store';
import { streamAsk } from '../lib/messaging/port';
import type { ErrorMessage } from '../lib/messaging/protocol';
import { sendGetConfig, sendOpenOptions } from '../lib/messaging/protocol';
import { eventTargetElement, isEditableTarget, isWithin } from './dom';
import { HistoryList } from './HistoryList';
import { installInputGuard } from './input-guard';
import { clampToViewport } from './position';
import type { AnchorRect } from './types';

const MARGIN = 12;
const MAX_WIDTH = 440;
const GAP = 8;
const HEADER_HIGHLIGHT_CHARS = 60;

type Status = 'input' | 'waiting' | 'streaming' | 'done' | 'error';
type View = 'thread' | 'history';
type StreamError = ErrorMessage['error'];

interface Props {
  /** Present for selection-born popovers; absent when opened straight into history. */
  mode?: Mode;
  ctx?: ExtractedContext;
  /** null → fallback position: right edge of the viewport, vertically centered. */
  rect: AnchorRect | null;
  initialView?: View;
  onClose: () => void;
}

export function Popover({ mode: initialMode, ctx: initialCtx, rect, initialView, onClose }: Props) {
  const [view, setView] = useState<View>(initialView ?? 'thread');
  const [mode, setMode] = useState<Mode>(initialMode ?? 'explain');
  const [ctx, setCtx] = useState<ExtractedContext | undefined>(initialCtx);
  const [anchor, setAnchor] = useState<AnchorRect | null>(rect);
  const [status, setStatus] = useState<Status>(() => {
    if ((initialView ?? 'thread') === 'history' || !initialCtx) return 'done';
    return initialMode === 'ask' ? 'input' : 'waiting';
  });
  // The side thread: completed exchanges plus (while streaming) the pending one.
  const [thread, setThread] = useState<SideExchange[]>([]);
  const [error, setError] = useState<StreamError | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const abortRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const threadIdRef = useRef<string>(crypto.randomUUID());
  const createdAtRef = useRef<number>(Date.now());
  const streamedRef = useRef(false); // persist only threads that actually streamed here
  const [, bumpReposition] = useState(0);
  // Dragging: once dragged, dragPos (fixed top/left) wins over the anchor.
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });

  // Deliberately NOT memoized: each render's `start` closes over current state;
  // submits go through submitRef (updated every render).
  const start = async (askQuestion?: string) => {
    if (!ctx) return;
    const completed = thread; // all exchanges are complete when a submit is possible
    streamedRef.current = true;
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
    if ((initialView ?? 'thread') === 'thread' && initialMode === 'explain' && initialCtx) {
      void start();
    }
    return () => {
      abortRef.current?.();
      abortRef.current = null;
    };
  }, []);

  // Persist after each completed (or stopped-with-partial-text) exchange, but
  // only for threads that streamed in this popover and have a conversation id.
  useEffect(() => {
    if (status !== 'done' || !streamedRef.current || !ctx?.conversationId) return;
    const exchanges = thread.filter((exchange) => exchange.answer.trim() !== '');
    if (exchanges.length === 0) return;
    const saved: SavedThread = {
      id: threadIdRef.current,
      conversationId: ctx.conversationId,
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
      mode,
      highlight: ctx.highlight,
      ctx,
      exchanges,
    };
    void saveThread(saved);
  }, [status]);

  const openSavedThread = (saved: SavedThread): void => {
    abortRef.current?.();
    abortRef.current = null;
    setCtx(saved.ctx);
    setMode(saved.mode);
    setThread(saved.exchanges);
    threadIdRef.current = saved.id;
    createdAtRef.current = saved.createdAt;
    streamedRef.current = false;
    setAnchor(null); // the original selection is gone — use the edge fallback
    setDragPos(null); // new position context: forget any drag
    setError(null);
    setStatus('done');
    setView('thread');
  };

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [status, view]);

  // The window-capture input guard stops events before they reach our input,
  // so the input is uncontrolled and Enter/Escape are handled here via refs
  // (the guard is installed once; refs keep the handlers current).
  const inputVisible =
    view === 'thread' && !!ctx && (status === 'input' || status === 'done' || status === 'error');
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
    const onResize = () => {
      bumpReposition((n) => n + 1);
      // Re-clamp a dragged popover into the new viewport.
      setDragPos((prev) => {
        const el = containerRef.current;
        if (!prev || !el) return prev;
        const box = el.getBoundingClientRect();
        return clampToViewport(
          prev.x,
          prev.y,
          box.width,
          box.height,
          window.innerWidth,
          window.innerHeight,
          MARGIN,
        );
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // --- drag (pointer events on the header, excluding its buttons) ---
  const onHeaderPointerDown = (e: PointerEvent) => {
    if (eventTargetElement(e)?.closest('button')) return;
    e.preventDefault(); // don't disturb the page selection
    const el = containerRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    dragOffset.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
    // Converts a bottom-anchored (flipped-above) popover to top/left on first drag.
    setDragPos(
      clampToViewport(
        box.left,
        box.top,
        box.width,
        box.height,
        window.innerWidth,
        window.innerHeight,
        MARGIN,
      ),
    );
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHeaderPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const el = containerRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setDragPos(
      clampToViewport(
        e.clientX - dragOffset.current.dx,
        e.clientY - dragOffset.current.dy,
        box.width,
        box.height,
        window.innerWidth,
        window.innerHeight,
        MARGIN,
      ),
    );
  };

  const onHeaderPointerUp = (e: PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const stop = () => {
    abortRef.current?.();
    abortRef.current = null;
    setStatus('done'); // the partial answer stays in the thread and is persisted
  };

  const copyAnswer = () => {
    navigator.clipboard.writeText(lastAnswer).then(
      () => setCopyState('copied'),
      () => setCopyState('failed'),
    );
  };

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 1500);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const lastAnswer = thread.length > 0 ? thread[thread.length - 1]!.answer : '';
  const conversationId =
    ctx?.conversationId ?? conversationIdFromPathname(window.location.pathname);

  // --- positioning: fixed, near the selection, clamped to the viewport;
  // no anchor → right edge, vertically centered; dragged → dragPos wins ---
  const width = Math.min(MAX_WIDTH, window.innerWidth - 2 * MARGIN);
  const style: Record<string, string> = { width: `${width}px` };
  if (dragPos) {
    style.left = `${dragPos.x}px`;
    style.top = `${dragPos.y}px`;
  } else if (anchor) {
    const left = Math.min(Math.max(MARGIN, anchor.left), window.innerWidth - width - MARGIN);
    const spaceBelow = window.innerHeight - anchor.bottom;
    const placeBelow = spaceBelow >= 240 || spaceBelow >= anchor.top;
    style.left = `${left}px`;
    if (placeBelow) {
      style.top = `${Math.max(MARGIN, Math.min(anchor.bottom + GAP, window.innerHeight - MARGIN - 160))}px`;
    } else {
      style.bottom = `${Math.max(MARGIN, Math.min(window.innerHeight - anchor.top + GAP, window.innerHeight - MARGIN - 160))}px`;
    }
  } else {
    style.right = `${MARGIN}px`;
    style.top = '50%';
    style.transform = 'translateY(-50%)';
  }

  const headerText = ctx
    ? ctx.highlight.length > HEADER_HIGHLIGHT_CHARS
      ? ctx.highlight.slice(0, HEADER_HIGHLIGHT_CHARS) + '…'
      : ctx.highlight
    : BRAND.name;

  return (
    <div
      ref={containerRef}
      class={`st-popover${dragging ? ' st-dragging' : ''}`}
      style={style}
      // Keep the page selection alive, but never block editable targets or
      // text selection inside the thread body.
      onMouseDown={(e) => {
        if (!isEditableTarget(e) && !isWithin(e, '.st-thread')) e.preventDefault();
      }}
    >
      <header
        class="st-header"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        {view === 'history' && ctx && (
          <button
            type="button"
            class="st-icon"
            title="Back"
            aria-label="Back"
            onClick={() => setView('thread')}
          >
            ←
          </button>
        )}
        <span class="st-highlight" title={headerText}>
          {view === 'history' ? 'History' : headerText}
        </span>
        {view === 'thread' && (
          <button
            type="button"
            class="st-icon"
            title="History"
            aria-label="History"
            onClick={() => setView('history')}
          >
            ☰
          </button>
        )}
        <button
          type="button"
          class="st-icon"
          title="Settings"
          aria-label="Settings"
          onClick={() => sendOpenOptions()}
        >
          ⚙
        </button>
        <button type="button" class="st-close" title="Close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>

      {view === 'history' ? (
        <div class="st-body">
          <HistoryList conversationId={conversationId} onOpen={openSavedThread} />
        </div>
      ) : (
        <>
          <div class="st-body st-thread">
            {thread.map((exchange, i) => (
              <div class="st-exchange" key={i}>
                {exchange.question && <div class="st-q">{exchange.question}</div>}
                {exchange.answer && <div class="st-answer">{exchange.answer}</div>}
              </div>
            ))}

            {status === 'waiting' && (
              <div class="st-pending" role="status" aria-label="Waiting for the answer">
                <span class="st-dot" />
                <span class="st-dot" />
                <span class="st-dot" />
              </div>
            )}

            {status === 'error' && error && <ErrorView error={error} />}

            {inputVisible && (
              // Uncontrolled on purpose: the input guard stops key/input events
              // at window capture, so onInput/onKeyDown here would never fire.
              // Enter is handled by the guard; the value is read from the ref.
              <input
                ref={inputRef}
                class="st-question"
                type="text"
                placeholder={thread.length === 0 ? 'Ask about this…' : 'Ask a follow-up…'}
              />
            )}
          </div>

          {(status === 'streaming' || (status === 'done' && lastAnswer)) && (
            <footer class="st-footer">
              {status === 'streaming' ? (
                <button type="button" onClick={stop}>
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  title="Copy answer"
                  aria-label="Copy answer"
                  disabled={copyState !== 'idle'}
                  onClick={copyAnswer}
                >
                  {copyState === 'idle' ? 'Copy' : copyState === 'copied' ? 'Copied' : 'Copy failed'}
                </button>
              )}
            </footer>
          )}
        </>
      )}
    </div>
  );
}

function ErrorView({ error }: { error: StreamError }) {
  const { text, settings } = friendlyError(error);
  return (
    <div class="st-error">
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
