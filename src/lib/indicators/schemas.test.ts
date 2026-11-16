import { describe, expect, it } from "vitest";
import {
  checkLimits,
  fieldErrorsFromZod,
  groupNameSchema,
  indicatorFormSchema,
  parseLimitsForm,
  saveLimitsInputSchema,
  type IndicatorFormInput,
} from "./schemas";

const base: IndicatorFormInput = {
  nameAr: "مؤشر",
  nameEn: "",
  description: "",
  group: "sys:continuity",
  newGroupAr: "",
  newGroupEn: "",
  method: "direct",
  better: "lower",
  unit: "عدد",
  labels: { value: { ar: "القيمة", en: "" } },
  adoptAll: true,
};

describe("indicatorFormSchema", () => {
  it("accepts a direct indicator and normalises it", () => {
    const r = indicatorFormSchema.parse(base);
    expect(r.nameEn).toBeNull();
    expect(r.description).toBeNull();
    expect(r.group).toEqual({ kind: "existing", key: { kind: "sys", code: "continuity" } });
    expect(r.inputLabels).toEqual({ value: { ar: "القيمة", en: "القيمة" } });
  });

  it("requires the Arabic name, the unit and the labels for the chosen method", () => {
    const r = indicatorFormSchema.safeParse({
      ...base,
      nameAr: "  ",
      unit: "",
      method: "average",
      labels: { value: { ar: "", en: "" } },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = fieldErrorsFromZod(r.error);
      expect(e.nameAr).toBe("nameRequired");
      expect(e.unit).toBe("unitRequired");
      expect(e["labels.value"]).toBe("labelRequired");
    }
  });

  it("fixes the unit for percentages, ratios and durations", () => {
    const ratio = indicatorFormSchema.parse({
      ...base,
      method: "ratio",
      unit: "kg",
      labels: { numerator: { ar: "ب", en: "n" }, denominator: { ar: "م", en: "d" } },
    });
    expect(ratio.unit).toBe("%");
    expect(Object.keys(ratio.inputLabels).sort()).toEqual(["denominator", "numerator"]);
    expect(indicatorFormSchema.parse({ ...base, method: "direct_percent", unit: "x" }).unit).toBe("%");
    expect(indicatorFormSchema.parse({ ...base, method: "duration", unit: "" }).unit).toBe("h");
  });

  it("handles the new-group option", () => {
    expect(indicatorFormSchema.safeParse({ ...base, group: "new" }).success).toBe(false);
    const r = indicatorFormSchema.parse({ ...base, group: "new", newGroupAr: "مجموعتي" });
    expect(r.group).toEqual({ kind: "new", nameAr: "مجموعتي", nameEn: null });
    expect(indicatorFormSchema.safeParse({ ...base, group: "garbage" }).success).toBe(false);
  });
});

describe("limits form", () => {
  it("parses Arabic digits and detects incomplete / non-numeric input", () => {
    const ok = parseLimitsForm("higher", { target: "٩٨", warning: "95", critical: "90" });
    expect(ok).toEqual({
      ok: true,
      limits: { kind: "higher", target: 98, warning: 95, critical: 90 },
    });
    expect(parseLimitsForm("higher", { target: "98", warning: "", critical: "90" })).toEqual({
      ok: false,
      error: "incomplete",
    });
    expect(parseLimitsForm("lower", { target: "a", warning: "1", critical: "2" })).toEqual({
      ok: false,
      error: "notNumber",
    });
  });

  it("checks ordering per kind and the 0-100 bound for direct percentages", () => {
    expect(checkLimits({ kind: "higher", target: 98, warning: 95, critical: 90 }, "ratio")).toBeNull();
    expect(checkLimits({ kind: "higher", target: 90, warning: 95, critical: 98 }, "ratio")).toBe(
      "badOrderHigher",
    );
    expect(checkLimits({ kind: "lower", target: 5, warning: 3, critical: 9 }, "direct")).toBe(
      "badOrderLower",
    );
    expect(
      checkLimits({ kind: "range", critMin: 1, minOk: 5, maxOk: 3, critMax: 9 }, "direct"),
    ).toBe("badOrderRange");
    expect(checkLimits({ kind: "lower", target: 5, warning: 10, critical: 120 }, "direct_percent")).toBe(
      "outOfPercentRange",
    );
    expect(checkLimits({ kind: "lower", target: 5, warning: 10, critical: 120 }, "direct")).toBeNull();
  });

  it("validates the save-limits payload", () => {
    expect(saveLimitsInputSchema.safeParse({ ref: "sys:SC-01", none: true }).success).toBe(true);
    expect(saveLimitsInputSchema.safeParse({ ref: "bad", none: true }).success).toBe(false);
    expect(
      saveLimitsInputSchema.safeParse({
        ref: "sys:SC-01",
        none: false,
        limits: { kind: "higher", target: Number.NaN, warning: 1, critical: 0 },
      }).success,
    ).toBe(false);
  });
});

describe("groupNameSchema", () => {
  it("requires an Arabic name", () => {
    expect(groupNameSchema.safeParse({ nameAr: " ", nameEn: "" }).success).toBe(false);
    expect(groupNameSchema.parse({ nameAr: " س ", nameEn: " " })).toEqual({ nameAr: "س", nameEn: null });
  });
});
