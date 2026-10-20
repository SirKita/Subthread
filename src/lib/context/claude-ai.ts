import type { ConversationAdapter, ExtractedContext } from './adapter';
import { windowAround } from './budget';

// Selectors that identify a chat message element on claude.ai — calibrated in Phase 2.
// Ordered: earlier entries are the stronger signals.
export const MESSAGE_SELECTORS = ['[data-testid*="message"]', '[class*="message"]', 'article'];

const MIN_HIGHLIGHT_CHARS = 2;
const MAX_HIGHLIGHT_CHARS = 1500;
const MIN_MESSAGE_CHARS = 300;
const MAX_MESSAGE_WINDOW_CHARS = 6000;

/**
 * Phase 1 adapter: deliberately naive. Takes the selection as the highlight and
 * the nearest plausible "message element" as the containing message. Prior
 * turns are not extracted yet.
 */
export const claudeAiAdapter: ConversationAdapter = {
  extract(selection: Selection): ExtractedContext | null {
    if (selection.isCollapsed || selection.rangeCount === 0) return null;

    const highlight = selection.toString().trim();
    if (highlight.length < MIN_HIGHLIGHT_CHARS || highlight.length > MAX_HIGHLIGHT_CHARS) {
      return null;
    }

    if (isInEditable(selection.anchorNode)) return null;

    const range = selection.getRangeAt(0);
    const start = elementOf(range.commonAncestorContainer);
    if (!start) return null;

    const messageElement = findMessageElement(start);
    const text = windowAround(textOf(messageElement), highlight, MAX_MESSAGE_WINDOW_CHARS);

    return {
      highlight,
      containingMessage: { role: 'assistant', text },
      precedingUserTurn: undefined, // Phase 2
      priorTurns: [], // Phase 2
    };
  },
};

/** Nearest ancestor that looks like a chat message; falls back to the start element. */
function findMessageElement(start: Element): Element {
  const selector = MESSAGE_SELECTORS.join(', ');
  let el: Element | null = start;
  while (el) {
    if (el.matches(selector) || textOf(el).length >= MIN_MESSAGE_CHARS) return el;
    if (el === el.ownerDocument.body) break;
    el = el.parentElement;
  }
  return start;
}

function isInEditable(node: Node | null): boolean {
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  return el?.closest('input, textarea, [contenteditable="true"]') != null;
}

function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function textOf(el: Element): string {
  // innerText approximates what the user sees; textContent is the fallback for
  // environments without layout (e.g. happy-dom in tests).
  return (el as HTMLElement).innerText ?? el.textContent ?? '';
}
