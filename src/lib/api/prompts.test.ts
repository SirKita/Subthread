import { describe, expect, it } from 'vitest';
import type { ExtractedContext } from '../context/adapter';
import { buildRequest, buildSystemPrompt, buildUserMessage, MAX_ANSWER_TOKENS } from './prompts';

function makeCtx(overrides: Partial<ExtractedContext> = {}): ExtractedContext {
  return {
    highlight: 'quantum tunneling',
    containingMessage: {
      role: 'assistant',
      text: 'Electrons can cross barriers via quantum tunneling even without enough energy.',
    },
    precedingUserTurn: undefined,
    priorTurns: [],
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('produces distinct prompts per mode with the shared style rules', () => {
    const explain = buildSystemPrompt('explain');
    const ask = buildSystemPrompt('ask');
    expect(explain).toContain('2–3 plain sentences');
    expect(ask).toContain('at most 5 sentences');
    expect(explain).not.toBe(ask);
    for (const prompt of [explain, ask]) {
      expect(prompt).toContain('no markdown');
      expect(prompt).toContain('without derailing the main conversation');
      expect(prompt).toContain("a message in the conversation (usually the assistant's)");
      expect(prompt).toContain('Answer in the language the conversation is written in.');
      expect(prompt).toContain('the context did not specify');
    }
  });
});

describe('buildUserMessage', () => {
  it('wraps the context in the expected tags and includes the highlight', () => {
    const message = buildUserMessage(makeCtx(), 'explain');
    expect(message).toContain('<conversation_context>');
    expect(message).toContain('</conversation_context>');
    expect(message).toContain('<message_containing_highlight role="assistant">');
    expect(message).toContain('</message_containing_highlight>');
    expect(message).toContain('<highlight>\nquantum tunneling\n</highlight>');
    expect(message).toContain('Electrons can cross barriers');
  });

  it('carries the containing message role in the tag', () => {
    const message = buildUserMessage(
      makeCtx({ containingMessage: { role: 'user', text: 'why though?' } }),
      'explain',
    );
    expect(message).toContain('<message_containing_highlight role="user">');
  });

  it('renders "none" when there are no prior turns', () => {
    const message = buildUserMessage(makeCtx(), 'explain');
    expect(message).toContain('<conversation_context>\nnone\n</conversation_context>');
  });

  it('renders speaker-labeled blocks oldest first, then the preceding user turn', () => {
    const message = buildUserMessage(
      makeCtx({
        priorTurns: [
          { role: 'user', text: 'first question' },
          { role: 'assistant', text: 'earlier answer' },
        ],
        precedingUserTurn: { role: 'user', text: 'explain barriers' },
      }),
      'explain',
    );
    const userBlock = message.indexOf('User: first question');
    const assistantBlock = message.indexOf('Assistant: earlier answer');
    const precedingBlock = message.indexOf(
      'User (the prompt that produced the highlighted message): explain barriers',
    );
    expect(userBlock).toBeGreaterThan(-1);
    expect(assistantBlock).toBeGreaterThan(userBlock);
    expect(precedingBlock).toBeGreaterThan(assistantBlock);
    expect(message).not.toContain('\nnone\n');
  });

  it('notes hidden earlier turns when the earliest rendered row is not the first', () => {
    const withHidden = buildUserMessage(
      makeCtx({
        priorTurns: [{ role: 'assistant', text: 'earlier answer' }],
        position: { index: 31, total: 32, earliestRenderedIndex: 29 },
      }),
      'explain',
    );
    expect(withHidden).toContain('[earlier turns exist but are not shown]');
    expect(withHidden.indexOf('[earlier turns exist')).toBeLessThan(
      withHidden.indexOf('Assistant: earlier answer'),
    );

    const fullHistory = buildUserMessage(
      makeCtx({ position: { index: 3, total: 32, earliestRenderedIndex: 0 } }),
      'explain',
    );
    expect(fullHistory).not.toContain('[earlier turns exist');
  });

  it('includes the question for ask mode', () => {
    const message = buildUserMessage(makeCtx(), 'ask', 'Is this the same as hopping?');
    expect(message.endsWith('Is this the same as hopping?')).toBe(true);
  });

  it('falls back to the explain instruction when ask has no question', () => {
    const message = buildUserMessage(makeCtx(), 'ask');
    expect(message.endsWith('Explain the highlight as used in this message.')).toBe(true);
  });
});

