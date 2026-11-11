import { describe, expect, it } from "vitest";
import {
  activityKey,
  alertCompare,
  compareLatest,
  endIndex,
  endsInRange,
  isHandled,
  pickLatestPerPlant,
} from "./rules";

const a = (id: string, plantId: string, periodStart: string, months: number, approvedAt: string | null) => ({
  id,
  plantId,
  periodStart,
  months,
  approvedAt,
});

describe("dashboard rules", () => {
  it("end index and range (current month counts as 1)", () => {
    expect(endIndex({ periodStart: "2026-07-01", months: 3 })).toBe(endIndex({ periodStart: "2026-09", months: 1 }));
    expect(endsInRange({ periodStart: "2026-09", months: 1 }, 1, "2026-09")).toBe(true);
    expect(endsInRange({ periodStart: "2026-08", months: 1 }, 1, "2026-09")).toBe(false);
    expect(endsInRange({ periodStart: "2026-08", months: 1 }, 2, "2026-09")).toBe(true);
    expect(endsInRange({ periodStart: "2020-01", months: 1 }, "all", "2026-09")).toBe(true);
  });

  it("latest: latest end, then shortest length, then latest approval", () => {
    const monthly = a("m", "p", "2026-09", 1, "2026-10-01T00:00:00Z");
    const quarter = a("q", "p", "2026-07", 3, "2026-10-02T00:00:00Z");
    const older = a("o", "p", "2026-08", 1, "2026-11-01T00:00:00Z");
    expect(compareLatest(monthly, quarter)).toBeLessThan(0);
    expect(pickLatestPerPlant([older, quarter, monthly]).get("p")?.id).toBe("m");
    const dup = a("d", "p", "2026-09", 1, "2026-10-05T00:00:00Z");
    expect(pickLatestPerPlant([monthly, dup]).get("p")?.id).toBe("d");
    expect(pickLatestPerPlant([a("x", "p2", "2026-01", 1, null)]).has("p")).toBe(false);
  });

  it("handled stages", () => {
    expect(isHandled("treated")).toBe(true);
    expect(isHandled("documented")).toBe(true);
    expect(isHandled("choosing_action")).toBe(false);
    expect(isHandled(null)).toBe(false);
  });

  it("alert order", () => {
    const rows = [
      { status: "warning" as const, plantOrder: 0, indicatorOrder: 1 },
      { status: "critical" as const, plantOrder: 2, indicatorOrder: 9 },
      { status: "warning" as const, plantOrder: 0, indicatorOrder: 0 },
      { status: "critical" as const, plantOrder: 1, indicatorOrder: 3 },
    ];
    expect(rows.sort(alertCompare).map((r) => `${r.status}${r.plantOrder}${r.indicatorOrder}`)).toEqual([
      "critical13",
      "critical29",
      "warning00",
      "warning01",
    ]);
  });

  it("activity key prefers approval", () => {
    expect(activityKey({ approvedAt: "2026-01-02T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" })).toBe(
      new Date("2026-01-02T00:00:00Z").getTime(),
    );
    expect(activityKey({ approvedAt: null, createdAt: "2026-01-01T00:00:00Z" })).toBe(
      new Date("2026-01-01T00:00:00Z").getTime(),
    );
  });
});
