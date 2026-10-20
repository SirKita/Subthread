// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { claudeAiAdapter, conversationIdFromPathname } from './claude-ai';

// Minimal duck-typed Selection over real happy-dom nodes/Ranges (happy-dom's
// window.getSelection() support is incomplete).
function selectionOver(anchorNode: Node, highlight: string, collapsed = false): Selection {
  const range = document.createRange();
  range.selectNodeContents(anchorNode);
  return {
    isCollapsed: collapsed,
    rangeCount: 1,
    anchorNode,
    toString: () => highlight,
    getRangeAt: () => range,
  } as unknown as Selection;
}

const ROW_31_TEXT =
  'Electrons can cross barriers via quantum tunneling.\n\n' +
  'Key points\n\n' +
  'Wave functions decay\n' +
  'Probability leaks through';
const ROW_30_TEXT = 'So why do electrons escape?';
const ROW_29_TEXT = 'Earlier answer about wave functions.';

// Mirrors docs/dom-docs/dump-assistant.txt / dump-user.txt: transcript-sizer
// inside [role=feed], leading/spacer elements, three virtualized rows
// (data-index 29 assistant, 30 human, 31 assistant + data-last-message), each
// wrapping an inner [data-transcript-row] and [role=article] "Message N of M".
function buildTranscript(): HTMLElement {
  const feed = document.createElement('div');
  feed.setAttribute('role', 'feed');
  feed.setAttribute('aria-label', 'Chat messages');
  feed.innerHTML = `
    <div data-testid="transcript-sizer" data-rocksteady-sizer>
      <div data-testid="transcript-leading" data-transcript-not-rows></div>
      <button class="sr-only">Skip to end</button>
      <div data-testid="transcript-spacer"></div>
      <div data-rs-index="29" data-index="29" data-testid="transcript-row" data-perf-row="assistant">
        <div class="contents" data-mini-claude-message="_r_1_">
          <div role="article" aria-label="Message 30 of 32">
            <div data-transcript-row>
              <div data-reply-scope>
                <div data-cds="AssistantMessage" data-testid="assistant-message">
                  <h2 class="sr-only" data-find-omitted>Claude said:</h2>
                  <div>
                    <div data-cds="TurnStatus" data-find-omitted data-state="done">Pondered the first question for 8 seconds</div>
                    <div class="contents" data-transcript-engine-root>
                      <div class="prose" data-cds="Prose">
                        <div data-perf-reply-text><p>Earlier answer about wave functions.</p></div>
                      </div>
                    </div>
                  </div>
                  <div><button>Copy</button><button>Retry</button></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div data-rs-index="30" data-index="30" data-testid="transcript-row" data-perf-row="human">
        <div class="contents" data-mini-claude-message="_r_1_">
          <div role="article" aria-label="Message 31 of 32">
            <div data-transcript-row>
              <h2 class="sr-only" data-find-omitted>You said:</h2>
              <div data-user-scope>
                <div data-cds="UserMessage" data-turn-key="k1">
                  <div data-cds="MessageAttachments" data-find-omitted>draft.pdf 54 KB</div>
                  <div class="bubble">
                    <div class="cds-user-message-body">
                      <div><div data-testid="user-message"><p>So why do electrons escape?</p></div></div>
                    </div>
                  </div>
                  <div data-cds="MessageActions"><button>Edit</button></div>
                </div>
              </div>
              <span class="sr-only" data-find-omitted data-testid="failed-send-status-region"></span>
            </div>
          </div>
        </div>
      </div>
      <div data-rs-index="31" data-index="31" data-testid="transcript-row" data-last-message="true" data-perf-row="assistant">
        <div class="contents" data-mini-claude-message="_r_1_">
          <div role="article" aria-label="Message 32 of 32">
            <div data-transcript-row>
              <div data-reply-scope>
                <div data-cds="AssistantMessage" data-testid="assistant-message">
                  <h2 class="sr-only" data-find-omitted>Claude said:</h2>
                  <div>
                    <div data-cds="TurnStatus" data-find-omitted data-state="done">Pondered quantum barriers for 12 seconds</div>
                    <div class="contents" data-transcript-engine-root>
                      <div class="prose" data-cds="Prose">
                        <div data-perf-reply-text><p>Electrons can cross barriers via quantum tunneling.</p><h3>Key points</h3><ol><li>Wave functions decay</li><li>Probability leaks through</li></ol></div>
                      </div>
                    </div>
                  </div>
                  <div><button>Copy</button><button>Retry</button></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div data-testid="transcript-spacer"></div>
    </div>
  `;
  document.body.appendChild(feed);
  return feed;
}

