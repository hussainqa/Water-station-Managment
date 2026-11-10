import { describe, expect, it } from "vitest";
import { MIN_SPAN, scaleSeries } from "./sparkline-scale";

const H = 24;

describe("scaleSeries", () => {
  it("returns nothing for an empty series", () => {
    expect(scaleSeries([], H)).toEqual([]);
  });

  it("centres a single point", () => {
    expect(scaleSeries([73], H)).toEqual([H / 2]);
  });

  it("draws a flat series as a centred flat line (no division by zero)", () => {
    const ys = scaleSeries([80, 80, 80], H);
    expect(ys).toEqual([12, 12, 12]);
    expect(ys.every(Number.isFinite)).toBe(true);
  });

  it("uses the full height minus a 10 % margin for two points", () => {
    const [a, b] = scaleSeries([60, 90], H);
    // range 30 -> axis span 36: margin of 3 points each side
    expect(a).toBeCloseTo(H * (1 - 3 / 36));
    expect(b).toBeCloseTo(H * (1 - 33 / 36));
    expect(a).toBeGreaterThan(b);
  });

  it("goes up the screen (smaller y) as values increase and down as they decrease", () => {
    const up = scaleSeries([10, 20, 40, 80], H);
    expect(up).toEqual([...up].sort((x, y) => y - x));
    expect(up[0]).toBeLessThan(H);
    expect(up[3]).toBeGreaterThan(0);
    const down = scaleSeries([80, 40, 20, 10], H);
    expect(down).toEqual([...down].sort((x, y) => x - y));
  });

  it("scales to the data, not to 0-100", () => {
    const small = scaleSeries([90, 92], H);
    const big = scaleSeries([0, 100], H);
    expect(small[0] - small[1]).toBeGreaterThan(0);
    // a 2-point change still spans a visible share of the height (min span 10 points)
    expect((small[0] - small[1]) / H).toBeCloseTo(2 / MIN_SPAN);
    expect(big[0] - big[1]).toBeLessThan(H);
  });

  it("handles values at 100 and keeps the line inside the box", () => {
    const ys = scaleSeries([100, 100], H);
    expect(ys).toEqual([12, 12]);
    const mixed = scaleSeries([95, 100, 97], H);
    for (const y of mixed) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(H);
    }
    expect(mixed[1]).toBeLessThan(mixed[0]);
  });

  it("clamps out-of-range values", () => {
    expect(scaleSeries([-5, 120], H)).toEqual(scaleSeries([0, 100], H));
  });
});
