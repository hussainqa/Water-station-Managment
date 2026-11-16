import { describe, expect, it } from "vitest";
import type { WizardGroup, WizardIndicator } from "@/lib/assessments/types";
import {
  allIndicators,
  canApprove,
  clampStep,
  countStates,
  detailsErrors,
  defaultDetails,
  emptyReading,
  evaluateAll,
  formatValue,
  formulaText,
  groupCheckState,
  monthLabel,
  monthOptions,
  toggleGroup,
  withPeriod,
} from "./lib";

const NOW = new Date("2026-11-10T09:00:00Z");

const ind = (ref: string, method: WizardIndicator["method"], keys: string[], integer: string[] = []): WizardIndicator => ({
  ref,
  code: ref.slice(4),
  nameAr: "x",
  nameEn: "x",
  isSystem: true,
  method,
  unit: "%",
  better: "higher",
  inputs: keys.map((key) => ({ key, labelAr: key, labelEn: key, integer: integer.includes(key), unitChoices: null })),
  limits: null,
});

describe("monthOptions", () => {
  it("offers only periods that end by the current month, latest first", () => {
    expect(monthOptions(1, NOW, 3)).toEqual(["2026-11", "2026-10", "2026-09"]);
    expect(monthOptions(3, NOW, 2)).toEqual(["2026-09", "2026-08"]);
    expect(monthOptions(12, NOW, 1)).toEqual(["2025-12"]);
  });
  it("uses the app time zone for the current month", () => {
    // 22:00 UTC on 30 Nov is already 1 Dec in Baghdad (UTC+3)
    expect(monthOptions(1, new Date("2026-11-30T22:00:00Z"), 1)).toEqual(["2026-12"]);
  });
});

describe("monthLabel", () => {
  it("uses Iraqi month names in Arabic with Western digits", () => {
    expect(monthLabel("2026-09", "ar")).toBe("أيلول 2026");
    expect(monthLabel("2026-01", "ar")).toBe("كانون الثاني 2026");
    expect(monthLabel("2026-09", "en")).toBe("September 2026");
  });
});

describe("withPeriod / detailsErrors", () => {
  it("defaults to the latest monthly period with whole-period dates", () => {
    const d = defaultDetails("p", "Eng", NOW);
    expect(d).toMatchObject({ periodStart: "2026-11", months: 1, startDate: "2026-11-01", endDate: "2026-11-30" });
    expect(detailsErrors(d, NOW)).toEqual({});
  });
  it("pulls the start back when a longer period would end in the future", () => {
    const d = withPeriod(defaultDetails("p", "Eng", NOW), { months: 3 }, NOW);
    expect(d.periodStart).toBe("2026-09");
    expect(d.endDate).toBe("2026-11-30");
  });
  it("reports dates outside the period, ordering and a missing name", () => {
    const d = { ...defaultDetails("p", " ", NOW), startDate: "2026-10-20", endDate: "2026-11-05" };
    expect(detailsErrors(d, NOW)).toEqual({ enteredBy: "required", startDate: "outsidePeriod" });
    expect(detailsErrors({ ...defaultDetails("p", "E", NOW), startDate: "2026-11-20", endDate: "2026-11-05" }, NOW)).toEqual({
      endDate: "beforeStart",
    });
  });
});

describe("formulaText", () => {
  it("writes ratios out", () => {
    expect(formulaText("ratio", { numerator: "676", denominator: "720" }, (676 * 100) / 720, "%")).toBe("676 ÷ 720 × 100 = 93.9 %");
  });
  it("normalises Arabic digits in the operands", () => {
    expect(formulaText("ratio", { numerator: "٢٢٩", denominator: "٢٤٠" }, 95.4166, "%")).toBe("229 ÷ 240 × 100 = 95.4 %");
  });
  it("writes averages, durations and recorded values", () => {
    expect(formulaText("average", { value: "4.29" }, 4.29, "h")).toBe("4.29 = 4.3 h");
    expect(formulaText("duration", { value: "390", unit: "min" }, 6.5, "h", "min")).toBe("390 min ÷ 60 = 6.5 h");
    expect(formulaText("duration", { value: "6.5", unit: "h" }, 6.5, "h")).toBe("6.5 h = 6.5 h");
    expect(formulaText("direct", { value: "7" }, 7, "events")).toBe("7 = 7 events");
  });
  it("is null without a value", () => {
    expect(formulaText("ratio", { numerator: "1", denominator: "" }, null, "%")).toBeNull();
  });
  it("keeps two decimals below one", () => {
    expect(formatValue(0.456)).toBe("0.46");
    expect(formatValue(12)).toBe("12");
  });
});

