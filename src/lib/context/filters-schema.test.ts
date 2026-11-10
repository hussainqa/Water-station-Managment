import { describe, expect, it } from "vitest";
import {
  DEFAULT_RANGE,
  parsePlantId,
  parseRange,
  setFiltersInputSchema,
} from "./filters-schema";

const A = "0b6f1f0e-7c1e-4f7e-9d0a-2f3d9c1a5b11";
const B = "7a1d3c52-2b0e-4a55-8f1c-9e6d4b7a2c33";

describe("parseRange", () => {
  it("accepts the allowed values as strings or numbers", () => {
    for (const v of [1, 3, 6, 9, 12]) {
      expect(parseRange(String(v))).toBe(v);
      expect(parseRange(v)).toBe(v);
    }
    expect(parseRange("all")).toBe("all");
  });
  it("falls back to the default", () => {
    for (const v of [undefined, null, "", "7", "0", "06x", "ALL", 2, {}, "999"]) {
      expect(parseRange(v)).toBe(DEFAULT_RANGE);
    }
  });
});

describe("parsePlantId", () => {
  it("returns a known plant id", () => {
    expect(parsePlantId(A, [A, B])).toBe(A);
  });
  it("rejects unknown ids, non-uuids and missing values", () => {
    expect(parsePlantId(B, [A])).toBeNull();
    expect(parsePlantId("all", [A])).toBeNull();
    expect(parsePlantId(undefined, [A])).toBeNull();
    expect(parsePlantId("", [A])).toBeNull();
  });
});

describe("setFiltersInputSchema", () => {
  it("accepts partial input and null plant", () => {
    expect(setFiltersInputSchema.safeParse({ range: 3 }).success).toBe(true);
    expect(setFiltersInputSchema.safeParse({ plantId: null }).success).toBe(true);
    expect(setFiltersInputSchema.safeParse({ plantId: A, range: "all" }).success).toBe(true);
  });
  it("rejects bad values", () => {
    expect(setFiltersInputSchema.safeParse({ range: 4 }).success).toBe(false);
    expect(setFiltersInputSchema.safeParse({ plantId: "x" }).success).toBe(false);
  });
});
