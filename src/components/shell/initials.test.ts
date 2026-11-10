import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("skips abbreviated titles", () => {
    expect(initials("م. سارة الجبوري")).toBe("سج");
    expect(initials("Eng. Sara Al-Jubouri")).toBe("SJ");
  });
  it("handles one word, blanks and extra spaces", () => {
    expect(initials("Sara")).toBe("S");
    expect(initials("  ")).toBe("");
    expect(initials("  sara   jubouri ")).toBe("SJ");
  });
  it("falls back to the abbreviation when nothing else is left", () => {
    expect(initials("Dr.")).toBe("D");
  });
});
