import { describe, expect, it } from "vitest";
import { filterLog, logCounts } from "./helpers";

const list = [
  { id: 1, chosen: true, needsStudy: false, implementedOn: null },
  { id: 2, chosen: true, needsStudy: false, implementedOn: "2026-10-05" },
  { id: 3, chosen: false, needsStudy: true, implementedOn: null },
  { id: 4, chosen: true, needsStudy: true, implementedOn: null },
];

describe("action log filters", () => {
  it("chosen excludes implemented ones", () => {
    expect(filterLog(list, "chosen").map((e) => e.id)).toEqual([1, 4]);
  });
  it("implemented and needs-study", () => {
    expect(filterLog(list, "implemented").map((e) => e.id)).toEqual([2]);
    expect(filterLog(list, "needsStudy").map((e) => e.id)).toEqual([3, 4]);
  });
  it("counts match the filters", () => {
    expect(logCounts(list)).toEqual({ all: 4, chosen: 2, implemented: 1, needsStudy: 2 });
    expect(logCounts([])).toEqual({ all: 0, chosen: 0, implemented: 0, needsStudy: 0 });
  });
});
