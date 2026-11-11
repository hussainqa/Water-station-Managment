import "dotenv/config";
import { randomBytes } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { seedDemo, type SeedDemoResult } from "../../scripts/seed-demo";
import {
  KARKH_SEPTEMBER,
  KARKH_SEPTEMBER_NOW,
  KARKH_SEPTEMBER_PERIOD,
} from "../../scripts/lib/demo-data";
import { pool } from "@/db/client";
import { withUser, type UserTx } from "@/db/with-user";
import { auth } from "@/lib/auth";
import * as assessmentsSvc from "@/lib/assessments/service";
import { getDashboard } from "@/lib/dashboard/service";
import type { Dashboard, DashboardRange } from "@/lib/dashboard/types";
import * as problemsSvc from "@/lib/problems/service";

/**
 * Dashboard service on a throwaway copy of the demo data (+ Al-Karkh September as a monthly
 * AND a 3-month assessment ending the same month). Expected values are computed here, with
 * plain SQL on the owner connection, not taken from the function under test.
 */

const email = `dash-demo-${randomBytes(6).toString("hex")}@test.local`;
const NOW_SEP = new Date("2026-09-20T09:00:00Z"); // mid-September: "last 1 month" = September only
const NOW_OCT = new Date("2026-10-15T09:00:00Z");
const NOW_NOV = new Date("2026-11-11T09:00:00Z");
let clock = new Date("2026-10-10T06:00:00Z");
const ctx = () => ({ now: (clock = new Date(clock.getTime() + 60_000)), actor: "Tester" });

type Ref = { id: string; plantId: string; ps: string; months: number; end: number; at: number };

