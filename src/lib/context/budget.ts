import type { ExtractedContext } from './adapter';

/** Rough token estimate: chars / 3.5, rounded up (newer tokenizers are denser than chars/4). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Slice `text` down to at most `maxChars`, centered on the first occurrence of
 * `anchor` so the anchor is always inside the window (if present in the text).
 */
export function windowAround(text: string, anchor: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const idx = text.indexOf(anchor);
  if (idx === -1) return text.slice(0, maxChars);
  const center = idx + anchor.length / 2;
  let start = Math.max(0, Math.round(center - maxChars / 2));
  const end = Math.min(text.length, start + maxChars);
  start = Math.max(0, end - maxChars);
  return text.slice(start, end);
}

/**
 * Trim context to fit a token budget. Drops priorTurns oldest-first, then
 * precedingUserTurn, then shrinks containingMessage.text around the highlight.
 * The highlight itself is never removed.
 */
export function fitToBudget(ctx: ExtractedContext, maxTokens: number): ExtractedContext {
  const fitted: ExtractedContext = {
    ...ctx,
    containingMessage: { ...ctx.containingMessage },
    priorTurns: [...ctx.priorTurns],
  };

  const total = (): number =>
    estimateTokens(fitted.highlight) +
    estimateTokens(fitted.containingMessage.text) +
    (fitted.precedingUserTurn ? estimateTokens(fitted.precedingUserTurn.text) : 0) +
    fitted.priorTurns.reduce((sum, turn) => sum + estimateTokens(turn.text), 0);

  while (total() > maxTokens && fitted.priorTurns.length > 0) {
    fitted.priorTurns.shift(); // oldest first
  }
  if (total() > maxTokens && fitted.precedingUserTurn) {
    fitted.precedingUserTurn = undefined;
  }
  if (total() > maxTokens) {
    const budgetForMessage = maxTokens - estimateTokens(fitted.highlight);
    // Never below the highlight itself — the highlight is never removed.
    const maxChars = Math.max(fitted.highlight.length, Math.floor(budgetForMessage * 3.5));
    fitted.containingMessage.text = windowAround(
      fitted.containingMessage.text,
      fitted.highlight,
      maxChars,
    );
  }
  return fitted;
}
