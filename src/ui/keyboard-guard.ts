// Diagnostic build: set to false once the composer-steals-keystrokes issue is confirmed fixed.
const DEBUG = true;

const GUARDED_EVENTS = ['keydown', 'keypress', 'keyup', 'beforeinput', 'input'] as const;

export interface KeyboardGuardHandlers {
  onEnter(): void;
  onEscape(): void;
}

/**
 * claude.ai has a document-level keyboard handler that refocuses its composer
 * when document.activeElement doesn't look like an input — which is what it
 * sees when focus is inside our shadow root (the host element). It may run in
 * the capture phase, so stopping propagation inside the shadow root is not
 * enough. This guard runs at WINDOW capture — ahead of any page listener — and
 * stops propagation whenever focus is inside our UI, so the page never sees
 * those events. Default actions still run (text insertion into our input),
 * with two exceptions we own: Enter in our input (submit) and Escape (close).
 *
 * NOTE: stopping propagation at window capture means the events never reach
 * the target element either. UI code must not rely on key/input listeners on
 * elements inside the shadow root while the guard is engaged — read input
 * values via refs instead.
 */
export function installKeyboardGuard(
  host: HTMLElement,
  handlers: KeyboardGuardHandlers,
): () => void {
  const guard = (event: Event): void => {
    const active = host.shadowRoot?.activeElement ?? null;
    const engaged = active != null;

    if (DEBUG) {
      console.log('[side-question] guard', {
        type: event.type,
        key: event instanceof KeyboardEvent ? event.key : undefined,
        engaged,
      });
      window.setTimeout(() => {
        console.log(
          '[side-question] guard focus doc=%s shadow=%s',
          document.activeElement?.tagName,
          host.shadowRoot?.activeElement?.tagName,
        );
      }, 0);
    }

    if (!engaged) return;

    event.stopPropagation();

    if (event.type === 'keydown' && event instanceof KeyboardEvent) {
      if (event.key === 'Enter' && active instanceof HTMLInputElement) {
        event.preventDefault();
        handlers.onEnter();
      } else if (event.key === 'Escape') {
        handlers.onEscape();
      }
    }
  };

  for (const type of GUARDED_EVENTS) window.addEventListener(type, guard, true);
  return () => {
    for (const type of GUARDED_EVENTS) window.removeEventListener(type, guard, true);
  };
}
