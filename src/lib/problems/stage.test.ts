import { describe, expect, it } from "vitest";
import {
  checkImplementationDate,
  deriveStage,
  isOpenStage,
  isValidDateKey,
  limitCrossed,
  orderByRank,
  orderSelectedObstacles,
  type StageInput,
} from "./stage";
import { setActionChosenSchema, setActionImplementedSchema, setObstacleSchema } from "./schemas";

const stage = (o: Partial<StageInput>) =>
  deriveStage({ obstacleCount: 0, chosenActionCount: 0, obstacleOnly: false, ...o });

describe("deriveStage truth table", () => {
  const cases: [Partial<StageInput>, string][] = [
    [{}, "awaiting_obstacles"],
    [{ obstacleCount: 1 }, "choosing_action"],
    [{ obstacleCount: 5 }, "choosing_action"],
    [{ obstacleCount: 1, obstacleOnly: true }, "documented"],
    [{ obstacleCount: 1, chosenActionCount: 1 }, "treated"],
    [{ obstacleCount: 1, chosenActionCount: 3 }, "treated"],
    // choosing an action after "obstacle only": the flag may stay, status is treated
    [{ obstacleCount: 1, chosenActionCount: 1, obstacleOnly: true }, "treated"],
    // an action without a selected obstacle (chosen from "show all"): still treated
    [{ chosenActionCount: 1 }, "treated"],
  ];
  it.each(cases)("%j -> %s", (input, expected) => {
    expect(stage(input)).toBe(expected);
  });

  it("transitions", () => {
    // select the first obstacle
    expect(stage({})).toBe("awaiting_obstacles");
    expect(stage({ obstacleCount: 1 })).toBe("choosing_action");
    // choose, then un-choose the only action: back to choosing_action
    expect(stage({ obstacleCount: 1, chosenActionCount: 1 })).toBe("treated");
    expect(stage({ obstacleCount: 1, chosenActionCount: 0 })).toBe("choosing_action");
    // ... or documented when the flag is set
    expect(stage({ obstacleCount: 1, chosenActionCount: 0, obstacleOnly: true })).toBe("documented");
    // undo the flag
    expect(stage({ obstacleCount: 1, obstacleOnly: false })).toBe("choosing_action");
    // remove the last obstacle (the flag is cleared with it)
    expect(stage({ obstacleCount: 0 })).toBe("awaiting_obstacles");
  });

  it("open = awaiting_obstacles or choosing_action", () => {
    expect(isOpenStage("awaiting_obstacles")).toBe(true);
    expect(isOpenStage("choosing_action")).toBe(true);
    expect(isOpenStage("documented")).toBe(false);
    expect(isOpenStage("treated")).toBe(false);
  });
});

describe("orderSelectedObstacles", () => {
  const o = (
    kind: "system" | "custom",
    classification: "confirmed" | "possible",
    axisIdx: number | null,
    seqInAxis: number | null,
    sortKey = "",
  ) => ({ kind, classification, axisIdx, seqInAxis, sortKey, id: `${kind}${axisIdx}.${seqInAxis}${sortKey}` });

  it("confirmed first; axis then source order; unlisted after system within the same classification", () => {
    const list = [
      o("system", "possible", 1, 1),
      o("custom", "confirmed", null, null, "b"),
      o("system", "confirmed", 3, 2),
      o("custom", "possible", null, null, "a"),
      o("system", "confirmed", 3, 1),
      o("system", "confirmed", 1, 6),
      o("custom", "confirmed", null, null, "a"),
      o("system", "possible", 2, 1),
    ];
    expect(orderSelectedObstacles(list).map((x) => x.id)).toEqual([
      "system1.6",
      "system3.1",
      "system3.2",
      "customnull.nulla",
      "customnull.nullb",
      "system1.1",
      "system2.1",
      "customnull.nulla",
    ]);
  });

  it("does not mutate its input", () => {
    const list = [o("system", "possible", 1, 1), o("system", "confirmed", 1, 2)];
    const copy = [...list];
    orderSelectedObstacles(list);
    expect(list).toEqual(copy);
  });
});

describe("orderByRank", () => {
  it("sorts ascending by rank", () => {
    expect(orderByRank([{ rank: 3 }, { rank: 1 }, { rank: 2 }]).map((x) => x.rank)).toEqual([1, 2, 3]);
  });
});

