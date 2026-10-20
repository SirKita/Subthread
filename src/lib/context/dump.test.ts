// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { describeAncestry } from './dump';

const SECRET_TEXT = 'this exact sentence must never appear in a dump';

beforeEach(() => {
  document.body.innerHTML = '';
});

function buildFixture(): Element {
  const outer = document.createElement('div');
  outer.id = 'conversation';
  outer.className = 'chat-root scrollable';
  outer.setAttribute('data-testid', 'conversation-root');

  for (let i = 0; i < 12; i++) {
    const message = document.createElement('article');
    message.className = 'message-row';
    message.setAttribute('data-message-index', String(i));
    message.textContent = `filler message number ${i}`;
    outer.appendChild(message);
  }

  const target = document.createElement('span');
  target.setAttribute('role', 'presentation');
  target.setAttribute('aria-label', 'assistant turn');
  target.textContent = SECRET_TEXT;
  outer.children[3]!.appendChild(target);

  document.body.appendChild(outer);
  return target;
}

describe('describeAncestry', () => {
  it('walks from the element up to body with structural info only', () => {
    const dump = describeAncestry(buildFixture());

    expect(dump.ancestors.map((a) => a.tag)).toEqual(['span', 'article', 'div', 'body']);
    expect(dump.ancestors[0]).toMatchObject({
      depth: 0,
      role: 'presentation',
      ariaLabel: 'assistant turn',
      textLength: SECRET_TEXT.length,
    });
    expect(dump.ancestors[2]).toMatchObject({
      id: 'conversation',
      classes: ['chat-root', 'scrollable'],
      dataAttrs: { 'data-testid': 'conversation-root' },
      childElementCount: 12,
    });
    expect(dump.selectionLength).toBe(0); // caller overlays the real value
  });

  it('samples at most 8 siblings per depth but reports the full count', () => {
    const dump = describeAncestry(buildFixture());

    const articleDepth = dump.siblingsAtEachDepth.find((s) => s.depth === 1);
    expect(articleDepth).toBeDefined();
    expect(articleDepth!.count).toBe(12);
    expect(articleDepth!.sample).toHaveLength(8);
    expect(articleDepth!.sample[0]).toMatchObject({
      tag: 'article',
      classes: ['message-row'],
      dataAttrs: { 'data-message-index': '0' },
    });
  });

  it('never includes text content anywhere in the dump', () => {
    const json = JSON.stringify(describeAncestry(buildFixture()));
    expect(json).not.toContain(SECRET_TEXT);
    expect(json).not.toContain('filler message');
  });
});
