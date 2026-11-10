import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { pool } from "@/db/client";
import {
  assessmentReadings,
  assessments,
  indicatorLimits,
  plantIndicators,
  plants,
  userIndicatorGroups,
  userIndicators,
} from "@/db/schema";
import { withUser } from "@/db/with-user";
import { auth } from "@/lib/auth";
import { indicatorFormSchema, type IndicatorFormInput } from "@/lib/indicators/schemas";
import * as svc from "@/lib/indicators/service";

async function signUp(label: string) {
  const email = `ind-${label}-${randomBytes(6).toString("hex")}@test.local`;
  const res = await auth.api.signUpEmail({
    body: {
      name: `IND ${label}`,
      email,
      password: randomBytes(12).toString("hex"),
      jobTitle: "tester",
    },
  });
  return res.user.id;
}

const newPlant = (ownerId: string, name: string) => ({
  ownerId,
  name,
  governorate: "Baghdad",
  waterSource: "river",
  designCapacity: 100,
});

const form = (over: Partial<IndicatorFormInput> = {}) =>
  indicatorFormSchema.parse({
    nameAr: "مؤشر اختبار",
    nameEn: "",
    description: "وصف",
    group: "sys:continuity",
    newGroupAr: "",
    newGroupEn: "",
    method: "ratio",
    better: "higher",
    unit: "",
    labels: { numerator: { ar: "بسط", en: "" }, denominator: { ar: "مقام", en: "" } },
    adoptAll: false,
    ...over,
  });

const sys = (code: string) => ({ kind: "sys", code }) as const;

