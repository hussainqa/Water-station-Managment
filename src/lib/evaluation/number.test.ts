import { describe, expect, it } from "vitest";
import { parseNumber } from "./number";

describe("parseNumber", () => {
  it.each([
    [null, null],
    [undefined, null],
    ["", null],
    ["   ", null],
    ["abc", NaN],
    ["1.2.3", NaN],
    ["Infinity", NaN],
    ["١٢٫٥", 12.5],
    ["1,234.5", 1234.5],
    ["١٬٢٣٤", 1234],
    ["١،٢٣٤", 1234],
    [" 1 234 ", 1234],
    ["٠", 0],
    ["0", 0],
    [0, 0],
    [42, 42],
    ["-3.5", -3.5],
  ])("parses %j", (input, expected) => {
    const r = parseNumber(input);
    if (expected === null) expect(r).toBeNull();
    else if (Number.isNaN(expected)) expect(r).toBeNaN();
    else expect(r).toBe(expected);
  });

  it("returns NaN for non-finite numeric input", () => {
    expect(parseNumber(Infinity)).toBeNaN();
    expect(parseNumber(NaN)).toBeNaN();
  });
});