describe("selection", () => {
  const group: WizardGroup = {
    key: "sys:continuity",
    nameAr: "g",
    nameEn: "g",
    isSystem: true,
    indicators: [ind("sys:A", "direct", ["value"]), ind("sys:B", "direct", ["value"])],
  };
  it("derives the tri-state and toggles", () => {
    expect(groupCheckState(group, new Set())).toBe("none");
    expect(groupCheckState(group, new Set(["sys:A"]))).toBe("some");
    expect(groupCheckState(group, new Set(["sys:A", "sys:B"]))).toBe("all");
    expect([...toggleGroup(group, new Set(["sys:A"]))].sort()).toEqual(["sys:A", "sys:B"]);
    expect([...toggleGroup(group, new Set(["sys:A", "sys:B"]))]).toEqual([]);
  });
});

describe("default selection of a new draft", () => {
  it("lists every indicator of the plant, so a new draft can open fully ticked", () => {
    const groups: WizardGroup[] = [
      { key: "sys:a", nameAr: "a", nameEn: "a", isSystem: true, indicators: [ind("sys:A", "direct", ["value"])] },
      { key: "sys:b", nameAr: "b", nameEn: "b", isSystem: true, indicators: [ind("sys:B", "direct", ["value"]), ind("sys:C", "direct", ["value"])] },
    ];
    const selected = new Set(allIndicators(groups).map((i) => i.ref));
    expect([...selected]).toEqual(["sys:A", "sys:B", "sys:C"]);
    expect(groupCheckState(groups[1], selected)).toBe("all");
    // "Clear selection" is an empty set: every group reads as none, "Select all" restores
    expect(groupCheckState(groups[1], new Set())).toBe("none");
  });
});

describe("step 4 rules", () => {
  const rows = (...specs: [WizardIndicator, Record<string, string>][]) =>
    evaluateAll(
      specs.map((s) => s[0]),
      Object.fromEntries(specs.map(([i, inputs]) => [i.ref, { inputs: { ...emptyReading(i).inputs, ...inputs }, note: "" }])),
    );
  const A = ind("sys:A", "ratio", ["numerator", "denominator"], ["numerator", "denominator"]);
  const B = ind("sys:B", "direct_percent", ["value"]);

  it("counts states and requires the acknowledgement for incomplete data", () => {
    const c = countStates(rows([A, { numerator: "9", denominator: "10" }], [B, {}]));
    expect(c).toEqual({ complete: 1, partial: 0, missing: 1, error: 0 });
    expect(canApprove(c, false)).toBe(false);
    expect(canApprove(c, true)).toBe(true);
  });
  it("blocks errors even when acknowledged", () => {
    const c = countStates(rows([A, { numerator: "11", denominator: "10" }], [B, { value: "50" }]));
    expect(c.error).toBe(1);
    expect(canApprove(c, true)).toBe(false);
  });
  it("needs at least one complete value", () => {
    expect(canApprove(countStates(rows([B, {}])), true)).toBe(false);
  });
  it("validates inputs live", () => {
    const [r] = rows([B, { value: "120" }]);
    expect(r.result.errors).toEqual({ value: "out_of_range" });
    const [s] = rows([A, { numerator: "1.5", denominator: "10" }]);
    expect(s.result.errors).toEqual({ numerator: "not_integer" });
  });
});

describe("clampStep", () => {
  it("opens a new assessment at 1 and a draft at the right step", () => {
    expect(clampStep(3, null)).toBe(1);
    expect(clampStep(null, { selection: [] })).toBe(2);
    // Pre-selected but nothing typed yet: back to the indicators step.
    expect(clampStep(null, { selection: ["sys:A"] })).toBe(2);
    const reading = (inputs: Record<string, string | number | null>, note = "") =>
      ({ ref: "sys:A", inputs, note }) as never;
    expect(clampStep(null, { selection: ["sys:A"], readings: [reading({ value: "" })] })).toBe(2);
    expect(clampStep(null, { selection: ["sys:A"], readings: [reading({ unit: "h" })] })).toBe(2);
    expect(clampStep(null, { selection: ["sys:A"], readings: [reading({ value: "5" })] })).toBe(3);
    expect(clampStep(null, { selection: ["sys:A"], readings: [reading({}, "note")] })).toBe(3);
    expect(clampStep(4, { selection: [] })).toBe(2);
    expect(clampStep(4, { selection: ["sys:A"] })).toBe(4);
    expect(clampStep(1, { selection: ["sys:A"] })).toBe(1);
  });
});
