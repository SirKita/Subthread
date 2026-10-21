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
