import { esc } from "./html";

/**
 * Pure geometry and SVG of the one chart of the report: share of indicators within limits
 * per period. Time runs in reading direction (left to right in English, right to left in
 * Arabic). The SVG has no scripts, no external references and no xmlns (it is inline HTML).
 */

export type ChartBox = { width: number; height: number; left: number; right: number; top: number; bottom: number };

export type ChartGeometry = {
  box: ChartBox;
  /** x of each period, index = chronological index (oldest = 0) */
  xs: number[];
  /** y of each value; null where there is no value */
  ys: (number | null)[];
  /** plot rectangle */
  plot: { x0: number; x1: number; y0: number; y1: number };
  yTicks: { value: number; y: number }[];
};

export const DEFAULT_BOX: ChartBox = { width: 680, height: 230, left: 44, right: 44, top: 24, bottom: 40 };

/** `values` are 0-100 or null, oldest first. `rtl` puts the oldest period on the right. */
export function chartGeometry(values: readonly (number | null)[], rtl: boolean, box: ChartBox = DEFAULT_BOX): ChartGeometry {
  const x0 = box.left;
  const x1 = box.width - box.right;
  const y0 = box.top;
  const y1 = box.height - box.bottom;
  const n = values.length;
  const xs = values.map((_, i) => {
    if (n <= 1) return (x0 + x1) / 2;
    const step = (x1 - x0) / (n - 1);
    return rtl ? x1 - i * step : x0 + i * step;
  });
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const ys = values.map((v) => (v === null ? null : y1 - (clamp(v) / 100) * (y1 - y0)));
  const yTicks = [0, 25, 50, 75, 100].map((value) => ({ value, y: y1 - (value / 100) * (y1 - y0) }));
  return { box, xs, ys, plot: { x0, x1, y0, y1 }, yTicks };
}

/** Runs of consecutive points that have a value (a gap breaks the line). */
export function lineRuns(g: Pick<ChartGeometry, "xs" | "ys">): { x: number; y: number }[][] {
  const runs: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  g.xs.forEach((x, i) => {
    const y = g.ys[i];
    if (y === null) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push({ x, y });
  });
  if (cur.length) runs.push(cur);
  return runs;
}

const f = (n: number) => String(Math.round(n * 10) / 10);

export type ChartInput = {
  values: (number | null)[];
  labels: string[];
  rtl: boolean;
  title: string;
  desc: string;
  /** "83%" text of a value */
  valueText: (v: number) => string;
};

export function chartSvg(input: ChartInput): string {
  const g = chartGeometry(input.values, input.rtl);
  const { plot, box } = g;
  const axisX = input.rtl ? plot.x1 + 8 : plot.x0 - 8;
  const anchor = input.rtl ? "start" : "end";
  const parts: string[] = [];
  parts.push(
    `<svg class="chart" viewBox="0 0 ${box.width} ${box.height}" width="100%" role="img" aria-labelledby="chart-t chart-d" preserveAspectRatio="xMidYMid meet">`,
    `<title id="chart-t">${esc(input.title)}</title><desc id="chart-d">${esc(input.desc)}</desc>`,
  );
  for (const t of g.yTicks) {
    parts.push(
      `<line x1="${f(plot.x0)}" x2="${f(plot.x1)}" y1="${f(t.y)}" y2="${f(t.y)}" class="${t.value === 0 ? "axis" : "grid"}"/>`,
      `<text x="${f(axisX)}" y="${f(t.y + 3.5)}" text-anchor="${anchor}" class="tick">${esc(t.value)}%</text>`,
    );
  }
  for (const run of lineRuns(g)) {
    if (run.length > 1) {
      parts.push(`<polyline class="line" fill="none" points="${run.map((p) => `${f(p.x)},${f(p.y)}`).join(" ")}"/>`);
    }
  }
  g.xs.forEach((x, i) => {
    const y = g.ys[i];
    parts.push(
      `<text x="${f(x)}" y="${f(plot.y1 + 16)}" text-anchor="middle" class="tick">${esc(input.labels[i] ?? "")}</text>`,
    );
    if (y !== null) {
      parts.push(
        `<circle cx="${f(x)}" cy="${f(y)}" r="3.6" class="dot"/>`,
        `<text x="${f(x)}" y="${f(y - 8)}" text-anchor="middle" class="val">${esc(input.valueText(input.values[i] as number))}</text>`,
      );
    }
  });
  parts.push("</svg>");
  return parts.join("");
}
