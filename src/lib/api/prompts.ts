import type { ConversationTurn, ExtractedContext } from '../context/adapter';
import { fitToBudget } from '../context/budget';

export type Mode = 'explain' | 'ask';

/** Answer budget for both modes; thinking counts toward it, the prompt controls length. */
export const MAX_ANSWER_TOKENS = 1024;

const FRAME =
  'You are a quick side-question helper embedded in the Claude web app. ' +
  "The user is reading an AI assistant's response in an ongoing conversation and has " +
  'highlighted a phrase in it; they want a quick side answer without derailing the main conversation.';

const STYLE =
  'Write plain prose only: no headers, no bullet points, no markdown, no preamble, and do not ' +
  'restate the phrase or refer to it as "the highlighted phrase" — just answer directly. ' +
  'Use the conversation context to ground your answer; if the phrase is ambiguous, pick the ' +
  'reading the context supports.';

const EXPLAIN_TASK =
  'Explain the highlighted phrase as it is used in this context, in 2–3 plain sentences. ' +
  'If it is a term, define it as it is used here. If it is a claim, say what it means and why ' +
  'it matters here.';

const ASK_TASK =
  "Answer the user's question about the highlighted phrase. Be concise: at most 5 sentences, " +
  'unless the question clearly needs more.';

export function buildSystemPrompt(mode: Mode): string {
  return `${FRAME} ${mode === 'explain' ? EXPLAIN_TASK : ASK_TASK} ${STYLE}`;
}

export function buildUserMessage(ctx: ExtractedContext, mode: Mode, question?: string): string {
  const turns: ConversationTurn[] = [...ctx.priorTurns];
  if (ctx.precedingUserTurn) turns.push(ctx.precedingUserTurn);
  const conversation =
    turns.length > 0 ? turns.map((turn) => `${turn.role}: ${turn.text}`).join('\n\n') : 'none';

  const instruction =
    mode === 'ask' && question?.trim()
      ? question.trim()
      : 'Explain the highlight as used in this message.';

  return [
    '<conversation_context>',
    conversation,
    '</conversation_context>',
    '',
    '<message_containing_highlight>',
    ctx.containingMessage.text,
    '</message_containing_highlight>',
    '',
    '<highlight>',
    ctx.highlight,
    '</highlight>',
    '',
    instruction,
  ].join('\n');
}

export function buildRequest(
  ctx: ExtractedContext,
  mode: Mode,
  question: string | undefined,
  maxContextTokens: number,
): { system: string; messages: [{ role: 'user'; content: string }]; maxTokens: number } {
  const fitted = fitToBudget(ctx, maxContextTokens);
  return {
    system: buildSystemPrompt(mode),
    messages: [{ role: 'user', content: buildUserMessage(fitted, mode, question) }],
    maxTokens: MAX_ANSWER_TOKENS,
  };
}
