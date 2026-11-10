import { describe, expect, it } from "vitest";
import type { HistoryPoint } from "@/lib/assessments/types";
import {
  calculationView,
  calloutRows,
  changeView,
  chartDomain,
  crossedLimit,
  describeAudit,
  describeLimits,
  formatDateTime,
  formatNumber,
  monthName,
  periodLabel,
  shapeHistory,
} from "./helpers";

describe("period labels", () => {
  it("names one month in both languages (Iraqi Arabic month names, Western digits)", () => {
    expect(periodLabel("2026-09", 1, "ar")).toBe("أيلول 2026");
    expect(periodLabel("2026-09", 1, "en")).toBe("September 2026");
    expect(monthName("2026-01", "ar")).toBe("كانون الثاني");
    expect(monthName("2026-02", "ar")).toBe("شباط");
    expect(monthName("2026-03", "ar")).toBe("آذار");
  });
  it("shows a range inside one year and across years", () => {
    expect(periodLabel("2026-03", 6, "en")).toBe("March – August 2026");
    expect(periodLabel("2026-03", 6, "ar")).toBe("آذار – آب 2026");
    expect(periodLabel("2025-11", 3, "en")).toBe("November 2025 – January 2026");
  });
});

describe("formatting", () => {
  it("formats numbers with Latin digits and trims decimals", () => {
    expect(formatNumber(95)).toBe("95");
    expect(formatNumber(96.456)).toBe("96.46");
    expect(formatNumber(null)).toBe("—");
  });
  it("formats a timestamp in Baghdad time", () => {
    expect(formatDateTime("2026-09-04T08:35:00.000Z")).toBe("2026-09-04 11:35");
  });
});

describe("calloutRows", () => {
  it("keeps only deviations, critical first, table order inside a status", () => {
    const rows = [
      { id: "a", status: "warning" as const },
      { id: "b", status: "ok" as const },
      { id: "c", status: "critical" as const },
      { id: "d", status: "insufficient_data" as const },
      { id: "e", status: "warning" as const },
      { id: "f", status: "critical" as const },
    ];
    expect(calloutRows(rows).map((r) => r.id)).toEqual(["c", "f", "a", "e"]);
  });
});

describe("changeView", () => {
  it("is null without a previous value or a direction", () => {
    expect(changeView({ value: 1, previousValue: null, change: null })).toBeNull();
    expect(changeView({ value: null, previousValue: 1, change: null })).toBeNull();
  });
  it("gives the arrow, the judgement and the size of the move", () => {
    expect(changeView({ value: 99.2, previousValue: 99, change: "improved" })).toMatchObject({
      direction: "up",
      judgement: "improved",
    });
    const down = changeView({ value: 3, previousValue: 5, change: "improved" });
    expect(down).toMatchObject({ direction: "down", judgement: "improved", delta: 2 });
    expect(changeView({ value: 3, previousValue: 3, change: "unchanged" })?.direction).toBe("flat");
  });
});

describe("limits wording", () => {
  const higher = { kind: "higher", target: 98, warning: 95, critical: 90 } as const;
  const lower = { kind: "lower", target: 2, warning: 4, critical: 6 } as const;
  const range = { kind: "range", critMin: 6, minOk: 6.5, maxOk: 8.5, critMax: 9 } as const;
  it("describes each kind", () => {
    expect(describeLimits(higher, "%").warning).toEqual({ key: "below", values: { v: "95%" } });
    expect(describeLimits(lower, "h").critical).toEqual({ key: "above", values: { v: "6" } });
    expect(describeLimits(range, "").target).toEqual({ key: "targetRange", values: { min: "6.5", max: "8.5" } });
  });
  it("picks the limit that was crossed", () => {
    expect(crossedLimit(higher, "warning", "%")?.values.v).toBe("95%");
    expect(crossedLimit(higher, "critical", "%")?.values.v).toBe("90%");
    expect(crossedLimit(higher, "ok", "%")).toBeNull();
    expect(crossedLimit(null, "warning", "%")).toBeNull();
  });
});

