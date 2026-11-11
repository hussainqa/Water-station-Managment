import "dotenv/config";
import { randomBytes } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { seedDemo, type SeedDemoResult } from "../../scripts/seed-demo";
import { KARKH_SEPTEMBER, KARKH_SEPTEMBER_NOW, KARKH_SEPTEMBER_PERIOD } from "../../scripts/lib/demo-data";
import { pool } from "@/db/client";
import { withUser, type UserTx } from "@/db/with-user";
import { auth } from "@/lib/auth";
import * as assessmentsSvc from "@/lib/assessments/service";
import * as problemsSvc from "@/lib/problems/service";
import { buildPeriodReport, buildPlantHistoryReport, getReportOptions } from "@/lib/reports/service";
import type { ReportData } from "@/lib/reports/types";

const email = `rp-demo-${randomBytes(6).toString("hex")}@test.local`;
let clock = new Date("2026-10-10T06:00:00Z");
const ctx = () => ({ now: (clock = new Date(clock.getTime() + 60_000)), actor: "Tester" });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function data(r: any): any {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r.data;
}
const ok = (r: Awaited<ReturnType<typeof buildPeriodReport>>): ReportData => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.data;
};

describe("reports data", () => {
  let owner: Client;
  let seeded: SeedDemoResult;
  let A: string;
  let B: string;
  let karkhSep: string;
  const extraUsers: string[] = [];
  const runA = <T>(fn: (tx: UserTx) => Promise<T>) => withUser(A, fn);

  beforeAll(async () => {
    owner = await connectAsOwner();
    seeded = await seedDemo({ email, client: owner });
    A = seeded.userId;
    const res = await auth.api.signUpEmail({
      body: { name: "RP B", email: `rp-b-${randomBytes(6).toString("hex")}@test.local`, password: randomBytes(12).toString("hex"), jobTitle: "tester" },
    });
    B = res.user.id;
    extraUsers.push(B);

    const approvalCtx = { now: KARKH_SEPTEMBER_NOW, actor: "م. مصطفى جاسم" };
    const draft = await runA((tx) =>
      assessmentsSvc.createDraft(tx, A, { plantId: seeded.plantIds.karkh, periodStart: KARKH_SEPTEMBER_PERIOD, months: 1, enteredBy: "م. مصطفى جاسم" }, approvalCtx),
    );
    karkhSep = data(draft).id;
    await runA((tx) => assessmentsSvc.setDraftSelection(tx, A, karkhSep, Object.keys(KARKH_SEPTEMBER)));
    await runA((tx) =>
      assessmentsSvc.saveDraftReadings(tx, A, karkhSep, Object.fromEntries(Object.entries(KARKH_SEPTEMBER).map(([r, inputs]) => [r, { inputs }])) as never),
    );
    data((await runA((tx) => assessmentsSvc.approveAssessment(tx, A, karkhSep, { acknowledgeMissing: true, ...approvalCtx }))) as never);

    const stages = await runA((tx) => problemsSvc.problemStagesForAssessment(tx, A, karkhSep));
    const sc03 = stages["sys:SC-03"].problemId;
    const sc04 = stages["sys:SC-04"].problemId;
    const o36 = { kind: "system", code: "O-36" } as const;
    data((await runA((tx) => problemsSvc.setObstacle(tx, A, { problemId: sc04, target: o36, classification: "confirmed", note: "دليل" }, ctx()))) as never);
    data((await runA((tx) => problemsSvc.setObstacle(tx, A, { problemId: sc03, target: { kind: "system", code: "O-37" }, classification: "possible" }, ctx()))) as never);
    data((await runA((tx) => problemsSvc.setActionChosen(tx, A, { problemId: sc04, actionCode: "A-41", chosen: true, linkedObstacle: o36 }, ctx()))) as never);
    data((await runA((tx) => problemsSvc.setActionImplemented(tx, A, { problemId: sc04, actionCode: "A-41", implementedOn: "2026-10-08" }, ctx()))) as never);
  }, 120000);

  afterAll(async () => {
    try {
      await owner.query("delete from users where id = any($1::uuid[]) or email = $2", [extraUsers, email]);
    } finally {
      await owner.end();
      await pool.end();
    }
  });

  it("period report of Al-Karkh September: two problems, obstacles, the chosen action with its rank", async () => {
    const r = ok(await runA((tx) => buildPeriodReport(tx, A, karkhSep)));
    expect(r.kind).toBe("period");
    expect(r.plant.name).toBeTruthy();
    expect(r.latest).toMatchObject({ periodStart: "2026-09", months: 1 });
    expect(r.problems).toHaveLength(2);
    const sc04 = r.problems.find((p) => p.indicator.code === "SC-04");
    const sc03 = r.problems.find((p) => p.indicator.code === "SC-03");
    expect(sc04).toMatchObject({ value: 6.5, stage: "treated", origin: "auto", limitCrossed: { status: "critical" } });
    expect(sc03?.obstacles).toHaveLength(1);
    expect(sc04?.obstacles).toHaveLength(1);
    expect(sc04?.obstacles[0]).toMatchObject({ kind: "system", classification: "confirmed", note: "دليل" });
    const ob = sc04?.obstacles[0];
    if (ob?.kind === "system") {
      expect(ob.seqInAxis).toBeGreaterThan(0);
      expect(ob.axisNameAr).toBeTruthy();
      expect(ob.axisNameEn).toBeTruthy();
    }
    const rank = (
      await owner.query<{ rank: number }>("select rank from obstacle_action_links where obstacle_code = 'O-36' and action_code = 'A-41'")
    ).rows[0].rank;
    expect(sc04?.actions).toHaveLength(1);
    expect(sc04?.actions[0]).toMatchObject({ kind: "system", rank, chosen: true, implementedOn: "2026-10-08" });
    expect(sc04?.actions[0].linkedObstacle).toMatchObject({ kind: "system" });
    expect(sc03?.actions).toHaveLength(0);
  });

  it("carries no codes of obstacles or actions and no hidden research figures", async () => {
    const r = ok(await runA((tx) => buildPeriodReport(tx, A, karkhSep)));
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/"(rii|correlation|priority|importance|sortPosition|obstacleCode|actionCode)/i);
    expect(json).not.toMatch(/\b[AO]-\d{2}\b/);
  });

  it("lists the indicators without data or limits (CS-02)", async () => {
    const r = ok(await runA((tx) => buildPeriodReport(tx, A, karkhSep)));
    const missing = r.groups.flatMap((g) => g.rows).filter((x) => x.status === "insufficient_data" || x.status === "no_limits");
    expect(missing.map((x) => x.code)).toContain("CS-02");
  });

  it("takes limits from the snapshot: changing the current limits changes nothing", async () => {
    const before = ok(await runA((tx) => buildPeriodReport(tx, A, karkhSep)));
    const sc04Before = before.groups.flatMap((g) => g.rows).find((x) => x.code === "SC-04");
    expect(sc04Before?.limits).toMatchObject({ kind: "lower" });
    await owner.query("update indicator_limits set warning = 1, critical = 2 where owner_id = $1 and indicator_code = 'SC-04'", [A]);
    const after = ok(await runA((tx) => buildPeriodReport(tx, A, karkhSep)));
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(after.problems.find((p) => p.indicator.code === "SC-04")?.limits).toEqual(sc04Before?.limits);
  });

  it("history report of Dijla (monthly): 6 periods, WQ-02 limits 96 then 95", async () => {
    const r = ok(await runA((tx) => buildPlantHistoryReport(tx, A, { plantId: seeded.plantIds.dijla, months: 1 })));
    expect(r.kind).toBe("history");
    expect(r.periods).toHaveLength(6);
    expect(r.periods.map((p) => p.periodStart)).toEqual(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    const wq02 = r.trends.find((t) => t.code === "WQ-02");
    const warnings = wq02?.cells.map((c) => (c?.limits && c.limits.kind === "higher" ? c.limits.warning : null));
    expect(warnings).toEqual([96, 96, 96, 96, 95, 95]);
    expect(r.latest.periodStart).toBe("2026-08");
    expect(r.periods.every((p) => p.withinShare !== null)).toBe(true);
    // the manual RT-03 problem of Dijla August is part of the included periods
    expect(r.problems.map((p) => p.indicator.code)).toContain("RT-03");
  });

  it("offers only the lengths the plant has, and refuses a length it does not have", async () => {
    const opts = await runA((tx) => getReportOptions(tx, A));
    const karkh = opts.plants.find((p) => p.id === seeded.plantIds.karkh);
    expect(karkh?.lengths).toEqual([1]);
    expect(karkh?.assessments[0]).toMatchObject({ id: karkhSep, periodStart: "2026-09" });
    const dijla = opts.plants.find((p) => p.id === seeded.plantIds.dijla);
    expect(dijla?.lengths).toEqual([1]);
    const none = await runA((tx) => buildPlantHistoryReport(tx, A, { plantId: seeded.plantIds.dijla, months: 3 }));
    expect(none).toEqual({ ok: false, error: "noData" });
  });

  it("user B cannot build A's reports (row-level security: not found)", async () => {
    const period = await withUser(B, (tx) => buildPeriodReport(tx, B, karkhSep));
    expect(period).toEqual({ ok: false, error: "notFound" });
    const history = await withUser(B, (tx) => buildPlantHistoryReport(tx, B, { plantId: seeded.plantIds.dijla, months: 1 }));
    expect(history).toEqual({ ok: false, error: "notFound" });
    const opts = await withUser(B, (tx) => getReportOptions(tx, B));
    expect(opts.plants).toHaveLength(0);
    const bad = await runA((tx) => buildPeriodReport(tx, A, "not-a-uuid"));
    expect(bad).toEqual({ ok: false, error: "notFound" });
  });
});
