export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** Where the containing message sits in the (virtualized) transcript. */
export interface MessagePosition {
  /** 0-based data-index of the containing row. */
  index: number;
  /** True total number of messages, from the row's "Message N of M" aria-label. */
  total: number;
  /** Lowest data-index currently rendered — rows before it exist but are not in the DOM. */
  earliestRenderedIndex: number;
}

export interface ExtractedContext {
  highlight: string;
  containingMessage: ConversationTurn;
  precedingUserTurn?: ConversationTurn;
  priorTurns: ConversationTurn[];
  /** Parsed from location.pathname (/chat/<uuid>); undefined elsewhere. */
  conversationId?: string;
  /** Present only when the structured adapter found a transcript row. */
  position?: MessagePosition;
  /** Which extraction path produced this context (debugging aid). */
  strategy?: 'structured' | 'naive';
}

/**
 * Reads conversation context around a selection from the claude.ai DOM.
 * Interface only in Phase 0 — implemented in Phase 1+.
 */
export interface ConversationAdapter {
  extract(selection: Selection): ExtractedContext | null;
}
