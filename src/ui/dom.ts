/** WXT shadow host element name. */
export const HOST_TAG = 'subthread-ui';

/** The innermost real target of an event, even across open shadow roots. */
export function eventTargetElement(event: Event): Element | null {
  const target = event.composedPath()[0] ?? event.target;
  return target instanceof Element ? target : null;
}

/** True if the event originated anywhere inside our shadow UI. */
export function isOwnUiEvent(event: Event): boolean {
  return event
    .composedPath()
    .some((node) => node instanceof Element && node.tagName.toLowerCase() === HOST_TAG);
}

/** True if the event's real target is an editable element (or inside one). */
export function isEditableTarget(event: Event): boolean {
  return eventTargetElement(event)?.closest('input, textarea, [contenteditable="true"]') != null;
}

/** True if the event's real target sits inside an element matching `selector` (same shadow tree). */
export function isWithin(event: Event, selector: string): boolean {
  return eventTargetElement(event)?.closest(selector) != null;
}

/**
 * True if the node lives inside our shadow UI — either inside the shadow tree
 * itself (its root is a ShadowRoot hosted by our tag) or inside the host
 * element in the light DOM.
 */
export function isNodeInOwnUi(node: Node | null): boolean {
  if (!node) return false;
  const el = node instanceof Element ? node : node.parentElement;
  if (el?.closest(HOST_TAG)) return true;
  const root = node.getRootNode();
  return root instanceof ShadowRoot && root.host.tagName.toLowerCase() === HOST_TAG;
}

/** True if the selection is anchored inside our shadow UI (never show our toolbar over it). */
export function isSelectionInOwnUi(selection: Selection | null): boolean {
  return isNodeInOwnUi(selection?.anchorNode ?? null);
}
