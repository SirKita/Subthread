export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ExtractedContext {
  highlight: string;
  containingMessage: ConversationTurn;
  precedingUserTurn?: ConversationTurn;
  priorTurns: ConversationTurn[];
}

/**
 * Reads conversation context around a selection from the claude.ai DOM.
 * Interface only in Phase 0 — implemented in Phase 1+.
 */
export interface ConversationAdapter {
  extract(selection: Selection): ExtractedContext | null;
}
