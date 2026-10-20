import type { ExtractedContext } from './adapter';
import { windowAround } from './budget';

// Phase 1's naive strategy, kept as the last-resort fallback when no
// transcript row is found (e.g. claude.ai markup changed, or a non-chat page).
// Selectors ordered: earlier entries are the stronger signals.
export const MESSAGE_SELECTORS = ['[data-testid*="message"]', '[class*="message"]', 'article'];

const MIN_HIGHLIGHT_CHARS = 2;
const MAX_HIGHLIGHT_CHARS = 1500;
const MIN_MESSAGE_CHARS = 300;
const MAX_MESSAGE_WINDOW_CHARS = 6000;

/**
 * Naive extraction: the nearest plausible "message element" (selector match or
 * ≥300 chars of text), windowed to 6000 chars around the highlight. No prior
 * turns, no position.
 */
export function extractNaive(selection: Selection): ExtractedContext | null {
  if (!passesSelectionRules(selection)) return null;

  const highlight = selection.toString().trim();
  const range = selection.getRangeAt(0);
  const start = elementOf(range.commonAncestorContainer);
  if (!start) return null;

  const messageElement = findMessageElement(start);
  const text = windowAround(textOf(messageElement), highlight, MAX_MESSAGE_WINDOW_CHARS);

  return {
    highlight,
    containingMessage: { role: 'assistant', text },
    precedingUserTurn: undefined,
    priorTurns: [],
    strategy: 'naive',
  };
}

/** Shared null rules: collapsed selection, highlight size, editable targets. */
export function passesSelectionRules(selection: Selection): boolean {
  if (selection.isCollapsed || selection.rangeCount === 0) return false;
  const highlight = selection.toString().trim();
  if (highlight.length < MIN_HIGHLIGHT_CHARS || highlight.length > MAX_HIGHLIGHT_CHARS) {
    return false;
  }
  return !isInEditable(selection.anchorNode);
}

export function elementOf(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

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

function textOf(el: Element): string {
  // innerText approximates what the user sees; textContent is the fallback for
  // environments without layout (e.g. happy-dom in tests).
  return (el as HTMLElement).innerText ?? el.textContent ?? '';
}
