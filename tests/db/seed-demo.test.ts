import "dotenv/config";
import { randomBytes } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { seedDemo, type SeedDemoResult } from "../../scripts/seed-demo";
import { DEMO_PASSWORD, DEMO_PLANTS, HIST, SERIES, type DemoPlantKey } from "../../scripts/lib/demo-data";
import { pool } from "@/db/client";
import { withUser } from "@/db/with-user";
import { auth } from "@/lib/auth";
import type { AssessmentResult } from "@/lib/assessments/schemas";
import * as svc from "@/lib/assessments/service";
import type { AssessmentResults, ResultRow } from "@/lib/assessments/types";

const email = `demo-${randomBytes(6).toString("hex")}@test.local`;

function data<T>(r: AssessmentResult<T>): T {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.data;
}

describe("demo account seed", () => {
  let owner: Client;
  let seeded: SeedDemoResult;
  const cache = new Map<string, AssessmentResults>();

  const results = async (plant: DemoPlantKey, month: string) => {
    const id = seeded.assessmentIds[`${plant}:${month}`];
    if (!cache.has(id)) {
      cache.set(id, data(await withUser(seeded.userId, (tx) => svc.getAssessmentResults(tx, seeded.userId, id))));
    }
    return cache.get(id) as AssessmentResults;
  };
  const rows = async (plant: DemoPlantKey, month: string): Promise<ResultRow[]> =>
    (await results(plant, month)).groups.flatMap((g) => g.rows);
  const rowFor = async (plant: DemoPlantKey, month: string, code: string) =>
    (await rows(plant, month)).find((r) => r.code === code) as ResultRow;

  beforeAll(async () => {
    owner = await connectAsOwner();
    seeded = await seedDemo({ email, client: owner });
  }, 60000);

  afterAll(async () => {
    try {
      await owner.query("delete from users where email = $1", [email]);
    } finally {
      await owner.end();
      await pool.end();
    }
  });

  it("creates the account, its plants and 18 approved assessments with snapshots", async () => {
    const u = (await owner.query("select full_name, job_title, locale, email_verified from users where id=$1", [seeded.userId])).rows[0];
    expect(u).toMatchObject({ full_name: "م. سارة الجبوري", job_title: "مهندسة تقييم الأداء", locale: "ar", email_verified: true });
    expect((await owner.query("select count(*)::int n from plants where owner_id=$1", [seeded.userId])).rows[0].n).toBe(3);
    const a = (await owner.query(
      "select status, count(*)::int n, count(limits_snapshot)::int snap, count(approved_at)::int appr from assessments where owner_id=$1 group by status",
      [seeded.userId],
    )).rows;
    expect(a).toEqual([{ status: "approved", n: 18, snap: 18, appr: 18 }]);
    for (const month of HIST) {
      for (const p of DEMO_PLANTS) {
        const r = await results(p.key, month);
        expect(r.audit.map((e) => e.action)).toEqual(expect.arrayContaining(["readings_entered", "approved"]));
        expect(r.header.status).toBe("approved");
      }
    }
  });

  it("produces every value from the prototype series, through the real code path", async () => {
    for (const p of DEMO_PLANTS) {
      for (let i = 0; i < HIST.length; i++) {
        const byCode = new Map((await rows(p.key, HIST[i])).map((r) => [r.code, r]));
        expect(byCode.size).toBe(Object.keys(SERIES[p.key]).length);
        for (const [code, values] of Object.entries(SERIES[p.key])) {
          const row = byCode.get(code) as ResultRow;
          if (values[i] === null) expect(row.value).toBeNull();
          else expect(row.value).toBeCloseTo(values[i] as number, 6);
        }
      }
    }
  });

  it("snapshots differ between June and July for WQ-02 (warning 96 -> 95)", async () => {
    for (const p of DEMO_PLANTS) {
      for (const month of ["2026-03", "2026-04", "2026-05", "2026-06"]) {
        expect((await rowFor(p.key, month, "WQ-02")).limits).toEqual({ kind: "higher", target: 98, warning: 96, critical: 90 });
      }
      for (const month of ["2026-07", "2026-08"]) {
        expect((await rowFor(p.key, month, "WQ-02")).limits).toEqual({ kind: "higher", target: 98, warning: 95, critical: 90 });
      }
    }
    // the same kind of value gets the status of ITS limits: Dijla's August 95.3 is within the new limit
    expect(await rowFor("dijla", "2026-08", "WQ-02")).toMatchObject({ status: "ok" });
    expect(await rowFor("dijla", "2026-06", "WQ-02")).toMatchObject({ status: "warning" }); // 95.8 < 96
    const snap = (await owner.query(
      "select limits_snapshot->'sys:WQ-02'->>'warning' w from assessments a join plants p on p.id=a.plant_id where a.owner_id=$1 and p.name like '%دجلة%' order by a.period_start",
      [seeded.userId],
    )).rows.map((r) => r.w);
    expect(snap).toEqual(["96", "96", "96", "96", "95", "95"]);
    // SC-02 is a percentage with the handoff limits, in the handoff range
    expect((await rowFor("karkh", "2026-08", "SC-02")).limits).toEqual({ kind: "lower", target: 5, warning: 10, critical: 20 });
    for (const p of DEMO_PLANTS) {
      for (const month of HIST) {
        const v = (await rowFor(p.key, month, "SC-02")).value as number;
        expect(v).toBeGreaterThanOrEqual(0.4);
        expect(v).toBeLessThanOrEqual(4.5);
      }
    }
  });

  it("matches the profiles of HANDOFF section 7", async () => {
    // Al-Rafidain: stable, every indicator within limits in August; it does not adopt CS-02
    const raf = await rows("rafidain", "2026-08");
    expect(raf).toHaveLength(14);
    expect(raf.every((r) => r.status === "ok")).toBe(true);
    expect(raf.find((r) => r.code === "CS-02")).toBeUndefined();
    const adoption = (await owner.query(
      "select adopted from plant_indicators where plant_id=$1 and indicator_code='CS-02'",
      [seeded.plantIds.rafidain],
    )).rows;
    expect(adoption).toEqual([{ adopted: false }]);
    for (const month of HIST) expect((await results("rafidain", month)).counts.critical).toBe(0);

    // Dijla: water-quality, complaint and response-time warnings in August, nothing critical
    const dijla = await rows("dijla", "2026-08");
    const warned = dijla.filter((r) => r.status === "warning").map((r) => r.code);
    expect(warned).toEqual(["WQ-04", "CS-02", "CS-03", "RT-01", "RT-02", "RT-03"]);
    expect((await results("dijla", "2026-08")).counts.critical).toBe(0);

    // Al-Karkh: continuity worsens month after month and ends in warning (critical comes in September)
    const sc04 = [];
    const sc01 = [];
    for (const month of HIST) {
      sc04.push((await rowFor("karkh", month, "SC-04")).value as number);
      sc01.push((await rowFor("karkh", month, "SC-01")).value as number);
    }
    expect(sc04).toEqual([...sc04].sort((x, y) => x - y)); // duration of interruptions grows
    expect(sc01).toEqual([...sc01].sort((x, y) => y - x)); // service continuity falls
    expect(await rowFor("karkh", "2026-03", "SC-04")).toMatchObject({ status: "ok" });
    expect(await rowFor("karkh", "2026-08", "SC-04")).toMatchObject({ status: "warning" });
    expect(await rowFor("karkh", "2026-08", "SC-03")).toMatchObject({ status: "warning" });
    expect((await results("karkh", "2026-08")).counts.critical).toBe(0);
  });

  it("keeps Dijla's missing March WQ-03 as insufficient data (acknowledged)", async () => {
    expect(await rowFor("dijla", "2026-03", "WQ-03")).toMatchObject({ value: null, status: "insufficient_data" });
    const r = await results("dijla", "2026-03");
    expect(r.audit.map((e) => e.action)).toContain("missing_data_acknowledged");
    expect(r.completeness.withValue).toBe(14);
  });

  it("has exactly one problem: the open manual one on Dijla RT-03 (Aug 2026) with obstacle O-26 possible", async () => {
    const ps = (await owner.query("select id, origin, indicator_code, assessment_id, detected_on::text d, value from problems where owner_id=$1", [seeded.userId])).rows;
    expect(ps).toEqual([
      {
        id: seeded.problemId,
        origin: "manual",
        indicator_code: "RT-03",
        assessment_id: seeded.assessmentIds["dijla:2026-08"],
        d: "2026-09-06",
        value: 25,
      },
    ]);
    const ob = (await owner.query("select obstacle_code, classification, note from problem_obstacles where problem_id=$1", [seeded.problemId])).rows;
    expect(ob).toHaveLength(1);
    expect(ob[0]).toMatchObject({ obstacle_code: "O-26", classification: "possible" });
    expect(ob[0].note).toContain("عدد موظفي");
    expect(await rowFor("dijla", "2026-08", "RT-03")).toMatchObject({ problemId: seeded.problemId, canOpenManualProblem: false });
  });

  it("can be run again: the account is recreated, not duplicated", async () => {
    const again = await seedDemo({ email, client: owner });
    expect(again.userId).not.toBe(seeded.userId);
    expect((await owner.query("select count(*)::int n from users where email=$1", [email])).rows[0].n).toBe(1);
    expect((await owner.query("select count(*)::int n from plants where owner_id=$1", [again.userId])).rows[0].n).toBe(3);
    expect((await owner.query("select count(*)::int n from assessments where owner_id=$1", [again.userId])).rows[0].n).toBe(18);
    expect((await owner.query("select count(*)::int n from assessments where owner_id=$1", [seeded.userId])).rows[0].n).toBe(0);
    seeded = again;
    cache.clear();
  }, 60000);

  it("signs in with the password, and the stored hash verifies", async () => {
    const hash = (await owner.query("select password from accounts where user_id=$1 and provider_id='credential'", [seeded.userId])).rows[0].password;
    expect(await verifyPassword({ hash, password: DEMO_PASSWORD })).toBe(true);
    expect(await verifyPassword({ hash, password: "wrong-password" })).toBe(false);
    const res = await auth.api.signInEmail({ body: { email, password: DEMO_PASSWORD } });
    expect(res.user.id).toBe(seeded.userId);
    await expect(auth.api.signInEmail({ body: { email, password: "wrong-password" } })).rejects.toThrow();
  });
});