describe("dashboard", () => {
  let owner: Client;
  let seeded: SeedDemoResult;
  let A: string;
  let B: string;
  let karkhMonthly: string;
  let karkhQuarter: string;
  let sc03: string;
  let sc04: string;
  const extraUsers: string[] = [];
  const run = <T>(fn: (tx: UserTx) => Promise<T>) => withUser(A, fn);
  const dash = (plantId: string | null, range: DashboardRange, now: Date) =>
    run((tx) => getDashboard(tx, A, { plantId, range, now }));

  /** the independent oracle: plain SQL + a few lines of JS on the owner connection */
  async function oracle(plantId: string | null, range: DashboardRange, now: Date) {
    const plantRows = (
      await owner.query<{ id: string; name: string }>(
        "select id, name from plants where owner_id = $1 and ($2::uuid is null or id = $2) order by created_at, id",
        [A, plantId],
      )
    ).rows;
    const ids = plantRows.map((p) => p.id);
    const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
    const asm = (
      await owner.query<{ id: string; plant_id: string; ps: string; months: number; end_idx: number; at: string | null }>(
        `select id, plant_id, to_char(period_start, 'YYYY-MM') ps, months,
                (extract(year from period_start)::int * 12 + extract(month from period_start)::int - 1 + months - 1) end_idx,
                approved_at at
           from assessments where owner_id = $1 and status = 'approved' and plant_id = any($2::uuid[])`,
        [A, ids],
      )
    ).rows
      .map((r) => ({ id: r.id, plantId: r.plant_id, ps: r.ps, months: r.months, end: r.end_idx, at: r.at ? new Date(r.at).getTime() : 0 }) as Ref)
      .filter((r) => range === "all" || r.end >= nowIdx - range + 1);
    const latest = new Map<string, Ref>();
    for (const r of asm) {
      const c = latest.get(r.plantId);
      if (!c || r.end > c.end || (r.end === c.end && (r.months < c.months || (r.months === c.months && r.at > c.at)))) {
        latest.set(r.plantId, r);
      }
    }
    const latestIds = [...latest.values()].map((l) => l.id);
    const counts = Object.fromEntries(
      (
        await owner.query<{ status: string; n: number }>(
          "select coalesce(status::text, 'insufficient_data') status, count(*)::int n from assessment_readings where assessment_id = any($1::uuid[]) group by 1",
          [latestIds],
        )
      ).rows.map((r) => [r.status, r.n]),
    ) as Record<string, number>;
    // problems and their handled-ness, written differently from the service: one row per problem
    const probs = (
      await owner.query<{ id: string; assessment_id: string; ref: string; handled: boolean; open: boolean }>(
        `select p.id, p.assessment_id, coalesce('sys:' || p.indicator_code, 'usr:' || p.user_indicator_id::text) ref,
                (exists (select 1 from problem_actions x where x.problem_id = p.id and x.chosen)
                 or exists (select 1 from custom_actions x where x.problem_id = p.id and x.chosen)
                 or p.obstacle_only) handled,
                (not p.obstacle_only
                 and not exists (select 1 from problem_actions x where x.problem_id = p.id and x.chosen)
                 and not exists (select 1 from custom_actions x where x.problem_id = p.id and x.chosen)) open
           from problems p join assessments a on a.id = p.assessment_id
          where p.owner_id = $1 and a.plant_id = any($2::uuid[])`,
        [A, ids],
      )
    ).rows;
    const handledKeys = new Set(probs.filter((p) => p.handled).map((p) => `${p.assessment_id}|${p.ref}`));
    const problemKeys = new Map(probs.map((p) => [`${p.assessment_id}|${p.ref}`, p.id]));
    const dev = (
      await owner.query<{ aid: string; ref: string; status: string; ord: number }>(
        `select r.assessment_id aid, coalesce('sys:' || r.indicator_code, 'usr:' || r.user_indicator_id::text) ref, r.status::text status,
                coalesce(i.sort, 1000) ord
           from assessment_readings r left join indicators i on i.code = r.indicator_code
          where r.assessment_id = any($1::uuid[]) and r.status in ('warning', 'critical')`,
        [latestIds],
      )
    ).rows;
    const plantIdx = new Map(ids.map((id, i) => [id, i]));
    const plantOf = new Map(latestIds.map((id) => [id, [...latest.values()].find((l) => l.id === id)!.plantId]));
    const alerts = dev
      .filter((d) => !handledKeys.has(`${d.aid}|${d.ref}`))
      .map((d) => ({ ...d, p: plantIdx.get(plantOf.get(d.aid)!)!, problemId: problemKeys.get(`${d.aid}|${d.ref}`) ?? null }))
      .sort((x, y) => (x.status === y.status ? 0 : x.status === "critical" ? -1 : 1) || x.p - y.p || x.ord - y.ord);
    const openProblems = probs.filter((p) => p.open).length;
    return { plantRows, asm, latest, counts, alerts, openProblems, handled: dev.length - alerts.length };
  }

  /** the dashboard must agree with the oracle on every number it shows */
  async function expectMatches(d: Dashboard, o: Awaited<ReturnType<typeof oracle>>) {
    const evaluated = (o.counts.ok ?? 0) + (o.counts.warning ?? 0) + (o.counts.critical ?? 0);
    expect(d.tiles).toMatchObject({
      plants: o.plantRows.length,
      plantsAssessed: o.latest.size,
      assessments: o.asm.length,
      withinLimits: o.counts.ok ?? 0,
      evaluated,
      followUp: o.alerts.length,
      followUpCritical: o.alerts.filter((a) => a.status === "critical").length,
      handled: o.handled,
      openProblems: o.openProblems,
    });
    expect(d.alerts.map((a) => `${a.status}|${a.assessmentId}|${a.ref}|${a.problem?.id ?? "-"}`)).toEqual(
      o.alerts.map((a) => `${a.status}|${a.aid}|${a.ref}|${a.problemId ?? "-"}`),
    );
    expect(d.breakdown.map((b) => [b.plantId, b.latest?.assessmentId ?? null])).toEqual(
      o.plantRows.map((p) => [p.id, o.latest.get(p.id)?.id ?? null]),
    );
  }

  beforeAll(async () => {
    owner = await connectAsOwner();
    seeded = await seedDemo({ email, client: owner });
    A = seeded.userId;
    const res = await auth.api.signUpEmail({
      body: { name: "Dash B", email: `dash-b-${randomBytes(6).toString("hex")}@test.local`, password: randomBytes(12).toString("hex"), jobTitle: "tester" },
    });
    B = res.user.id;
    extraUsers.push(B);

    // Al-Karkh September as a monthly assessment AND as a 3-month one (July-September)
    const approvalCtx = { now: KARKH_SEPTEMBER_NOW, actor: "م. مصطفى جاسم" };
    const make = async (periodStart: string, months: number) => {
      const d = await run((tx) =>
        assessmentsSvc.createDraft(tx, A, { plantId: seeded.plantIds.karkh, periodStart, months, enteredBy: "Tester" }, approvalCtx),
      );
      if (!d.ok) throw new Error(JSON.stringify(d));
      await run((tx) => assessmentsSvc.setDraftSelection(tx, A, d.data.id, Object.keys(KARKH_SEPTEMBER)));
      await run((tx) =>
        assessmentsSvc.saveDraftReadings(
          tx,
          A,
          d.data.id,
          Object.fromEntries(Object.entries(KARKH_SEPTEMBER).map(([r, inputs]) => [r, { inputs }])) as never,
        ),
      );
      const done = await run((tx) => assessmentsSvc.approveAssessment(tx, A, d.data.id, { acknowledgeMissing: true, ...approvalCtx }));
      if (!done.ok) throw new Error(JSON.stringify(done));
      return d.data.id;
    };
    karkhQuarter = await make("2026-07", 3);
    karkhMonthly = await make(KARKH_SEPTEMBER_PERIOD, 1);
    const list = await owner.query<{ id: string; code: string }>(
      "select id, indicator_code code from problems where assessment_id = $1 and origin = 'auto'",
      [karkhMonthly],
    );
    sc03 = list.rows.find((r) => r.code === "SC-03")!.id;
    sc04 = list.rows.find((r) => r.code === "SC-04")!.id;
  }, 180_000);

  afterAll(async () => {
    try {
      await owner.query("delete from users where id = any($1::uuid[]) or email = $2", [extraUsers, email]);
    } finally {
      await owner.end();
      await pool.end();
    }
  });

  it("all plants, full history: every number matches the database", async () => {
    const d = await dash(null, "all", NOW_NOV);
    const o = await oracle(null, "all", NOW_NOV);
    await expectMatches(d, o);
    expect(d.tiles.plants).toBe(3);
    expect(d.tiles.assessments).toBe(18 + 2); // 3 plants x 6 months + Karkh September (monthly + quarterly)
    expect(d.tiles.followUp).toBeGreaterThan(0);
    expect(d.hasPlants).toBe(true);
    // the same totals broken down by plant add up to the tiles
    const summed = d.breakdown.reduce((n, b) => n + (b.latest?.counts.ok ?? 0), 0);
    expect(summed).toBe(d.tiles.withinLimits);
  });

  it("latest assessment: latest end month, ties go to the shortest length", async () => {
    const d = await dash(null, "all", NOW_NOV);
    const karkh = d.breakdown.find((b) => b.plantId === seeded.plantIds.karkh)!;
    expect(karkh.latest?.assessmentId).toBe(karkhMonthly);
    expect(karkh.latest?.assessmentId).not.toBe(karkhQuarter);
    expect(karkh.latest?.months).toBe(1);
    expect(karkh.latest?.periodStart).toBe("2026-09");
    expect(karkh.latest?.total).toBe(Object.keys(KARKH_SEPTEMBER).length);
    // the other plants stay on their August assessments
    for (const key of ["dijla", "rafidain"] as const) {
      const b = d.breakdown.find((x) => x.plantId === seeded.plantIds[key])!;
      expect(b.latest?.periodStart).toBe("2026-08");
    }
    // alerts of Karkh come from the monthly assessment only
    const karkhAlerts = d.alerts.filter((a) => a.plantId === seeded.plantIds.karkh);
    expect(karkhAlerts.length).toBeGreaterThan(0);
    expect(new Set(karkhAlerts.map((a) => a.assessmentId))).toEqual(new Set([karkhMonthly]));
  });

  it("alerts: warnings without a problem are included, criticals have their problem, order is critical-first", async () => {
    const d = await dash(null, "all", NOW_NOV);
    const crit = d.alerts.filter((a) => a.status === "critical");
    expect(crit.map((a) => a.ref).sort()).toEqual(["sys:SC-03", "sys:SC-04"]);
    expect(crit.every((a) => a.problem && a.problem.stage === "awaiting_obstacles")).toBe(true);
    expect(crit.find((a) => a.ref === "sys:SC-03")!.problem!.id).toBe(sc03);
    const warnings = d.alerts.filter((a) => a.status === "warning");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((a) => a.problem === null)).toBe(true);
    // all criticals come before all warnings
    const firstWarning = d.alerts.findIndex((a) => a.status === "warning");
    expect(d.alerts.slice(0, firstWarning).every((a) => a.status === "critical")).toBe(true);
    expect(d.alerts.slice(firstWarning).every((a) => a.status === "warning")).toBe(true);
    // the limit crossed comes from the snapshot
    const sc03Row = crit.find((a) => a.ref === "sys:SC-03")!;
    expect(sc03Row.limits).not.toBeNull();
    expect(sc03Row.crossed?.status).toBe("critical");
    expect(sc03Row.assessedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // the Dijla RT-03 warning has the seeded manual problem
    const rt03 = d.alerts.find((a) => a.ref === "sys:RT-03" && a.plantId === seeded.plantIds.dijla);
    expect(rt03?.problem?.stage).toBe("choosing_action");
    expect(d.tiles.followUp).toBe(d.alerts.length);
  });

  it("a treated or documented problem leaves the alerts, and returns when un-chosen", async () => {
    const before = await dash(null, "all", NOW_NOV);
    const o36 = { kind: "system", code: "O-36" } as const;
    const open0 = before.tiles.openProblems;

    // treated: choose an action
    await run((tx) => problemsSvc.setObstacle(tx, A, { problemId: sc04, target: o36, classification: "confirmed" }, ctx()));
    const choosing = await dash(null, "all", NOW_NOV);
    expect(choosing.alerts.find((a) => a.ref === "sys:SC-04")?.problem?.stage).toBe("choosing_action");
    await run((tx) =>
      problemsSvc.setActionChosen(tx, A, { problemId: sc04, actionCode: "A-41", chosen: true, linkedObstacle: o36 }, ctx()),
    );
    const treated = await dash(null, "all", NOW_NOV);
    await expectMatches(treated, await oracle(null, "all", NOW_NOV));
    expect(treated.alerts.some((a) => a.ref === "sys:SC-04" && a.plantId === seeded.plantIds.karkh)).toBe(false);
    expect(treated.tiles.followUp).toBe(before.tiles.followUp - 1);
    expect(treated.tiles.handled).toBe(before.tiles.handled + 1);
    expect(treated.tiles.openProblems).toBe(open0 - 1);

    // documented: obstacle recorded, no action
    await run((tx) =>
      problemsSvc.setObstacle(tx, A, { problemId: sc03, target: { kind: "system", code: "O-37" }, classification: "possible" }, ctx()),
    );
    await run((tx) => problemsSvc.setObstacleOnly(tx, A, { problemId: sc03, value: true }, ctx()));
    const documented = await dash(null, "all", NOW_NOV);
    await expectMatches(documented, await oracle(null, "all", NOW_NOV));
    expect(documented.alerts.some((a) => a.ref === "sys:SC-03" && a.plantId === seeded.plantIds.karkh)).toBe(false);
    expect(documented.alerts.filter((a) => a.status === "critical")).toHaveLength(0);
    expect(documented.tiles.followUpCritical).toBe(0);
    expect(documented.tiles.openProblems).toBe(open0 - 2);

    // un-choose / un-document: both are back
    await run((tx) => problemsSvc.setActionChosen(tx, A, { problemId: sc04, actionCode: "A-41", chosen: false }, ctx()));
    await run((tx) => problemsSvc.setObstacleOnly(tx, A, { problemId: sc03, value: false }, ctx()));
    const back = await dash(null, "all", NOW_NOV);
    await expectMatches(back, await oracle(null, "all", NOW_NOV));
    expect(back.alerts.filter((a) => a.status === "critical").map((a) => a.ref).sort()).toEqual(["sys:SC-03", "sys:SC-04"]);
    expect(back.tiles.followUp).toBe(before.tiles.followUp);
    expect(back.tiles.openProblems).toBe(open0);
  });

  it("plant filter", async () => {
    const dijla = seeded.plantIds.dijla;
    const d = await dash(dijla, "all", NOW_NOV);
    await expectMatches(d, await oracle(dijla, "all", NOW_NOV));
    expect(d.tiles.plants).toBe(1);
    expect(d.breakdown).toHaveLength(1);
    expect(d.alerts.every((a) => a.plantId === dijla)).toBe(true);
    expect(d.latest.every((a) => a.plantId === dijla)).toBe(true);
    expect(d.tiles.assessments).toBe(6);
    const karkh = await dash(seeded.plantIds.karkh, "all", NOW_NOV);
    await expectMatches(karkh, await oracle(seeded.plantIds.karkh, "all", NOW_NOV));
    expect(karkh.tiles.openProblems).toBe((await oracle(seeded.plantIds.karkh, "all", NOW_NOV)).openProblems);
  });

  it("range filter with an injected now", async () => {
    // mid-September, last month: only Karkh September (monthly + quarterly end there)
    const d1 = await dash(null, 1, NOW_SEP);
    await expectMatches(d1, await oracle(null, 1, NOW_SEP));
    expect(d1.tiles.assessments).toBe(2);
    expect(d1.tiles.plants).toBe(3);
    expect(d1.tiles.plantsAssessed).toBe(1);
    const dijla = d1.breakdown.find((b) => b.plantId === seeded.plantIds.dijla)!;
    expect(dijla.latest).toBeNull(); // "not assessed in this period", counted in no indicator tile
    expect(d1.breakdown.find((b) => b.plantId === seeded.plantIds.karkh)!.latest?.assessmentId).toBe(karkhMonthly);
    expect(d1.tiles.evaluated).toBe(
      d1.breakdown.find((b) => b.plantId === seeded.plantIds.karkh)!.latest!.counts.ok +
        d1.breakdown.find((b) => b.plantId === seeded.plantIds.karkh)!.latest!.counts.warning +
        d1.breakdown.find((b) => b.plantId === seeded.plantIds.karkh)!.latest!.counts.critical,
    );
    expect(d1.alerts.every((a) => a.plantId === seeded.plantIds.karkh)).toBe(true);

    // mid-October, last month: nothing ended in October
    const d0 = await dash(null, 1, NOW_OCT);
    await expectMatches(d0, await oracle(null, 1, NOW_OCT));
    expect(d0.tiles).toMatchObject({ assessments: 0, withinLimits: 0, evaluated: 0, followUp: 0, plantsAssessed: 0 });
    expect(d0.alerts).toHaveLength(0);
    expect(d0.breakdown.every((b) => b.latest === null)).toBe(true);
    // the open-problems tile ignores the period
    const all = await oracle(null, "all", NOW_OCT);
    expect(d0.tiles.openProblems).toBe(all.openProblems);
    expect(d0.tiles.openProblems).toBeGreaterThan(0);

    // last 3 months in October (Aug-Oct): every plant has something
    const d3 = await dash(null, 3, NOW_OCT);
    await expectMatches(d3, await oracle(null, 3, NOW_OCT));
    expect(d3.tiles.plantsAssessed).toBe(3);
    // last 6 months in November (Jun-Nov): Mar-May drop out
    const d6 = await dash(null, 6, NOW_NOV);
    await expectMatches(d6, await oracle(null, 6, NOW_NOV));
    expect(d6.tiles.assessments).toBeLessThan((await dash(null, "all", NOW_NOV)).tiles.assessments);
  });

  it("latest assessments include drafts, newest activity first, at most 6", async () => {
    const d0 = await run((tx) =>
      assessmentsSvc.createDraft(
        tx,
        A,
        { plantId: seeded.plantIds.rafidain, periodStart: "2026-09", months: 1, enteredBy: "Tester" },
        ctx(),
      ),
    );
    if (!d0.ok) throw new Error(JSON.stringify(d0));
    const d = await dash(null, "all", NOW_NOV);
    expect(d.latest.length).toBe(6);
    const draft = d.latest.find((a) => a.id === d0.data.id);
    expect(draft?.status).toBe("draft");
    expect(d.tiles.drafts).toBe(1);
    const expected = (
      await owner.query<{ id: string }>(
        "select id from assessments where owner_id = $1 order by coalesce(approved_at, created_at) desc, id limit 6",
        [A],
      )
    ).rows.map((r) => r.id);
    expect(d.latest.map((a) => a.id)).toEqual(expected);
    // a plant filter keeps only that plant's rows, the draft included
    const r = await dash(seeded.plantIds.rafidain, "all", NOW_NOV);
    expect(r.latest.some((a) => a.id === d0.data.id)).toBe(true);
    expect(r.latest.every((a) => a.plantId === seeded.plantIds.rafidain)).toBe(true);
    // a draft is not a completed assessment and not in the indicator tiles
    expect(r.tiles.assessments).toBe(6);
  });

  it("user B sees nothing of A's data; a user with no plants gets zeros", async () => {
    for (const plantId of [null, seeded.plantIds.karkh]) {
      const d = await withUser(B, (tx) => getDashboard(tx, B, { plantId, range: "all", now: NOW_NOV }));
      expect(d.hasPlants).toBe(false);
      expect(d.tiles).toEqual({
        plants: 0,
        plantsAssessed: 0,
        assessments: 0,
        drafts: 0,
        withinLimits: 0,
        evaluated: 0,
        followUp: 0,
        followUpCritical: 0,
        handled: 0,
        openProblems: 0,
      });
      expect(d.breakdown).toEqual([]);
      expect(d.alerts).toEqual([]);
      expect(d.latest).toEqual([]);
    }
  });
});