describe("indicators service", () => {
  let a: string;
  let b: string;
  const users: string[] = [];

  beforeAll(async () => {
    a = await signUp("a");
    b = await signUp("b");
    users.push(a, b);
  });

  afterAll(async () => {
    const owner = await connectAsOwner();
    try {
      await owner.query("delete from users where id = any($1::uuid[])", [users]);
    } finally {
      await owner.end();
      await pool.end();
    }
  });

  const limitsRows = (uid: string) =>
    withUser(uid, (tx) => tx.select().from(indicatorLimits).where(eq(indicatorLimits.ownerId, uid)));

  it("ensureDefaultLimits copies 15 rows once and is idempotent", async () => {
    expect(await limitsRows(a)).toHaveLength(0);
    await withUser(a, (tx) => svc.ensureDefaultLimits(tx, a));
    expect(await limitsRows(a)).toHaveLength(15);
    await withUser(a, (tx) => svc.ensureDefaultLimits(tx, a));
    await withUser(a, (tx) => svc.ensureDefaultLimits(tx, a));
    expect(await limitsRows(a)).toHaveLength(15);
  });

  it("never overwrites an edited row or a 'none' row", async () => {
    const edited = await withUser(a, (tx) =>
      svc.saveLimits(tx, a, sys("SC-01"), {
        none: false,
        limits: { kind: "higher", target: 99, warning: 96, critical: 91 },
      }),
    );
    expect(edited.ok).toBe(true);
    const none = await withUser(a, (tx) => svc.saveLimits(tx, a, sys("SC-03"), { none: true }));
    expect(none.ok).toBe(true);

    await withUser(a, (tx) => svc.ensureDefaultLimits(tx, a));
    const rows = await limitsRows(a);
    expect(rows).toHaveLength(15);
    const sc1 = rows.find((r) => r.indicatorCode === "SC-01");
    expect([sc1?.target, sc1?.warning, sc1?.critical]).toEqual([99, 96, 91]);
    expect(rows.find((r) => r.indicatorCode === "SC-03")?.none).toBe(true);

    const data = await withUser(a, (tx) => svc.listIndicatorsForUser(tx, a, null));
    expect(data.indicators.find((i) => i.ref === "sys:SC-03")?.limits).toBeNull();
    expect(data.indicators.find((i) => i.ref === "sys:SC-03")?.limitsNone).toBe(true);
    expect(data.indicators.find((i) => i.ref === "sys:SC-01")?.limits).toEqual({
      kind: "higher",
      target: 99,
      warning: 96,
      critical: 91,
    });
  });

  it("lists 15 system indicators in 4 groups under the app role", async () => {
    const data = await withUser(b, (tx) => svc.listIndicatorsForUser(tx, b, null));
    expect(data.indicators.filter((i) => i.isSystem)).toHaveLength(15);
    expect(data.groups.filter((g) => g.isSystem)).toHaveLength(4);
    expect(data.indicators.every((i) => !i.adopted)).toBe(true);
    // SC-02 is a direct percentage, lower is better (client note 10)
    const sc2 = data.indicators.find((i) => i.ref === "sys:SC-02");
    expect([sc2?.method, sc2?.unit, sc2?.better]).toEqual(["direct_percent", "%", "lower"]);
  });

  it("saveLimits rejects bad ordering and out-of-range percentages server-side", async () => {
    const bad = await withUser(a, (tx) =>
      svc.saveLimits(tx, a, sys("SC-01"), {
        none: false,
        limits: { kind: "higher", target: 90, warning: 95, critical: 98 },
      }),
    );
    expect(bad).toEqual({ ok: false, error: "validation", fieldErrors: { limits: "badOrderHigher" } });

    const pct = await withUser(a, (tx) =>
      svc.saveLimits(tx, a, sys("SC-02"), {
        none: false,
        limits: { kind: "lower", target: 5, warning: 10, critical: 120 },
      }),
    );
    expect(pct).toEqual({ ok: false, error: "validation", fieldErrors: { limits: "outOfPercentRange" } });

    const rows = await limitsRows(a);
    const sc1 = rows.find((r) => r.indicatorCode === "SC-01");
    expect(sc1?.target).toBe(99); // unchanged by the refused saves

    const missing = await withUser(a, (tx) =>
      svc.saveLimits(tx, a, sys("XX-99"), { none: true }),
    );
    expect(missing).toMatchObject({ ok: false, error: "notFound" });
  });

  it("toggles adoption and refuses another user's plant", async () => {
    const [plantA] = await withUser(a, (tx) =>
      tx.insert(plants).values(newPlant(a, "A1")).returning({ id: plants.id }),
    );
    const [plantB] = await withUser(b, (tx) =>
      tx.insert(plants).values(newPlant(b, "B1")).returning({ id: plants.id }),
    );

    expect(
      await withUser(a, (tx) => svc.setAdoption(tx, a, plantA.id, sys("SC-01"), true)),
    ).toEqual({ ok: true });
    let data = await withUser(a, (tx) => svc.listIndicatorsForUser(tx, a, plantA.id));
    expect(data.indicators.find((i) => i.ref === "sys:SC-01")?.adopted).toBe(true);
    expect(data.indicators.find((i) => i.ref === "sys:SC-02")?.adopted).toBe(false);

    await withUser(a, (tx) => svc.setAdoption(tx, a, plantA.id, sys("SC-01"), false));
    data = await withUser(a, (tx) => svc.listIndicatorsForUser(tx, a, plantA.id));
    expect(data.indicators.find((i) => i.ref === "sys:SC-01")?.adopted).toBe(false);
    const rows = await withUser(a, (tx) =>
      tx
        .select()
        .from(plantIndicators)
        .where(and(eq(plantIndicators.plantId, plantA.id), eq(plantIndicators.indicatorCode, "SC-01"))),
    );
    expect(rows).toHaveLength(1); // upsert, not a second row

    const refused = await withUser(a, (tx) => svc.setAdoption(tx, a, plantB.id, sys("SC-01"), true));
    expect(refused).toMatchObject({ ok: false, error: "plantNotFound" });
    const leaked = await withUser(b, (tx) =>
      tx.select().from(plantIndicators).where(eq(plantIndicators.plantId, plantB.id)),
    );
    expect(leaked).toHaveLength(0);
  });

  describe("user-defined indicators", () => {
    it("create with adopt-all inserts rows for all of the user's plants only", async () => {
      const c = await signUp("c");
      users.push(c);
      const ids = await withUser(c, (tx) =>
        tx
          .insert(plants)
          .values([newPlant(c, "C1"), newPlant(c, "C2")])
          .returning({ id: plants.id }),
      );
      const [otherPlant] = await withUser(a, (tx) =>
        tx.select({ id: plants.id }).from(plants).limit(1),
      );

      const res = await withUser(c, (tx) =>
        svc.createUserIndicator(tx, c, form({ adoptAll: true, group: "new", newGroupAr: "مجموعتي" })),
      );
      expect(res.ok).toBe(true);
      const id = res.ok ? res.data!.id : "";

      const rows = await withUser(c, (tx) =>
        tx.select().from(plantIndicators).where(eq(plantIndicators.userIndicatorId, id)),
      );
      expect(rows.map((r) => r.plantId).sort()).toEqual(ids.map((p) => p.id).sort());
      expect(rows.every((r) => r.adopted && r.ownerId === c)).toBe(true);
      expect(rows.find((r) => r.plantId === otherPlant.id)).toBeUndefined();

      // starts with "no approved limits"; unit fixed to % for a ratio
      const data = await withUser(c, (tx) => svc.listIndicatorsForUser(tx, c, ids[0].id));
      const mine = data.indicators.find((i) => i.ref === `usr:${id}`)!;
      expect(mine.limits).toBeNull();
      expect(mine.limitsNone).toBe(true);
      expect(mine.unit).toBe("%");
      expect(mine.adopted).toBe(true);
      expect(data.groups.filter((g) => !g.isSystem)).toHaveLength(1);
      expect(data.groups.find((g) => !g.isSystem)?.count).toBe(1);

      // without adopt-all: no rows
      const res2 = await withUser(c, (tx) => svc.createUserIndicator(tx, c, form({ adoptAll: false })));
      const id2 = res2.ok ? res2.data!.id : "";
      const rows2 = await withUser(c, (tx) =>
        tx.select().from(plantIndicators).where(eq(plantIndicators.userIndicatorId, id2)),
      );
      expect(rows2).toHaveLength(0);
    });

    it("updates, and refuses a method change once a reading uses it", async () => {
      const created = await withUser(a, (tx) => svc.createUserIndicator(tx, a, form()));
      const id = created.ok ? created.data!.id : "";
      const upd = await withUser(a, (tx) =>
        svc.updateUserIndicator(tx, a, id, form({ nameAr: "اسم جديد", nameEn: "New name" })),
      );
      expect(upd).toEqual({ ok: true });
      let row = (await withUser(a, (tx) => tx.select().from(userIndicators).where(eq(userIndicators.id, id))))[0];
      expect([row.nameAr, row.nameEn]).toEqual(["اسم جديد", "New name"]);

      // unused: method may change
      const m1 = await withUser(a, (tx) =>
        svc.updateUserIndicator(
          tx,
          a,
          id,
          form({ method: "direct", unit: "عدد", labels: { value: { ar: "قيمة", en: "" } } }),
        ),
      );
      expect(m1).toEqual({ ok: true });

      await useIndicator(a, id);
      const m2 = await withUser(a, (tx) => svc.updateUserIndicator(tx, a, id, form()));
      expect(m2).toMatchObject({ ok: false, error: "methodLocked" });
      row = (await withUser(a, (tx) => tx.select().from(userIndicators).where(eq(userIndicators.id, id))))[0];
      expect(row.method).toBe("direct");

      // B cannot update it
      expect(await withUser(b, (tx) => svc.updateUserIndicator(tx, b, id, form()))).toMatchObject({
        ok: false,
        error: "notFound",
      });
    });

    let month = 0;
    async function useIndicator(uid: string, indicatorId: string) {
      const mm = String(++month).padStart(2, "0"); // one assessment per plant+period
      await withUser(uid, async (tx) => {
        const [p] = await tx.select({ id: plants.id }).from(plants).limit(1);
        const [asmt] = await tx
          .insert(assessments)
          .values({
            ownerId: uid,
            plantId: p.id,
            periodStart: `2026-${mm}-01`,
            months: 1,
            startDate: `2026-${mm}-01`,
            endDate: `2026-${mm}-28`,
          })
          .returning({ id: assessments.id });
        await tx.insert(assessmentReadings).values({
          ownerId: uid,
          assessmentId: asmt.id,
          userIndicatorId: indicatorId,
          inputs: { value: 3 },
        });
      });
    }

    it("deletes when unused and refuses when a reading uses it", async () => {
      const unused = await withUser(a, (tx) => svc.createUserIndicator(tx, a, form({ adoptAll: true })));
      const unusedId = unused.ok ? unused.data!.id : "";
      expect(await withUser(a, (tx) => svc.deleteUserIndicator(tx, a, unusedId))).toEqual({ ok: true });
      expect(
        await withUser(a, (tx) => tx.select().from(userIndicators).where(eq(userIndicators.id, unusedId))),
      ).toHaveLength(0);
      // its limits and adoption rows went with it
      expect(
        await withUser(a, (tx) =>
          tx.select().from(indicatorLimits).where(eq(indicatorLimits.userIndicatorId, unusedId)),
        ),
      ).toHaveLength(0);

      const used = await withUser(a, (tx) => svc.createUserIndicator(tx, a, form()));
      const usedId = used.ok ? used.data!.id : "";
      await useIndicator(a, usedId);
      expect(await withUser(a, (tx) => svc.deleteUserIndicator(tx, a, usedId))).toMatchObject({
        ok: false,
        error: "inUse",
      });
      const data = await withUser(a, (tx) => svc.listIndicatorsForUser(tx, a, null));
      expect(data.indicators.find((i) => i.ref === `usr:${usedId}`)?.used).toBe(true);

      // the database itself also refuses (foreign key), whatever the service says
      const state = await withUser(a, async (tx) => {
        try {
          await tx.transaction((sp) => sp.delete(userIndicators).where(eq(userIndicators.id, usedId)));
          return "deleted";
        } catch (e) {
          return (e as { cause?: { code?: string }; code?: string }).cause?.code ?? (e as { code?: string }).code;
        }
      });
      expect(state).toBe("23503");
    });
  });

  it("groups: create, rename, delete is refused while it has indicators", async () => {
    const g = await withUser(a, (tx) => svc.createGroup(tx, a, { nameAr: "مجموعة", nameEn: null }));
    expect(g.ok).toBe(true);
    const key = g.ok ? g.data!.key : "";
    const gid = key.slice(4);
    expect(await withUser(a, (tx) => svc.renameGroup(tx, a, gid, { nameAr: "مجموعة ٢", nameEn: "G2" }))).toEqual({
      ok: true,
    });
    const [row] = await withUser(a, (tx) =>
      tx.select().from(userIndicatorGroups).where(eq(userIndicatorGroups.id, gid)),
    );
    expect([row.nameAr, row.nameEn]).toEqual(["مجموعة ٢", "G2"]);

    const created = await withUser(a, (tx) => svc.createUserIndicator(tx, a, form({ group: key })));
    const indId = created.ok ? created.data!.id : "";
    expect(await withUser(a, (tx) => svc.deleteGroup(tx, a, gid))).toMatchObject({
      ok: false,
      error: "hasIndicators",
    });
    // B cannot rename or delete A's group
    expect(await withUser(b, (tx) => svc.renameGroup(tx, b, gid, { nameAr: "x", nameEn: null }))).toMatchObject({
      ok: false,
      error: "notFound",
    });
    expect(await withUser(b, (tx) => svc.deleteGroup(tx, b, gid))).toMatchObject({ ok: false, error: "notFound" });
    // and cannot put an indicator into it
    expect(await withUser(b, (tx) => svc.createUserIndicator(tx, b, form({ group: key })))).toMatchObject({
      ok: false,
      error: "validation",
    });

    await withUser(a, (tx) => svc.deleteUserIndicator(tx, a, indId));
    expect(await withUser(a, (tx) => svc.deleteGroup(tx, a, gid))).toEqual({ ok: true });
  });

  it("user B never sees A's user indicators, groups or limits", async () => {
    const aData = await withUser(a, (tx) => svc.listIndicatorsForUser(tx, a, null));
    expect(aData.indicators.some((i) => !i.isSystem)).toBe(true);
    const bData = await withUser(b, (tx) => svc.listIndicatorsForUser(tx, b, null));
    expect(bData.indicators.every((i) => i.isSystem)).toBe(true);
    expect(bData.groups.every((g) => g.isSystem)).toBe(true);
    // B's own limits are the untouched defaults, not A's edits
    expect(bData.indicators.find((i) => i.ref === "sys:SC-01")?.limits).toEqual({
      kind: "higher",
      target: 98,
      warning: 95,
      critical: 90,
    });
    expect(bData.indicators.find((i) => i.ref === "sys:SC-03")?.limitsNone).toBe(false);
    const raw = await withUser(b, (tx) =>
      tx.execute(sql`select count(*)::int as n from user_indicators where owner_id <> app_user_id()`),
    );
    expect((raw.rows[0] as { n: number }).n).toBe(0);
  });
});
