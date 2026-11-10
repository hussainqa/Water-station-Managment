import { describe, expect, it } from "vitest";
import {
  approveSchema,
  dateKeyOf,
  monthKeyOf,
  noteSchema,
  readingsSchema,
  selectionSchema,
  validateDetails,
  validatePeriod,
} from "./schemas";

const PLANT = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const at = (iso: string) => new Date(iso);

describe("monthKeyOf / dateKeyOf", () => {
  it("uses the Baghdad calendar, not UTC", () => {
    // 22:30 UTC on Aug 31 is already Sept 1 in Baghdad (UTC+3)
    expect(monthKeyOf(at("2026-08-31T22:30:00Z"))).toBe("2026-09");
    expect(dateKeyOf(at("2026-08-31T22:30:00Z"))).toBe("2026-09-01");
    expect(monthKeyOf(at("2026-08-31T20:00:00Z"))).toBe("2026-08");
  });
});

describe("validatePeriod", () => {
  const now = at("2026-09-15T09:00:00Z");

  it("allows a period whose end month is the current month", () => {
    const r = validatePeriod({ periodStart: "2026-09", months: 1 }, now);
    expect(r).toEqual({ ok: true, startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(validatePeriod({ periodStart: "2026-07", months: 3 }, now).ok).toBe(true);
  });

  it("refuses a period that ends after the current month", () => {
    const r = validatePeriod({ periodStart: "2026-10", months: 1 }, now);
    expect(r).toMatchObject({ ok: false, error: "futurePeriod" });
    expect(validatePeriod({ periodStart: "2026-08", months: 3 }, now)).toMatchObject({
      ok: false,
      error: "futurePeriod",
    });
  });

  it("crosses a year boundary", () => {
    expect(validatePeriod({ periodStart: "2025-11", months: 3 }, at("2026-01-10T00:00:00Z")).ok).toBe(true);
    expect(validatePeriod({ periodStart: "2025-12", months: 3 }, at("2026-01-10T00:00:00Z"))).toMatchObject({
      error: "futurePeriod",
    });
  });

  it("defaults the dates and keeps custom ones inside the period and ordered", () => {
    expect(validatePeriod({ periodStart: "2026-06", months: 3, startDate: "2026-06-10", endDate: "2026-08-20" }, now)).toEqual({
      ok: true,
      startDate: "2026-06-10",
      endDate: "2026-08-20",
    });
    const before = validatePeriod({ periodStart: "2026-06", months: 1, startDate: "2026-05-31" }, now);
    expect(before).toMatchObject({ ok: false, fieldErrors: { startDate: "outsidePeriod" } });
    const after = validatePeriod({ periodStart: "2026-06", months: 1, endDate: "2026-07-01" }, now);
    expect(after).toMatchObject({ ok: false, fieldErrors: { endDate: "outsidePeriod" } });
    const order = validatePeriod({ periodStart: "2026-06", months: 1, startDate: "2026-06-20", endDate: "2026-06-10" }, now);
    expect(order).toMatchObject({ ok: false, fieldErrors: { endDate: "beforeStart" } });
    const bad = validatePeriod({ periodStart: "2026-06", months: 1, startDate: "2026-02-30" }, now);
    expect(bad).toMatchObject({ ok: false, fieldErrors: { startDate: "invalidDate" } });
  });
});

describe("validateDetails", () => {
  const now = at("2026-09-15T09:00:00Z");
  const base = { plantId: PLANT, periodStart: "2026-09", months: 1, enteredBy: "  م. أحمد " };

  it("accepts a valid payload and trims enteredBy", () => {
    const r = validateDetails(base, now);
    expect(r).toMatchObject({
      ok: true,
      data: { periodStart: "2026-09", months: 1, startDate: "2026-09-01", endDate: "2026-09-30", enteredBy: "م. أحمد" },
    });
  });

  it("accepts the length as a numeric string and rejects other lengths", () => {
    expect(validateDetails({ ...base, months: "3", periodStart: "2026-07" }, now).ok).toBe(true);
    expect(validateDetails({ ...base, months: 2 }, now)).toMatchObject({ ok: false, error: "validation" });
    expect(validateDetails({ ...base, months: "x" }, now)).toMatchObject({ ok: false, error: "validation" });
  });

  it("rejects a bad month and a bad plant id", () => {
    expect(validateDetails({ ...base, periodStart: "2026-13" }, now)).toMatchObject({
      ok: false,
      fieldErrors: { periodStart: "invalidMonth" },
    });
    expect(validateDetails({ ...base, plantId: "nope" }, now)).toMatchObject({
      ok: false,
      fieldErrors: { plantId: "invalidPlant" },
    });
  });

  it("reports a future period", () => {
    expect(validateDetails({ ...base, periodStart: "2026-10" }, now)).toMatchObject({
      ok: false,
      error: "futurePeriod",
    });
  });
});

describe("selection / readings / approve / note schemas", () => {
  it("canonicalises and dedupes indicator refs, rejects malformed ones", () => {
    const ok = selectionSchema.safeParse({ id: PLANT, refs: ["sys:SC-01", "sys:SC-01", "sys:WQ-02"] });
    expect(ok.success && ok.data.refs).toEqual(["sys:SC-01", "sys:WQ-02"]);
    expect(selectionSchema.safeParse({ id: PLANT, refs: ["SC-01"] }).success).toBe(false);
  });

  it("strips a client-sent value or status from a reading", () => {
    const r = readingsSchema.safeParse({
      id: PLANT,
      readings: {
        "sys:SC-03": { inputs: { value: "7" }, note: "x", value: 1, status: "ok" },
      },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.readings["sys:SC-03"]).toEqual({ inputs: { value: "7" }, note: "x" });
    }
  });

  it("approve defaults the acknowledgement to false", () => {
    const r = approveSchema.parse({ id: PLANT });
    expect(r.acknowledgeMissing).toBe(false);
  });

  it("note has a maximum length", () => {
    expect(noteSchema.safeParse({ id: PLANT, ref: "sys:SC-01", note: "a".repeat(2001) }).success).toBe(false);
    expect(noteSchema.safeParse({ id: PLANT, ref: "sys:SC-01", note: "" }).success).toBe(true);
  });
});
