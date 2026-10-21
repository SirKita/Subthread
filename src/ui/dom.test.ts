// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { HOST_TAG, isNodeInOwnUi, isSelectionInOwnUi } from './dom';

function fakeSelection(anchorNode: Node | null): Selection {
  return { anchorNode } as unknown as Selection;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('isNodeInOwnUi / isSelectionInOwnUi', () => {
  it('detects nodes inside our shadow root', () => {
    const host = document.createElement(HOST_TAG);
    const shadow = host.attachShadow({ mode: 'open' });
    const inner = document.createElement('div');
    const text = document.createTextNode('popover answer text');
    inner.appendChild(text);
    shadow.appendChild(inner);
    document.body.appendChild(host);

    expect(isNodeInOwnUi(inner)).toBe(true);
    expect(isNodeInOwnUi(text)).toBe(true);
    expect(isSelectionInOwnUi(fakeSelection(text))).toBe(true);
  });

  it('detects light-DOM nodes inside the host element', () => {
    const host = document.createElement(HOST_TAG);
    const lightChild = document.createElement('span');
    host.appendChild(lightChild);
    document.body.appendChild(host);

    expect(isNodeInOwnUi(lightChild)).toBe(true);
  });

  it('rejects page nodes, foreign shadow roots, and empty selections', () => {
    const pageDiv = document.createElement('div');
    const pageText = document.createTextNode('ordinary page text');
    pageDiv.appendChild(pageText);
    document.body.appendChild(pageDiv);

    const foreignHost = document.createElement('other-widget');
    const foreignShadow = foreignHost.attachShadow({ mode: 'open' });
    const foreignNode = document.createElement('div');
    foreignShadow.appendChild(foreignNode);
    document.body.appendChild(foreignHost);

    expect(isNodeInOwnUi(pageDiv)).toBe(false);
    expect(isNodeInOwnUi(pageText)).toBe(false);
    expect(isNodeInOwnUi(foreignNode)).toBe(false);
    expect(isNodeInOwnUi(null)).toBe(false);
    expect(isSelectionInOwnUi(fakeSelection(pageText))).toBe(false);
    expect(isSelectionInOwnUi(fakeSelection(null))).toBe(false);
    expect(isSelectionInOwnUi(null)).toBe(false);
  });
});
