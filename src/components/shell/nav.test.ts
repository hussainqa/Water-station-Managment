import { describe, expect, it } from "vitest";
import { activeHref } from "./nav";

describe("activeHref", () => {
  it("matches exact paths and children", () => {
    expect(activeHref("/dashboard")).toBe("/dashboard");
    expect(activeHref("/plants/abc")).toBe("/plants");
  });
  it("prefers the longest match", () => {
    expect(activeHref("/assessments/new")).toBe("/assessments/new");
    expect(activeHref("/assessments")).toBe("/assessments");
    expect(activeHref("/assessments/123/results")).toBe("/assessments");
  });
  it("returns null outside the nav", () => {
    expect(activeHref("/profile")).toBeNull();
    expect(activeHref("/plantsx")).toBeNull();
  });
});
