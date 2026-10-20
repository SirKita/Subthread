// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installInputGuard } from './input-guard';

// The guard only reads host.shadowRoot.activeElement, so the host is a minimal
// fake with a settable activeElement; the input and the event propagation
// (window capture -> document -> target) are real happy-dom machinery.
function makeHost(): { host: HTMLElement; setActive(el: Element | null): void } {
  const shadowRoot = { activeElement: null as Element | null };
  return {
    host: { shadowRoot } as unknown as HTMLElement,
    setActive: (el) => {
      shadowRoot.activeElement = el;
    },
  };
}

describe('installInputGuard', () => {
  let input: HTMLInputElement;
  let uninstall: (() => void) | null = null;
  const docBubbleListener = vi.fn();
  const docCaptureListener = vi.fn();
  const onEnter = vi.fn();
  const onEscape = vi.fn();

  function pressKey(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    input.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    input = document.createElement('input');
    document.body.appendChild(input);
    document.addEventListener('keydown', docBubbleListener);
    document.addEventListener('keydown', docCaptureListener, true);
  });

  afterEach(() => {
    uninstall?.();
    uninstall = null;
    document.removeEventListener('keydown', docBubbleListener);
    document.removeEventListener('keydown', docCaptureListener, true);
    vi.clearAllMocks();
  });

  it('stops guarded events from reaching document-level listeners (capture and bubble)', () => {
    const { host, setActive } = makeHost();
    setActive(input);
    uninstall = installInputGuard(host, { onEnter, onEscape });

    const letter = pressKey('a');

    expect(docCaptureListener).not.toHaveBeenCalled();
    expect(docBubbleListener).not.toHaveBeenCalled();
    // Default must NOT be prevented — the browser still inserts the character.
    expect(letter.defaultPrevented).toBe(false);
    expect(onEnter).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('Enter in our input is defaultPrevented and calls onEnter', () => {
    const { host, setActive } = makeHost();
    setActive(input);
    uninstall = installInputGuard(host, { onEnter, onEscape });

    const enter = pressKey('Enter');

    expect(onEnter).toHaveBeenCalledOnce();
    expect(enter.defaultPrevented).toBe(true);
    expect(docBubbleListener).not.toHaveBeenCalled();
  });

  it('Escape calls onEscape', () => {
    const { host, setActive } = makeHost();
    setActive(input);
    uninstall = installInputGuard(host, { onEnter, onEscape });

    pressKey('Escape');

    expect(onEscape).toHaveBeenCalledOnce();
    expect(onEnter).not.toHaveBeenCalled();
    expect(docBubbleListener).not.toHaveBeenCalled();
  });

  it('does nothing when focus is outside the shadow root', () => {
    const { host, setActive } = makeHost();
    setActive(null);
    uninstall = installInputGuard(host, { onEnter, onEscape });

    const letter = pressKey('a');
    const enter = pressKey('Enter');

    expect(docCaptureListener).toHaveBeenCalledTimes(2);
    expect(docBubbleListener).toHaveBeenCalledTimes(2);
    expect(letter.defaultPrevented).toBe(false);
    expect(enter.defaultPrevented).toBe(false);
    expect(onEnter).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('stops guarding after uninstall', () => {
    const { host, setActive } = makeHost();
    setActive(input);
    const remove = installInputGuard(host, { onEnter, onEscape });
    remove();

    pressKey('a');
    expect(docBubbleListener).toHaveBeenCalledOnce();
  });

  describe('clipboard events', () => {
    const docPasteListener = vi.fn();

    function dispatchPaste(): Event {
      // Plain Event: happy-dom's ClipboardEvent support is spotty, and the
      // guard's behavior doesn't depend on the event subclass.
      const event = new Event('paste', { bubbles: true, cancelable: true, composed: true });
      input.dispatchEvent(event);
      return event;
    }

    beforeEach(() => {
      document.addEventListener('paste', docPasteListener);
    });

    afterEach(() => {
      document.removeEventListener('paste', docPasteListener);
    });

    it('stops paste from reaching document-level listeners without preventing the default', () => {
      const { host, setActive } = makeHost();
      setActive(input);
      uninstall = installInputGuard(host, { onEnter, onEscape });

      const paste = dispatchPaste();

      expect(docPasteListener).not.toHaveBeenCalled();
      // Default must NOT be prevented — the browser still pastes into our input.
      expect(paste.defaultPrevented).toBe(false);
    });

    it('lets paste through when focus is outside the shadow root', () => {
      const { host, setActive } = makeHost();
      setActive(null);
      uninstall = installInputGuard(host, { onEnter, onEscape });

      const paste = dispatchPaste();

      expect(docPasteListener).toHaveBeenCalledOnce();
      expect(paste.defaultPrevented).toBe(false);
    });
  });
});
