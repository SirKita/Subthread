import type { ConversationAdapter, ConversationTurn, ExtractedContext } from './adapter';
import { elementOf, extractNaive, passesSelectionRules } from './naive';

// Derived from real DOM structure dumps: docs/dom-docs/dump-assistant.txt and
// dump-user.txt (captured 2026-10-21). All DOM queries in this adapter go
// through this object. Notes from the dumps:
// - Rows are [data-testid="transcript-row"] with data-index (0-based order) and
//   data-perf-row ("assistant" | "human"), direct children of transcript-sizer
//   inside [role="feed"]. The list is VIRTUALIZED — only rows near the viewport
//   exist in the DOM.
// - [data-transcript-row] (rowFallbacks[0]) is an INNER wrapper nested inside
//   the primary row, so the primary selector must be tried on the whole
//   ancestor chain before any fallback.
// - Each row contains [role="article"][aria-label="Message N of M"]; N is
//   1-based (data-index 31 ↔ "Message 32 of 32"), M is the true total.
export const CLAUDE_AI_SELECTORS = {
  container: '[data-testid="transcript-sizer"], [role="feed"]',
  row: '[data-testid="transcript-row"]',
  rowFallbacks: ['[data-transcript-row]', '[role="article"][aria-label^="Message"]'],
  roleAttr: 'data-perf-row',
  article: '[role="article"][aria-label^="Message"]',
  assistantText: '[data-perf-reply-text]',
  userText: '[data-testid="user-message"]',
  assistantRoleFallback: '[data-testid="assistant-message"], [data-cds="AssistantMessage"]',
  userRoleFallback: '[data-testid="user-message"], [data-cds="UserMessage"]',
  assistantExclude: ['[data-cds="TurnStatus"]', '.sr-only', '[data-find-omitted]'],
  userExclude: [
    '[data-cds="MessageAttachments"]',
    '[data-cds="MessageActions"]',
    '.sr-only',
    '[data-find-omitted]',
  ],
} as const;

const S = CLAUDE_AI_SELECTORS;

/**
 * Structured adapter: resolves the transcript row containing the selection and
 * reads role/text/neighbors from claude.ai's own markup. Falls back to the
 * Phase 1 naive window strategy when no row is found.
 */
export const claudeAiAdapter: ConversationAdapter = {
  extract(selection: Selection): ExtractedContext | null {
    if (!passesSelectionRules(selection)) return null;

    const highlight = selection.toString().trim();
    const start = elementOf(selection.getRangeAt(0).commonAncestorContainer);
    if (!start) return null;

    const row = findRow(start);
    if (!row) {
      const naive = extractNaive(selection);
      if (naive) naive.conversationId = conversationIdFor(start);
      return naive;
    }

    const role = rowRole(row);
    const index = rowIndex(row);
    const renderedRows = collectRenderedRows(row);

    let precedingUserTurn: ConversationTurn | undefined;
    const priorTurns: ConversationTurn[] = [];
    if (index != null) {
      const prior = renderedRows.filter((r) => r.index < index).sort((a, b) => a.index - b.index);
      const preceding = [...prior].reverse().find((r) => rowRole(r.row) === 'user');
      if (preceding) {
        precedingUserTurn = { role: 'user', text: rowText(preceding.row) };
      }
      for (const r of prior) {
        if (r === preceding) continue;
        priorTurns.push({ role: rowRole(r.row), text: rowText(r.row) });
      }
    }

    return {
      highlight,
      containingMessage: { role, text: rowText(row) },
      precedingUserTurn,
      priorTurns,
      conversationId: conversationIdFor(row),
      position: buildPosition(row, index, renderedRows),
      strategy: 'structured',
    };
  },
};

/** /chat/<uuid> → the uuid; undefined for any other path. */
export function conversationIdFromPathname(pathname: string): string | undefined {
  const match = /\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(
    pathname,
  );
  return match?.[1];
}

function conversationIdFor(el: Element): string | undefined {
  const pathname = el.ownerDocument.defaultView?.location?.pathname;
  return pathname ? conversationIdFromPathname(pathname) : undefined;
}

