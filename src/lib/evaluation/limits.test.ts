import { describe, expect, it } from "vitest";
import { validateLimits } from "./limits";
import { limitsSchema, limitsSnapshotSchema } from "./types";
import type { Limits } from "./types";

const h = (target: number, warning: number, critical: number): Limits => ({ kind: "higher", target, warning, critical });
const l = (target: number, warning: number, critical: number): Limits => ({ kind: "lower", target, warning, critical });
const r = (critMin: number, minOk: number, maxOk: number, critMax: number): Limits => ({
  kind: "range",
  critMin,
  minOk,
  maxOk,
  critMax,
});

describe("validateLimits", () => {
  it.each([
    ["higher valid", h(95, 90, 80)],
    ["higher warning == target", h(90, 90, 80)],
    ["lower valid", l(2, 4, 6)],
    ["lower warning == target", l(4, 4, 6)],
    ["range valid", r(6, 6.5, 8.5, 9)],
    ["negative numbers ok", r(-10, -5, 5, 10)],
  ])("%s", (_n, lim) => expect(validateLimits(lim)).toBeNull());

  it.each([
    ["higher critical == warning", h(95, 90, 90)],
    ["higher critical > warning", h(95, 90, 91)],
    ["higher warning > target", h(85, 90, 80)],
    ["lower warning < target", l(5, 4, 6)],
    ["lower critical == warning", l(2, 4, 4)],
    ["lower critical < warning", l(2, 4, 3)],
    ["range critMin == minOk", r(6, 6, 8, 9)],
    ["range critMin > minOk", r(7, 6, 8, 9)],
    ["range minOk == maxOk", r(5, 7, 7, 9)],
    ["range minOk > maxOk", r(5, 8, 7, 9)],
    ["range maxOk == critMax", r(5, 6, 9, 9)],
    ["range maxOk > critMax", r(5, 6, 10, 9)],
  ])("%s is bad_order", (_n, lim) => expect(validateLimits(lim)).toEqual(["bad_order"]));

  it.each([
    ["higher NaN", h(NaN, 90, 80)],
    ["lower Infinity", l(2, 4, Infinity)],
    ["range -Infinity", r(-Infinity, 6, 8, 9)],
  ])("%s is not_finite", (_n, lim) => expect(validateLimits(lim)).toEqual(["not_finite"]));
});

describe("schemas", () => {
  it("parses each kind", () => {
    expect(limitsSchema.parse(h(95, 90, 80))).toEqual(h(95, 90, 80));
    expect(limitsSchema.parse(r(1, 2, 3, 4))).toEqual(r(1, 2, 3, 4));
  });
  it("rejects bad shapes", () => {
    expect(limitsSchema.safeParse({ kind: "range", target: 1, warning: 2, critical: 3 }).success).toBe(false);
    expect(limitsSchema.safeParse({ kind: "higher", target: "1", warning: 2, critical: 3 }).success).toBe(false);
    expect(limitsSchema.safeParse({ kind: "other" }).success).toBe(false);
  });
  it("snapshot allows null", () => {
    const snap = { "p1.a": l(2, 4, 6), "p1.b": null };
    expect(limitsSnapshotSchema.parse(snap)).toEqual(snap);
    expect(limitsSnapshotSchema.safeParse({ x: undefined }).success).toBe(false);
  });
});
