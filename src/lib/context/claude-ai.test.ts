// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { claudeAiAdapter } from './claude-ai';

// Real DOM nodes + Range from happy-dom; Selection is a minimal duck-typed
// wrapper because happy-dom's window.getSelection() support is incomplete.
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

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('claudeAiAdapter.extract', () => {
  it('extracts a window of the long containing element that includes the highlight', () => {
    const div = document.createElement('div');
    const highlight = 'the needle phrase';
    const longText = 'x'.repeat(4000) + ' ' + highlight + ' ' + 'y'.repeat(4000);
    div.textContent = longText;
    document.body.appendChild(div);

    const ctx = claudeAiAdapter.extract(selectionOver(div.firstChild!, highlight));
    expect(ctx).not.toBeNull();
    expect(ctx!.highlight).toBe(highlight);
    expect(ctx!.containingMessage.role).toBe('assistant');
    expect(ctx!.containingMessage.text).toContain(highlight);
    expect(ctx!.containingMessage.text.length).toBeLessThanOrEqual(6000);
    expect(ctx!.priorTurns).toEqual([]);
    expect(ctx!.precedingUserTurn).toBeUndefined();
  });

  it('prefers a MESSAGE_SELECTORS match over walking up to a longer ancestor', () => {
    const outer = document.createElement('div');
    outer.textContent = 'z'.repeat(1000); // long enough to qualify by length
    const message = document.createElement('div');
    message.setAttribute('data-testid', 'assistant-message');
    const short = 'short message with a needle inside';
    message.textContent = short;
    outer.appendChild(message);
    document.body.appendChild(outer);

    const ctx = claudeAiAdapter.extract(selectionOver(message.firstChild!, 'needle'));
    expect(ctx).not.toBeNull();
    expect(ctx!.containingMessage.text).toBe(short);
  });

  it('returns null for a selection inside a textarea', () => {
    const textarea = document.createElement('textarea');
    const text = document.createTextNode('some editable draft text');
    textarea.appendChild(text);
    document.body.appendChild(textarea);

    expect(claudeAiAdapter.extract(selectionOver(text, 'editable draft'))).toBeNull();
  });

  it('returns null for a selection inside a contenteditable element', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const text = document.createTextNode('typing a reply here');
    editor.appendChild(text);
    document.body.appendChild(editor);

    expect(claudeAiAdapter.extract(selectionOver(text, 'a reply'))).toBeNull();
  });

  it('returns null for a 1-char highlight, an oversized highlight, and a collapsed selection', () => {
    const div = document.createElement('div');
    div.textContent = 'plenty of ordinary page text to select from '.repeat(20);
    document.body.appendChild(div);
    const node = div.firstChild!;

    expect(claudeAiAdapter.extract(selectionOver(node, 'x'))).toBeNull();
    expect(claudeAiAdapter.extract(selectionOver(node, 'q'.repeat(1501)))).toBeNull();
    expect(claudeAiAdapter.extract(selectionOver(node, 'ordinary page', true))).toBeNull();
  });
});
