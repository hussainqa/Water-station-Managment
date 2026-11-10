import { describe, expect, it } from "vitest";
import { changeDirection, statusOf } from "./status";
import type { Limits, Status } from "./types";

const higher: Limits = { kind: "higher", target: 95, warning: 90, critical: 80 };
const lower: Limits = { kind: "lower", target: 2, warning: 4, critical: 6 };
const range: Limits = { kind: "range", critMin: 6, minOk: 6.5, maxOk: 8.5, critMax: 9 };

describe("statusOf", () => {
  const cases: [string, Limits, number, Status][] = [
    // higher is better: critical < warning <= target
    ["higher below critical", higher, 79, "critical"],
    ["higher on critical", higher, 80, "warning"],
    ["higher between critical and warning", higher, 85, "warning"],
    ["higher just below warning", higher, 89.99, "warning"],
    ["higher on warning", higher, 90, "ok"],
    ["higher between warning and target", higher, 92, "ok"],
    ["higher on target", higher, 95, "ok"],
    ["higher above target", higher, 99, "ok"],
    // lower is better
    ["lower below target", lower, 1, "ok"],
    ["lower on target", lower, 2, "ok"],
    ["lower between target and warning", lower, 3, "ok"],
    ["lower on warning", lower, 4, "ok"],
    ["lower just above warning", lower, 4.01, "warning"],
    ["lower between warning and critical", lower, 5, "warning"],
    ["lower on critical", lower, 6, "warning"],
    ["lower above critical", lower, 6.01, "critical"],
    ["lower 8", lower, 8, "critical"],
    // range
    ["range below critMin", range, 5.9, "critical"],
    ["range on critMin", range, 6, "warning"],
    ["range between critMin and minOk", range, 6.2, "warning"],
    ["range on minOk", range, 6.5, "ok"],
    ["range inside", range, 7.5, "ok"],
    ["range on maxOk", range, 8.5, "ok"],
    ["range between maxOk and critMax", range, 8.8, "warning"],
    ["range on critMax", range, 9, "warning"],
    ["range above critMax", range, 9.1, "critical"],
  ];
  it.each(cases)("%s", (_n, limits, value, expected) => {
    expect(statusOf(value, limits)).toBe(expected);
  });

  it("insufficient_data for null/undefined/NaN", () => {
    expect(statusOf(null, lower)).toBe("insufficient_data");
    expect(statusOf(undefined, lower)).toBe("insufficient_data");
    expect(statusOf(NaN, lower)).toBe("insufficient_data");
  });
  it("no_limits when limits missing", () => {
    expect(statusOf(3, null)).toBe("no_limits");
    expect(statusOf(3, undefined)).toBe("no_limits");
  });
  it("insufficient_data wins over no_limits", () => {
    expect(statusOf(null, null)).toBe("insufficient_data");
    expect(statusOf(NaN, undefined)).toBe("insufficient_data");
  });
  it("zero is a real value", () => {
    expect(statusOf(0, higher)).toBe("critical");
    expect(statusOf(0, lower)).toBe("ok");
  });
});

describe("changeDirection", () => {
  it("null when either is missing", () => {
    expect(changeDirection(null, 1, "higher")).toBeNull();
    expect(changeDirection(1, undefined, "higher")).toBeNull();
    expect(changeDirection(NaN, 1, "higher")).toBeNull();
    expect(changeDirection(1, NaN, lower)).toBeNull();
  });
  it("null when direction unknown", () => {
    expect(changeDirection(1, 2, null)).toBeNull();
    expect(changeDirection(1, 2, undefined)).toBeNull();
  });
  it("higher is better", () => {
    expect(changeDirection(5, 3, "higher")).toBe("improved");
    expect(changeDirection(3, 5, "higher")).toBe("worsened");
    expect(changeDirection(5, 3, higher)).toBe("improved");
  });
  it("lower is better", () => {
    expect(changeDirection(3, 5, "lower")).toBe("improved");
    expect(changeDirection(5, 3, "lower")).toBe("worsened");
    expect(changeDirection(3, 5, lower)).toBe("improved");
  });
  it("unchanged within 1e-9", () => {
    expect(changeDirection(1, 1, "higher")).toBe("unchanged");
    expect(changeDirection(1 + 1e-10, 1, "lower")).toBe("unchanged");
    expect(changeDirection(1 + 1e-6, 1, "higher")).toBe("improved");
    expect(changeDirection(0, 0, range)).toBe("unchanged");
  });
  it("range compares distance to midpoint (7.5)", () => {
    expect(changeDirection(7, 6, range)).toBe("improved");
    expect(changeDirection(6, 7, range)).toBe("worsened");
    expect(changeDirection(8.5, 9, range)).toBe("improved");
    expect(changeDirection(9, 8.5, range)).toBe("worsened");
    // crossing the midpoint: 7 (0.5 away) vs 8.5 (1 away)
    expect(changeDirection(7, 8.5, range)).toBe("improved");
    // equal distance on opposite sides
    expect(changeDirection(7, 8, range)).toBe("unchanged");
  });
  it("range kind string alone is not enough", () => {
    expect(changeDirection(7, 6, "range" as never)).toBeNull();
  });
});
