import { describe, expect, it } from "vitest";
import type { ProblemDto, SelectedObstacle } from "@/lib/problems/types";
import { applyPatch } from "./optimistic";

const base = (): ProblemDto =>
  ({
    header: { description: "d" },
    stage: "awaiting_obstacles",
    open: true,
    obstacleOnly: false,
    obstacles: [],
    suggestions: [],
    chosenActions: [],
    customActions: [],
    audit: [],
  }) as unknown as ProblemDto;

const o = (code: string, axisIdx: number, seq: number, c: "confirmed" | "possible"): SelectedObstacle & { kind: "system" } => ({
  kind: "system",
  key: code,
  code,
  axisIdx,
  seqInAxis: seq,
  textAr: code,
  textEn: code,
  classification: c,
  note: "",
});
const texts = { actionCode: "A-41", textAr: "x", textEn: "x" };

describe("applyPatch", () => {
  it("selecting an obstacle moves the stage to choosing_action, confirmed first", () => {
    let p = applyPatch(base(), { t: "obstacleSet", obstacle: o("O-39", 6, 3, "possible") });
    expect(p.stage).toBe("choosing_action");
    p = applyPatch(p, { t: "obstacleSet", obstacle: o("O-36", 5, 1, "confirmed") });
    expect(p.obstacles.map((x) => x.key)).toEqual(["O-36", "O-39"]);
  });
  it("unselecting the last obstacle goes back to awaiting_obstacles", () => {
    let p = applyPatch(base(), { t: "obstacleSet", obstacle: o("O-36", 5, 1, "confirmed") });
    p = applyPatch(p, { t: "obstacleUnset", code: "O-36" });
    expect(p.stage).toBe("awaiting_obstacles");
    expect(p.open).toBe(true);
  });
  it("choosing an action means treated; un-choosing clears the implementation", () => {
    let p = applyPatch(base(), { t: "obstacleSet", obstacle: o("O-36", 5, 1, "confirmed") });
    p = applyPatch(p, { t: "action", texts, state: { chosen: true } });
    expect(p.stage).toBe("treated");
    expect(p.open).toBe(false);
    p = applyPatch(p, { t: "action", texts, state: { implementedOn: "2026-10-05" } });
    expect(p.chosenActions[0]).toMatchObject({ implementedOn: "2026-10-05" });
    p = applyPatch(p, { t: "action", texts, state: { chosen: false } });
    expect(p.chosenActions).toHaveLength(0);
    expect(p.stage).toBe("choosing_action");
  });
  it("obstacle-only gives documented unless something is chosen", () => {
    let p = applyPatch(base(), { t: "obstacleSet", obstacle: o("O-36", 5, 1, "confirmed") });
    p = applyPatch(p, { t: "obstacleOnly", value: true });
    expect(p.stage).toBe("documented");
    p = applyPatch(p, { t: "action", texts, state: { chosen: true } });
    expect(p.stage).toBe("treated");
    // choosing cleared the flag, so un-choosing returns to choosing_action
    expect(p.obstacleOnly).toBe(false);
    p = applyPatch(p, { t: "action", texts, state: { chosen: false } });
    expect(p.stage).toBe("choosing_action");
  });
  it("choosing a case-specific action also clears the flag", () => {
    let p = applyPatch(base(), { t: "obstacleSet", obstacle: o("O-36", 5, 1, "confirmed") });
    p = applyPatch(p, { t: "obstacleOnly", value: true });
    p = { ...p, customActions: [{ id: "c1", name: "x", description: "", rationale: "", chosen: false, needsStudy: false, implementedOn: null, linkedObstacle: null } as never] };
    p = applyPatch(p, { t: "customAction", id: "c1", state: { chosen: true } });
    expect(p.stage).toBe("treated");
    expect(p.obstacleOnly).toBe(false);
    p = applyPatch(p, { t: "customAction", id: "c1", state: { chosen: false } });
    expect(p.stage).toBe("choosing_action");
  });
});