/** Primary row selector on the whole ancestor chain first, then each fallback. */
function findRow(start: Element): Element | null {
  for (const selector of [S.row, ...S.rowFallbacks]) {
    const row = start.closest(selector);
    if (row) return row;
  }
  return null;
}

function rowRole(row: Element): 'user' | 'assistant' {
  const attr = row.getAttribute(S.roleAttr);
  if (attr === 'assistant') return 'assistant';
  if (attr === 'human') return 'user';
  if (row.querySelector(S.assistantRoleFallback)) return 'assistant';
  if (row.querySelector(S.userRoleFallback)) return 'user';
  return 'assistant'; // transcript rows are overwhelmingly assistant turns
}

function rowIndex(row: Element): number | undefined {
  const raw = row.getAttribute('data-index');
  if (raw == null) return undefined;
  const index = Number.parseInt(raw, 10);
  return Number.isNaN(index) ? undefined : index;
}

interface RenderedRow {
  row: Element;
  index: number;
}

/** All transcript rows currently in the DOM (the list is virtualized). */
function collectRenderedRows(fromRow: Element): RenderedRow[] {
  const scope = fromRow.closest(S.container) ?? fromRow.ownerDocument;
  const rows: RenderedRow[] = [];
  for (const row of Array.from(scope.querySelectorAll(S.row))) {
    const index = rowIndex(row);
    if (index != null) rows.push({ row, index });
  }
  return rows;
}

function buildPosition(
  row: Element,
  index: number | undefined,
  renderedRows: RenderedRow[],
): ExtractedContext['position'] {
  if (index == null) return undefined;
  const earliestRenderedIndex = renderedRows.length
    ? Math.min(...renderedRows.map((r) => r.index))
    : index;
  // aria-label "Message N of M": N is 1-based, M is the true total.
  const ariaLabel = row.querySelector(S.article)?.getAttribute('aria-label') ?? '';
  const match = /Message\s+\d+\s+of\s+(\d+)/i.exec(ariaLabel);
  const total = match
    ? Number.parseInt(match[1]!, 10)
    : Math.max(...renderedRows.map((r) => r.index), index) + 1; // lower bound
  return { index, total, earliestRenderedIndex };
}

/** Role-appropriate text for a row, honoring the exclusion lists. */
function rowText(row: Element): string {
  const role = rowRole(row);
  const containers = Array.from(
    row.querySelectorAll(role === 'user' ? S.userText : S.assistantText),
  );
  const exclude = role === 'user' ? S.userExclude : S.assistantExclude;
  if (containers.length > 0) {
    return containers
      .map((container) => extractVisibleText(container, exclude))
      .filter(Boolean)
      .join('\n\n');
  }
  // Content container missing (markup drift): extract from the whole row with
  // both exclusion lists. Button labels in unmarked action bars may leak here.
  return extractVisibleText(row, [...S.assistantExclude, ...S.userExclude]);
}

// Block-level tags get blank lines around them; list items/rows get newlines.
const PARAGRAPH_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ol',
  'ul',
  'pre',
  'blockquote',
  'table',
  'div',
  'section',
  'article',
]);
const LINE_TAGS = new Set(['li', 'tr']);

/**
 * Serialize an element's visible text, skipping excluded subtrees entirely.
 * Walks the live tree (no detached clones, no innerText dependence).
 */
function extractVisibleText(root: Element, excludeSelectors: readonly string[]): string {
  const excludeSelector = excludeSelectors.join(', ');
  const parts: string[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.matches(excludeSelector)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') {
      parts.push('\n');
      return;
    }
    const isParagraph = PARAGRAPH_TAGS.has(tag);
    parts.push(isParagraph ? '\n\n' : LINE_TAGS.has(tag) ? '\n' : '');
    for (const child of Array.from(node.childNodes)) visit(child);
    if (isParagraph) parts.push('\n\n');
  };
  for (const child of Array.from(root.childNodes)) visit(child);
  return parts
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
