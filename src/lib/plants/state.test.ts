import { describe, expect, it } from "vitest";
import { matchesPlant, plantState, utilisation } from "./state";

describe("plantState", () => {
  it("is not assessed without an assessment", () => {
    expect(plantState(null)).toBe("notAssessed");
    expect(plantState(undefined)).toBe("notAssessed");
  });
  it("needs review when problems are open, whatever the counts", () => {
    expect(plantState({ critical: 0, warning: 0, openProblems: 1 })).toBe("review");
    expect(plantState({ critical: 2, warning: 1, openProblems: 3 })).toBe("review");
  });
  it("shows warnings for critical or warning readings without open problems", () => {
    expect(plantState({ critical: 1, warning: 0, openProblems: 0 })).toBe("warnings");
    expect(plantState({ critical: 0, warning: 4, openProblems: 0 })).toBe("warnings");
  });
  it("is stable when everything is within limits", () => {
    expect(plantState({ critical: 0, warning: 0, openProblems: 0 })).toBe("stable");
  });
});

describe("utilisation", () => {
  it("is actual divided by design, in percent", () => {
    expect(utilisation(104500, 120000)).toBeCloseTo(87.0833, 3);
    expect(utilisation(0, 100)).toBe(0);
    expect(utilisation(120, 100)).toBeCloseTo(120);
  });
  it("is null when actual is missing or design is not positive", () => {
    expect(utilisation(null, 100)).toBeNull();
    expect(utilisation(undefined, 100)).toBeNull();
    expect(utilisation(50, 0)).toBeNull();
    expect(utilisation(50, null)).toBeNull();
  });
});

describe("matchesPlant", () => {
  const fields = ["Dijla Plant", "Al-Adhamiya", "Baghdad", "Eng. Zainab"];
  it("matches any field, ignoring case", () => {
    expect(matchesPlant("dijla", fields)).toBe(true);
    expect(matchesPlant("ADHAM", fields)).toBe(true);
    expect(matchesPlant("zainab", fields)).toBe(true);
  });
  it("an empty query matches everything and a miss matches nothing", () => {
    expect(matchesPlant("  ", fields)).toBe(true);
    expect(matchesPlant("kirkuk", fields)).toBe(false);
  });
  it("ignores missing fields", () => {
    expect(matchesPlant("x", [null, undefined, "x"])).toBe(true);
  });
});
