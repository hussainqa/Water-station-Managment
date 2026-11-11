import { describe, expect, it } from "vitest";
import { chartGeometry, chartSvg, lineRuns } from "./chart";

describe("chartGeometry", () => {
  it("runs left to right in LTR and right to left in RTL (oldest first)", () => {
    const ltr = chartGeometry([100, 50, 0], false);
    expect(ltr.xs[0]).toBeLessThan(ltr.xs[1]);
    expect(ltr.xs[1]).toBeLessThan(ltr.xs[2]);
    const rtl = chartGeometry([100, 50, 0], true);
    expect(rtl.xs[0]).toBeGreaterThan(rtl.xs[1]);
    expect(rtl.xs[1]).toBeGreaterThan(rtl.xs[2]);
    expect(rtl.xs[0]).toBe(ltr.xs[2]);
  });
  it("maps 0 to the bottom and 100 to the top of the plot", () => {
    const g = chartGeometry([0, 100, null], false);
    expect(g.ys[0]).toBe(g.plot.y1);
    expect(g.ys[1]).toBe(g.plot.y0);
    expect(g.ys[2]).toBeNull();
    expect(g.yTicks.map((t) => t.value)).toEqual([0, 25, 50, 75, 100]);
  });
  it("clamps out-of-range values and centres a single point", () => {
    const g = chartGeometry([140], false);
    expect(g.ys[0]).toBe(g.plot.y0);
    expect(g.xs[0]).toBe((g.plot.x0 + g.plot.x1) / 2);
  });
  it("breaks the line at a missing value", () => {
    const g = chartGeometry([10, null, 20, 30], false);
    expect(lineRuns(g).map((r) => r.length)).toEqual([1, 2]);
  });
});

describe("chartSvg", () => {
  it("is self-contained and escapes labels", () => {
    const svg = chartSvg({ values: [100, 50], labels: ["<b>x", "y"], rtl: true, title: 'T"', desc: "d", valueText: (v) => `${v}%` });
    expect(svg).toContain("<svg");
    expect(svg).not.toMatch(/xmlns|http|<script|<b>/);
    expect(svg).toContain("&lt;b&gt;x");
  });
});