describe("implementation date rule", () => {
  // 2026-10-04 08:00Z is the 4th of October in Baghdad
  const now = new Date("2026-10-04T08:00:00Z");
  it("accepts today and any day from the detection date on", () => {
    expect(checkImplementationDate("2026-10-04", "2026-10-01", now)).toBe("ok");
    expect(checkImplementationDate("2026-10-01", "2026-10-01", now)).toBe("ok");
    expect(checkImplementationDate("2026-10-02", "2026-10-01", now)).toBe("ok");
  });
  it("rejects the future and dates before detection", () => {
    expect(checkImplementationDate("2026-10-05", "2026-10-01", now)).toBe("future");
    expect(checkImplementationDate("2026-09-30", "2026-10-01", now)).toBe("beforeDetected");
  });
  it("uses the Baghdad calendar day, not UTC", () => {
    // 22:30Z on the 4th is already the 5th in Baghdad (UTC+3)
    const late = new Date("2026-10-04T22:30:00Z");
    expect(checkImplementationDate("2026-10-05", "2026-10-01", late)).toBe("ok");
    expect(checkImplementationDate("2026-10-06", "2026-10-01", late)).toBe("future");
  });
  it("rejects malformed and impossible dates", () => {
    expect(checkImplementationDate("04/10/2026", "2026-10-01", now)).toBe("invalid");
    expect(checkImplementationDate("2026-02-30", "2026-01-01", now)).toBe("invalid");
    expect(isValidDateKey("2026-02-28")).toBe(true);
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isValidDateKey("2027-02-29")).toBe(false);
  });
});

describe("limitCrossed", () => {
  const higher = { kind: "higher", target: 95, warning: 90, critical: 80 } as const;
  const lower = { kind: "lower", target: 5, warning: 10, critical: 20 } as const;
  const range = { kind: "range", critMin: 6, minOk: 6.5, maxOk: 8.5, critMax: 9 } as const;
  it("one-sided limits", () => {
    expect(limitCrossed(higher, "warning", 85)).toEqual({ status: "warning", limit: 90, side: null });
    expect(limitCrossed(higher, "critical", 70)).toEqual({ status: "critical", limit: 80, side: null });
    expect(limitCrossed(lower, "critical", 25)).toEqual({ status: "critical", limit: 20, side: null });
  });
  it("range limits report the crossed end", () => {
    expect(limitCrossed(range, "warning", 6.2)).toEqual({ status: "warning", limit: 6.5, side: "min" });
    expect(limitCrossed(range, "warning", 8.8)).toEqual({ status: "warning", limit: 8.5, side: "max" });
    expect(limitCrossed(range, "critical", 5)).toEqual({ status: "critical", limit: 6, side: "min" });
    expect(limitCrossed(range, "critical", 9.5)).toEqual({ status: "critical", limit: 9, side: "max" });
  });
  it("null when nothing was crossed or limits are missing", () => {
    expect(limitCrossed(higher, "ok", 99)).toBeNull();
    expect(limitCrossed(null, "critical", 1)).toBeNull();
    expect(limitCrossed(higher, "critical", null)).toBeNull();
  });
});

describe("input schemas", () => {
  const id = "3f1c2f9e-6a41-4c5e-9d57-0a5b8e0c1d11";
  it("accept well-formed input and reject bad codes and dates", () => {
    expect(setObstacleSchema.safeParse({ problemId: id, target: { kind: "system", code: "O-36" }, classification: "confirmed" }).success).toBe(true);
    expect(setObstacleSchema.safeParse({ problemId: id, target: { kind: "system", code: "36" }, classification: "confirmed" }).success).toBe(false);
    expect(setObstacleSchema.safeParse({ problemId: id, target: { kind: "system", code: "O-36" }, classification: "maybe" }).success).toBe(false);
    expect(setActionChosenSchema.safeParse({ problemId: id, actionCode: "A-12", chosen: true, linkedObstacle: null }).success).toBe(true);
    expect(setActionChosenSchema.safeParse({ problemId: "x", actionCode: "A-12", chosen: true }).success).toBe(false);
    expect(setActionImplementedSchema.safeParse({ problemId: id, actionCode: "A-12", implementedOn: null }).success).toBe(true);
    expect(setActionImplementedSchema.safeParse({ problemId: id, actionCode: "A-12", implementedOn: "10/2026" }).success).toBe(false);
  });
});
