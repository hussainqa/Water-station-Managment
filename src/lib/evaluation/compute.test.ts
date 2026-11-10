import { describe, expect, it } from "vitest";
import { computeValue, evaluateInputs } from "./compute";
import type { EvaluationSpec, Method } from "./types";

const ev = (method: Method, inputs: Record<string, string | number | null | undefined>, extra?: Partial<EvaluationSpec>) =>
  evaluateInputs({ method, ...extra }, inputs);

describe("direct", () => {
  it("computes complete", () => {
    expect(ev("direct", { value: "3.5" })).toEqual({ state: "complete", errors: {}, value: 3.5 });
  });
  it("accepts 0", () => expect(ev("direct", { value: 0 }).value).toBe(0));
  it.each([[null], [""], [undefined]])("missing for %j", (v) => {
    expect(ev("direct", { value: v })).toEqual({ state: "missing", errors: {}, value: null });
  });
  it("invalid_number", () => {
    const r = ev("direct", { value: "abc" });
    expect(r).toEqual({ state: "error", errors: { value: "invalid_number" }, value: null });
  });
  it("negative", () => {
    expect(ev("direct", { value: -1 }).errors).toEqual({ value: "negative" });
  });
  it("not_integer when listed in integerInputs", () => {
    expect(ev("direct", { value: 1.5 }, { integerInputs: ["value"] }).errors).toEqual({ value: "not_integer" });
    expect(ev("direct", { value: 2 }, { integerInputs: ["value"] }).value).toBe(2);
  });
  it("accepts Arabic digits", () => expect(ev("direct", { value: "١٢٫٥" }).value).toBe(12.5));
});

describe("direct_percent", () => {
  it.each([[0], [100], [55.5]])("allows %s", (v) => {
    expect(ev("direct_percent", { value: v })).toEqual({ state: "complete", errors: {}, value: v });
  });
  it("rejects 100.1", () => {
    expect(ev("direct_percent", { value: 100.1 })).toEqual({
      state: "error",
      errors: { value: "out_of_range" },
      value: null,
    });
  });
  it("negative and invalid", () => {
    expect(ev("direct_percent", { value: -5 }).errors).toEqual({ value: "negative" });
    expect(ev("direct_percent", { value: "x" }).errors).toEqual({ value: "invalid_number" });
  });
  it("missing", () => expect(ev("direct_percent", {}).state).toBe("missing"));
});

describe("duration", () => {
  it("defaults to hours", () => expect(ev("duration", { value: 2 }).value).toBe(2));
  it("unit h", () => expect(ev("duration", { value: 2, unit: "h" }).value).toBe(2));
  it("90 min -> 1.5 h", () => expect(ev("duration", { value: 90, unit: "min" }).value).toBe(1.5));
  it("unit alone does not count as input", () => {
    expect(ev("duration", { unit: "min" })).toEqual({ state: "missing", errors: {}, value: null });
  });
  it("errors", () => {
    expect(ev("duration", { value: -1, unit: "min" }).errors).toEqual({ value: "negative" });
    expect(ev("duration", { value: "abc" }).errors).toEqual({ value: "invalid_number" });
  });
});

