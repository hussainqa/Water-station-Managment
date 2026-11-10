import { describe, expect, it } from "vitest";
import {
  addMonths,
  canOpenManualProblem,
  defaultPeriodDates,
  findPreviousAssessment,
  periodEndMonth,
  shouldAutoOpenProblem,
  type AssessmentCandidate,
} from "./period";
import { statusOf } from "./status";
import { STATUSES } from "./types";

describe("addMonths", () => {
  it.each([
    ["2026-12", 1, "2027-01"],
    ["2026-01", -1, "2025-12"],
    ["2026-05", 0, "2026-05"],
    ["2026-05", 12, "2027-05"],
    ["2026-05", -17, "2024-12"],
    ["2026-01", 11, "2026-12"],
    ["2026-11", 26, "2029-01"],
  ])("%s + %i = %s", (k, n, e) => expect(addMonths(k, n)).toBe(e));
  it("throws on bad key", () => {
    expect(() => addMonths("2026-13", 1)).toThrow();
    expect(() => addMonths("2026", 1)).toThrow();
  });
});

describe("periodEndMonth", () => {
  it.each([
    ["2026-01", 1, "2026-01"],
    ["2026-01", 3, "2026-03"],
    ["2026-11", 3, "2027-01"],
    ["2026-01", 12, "2026-12"],
    ["2026-07", 12, "2027-06"],
  ])("%s x %i = %s", (k, n, e) => expect(periodEndMonth(k, n)).toBe(e));
});

describe("defaultPeriodDates", () => {
  it("single month", () => {
    expect(defaultPeriodDates("2026-04", 1)).toEqual({ startDate: "2026-04-01", endDate: "2026-04-30" });
  });
  it("quarter crossing year", () => {
    expect(defaultPeriodDates("2026-11", 3)).toEqual({ startDate: "2026-11-01", endDate: "2027-01-31" });
  });
  it("12-month period", () => {
    expect(defaultPeriodDates("2026-01", 12)).toEqual({ startDate: "2026-01-01", endDate: "2026-12-31" });
    expect(defaultPeriodDates("2026-07", 12)).toEqual({ startDate: "2026-07-01", endDate: "2027-06-30" });
  });
  it("leap February", () => {
    expect(defaultPeriodDates("2028-02", 1).endDate).toBe("2028-02-29");
    expect(defaultPeriodDates("2000-02", 1).endDate).toBe("2000-02-29");
  });
  it("non-leap February", () => {
    expect(defaultPeriodDates("2027-02", 1).endDate).toBe("2027-02-28");
    expect(defaultPeriodDates("1900-02", 1).endDate).toBe("1900-02-28");
  });
});

const a = (
  id: string,
  periodStart: string,
  over: Partial<AssessmentCandidate> = {},
): AssessmentCandidate => ({ id, plantId: "p1", periodStart, months: 3, status: "approved", ...over });

describe("findPreviousAssessment", () => {
  const current = { plantId: "p1", periodStart: "2026-04", months: 3 };

  it("undefined when no candidates", () => {
    expect(findPreviousAssessment(current, [])).toBeUndefined();
  });
  it("finds the adjacent approved one", () => {
    expect(findPreviousAssessment(current, [a("x", "2026-01")])?.id).toBe("x");
  });
  it("ignores drafts", () => {
    expect(findPreviousAssessment(current, [a("x", "2026-01", { status: "draft" })])).toBeUndefined();
  });
  it("ignores other plants", () => {
    expect(findPreviousAssessment(current, [a("x", "2026-01", { plantId: "p2" })])).toBeUndefined();
  });
  it("ignores other lengths", () => {
    expect(findPreviousAssessment(current, [a("x", "2025-07", { months: 6 })])).toBeUndefined();
  });
  it("ignores assessments ending in the current start month", () => {
    // 2026-02 + 3 months ends 2026-04
    expect(findPreviousAssessment(current, [a("x", "2026-02")])).toBeUndefined();
  });
  it("ignores assessments ending after the current start month", () => {
    expect(findPreviousAssessment(current, [a("x", "2026-04"), a("y", "2026-07"), a("z", "2026-03")])).toBeUndefined();
  });
  it("accepts one ending the month right before the current start", () => {
    expect(findPreviousAssessment(current, [a("x", "2026-01")])?.id).toBe("x");
  });
  it("picks the latest end month of several, regardless of order", () => {
    const list = [a("old", "2025-04"), a("new", "2026-01"), a("mid", "2025-10"), a("draft", "2026-01", { id: "d", status: "draft" })];
    expect(findPreviousAssessment(current, list)?.id).toBe("new");
    expect(findPreviousAssessment(current, [...list].reverse())?.id).toBe("new");
  });
  it("non-adjacent is fine", () => {
    expect(findPreviousAssessment(current, [a("far", "2024-01")])?.id).toBe("far");
  });
  it("works across year boundaries and 12-month lengths", () => {
    const cur = { plantId: "p1", periodStart: "2027-01", months: 12 };
    const list = [a("y", "2026-01", { months: 12 }), a("overlap", "2026-02", { months: 12 })];
    expect(findPreviousAssessment(cur, list)?.id).toBe("y");
  });
});

describe("problem rules (acceptance example)", () => {
  const lower = { kind: "lower", target: 2, warning: 4, critical: 6 } as const;

  it("value 8 is critical and auto-opens", () => {
    const s = statusOf(8, lower);
    expect(s).toBe("critical");
    expect(shouldAutoOpenProblem(s)).toBe(true);
    expect(canOpenManualProblem(s)).toBe(true);
  });
  it("value 5 is warning, no auto-open, manual allowed", () => {
    const s = statusOf(5, lower);
    expect(s).toBe("warning");
    expect(shouldAutoOpenProblem(s)).toBe(false);
    expect(canOpenManualProblem(s)).toBe(true);
  });
  it("ok can do neither", () => {
    const s = statusOf(3, lower);
    expect(s).toBe("ok");
    expect(shouldAutoOpenProblem(s)).toBe(false);
    expect(canOpenManualProblem(s)).toBe(false);
  });
  it.each(STATUSES)("status %s", (s) => {
    expect(shouldAutoOpenProblem(s)).toBe(s === "critical");
    expect(canOpenManualProblem(s)).toBe(s === "warning" || s === "critical");
  });
});