function textNodeIn(feed: HTMLElement, selector: string): Node {
  const el = feed.querySelector(selector);
  if (!el) throw new Error(`fixture is missing ${selector}`);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  if (!node) throw new Error(`no text node under ${selector}`);
  return node;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('claudeAiAdapter.extract (structured)', () => {
  it('extracts an assistant row: body text only, neighbors, position', () => {
    const feed = buildTranscript();
    const anchor = textNodeIn(feed, '[data-index="31"] [data-perf-reply-text] p');

    const ctx = claudeAiAdapter.extract(selectionOver(anchor, 'quantum tunneling'));

    expect(ctx).not.toBeNull();
    expect(ctx!.strategy).toBe('structured');
    expect(ctx!.containingMessage.role).toBe('assistant');
    expect(ctx!.containingMessage.text).toBe(ROW_31_TEXT);
    expect(ctx!.containingMessage.text).not.toContain('Claude said');
    expect(ctx!.containingMessage.text).not.toContain('Pondered');
    expect(ctx!.containingMessage.text).not.toContain('Copy');
    expect(ctx!.precedingUserTurn).toEqual({ role: 'user', text: ROW_30_TEXT });
    expect(ctx!.priorTurns).toEqual([{ role: 'assistant', text: ROW_29_TEXT }]);
    expect(ctx!.position).toEqual({ index: 31, total: 32, earliestRenderedIndex: 29 });
  });

  it('extracts a user row: bubble text only, no preceding user turn', () => {
    const feed = buildTranscript();
    const anchor = textNodeIn(feed, '[data-index="30"] [data-testid="user-message"] p');

    const ctx = claudeAiAdapter.extract(selectionOver(anchor, 'electrons escape'));

    expect(ctx).not.toBeNull();
    expect(ctx!.containingMessage.role).toBe('user');
    expect(ctx!.containingMessage.text).toBe(ROW_30_TEXT);
    expect(ctx!.containingMessage.text).not.toContain('draft.pdf');
    expect(ctx!.containingMessage.text).not.toContain('Edit');
    expect(ctx!.precedingUserTurn).toBeUndefined();
    expect(ctx!.priorTurns).toEqual([{ role: 'assistant', text: ROW_29_TEXT }]);
    expect(ctx!.position).toEqual({ index: 30, total: 32, earliestRenderedIndex: 29 });
  });

  it('resolves the row even when the selection sits inside TurnStatus', () => {
    const feed = buildTranscript();
    const anchor = textNodeIn(feed, '[data-index="31"] [data-cds="TurnStatus"]');

    const ctx = claudeAiAdapter.extract(selectionOver(anchor, 'quantum barriers'));

    expect(ctx).not.toBeNull();
    expect(ctx!.strategy).toBe('structured');
    expect(ctx!.containingMessage.text).toBe(ROW_31_TEXT); // body, not the status text
    expect(ctx!.position?.index).toBe(31);
  });

  it('falls back to content markers for roles when data-perf-row is missing', () => {
    const feed = buildTranscript();
    for (const row of Array.from(feed.querySelectorAll('[data-testid="transcript-row"]'))) {
      row.removeAttribute('data-perf-row');
    }

    const assistantCtx = claudeAiAdapter.extract(
      selectionOver(textNodeIn(feed, '[data-index="31"] [data-perf-reply-text] p'), 'quantum tunneling'),
    );
    expect(assistantCtx!.containingMessage.role).toBe('assistant');
    expect(assistantCtx!.precedingUserTurn).toEqual({ role: 'user', text: ROW_30_TEXT });

    const userCtx = claudeAiAdapter.extract(
      selectionOver(textNodeIn(feed, '[data-index="30"] [data-testid="user-message"] p'), 'electrons escape'),
    );
    expect(userCtx!.containingMessage.role).toBe('user');
  });
});

describe('claudeAiAdapter.extract (naive fallback)', () => {
  it('uses the naive window strategy when no transcript row exists', () => {
    const div = document.createElement('div');
    const highlight = 'the needle phrase';
    div.textContent = 'x'.repeat(4000) + ' ' + highlight + ' ' + 'y'.repeat(4000);
    document.body.appendChild(div);

    const ctx = claudeAiAdapter.extract(selectionOver(div.firstChild!, highlight));

    expect(ctx).not.toBeNull();
    expect(ctx!.strategy).toBe('naive');
    expect(ctx!.containingMessage.text).toContain(highlight);
    expect(ctx!.containingMessage.text.length).toBeLessThanOrEqual(6000);
    expect(ctx!.priorTurns).toEqual([]);
    expect(ctx!.position).toBeUndefined();
  });
});

describe('selection null rules (unchanged from phase 1)', () => {
  it('rejects textarea, contenteditable, tiny/huge, and collapsed selections', () => {
    const textarea = document.createElement('textarea');
    const textareaText = document.createTextNode('some editable draft text');
    textarea.appendChild(textareaText);
    document.body.appendChild(textarea);
    expect(claudeAiAdapter.extract(selectionOver(textareaText, 'editable draft'))).toBeNull();

    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const editorText = document.createTextNode('typing a reply here');
    editor.appendChild(editorText);
    document.body.appendChild(editor);
    expect(claudeAiAdapter.extract(selectionOver(editorText, 'a reply'))).toBeNull();

    const div = document.createElement('div');
    div.textContent = 'plenty of ordinary page text to select from '.repeat(20);
    document.body.appendChild(div);
    const node = div.firstChild!;
    expect(claudeAiAdapter.extract(selectionOver(node, 'x'))).toBeNull();
    expect(claudeAiAdapter.extract(selectionOver(node, 'q'.repeat(1501)))).toBeNull();
    expect(claudeAiAdapter.extract(selectionOver(node, 'ordinary page', true))).toBeNull();
  });
});

describe('conversationIdFromPathname', () => {
  it('parses /chat/<uuid> and rejects other paths', () => {
    expect(conversationIdFromPathname('/chat/5a1cd48b-2932-4346-a285-e975a5744da6')).toBe(
      '5a1cd48b-2932-4346-a285-e975a5744da6',
    );
    expect(conversationIdFromPathname('/chat/not-a-uuid')).toBeUndefined();
    expect(conversationIdFromPathname('/settings')).toBeUndefined();
    expect(conversationIdFromPathname('/')).toBeUndefined();
  });
});