describe('buildRequest', () => {
  it('applies fitToBudget before building the message', () => {
    const hugeCtx = makeCtx({
      containingMessage: {
        role: 'assistant',
        text: 'a'.repeat(50_000) + ' quantum tunneling ' + 'b'.repeat(50_000),
      },
    });
    const request = buildRequest(hugeCtx, 'explain', undefined, 200);
    expect(request.messages[0]!.content.length).toBeLessThan(2000);
    expect(request.messages[0]!.content).toContain('quantum tunneling');
  });

  it('returns the mode system prompt and the fixed answer budget', () => {
    const request = buildRequest(makeCtx(), 'ask', 'why?', 8000);
    expect(request.system).toBe(buildSystemPrompt('ask'));
    expect(request.maxTokens).toBe(MAX_ANSWER_TOKENS);
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]!.role).toBe('user');
    expect(request.messages[0]!.content).toContain('why?');
  });

  it('threads follow-up exchanges as alternating turns after the context message', () => {
    const request = buildRequest(
      makeCtx(),
      'explain',
      'And why does the barrier width matter?',
      8000,
      [
        { question: undefined, answer: 'It means particles cross energy barriers.' },
        { question: 'Is that common?', answer: 'Yes, in alpha decay for example.' },
      ],
    );

    expect(request.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
    ]);
    // First exchange's (explain) opening is embedded in the context message.
    expect(request.messages[0]!.content).toContain('<highlight>');
    expect(request.messages[0]!.content).toContain(
      'Explain the highlight as used in this message.',
    );
    expect(request.messages[1]!.content).toBe('It means particles cross energy barriers.');
    expect(request.messages[2]!.content).toBe('Is that common?');
    expect(request.messages[4]!.content).toBe('And why does the barrier width matter?');
    // Follow-ups answer questions, so the ask system prompt applies.
    expect(request.system).toBe(buildSystemPrompt('ask'));
  });

  it('re-anchors on the oldest kept exchange when the budget drops early ones', () => {
    // Context ~23 tokens; each exchange ~40 tokens. Budget 80 forces the
    // first exchange out; the second's question becomes the context message's
    // instruction and its answer follows.
    const request = buildRequest(makeCtx(), 'ask', 'current question?', 80, [
      { question: 'first question, dropped', answer: 'f'.repeat(105) },
      { question: 'second question, kept', answer: 's'.repeat(35) },
    ]);

    expect(request.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(request.messages[0]!.content).toContain('second question, kept');
    expect(request.messages[0]!.content).not.toContain('first question, dropped');
    expect(request.messages[1]!.content).toBe('s'.repeat(35));
    expect(request.messages[2]!.content).toBe('current question?');
  });

  it('marks dropped follow-ups at the start of the first kept user message', () => {
    const dropped = buildRequest(makeCtx(), 'ask', 'current question?', 80, [
      { question: 'first question, dropped', answer: 'f'.repeat(105) },
      { question: 'second question, kept', answer: 's'.repeat(35) },
    ]);
    expect(dropped.messages[0]!.content.startsWith('[earlier follow-ups omitted]')).toBe(true);

    // Even when every exchange is dropped, the context message carries the marker.
    const allDropped = buildRequest(makeCtx(), 'ask', 'current question?', 40, [
      { question: 'only exchange', answer: 'x'.repeat(350) },
    ]);
    expect(allDropped.messages).toHaveLength(1);
    expect(allDropped.messages[0]!.content.startsWith('[earlier follow-ups omitted]')).toBe(true);

    // No marker when nothing was dropped.
    const kept = buildRequest(makeCtx(), 'ask', 'current question?', 8000, [
      { question: 'kept question', answer: 'kept answer' },
    ]);
    expect(kept.messages[0]!.content).not.toContain('[earlier follow-ups omitted]');
  });
});
