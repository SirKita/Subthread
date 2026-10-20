/** Viewport-relative snapshot of the selection's bounding rect (for position: fixed). */
export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export function snapshotRect(rect: DOMRect): AnchorRect {
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
  };
}
