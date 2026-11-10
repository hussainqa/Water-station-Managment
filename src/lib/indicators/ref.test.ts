import { describe, expect, it } from "vitest";
import {
  formatRef,
  parseGroupKey,
  parseRef,
  refColumns,
  refFromColumns,
  refSchema,
} from "./ref";

const ID = "3f2b8f0e-5c1d-4a52-9d57-0a1b2c3d4e5f";

describe("indicator refs", () => {
  it("round-trips system and user refs", () => {
    expect(formatRef({ kind: "sys", code: "SC-01" })).toBe("sys:SC-01");
    expect(formatRef({ kind: "usr", id: ID })).toBe(`usr:${ID}`);
    expect(parseRef("sys:SC-01")).toEqual({ kind: "sys", code: "SC-01" });
    expect(parseRef(`usr:${ID}`)).toEqual({ kind: "usr", id: ID });
  });

  it("rejects malformed input", () => {
    for (const bad of [
      "",
      "SC-01",
      "sys:",
      "sys:SC 01",
      "usr:not-a-uuid",
      "foo:SC-01",
      null,
      undefined,
      42,
      "sys:SC-01; drop table",
    ]) {
      expect(parseRef(bad)).toBeNull();
    }
  });

  it("maps to exactly-one column pairs", () => {
    expect(refColumns({ kind: "sys", code: "WQ-02" })).toEqual({
      indicatorCode: "WQ-02",
      userIndicatorId: null,
    });
    expect(refColumns({ kind: "usr", id: ID })).toEqual({
      indicatorCode: null,
      userIndicatorId: ID,
    });
    expect(refFromColumns({ indicatorCode: "WQ-02", userIndicatorId: null })).toEqual({
      kind: "sys",
      code: "WQ-02",
    });
    expect(refFromColumns({ indicatorCode: null, userIndicatorId: ID })).toEqual({
      kind: "usr",
      id: ID,
    });
    expect(refFromColumns({ indicatorCode: "A-1", userIndicatorId: ID })).toBeNull();
    expect(refFromColumns({ indicatorCode: null, userIndicatorId: null })).toBeNull();
  });

  it("works as a zod schema and for group keys", () => {
    expect(refSchema.safeParse("sys:SC-01").success).toBe(true);
    expect(refSchema.safeParse("nope").success).toBe(false);
    expect(parseGroupKey("sys:continuity")).toEqual({ kind: "sys", code: "continuity" });
  });
});
