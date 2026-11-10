import { describe, expect, it } from "vitest";
import { sectionProblems } from "./helpers";

describe("sectionProblems", () => {
  it("splits open from handled and keeps order", () => {
    const items = [
      { id: "a", open: true },
      { id: "b", open: false },
      { id: "c", open: true },
      { id: "d", open: false },
    ];
    const s = sectionProblems(items);
    expect(s.open.map((i) => i.id)).toEqual(["a", "c"]);
    expect(s.handled.map((i) => i.id)).toEqual(["b", "d"]);
  });
  it("handles an empty list", () => {
    expect(sectionProblems([])).toEqual({ open: [], handled: [] });
  });
});
