import { describe, expect, it } from 'vitest';
import type { ExtractedContext } from './adapter';
import type { SideExchange } from './budget';
import { estimateTokens, fitToBudget } from './budget';

// Sizes chosen so token math is easy: estimateTokens = ceil(chars / 3.5)
const HIGHLIGHT = 'needle'; // 6 chars -> 2 tokens
const MESSAGE_TEXT = 'x'.repeat(347) + HIGHLIGHT + 'y'.repeat(347); // 700 chars -> 200 tokens
const PRECEDING = { role: 'user' as const, text: 'u'.repeat(350) }; // -> 100 tokens
const OLDEST = { role: 'user' as const, text: 'a'.repeat(350) }; // -> 100 tokens
const NEWER = { role: 'assistant' as const, text: 'b'.repeat(175) }; // -> 50 tokens
// context total: 2 + 200 + 100 + 100 + 50 = 452 tokens

function makeCtx(): ExtractedContext {
  return {
    highlight: HIGHLIGHT,
    containingMessage: { role: 'assistant', text: MESSAGE_TEXT },
    precedingUserTurn: { ...PRECEDING },
    priorTurns: [{ ...OLDEST }, { ...NEWER }],
  };
}

// 35-char question + 70-char answer -> 10 + 20 = 30 tokens per exchange
const EXCHANGE_1: SideExchange = { question: 'q'.repeat(35), answer: 'A'.repeat(70) };
const EXCHANGE_2: SideExchange = { question: 'r'.repeat(35), answer: 'B'.repeat(70) };
// thread total: 60 tokens; grand total with context: 512

describe('estimateTokens', () => {
  it('rounds chars / 3.5 up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abc')).toBe(1); // 3 / 3.5 -> 1
    expect(estimateTokens('abcd')).toBe(2); // 4 / 3.5 -> 2
    expect(estimateTokens('x'.repeat(35))).toBe(10);
  });
});

describe('fitToBudget', () => {
  it('returns everything unchanged when it fits', () => {
    const ctx = makeCtx();
    const fitted = fitToBudget(ctx, 512, [EXCHANGE_1, EXCHANGE_2]);
    expect(fitted.ctx).toEqual(ctx);
    expect(fitted.sideThread).toEqual([EXCHANGE_1, EXCHANGE_2]);
  });

  it('drops side-thread exchanges oldest-first before any conversation context', () => {
    // 512 total; budget 470 needs 42 tokens freed -> dropping EXCHANGE_1 (30)
    // is not enough, EXCHANGE_2 (30 more) also goes; context stays whole.
    const fitted = fitToBudget(makeCtx(), 470, [EXCHANGE_1, EXCHANGE_2]);
    expect(fitted.sideThread).toEqual([]);
    expect(fitted.ctx.priorTurns).toEqual([OLDEST, NEWER]);
    expect(fitted.ctx.precedingUserTurn).toEqual(PRECEDING);

    // Budget 490 needs only 22 tokens freed -> only the oldest exchange goes.
    const partial = fitToBudget(makeCtx(), 490, [EXCHANGE_1, EXCHANGE_2]);
    expect(partial.sideThread).toEqual([EXCHANGE_2]);
    expect(partial.ctx.priorTurns).toEqual([OLDEST, NEWER]);
  });

  it('drops prior turns oldest-first after the side thread', () => {
    // Budget 360: thread (60) + oldest prior turn (100) must go -> 352 fits.
    const fitted = fitToBudget(makeCtx(), 360, [EXCHANGE_1, EXCHANGE_2]);
    expect(fitted.sideThread).toEqual([]);
    expect(fitted.ctx.priorTurns).toEqual([NEWER]);
    expect(fitted.ctx.precedingUserTurn).toEqual(PRECEDING);
    expect(fitted.ctx.containingMessage.text).toBe(MESSAGE_TEXT);
  });

  it('drops precedingUserTurn after all prior turns', () => {
    const fitted = fitToBudget(makeCtx(), 300);
    expect(fitted.ctx.priorTurns).toEqual([]);
    expect(fitted.ctx.precedingUserTurn).toBeUndefined();
    expect(fitted.ctx.containingMessage.text).toBe(MESSAGE_TEXT); // 202 <= 300
  });

  it('shrinks containingMessage.text around the highlight last', () => {
    const fitted = fitToBudget(makeCtx(), 50);
    expect(fitted.ctx.priorTurns).toEqual([]);
    expect(fitted.ctx.precedingUserTurn).toBeUndefined();
    expect(fitted.ctx.containingMessage.text.length).toBeLessThanOrEqual(
      Math.floor((50 - 2) * 3.5),
    );
    expect(fitted.ctx.containingMessage.text).toContain(HIGHLIGHT);
  });

  it('never removes the highlight, even on an impossible budget', () => {
    const fitted = fitToBudget(makeCtx(), 1, [EXCHANGE_1]);
    expect(fitted.ctx.containingMessage.text).toContain(HIGHLIGHT);
    expect(fitted.sideThread).toEqual([]);
  });

  it('does not mutate its inputs', () => {
    const ctx = makeCtx();
    const thread = [EXCHANGE_1, EXCHANGE_2];
    fitToBudget(ctx, 1, thread);
    expect(ctx.priorTurns).toHaveLength(2);
    expect(ctx.precedingUserTurn).toEqual(PRECEDING);
    expect(ctx.containingMessage.text).toBe(MESSAGE_TEXT);
    expect(thread).toHaveLength(2);
  });
});
