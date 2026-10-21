import type { ConversationTurn, ExtractedContext } from '../context/adapter';
import { fitToBudget } from '../context/budget';
import type { SideExchange } from '../context/budget';

export type Mode = 'explain' | 'ask';

/** Answer budget for both modes; thinking counts toward it, the prompt controls length. */
export const MAX_ANSWER_TOKENS = 1024;

const FRAME =
  'You are a helper for quick side questions, embedded in the Claude web app. ' +
  "The user is reading a message in the conversation (usually the assistant's) and has " +
  'highlighted a phrase in it; they want a quick side answer without derailing the main conversation.';

const STYLE =
  'Write plain prose only: no headers, no bullet points, no markdown, no preamble, and do not ' +
  'restate the phrase or refer to it as "the highlighted phrase" — just answer directly. ' +
  'Use the conversation context to ground your answer; if the phrase is ambiguous, pick the ' +
  'reading the context supports. If the context does not settle what the phrase means, give ' +
  'the most common reading and say in a few words that the context did not specify. ' +
  'Answer in the language the conversation is written in.';

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
  const instruction =
    mode === 'ask' && question?.trim()
      ? question.trim()
      : 'Explain the highlight as used in this message.';

  return [
    '<conversation_context>',
    conversationSection(ctx),
    '</conversation_context>',
    '',
    `<message_containing_highlight role="${ctx.containingMessage.role}">`,
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

function conversationSection(ctx: ExtractedContext): string {
  const blocks: string[] = [];
  if ((ctx.position?.earliestRenderedIndex ?? 0) > 0) {
    blocks.push('[earlier turns exist but are not shown]');
  }
  for (const turn of ctx.priorTurns) {
    blocks.push(`${speakerLabel(turn)}: ${turn.text}`);
  }
  if (ctx.precedingUserTurn) {
    blocks.push(
      `User (the prompt that produced the highlighted message): ${ctx.precedingUserTurn.text}`,
    );
  }
  return blocks.length > 0 ? blocks.join('\n\n') : 'none';
}

function speakerLabel(turn: ConversationTurn): string {
  return turn.role === 'user' ? 'User' : 'Assistant';
}

/**
 * Build the full request. `sideThread` holds the popover's completed exchanges
 * (oldest first); `question` is the message being asked NOW. The first kept
 * exchange's question is embedded in the context message; later exchanges
 * alternate as plain user/assistant turns. Follow-ups use the ask system
 * prompt regardless of the opening mode.
 */
export function buildRequest(
  ctx: ExtractedContext,
  mode: Mode,
  question: string | undefined,
  maxContextTokens: number,
  sideThread: SideExchange[] = [],
): {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
} {
  const fitted = fitToBudget(ctx, maxContextTokens, sideThread);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (fitted.sideThread.length === 0) {
    messages.push({ role: 'user', content: buildUserMessage(fitted.ctx, mode, question) });
  } else {
    const [first, ...rest] = fitted.sideThread;
    messages.push({ role: 'user', content: buildUserMessage(fitted.ctx, mode, first!.question) });
    messages.push({ role: 'assistant', content: first!.answer });
    for (const exchange of rest) {
      messages.push({ role: 'user', content: exchange.question ?? '' });
      messages.push({ role: 'assistant', content: exchange.answer });
    }
    messages.push({ role: 'user', content: question ?? '' });
  }

  // Tell the model when budget trimming dropped older follow-up exchanges.
  if (fitted.sideThread.length < sideThread.length) {
    messages[0] = {
      ...messages[0]!,
      content: `[earlier follow-ups omitted]\n\n${messages[0]!.content}`,
    };
  }

  return {
    system: buildSystemPrompt(sideThread.length > 0 ? 'ask' : mode),
    messages,
    maxTokens: MAX_ANSWER_TOKENS,
  };
}
