// Flip to true to diagnose focus/keystroke routing (logs every guarded event type).
const DEBUG = false;

const GUARDED_EVENTS = [
  'keydown',
  'keypress',
  'keyup',
  'beforeinput',
  'input',
  'paste',
  'cut',
  'copy',
  'compositionstart',
  'compositionupdate',
  'compositionend',
] as const;

export interface InputGuardHandlers {
  onEnter(): void;
  onEscape(): void;
}

/**
 * claude.ai has document-level keyboard AND clipboard handlers that redirect
 * input to its composer when document.activeElement doesn't look like an input
 * — which is what it sees when focus is inside our shadow root (the host
 * element). They may run in the capture phase, so stopping propagation inside
 * the shadow root is not enough. This guard runs at WINDOW capture — ahead of
 * any page listener — and stops propagation of keyboard, input, clipboard, and
 * composition events whenever focus is inside our UI, so the page never sees
 * them. Default actions still run (text insertion/paste/cut/copy in our
 * input), with two exceptions we own: Enter in our input (submit) and Escape
 * (close).
 *
 * NOTE: stopping propagation at window capture means the events never reach
 * the target element either. UI code must not rely on key/input listeners on
 * elements inside the shadow root while the guard is engaged — read input
 * values via refs instead.
 */
export function installInputGuard(host: HTMLElement, handlers: InputGuardHandlers): () => void {
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
