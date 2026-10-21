/**
 * Clamp a fixed-position box to the viewport with a margin on all sides.
 * If the box is larger than the available space, it pins to the top/left margin.
 */
export function clampToViewport(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
  margin: number,
): { x: number; y: number } {
  const maxX = vw - w - margin;
  const maxY = vh - h - margin;
  return {
    x: Math.min(Math.max(margin, x), Math.max(margin, maxX)),
    y: Math.min(Math.max(margin, y), Math.max(margin, maxY)),
  };
}