describe("ratio", () => {
  it("950/1000 -> 95", () => {
    expect(ev("ratio", { numerator: 950, denominator: 1000 })).toEqual({ state: "complete", errors: {}, value: 95 });
  });
  it("numerator == denominator -> 100", () => {
    expect(ev("ratio", { numerator: 40, denominator: 40 }).value).toBe(100);
  });
  it("numerator 0 allowed", () => expect(ev("ratio", { numerator: 0, denominator: 10 }).value).toBe(0));
  it("partial", () => {
    expect(ev("ratio", { numerator: 5 })).toEqual({ state: "partial", errors: {}, value: null });
    expect(ev("ratio", { denominator: 5, numerator: "" }).state).toBe("partial");
  });
  it("missing", () => expect(ev("ratio", {}).state).toBe("missing"));
  it("exceeds_denominator on numerator", () => {
    expect(ev("ratio", { numerator: 11, denominator: 10 })).toEqual({
      state: "error",
      errors: { numerator: "exceeds_denominator" },
      value: null,
    });
  });
  it("zero_denominator on denominator", () => {
    expect(ev("ratio", { numerator: 0, denominator: 0 }).errors).toEqual({ denominator: "zero_denominator" });
    expect(ev("ratio", { numerator: 5, denominator: 0 }).errors).toEqual({ denominator: "zero_denominator" });
  });
  it("cross-field rules skipped when a field error exists", () => {
    expect(ev("ratio", { numerator: -1, denominator: 0 }).errors).toEqual({ numerator: "negative" });
    expect(ev("ratio", { numerator: "x", denominator: 10 }).errors).toEqual({ numerator: "invalid_number" });
  });
  it("per-field errors on both keys", () => {
    expect(ev("ratio", { numerator: "x", denominator: -2 }).errors).toEqual({
      numerator: "invalid_number",
      denominator: "negative",
    });
  });
  it("not_integer when configured", () => {
    expect(ev("ratio", { numerator: 1.5, denominator: 10 }, { integerInputs: ["numerator"] }).errors).toEqual({
      numerator: "not_integer",
    });
  });
  it("a lone zero denominator is an error even when numerator is missing", () => {
    expect(ev("ratio", { denominator: 0 }).state).toBe("error");
  });
});

describe("average", () => {
  it("12/4 -> 3", () => {
    expect(ev("average", { total: 12, count: 4 })).toEqual({ state: "complete", errors: {}, value: 3 });
  });
  it("total 0 allowed", () => expect(ev("average", { total: 0, count: 3 }).value).toBe(0));
  it("non-integer total ok", () => expect(ev("average", { total: 10, count: 4 }).value).toBe(2.5));
  it("partial / missing", () => {
    expect(ev("average", { total: 12 }).state).toBe("partial");
    expect(ev("average", { count: 4 }).state).toBe("partial");
    expect(ev("average", {}).state).toBe("missing");
  });
  it("count must be integer without being configured", () => {
    expect(ev("average", { total: 12, count: 2.5 }).errors).toEqual({ count: "not_integer" });
  });
  it("zero_count", () => {
    expect(ev("average", { total: 12, count: 0 })).toEqual({
      state: "error",
      errors: { count: "zero_count" },
      value: null,
    });
    expect(ev("average", { count: 0 }).errors).toEqual({ count: "zero_count" });
  });
  it("negative and invalid", () => {
    expect(ev("average", { total: -1, count: 2 }).errors).toEqual({ total: "negative" });
    expect(ev("average", { total: 1, count: "x" }).errors).toEqual({ count: "invalid_number" });
    expect(ev("average", { total: 1, count: -2 }).errors).toEqual({ count: "negative" });
  });
});

describe("value safety", () => {
  it("never returns NaN or Infinity", () => {
    expect(ev("direct", { value: "1e999" }).value).toBeNull();
    expect(ev("direct", { value: "1e999" }).state).toBe("error");
  });
  it("does not round", () => {
    expect(ev("ratio", { numerator: 1, denominator: 3 }).value).toBe((1 / 3) * 100);
  });
});

describe("computeValue", () => {
  it("returns value when complete", () => {
    expect(computeValue("duration", { value: "90", unit: "min" })).toBe(1.5);
    expect(computeValue("ratio", { numerator: 950, denominator: 1000 })).toBe(95);
  });
  it("returns null otherwise", () => {
    expect(computeValue("average", { total: 1, count: 0 })).toBeNull();
    expect(computeValue("direct", {})).toBeNull();
    expect(computeValue("ratio", { numerator: 1 })).toBeNull();
  });
});

describe("ratio keeps exact values exact", () => {
  it.each([
    [29, 100, 29],
    [57, 100, 57],
    [950, 1000, 95],
    [676, 720, (676 * 100) / 720],
  ])("%d / %d", (numerator, denominator, expected) => {
    expect(computeValue("ratio", { numerator, denominator })).toBe(expected);
  });
});
