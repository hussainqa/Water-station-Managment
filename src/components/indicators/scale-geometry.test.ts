import { describe, expect, it } from "vitest";
import { statusOf, type Limits } from "@/lib/evaluation";
import { markerTone, scaleGeometry } from "./scale-geometry";

const higher: Limits = { kind: "higher", target: 98, warning: 95, critical: 90 };
const lower: Limits = { kind: "lower", target: 2, warning: 4, critical: 6 };
const range: Limits = { kind: "range", critMin: 6, minOk: 6.5, maxOk: 8.5, critMax: 9 };

const sum = (g: ReturnType<typeof scaleGeometry>) => g.segments.reduce((s, x) => s + x.size, 0);

describe("scaleGeometry", () => {
  it("higher is better: critical, warning, ok from the low end", () => {
    const g = scaleGeometry(higher, null, { bounds: { max: 100 } });
    expect(g.segments.map((s) => s.status)).toEqual(["critical", "warning", "ok"]);
    expect(sum(g)).toBeCloseTo(100, 5);
    expect(g.segments[0].start).toBe(0);
    expect(g.max).toBe(100);
    expect(g.marker).toBeNull();
    // ticks ascend and lie inside the scale
    expect(g.ticks.map((t) => t.value)).toEqual([90, 95, 98]);
    expect(g.ticks.every((t) => t.pos >= 0 && t.pos <= 100)).toBe(true);
  });

  it("lower is better: ok, warning, critical from the low end", () => {
    const g = scaleGeometry(lower);
    expect(g.segments.map((s) => s.status)).toEqual(["ok", "warning", "critical"]);
    expect(sum(g)).toBeCloseTo(100, 5);
    expect(g.min).toBeGreaterThanOrEqual(0);
  });

  it("range: critical-warning-ok-warning-critical", () => {
    const g = scaleGeometry(range);
    expect(g.segments.map((s) => s.status)).toEqual([
      "critical",
      "warning",
      "ok",
      "warning",
      "critical",
    ]);
    expect(g.ticks).toHaveLength(4);
    expect(sum(g)).toBeCloseTo(100, 5);
  });

  it("places the marker where the value falls, consistently with statusOf", () => {
    const g = scaleGeometry(higher, 96, { bounds: { max: 100 } });
    expect(g.marker).not.toBeNull();
    const warnTick = g.ticks.find((t) => t.value === 95)!;
    const okTick = g.ticks.find((t) => t.value === 98)!;
    expect(g.marker!).toBeGreaterThan(warnTick.pos);
    expect(g.marker!).toBeLessThan(okTick.pos);
    expect(statusOf(96, higher)).toBe("ok");
  });

  it("stretches the scale for a value beyond it and keeps the marker inside", () => {
    const g = scaleGeometry(lower, 50);
    expect(g.max).toBeGreaterThan(50);
    expect(g.marker!).toBeLessThanOrEqual(100);
    expect(sum(g)).toBeCloseTo(100, 5);
    const lowG = scaleGeometry(higher, 10);
    expect(lowG.min).toBeLessThan(10);
    expect(lowG.marker!).toBeGreaterThanOrEqual(0);
  });

  it("respects percent bounds and does not clamp at zero for negative limits", () => {
    const pct = scaleGeometry({ kind: "higher", target: 100, warning: 90, critical: 70 }, null, {
      bounds: { min: 0, max: 100 },
    });
    expect(pct.min).toBeGreaterThanOrEqual(0);
    expect(pct.max).toBe(100);
    const neg = scaleGeometry({ kind: "range", critMin: -10, minOk: -5, maxOk: 5, critMax: 10 });
    expect(neg.min).toBeLessThan(-10);
  });

  it("survives degenerate limits (equal target and warning, zero span)", () => {
    const g = scaleGeometry({ kind: "higher", target: 5, warning: 5, critical: 5 } as Limits);
    expect(Number.isFinite(g.min) && Number.isFinite(g.max) && g.max > g.min).toBe(true);
    const e = scaleGeometry({ kind: "lower", target: 2, warning: 2, critical: 6 });
    expect(e.ticks.map((t) => t.value)).toEqual([2, 6]);
  });

  it("thins out ticks that would collide", () => {
    const g = scaleGeometry(higher, null, { minTickGap: 40 });
    expect(g.ticks.length).toBeLessThan(3);
  });

  it("maps statuses to marker tones", () => {
    expect(markerTone("ok")).toBe("ok");
    expect(markerTone("insufficient_data")).toBe("neutral");
    expect(markerTone("no_limits")).toBe("neutral");
  });
});
