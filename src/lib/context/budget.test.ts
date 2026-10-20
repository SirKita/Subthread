import { describe, expect, it } from 'vitest';
import type { ExtractedContext } from './adapter';
import { estimateTokens, fitToBudget } from './budget';

// Sizes chosen so token math is easy: estimateTokens = ceil(chars / 3.5)
const HIGHLIGHT = 'needle'; // 6 chars -> 2 tokens
const MESSAGE_TEXT = 'x'.repeat(347) + HIGHLIGHT + 'y'.repeat(347); // 700 chars -> 200 tokens
const PRECEDING = { role: 'user' as const, text: 'u'.repeat(350) }; // -> 100 tokens
const OLDEST = { role: 'user' as const, text: 'a'.repeat(350) }; // -> 100 tokens
const NEWER = { role: 'assistant' as const, text: 'b'.repeat(175) }; // -> 50 tokens
// grand total: 2 + 200 + 100 + 100 + 50 = 452 tokens

function makeCtx(): ExtractedContext {
  return {
    highlight: HIGHLIGHT,
    containingMessage: { role: 'assistant', text: MESSAGE_TEXT },
    precedingUserTurn: { ...PRECEDING },
    priorTurns: [{ ...OLDEST }, { ...NEWER }],
  };
}

describe('estimateTokens', () => {
  it('rounds chars / 3.5 up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abc')).toBe(1); // 3 / 3.5 -> 1
    expect(estimateTokens('abcd')).toBe(2); // 4 / 3.5 -> 2
    expect(estimateTokens('x'.repeat(35))).toBe(10);
  });
});

describe('fitToBudget', () => {
  it('returns the context unchanged when it fits', () => {
    const ctx = makeCtx();
    expect(fitToBudget(ctx, 452)).toEqual(ctx);
  });

  it('drops prior turns oldest-first before touching anything else', () => {
    const fitted = fitToBudget(makeCtx(), 360); // 452 - 100 (oldest) = 352 fits
    expect(fitted.priorTurns).toEqual([NEWER]);
    expect(fitted.precedingUserTurn).toEqual(PRECEDING);
    expect(fitted.containingMessage.text).toBe(MESSAGE_TEXT);
  });

  it('drops precedingUserTurn after all prior turns', () => {
    const fitted = fitToBudget(makeCtx(), 300); // needs both prior turns AND preceding gone
    expect(fitted.priorTurns).toEqual([]);
    expect(fitted.precedingUserTurn).toBeUndefined();
    expect(fitted.containingMessage.text).toBe(MESSAGE_TEXT); // message untouched (202 <= 300)
  });

  it('shrinks containingMessage.text around the highlight last', () => {
    const fitted = fitToBudget(makeCtx(), 50);
    expect(fitted.priorTurns).toEqual([]);
    expect(fitted.precedingUserTurn).toBeUndefined();
    expect(fitted.containingMessage.text.length).toBeLessThanOrEqual(Math.floor((50 - 2) * 3.5));
    expect(fitted.containingMessage.text).toContain(HIGHLIGHT);
  });

  it('never removes the highlight, even on an impossible budget', () => {
    const fitted = fitToBudget(makeCtx(), 1);
    expect(fitted.containingMessage.text).toContain(HIGHLIGHT);
  });

  it('does not mutate the input context', () => {
    const ctx = makeCtx();
    fitToBudget(ctx, 1);
    expect(ctx.priorTurns).toHaveLength(2);
    expect(ctx.precedingUserTurn).toEqual(PRECEDING);
    expect(ctx.containingMessage.text).toBe(MESSAGE_TEXT);
  });
});
