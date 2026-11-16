import { describe, expect, it } from "vitest";
import { evaluateInputs } from "@/lib/evaluation";
import { inputDefs, integerInputKeys, sanitizeInputs, storedInputKeys } from "./inputs";

describe("sanitizeInputs", () => {
  it("keeps only the method's keys and never a value or status", () => {
    const out = sanitizeInputs("ratio", { numerator: "5", denominator: 10, value: 99, status: "ok", junk: 1 });
    expect(out).toEqual({ numerator: "5", denominator: 10 });
  });

  it("fills missing keys with null", () => {
    expect(sanitizeInputs("average", {})).toEqual({ value: null });
    expect(sanitizeInputs("direct", undefined)).toEqual({ value: null });
  });

  it("stores a duration unit of h or min, defaulting to h", () => {
    expect(sanitizeInputs("duration", { value: "90", unit: "min" })).toEqual({ value: "90", unit: "min" });
    expect(sanitizeInputs("duration", { value: "2", unit: "days" })).toEqual({ value: "2", unit: "h" });
    expect(sanitizeInputs("duration", { value: "2" })).toEqual({ value: "2", unit: "h" });
    expect(storedInputKeys("duration")).toEqual(["value", "unit"]);
  });

  it("upgrades an average saved as total and count to its value", () => {
    expect(sanitizeInputs("average", { total: "10", count: "4" })).toEqual({ value: "2.5" });
    expect(sanitizeInputs("average", { value: "3", total: "10", count: "4" })).toEqual({ value: "3" });
  });

  it("drops non-finite numbers", () => {
    expect(sanitizeInputs("direct", { value: Number.NaN })).toEqual({ value: null });
  });
});

describe("integer inputs and definitions", () => {
  it("marks the counting inputs of system indicators", () => {
    expect(integerInputKeys("SC-03", "direct")).toEqual(["value"]);
    expect(integerInputKeys("WQ-02", "ratio")).toEqual(["numerator", "denominator"]);
    expect(integerInputKeys("SC-01", "ratio")).toEqual([]);
    expect(integerInputKeys(null, "direct")).toEqual([]);
  });

  it("builds input definitions with labels, integer flags and duration units", () => {
    const defs = inputDefs("average", "RT-01", { value: { ar: "متوسط زمن الاستجابة", en: "Average response time" } });
    expect(defs.map((d) => [d.key, d.integer, d.labelAr])).toEqual([["value", false, "متوسط زمن الاستجابة"]]);
    const dur = inputDefs("duration", "SC-04", { value: { ar: "زمن", en: "Time" } });
    expect(dur).toHaveLength(1);
    expect(dur[0].unitChoices).toEqual(["h", "min"]);
  });

  it("feeds evaluateInputs: minutes become hours, integers are enforced", () => {
    expect(evaluateInputs({ method: "duration" }, sanitizeInputs("duration", { value: "90", unit: "min" })).value).toBe(1.5);
    const r = evaluateInputs(
      { method: "direct", integerInputs: integerInputKeys("SC-03", "direct") },
      sanitizeInputs("direct", { value: "2.5" }),
    );
    expect(r.errors).toEqual({ value: "not_integer" });
  });
});
