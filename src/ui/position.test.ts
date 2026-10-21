import { describe, expect, it } from 'vitest';
import { clampToViewport } from './position';

// 440x300 box in a 1280x800 viewport with a 12px margin, unless stated.
const W = 440;
const H = 300;
const VW = 1280;
const VH = 800;
const M = 12;

describe('clampToViewport', () => {
  it('leaves an in-bounds position untouched', () => {
    expect(clampToViewport(100, 150, W, H, VW, VH, M)).toEqual({ x: 100, y: 150 });
  });

  it('clamps each corner to the margin', () => {
    // top-left overflow
    expect(clampToViewport(-50, -50, W, H, VW, VH, M)).toEqual({ x: M, y: M });
    // bottom-right overflow
    expect(clampToViewport(5000, 5000, W, H, VW, VH, M)).toEqual({
      x: VW - W - M,
      y: VH - H - M,
    });
    // top-right overflow
    expect(clampToViewport(5000, -50, W, H, VW, VH, M)).toEqual({ x: VW - W - M, y: M });
    // bottom-left overflow
    expect(clampToViewport(-50, 5000, W, H, VW, VH, M)).toEqual({ x: M, y: VH - H - M });
  });

  it('allows positions exactly on the clamp boundary', () => {
    expect(clampToViewport(M, M, W, H, VW, VH, M)).toEqual({ x: M, y: M });
    expect(clampToViewport(VW - W - M, VH - H - M, W, H, VW, VH, M)).toEqual({
      x: VW - W - M,
      y: VH - H - M,
    });
  });

  it('pins an oversized popover to the top-left margin instead of oscillating', () => {
    // wider and taller than the viewport minus margins
    expect(clampToViewport(100, 100, 2000, 1000, VW, VH, M)).toEqual({ x: M, y: M });
    expect(clampToViewport(-500, -500, 2000, 1000, VW, VH, M)).toEqual({ x: M, y: M });
  });
});