describe("describeAudit", () => {
  const nameOf = (ref: string) => (ref === "sys:WQ-02" ? "جودة" : ref);
  it("maps every known code", () => {
    expect(describeAudit({ action: "note_changed", actor: "x", payload: { ref: "sys:WQ-02", from: "", to: "a" } }, nameOf)).toEqual({
      key: "note_changed",
      values: { indicator: "جودة" },
    });
    expect(describeAudit({ action: "readings_entered", actor: "me", payload: { count: 15 } }, nameOf).values).toEqual({
      count: "15",
      enteredBy: "me",
    });
    expect(
      describeAudit(
        { action: "approved", actor: "x", payload: { indicators: 15, ok: 9, warning: 6, critical: 0, insufficient_data: 0, no_limits: 0, problems: 0 } },
        nameOf,
      ).key,
    ).toBe("approved");
    for (const a of ["draft_created", "draft_deleted", "missing_data_acknowledged", "problem_opened_auto", "problem_opened_manual"]) {
      expect(describeAudit({ action: a, actor: "x", payload: {} }, nameOf).key).toBe(a);
    }
  });
  it("never shows a raw code for an unknown action", () => {
    expect(describeAudit({ action: "something_new", actor: "x", payload: {} }, nameOf).key).toBe("unknown");
  });
});

describe("shapeHistory", () => {
  const point = (m: string, value: number | null, limits: HistoryPoint["limits"]): HistoryPoint => ({
    assessmentId: m,
    periodStart: m,
    months: 1,
    endDate: `${m}-28`,
    value,
    status: value === null ? "insufficient_data" : "ok",
    limits,
  });
  it("carries each point's own snapshot limits and keeps missing values as null", () => {
    const d = shapeHistory(
      [
        point("2026-06", 96.5, { kind: "higher", target: 98, warning: 96, critical: 90 }),
        point("2026-07", null, null),
        point("2026-08", 97, { kind: "higher", target: 98, warning: 95, critical: 90 }),
      ],
      "en",
    );
    expect(d.rows.map((r) => r.label)).toEqual(["Jun", "Jul", "Aug"]);
    expect(d.rows.map((r) => r.warnA)).toEqual([96, null, 95]);
    expect(d.rows[1].value).toBeNull();
    expect(d.withValue).toBe(2);
    expect(d.hasLimits).toBe(true);
    expect(d.isRange).toBe(false);
  });
  it("adds a short year when the series crosses a year and handles a single point", () => {
    const d = shapeHistory([point("2025-12", 1, null), point("2026-01", 2, null)], "en");
    expect(d.rows.map((r) => r.label)).toEqual(["Dec 25", "Jan 26"]);
    expect(shapeHistory([point("2026-08", 5, null)], "ar").rows).toHaveLength(1);
  });
  it("range limits fill both lines", () => {
    const d = shapeHistory([point("2026-08", 7, { kind: "range", critMin: 6, minOk: 6.5, maxOk: 8.5, critMax: 9 })], "en");
    expect(d.rows[0]).toMatchObject({ warnA: 6.5, warnB: 8.5, critA: 6, critB: 9 });
    expect(d.isRange).toBe(true);
  });
  it("keeps percentage domains inside 0-100", () => {
    const d = shapeHistory([point("2026-08", 99.5, { kind: "higher", target: 98, warning: 95, critical: 90 })], "en");
    const [lo, hi] = chartDomain(d, "%");
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(100);
    expect(lo).toBeLessThan(90);
  });
});

describe("calculationView", () => {
  it("writes ratios, averages and durations out", () => {
    expect(
      calculationView({ method: "ratio", unit: "%", value: 98, inputs: { numerator: 49, denominator: 50 } }),
    ).toEqual({ key: "ratio", values: { numerator: "49", denominator: "50", value: "98%" } });
    expect(
      calculationView({ method: "average", unit: "h", value: 2.5, inputs: { total: "10", count: "4" } }).key,
    ).toBe("average");
    expect(
      calculationView({ method: "duration", unit: "h", value: 1.5, inputs: { value: 90, unit: "min" } }),
    ).toEqual({ key: "duration", values: { raw: "90", unit: "min", value: "1.5" } });
  });
  it("is empty without a value", () => {
    expect(calculationView({ method: "ratio", unit: "%", value: null, inputs: {} }).key).toBe("none");
  });
});
