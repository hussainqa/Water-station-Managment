import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { db, pool } from "@/db/client";
import { indicatorGroups } from "@/db/schema/reference";
import { assessments, plantIndicators, plants, userIndicators } from "@/db/schema/app";
import { withUser } from "@/db/with-user";
import { auth } from "@/lib/auth";
import { validatePlant } from "@/lib/plants/schemas";
import {
  createPlant,
  deletePlant,
  getPlant,
  listPlants,
  updatePlant,
} from "@/lib/plants/service";
import { sqlState } from "./helpers";

const FK_VIOLATION = "23503";

async function signUp(label: string) {
  const res = await auth.api.signUpEmail({
    body: {
      name: `Plants ${label}`,
      email: `plants-${label}-${randomBytes(6).toString("hex")}@test.local`,
      password: randomBytes(12).toString("hex"),
      jobTitle: "tester",
    },
  });
  return res.user.id;
}

function input(over: Record<string, unknown> = {}) {
  const r = validatePlant({
    name: "Test plant",
    governorate: "baghdad",
    location: "Al-Rusafa",
    waterSource: "tigris",
    designCapacity: "1000",
    actualCapacity: "900",
    engineer: "Eng. T",
    notes: "",
    ...over,
  });
  if (!r.ok) throw new Error(`invalid test input: ${JSON.stringify(r.fieldErrors)}`);
  return r.data;
}

describe("plants service", () => {
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

  async function adoptedOf(owner: string, plantId: string) {
    return withUser(owner, (tx) =>
      tx.select().from(plantIndicators).where(eq(plantIndicators.plantId, plantId)),
    );
  }

  it("validation rules hold at the schema level", () => {
    expect(validatePlant({}).ok).toBe(false);
    const high = validatePlant({
      name: "x", governorate: "baghdad", location: "y", waterSource: "tigris",
      designCapacity: "1000", actualCapacity: "1201",
    });
    expect(high.ok).toBe(false);
    if (!high.ok) expect(high.fieldErrors.actualCapacity).toBe("actualTooHigh");
    expect(
      validatePlant({
        name: "x", governorate: "baghdad", location: "y", waterSource: "tigris",
        designCapacity: "1000", actualCapacity: "1200",
      }).ok,
    ).toBe(true);
  });

  it("create adopts exactly the 15 system indicators", async () => {
    const plant = await withUser(a, (tx) => createPlant(tx, a, input()));
    expect(plant.ownerId).toBe(a);
    const rows = await adoptedOf(a, plant.id);
    expect(rows).toHaveLength(15);
    expect(rows.every((r) => r.adopted && r.indicatorCode && !r.userIndicatorId)).toBe(true);
    expect(new Set(rows.map((r) => r.indicatorCode)).size).toBe(15);
  });

  it("create also adopts the user's adopt-all indicators, and never another user's", async () => {
    const mk = (owner: string, name: string, adoptAll: boolean, groupCode: string) =>
      withUser(owner, async (tx) => {
        const [row] = await tx
          .insert(userIndicators)
          .values({
            ownerId: owner,
            groupCode,
            nameAr: name,
            method: "direct",
            unit: "%",
            better: "higher",
            inputLabels: { value: { ar: "قيمة", en: "Value" } } as never,
            adoptAllPlants: adoptAll,
          })
          .returning();
        return row.id;
      });
    const [{ code: groupCode }] = await db.select({ code: indicatorGroups.code }).from(indicatorGroups).limit(1);
    const mineAll = await mk(a, "adopt all", true, groupCode);
    const mineOff = await mk(a, "adopt none", false, groupCode);
    const theirs = await mk(b, "theirs", true, groupCode);

    const plant = await withUser(a, (tx) => createPlant(tx, a, input({ name: "Second" })));
    const rows = await adoptedOf(a, plant.id);
    expect(rows).toHaveLength(16);
    const userIds = rows.map((r) => r.userIndicatorId).filter(Boolean);
    expect(userIds).toEqual([mineAll]);
    expect(userIds).not.toContain(mineOff);
    expect(userIds).not.toContain(theirs);
  });

  it("list returns the owner's plants with assessment counts; getPlant finds one", async () => {
    const list = await withUser(a, (tx) => listPlants(tx));
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.every((p) => p.ownerId === a && p.assessmentCount === 0)).toBe(true);
    const one = await withUser(a, (tx) => getPlant(tx, list[0].id));
    expect(one?.id).toBe(list[0].id);
    expect(await withUser(b, (tx) => listPlants(tx))).toHaveLength(0);
  });

  it("update changes the plant, including when it has assessments", async () => {
    const plant = await withUser(a, (tx) => createPlant(tx, a, input({ name: "To edit" })));
    const row = await withUser(a, (tx) =>
      updatePlant(tx, a, plant.id, input({ name: "Edited", actualCapacity: "", engineer: "" })),
    );
    expect(row?.name).toBe("Edited");
    expect(row?.actualCapacity).toBeNull();

    await withUser(a, (tx) =>
      tx.insert(assessments).values({
        ownerId: a,
        plantId: plant.id,
        periodStart: "2026-09-01",
        months: 1,
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      }),
    );
    const again = await withUser(a, (tx) =>
      updatePlant(tx, a, plant.id, input({ name: "Edited twice" })),
    );
    expect(again?.name).toBe("Edited twice");
  });

  it("delete succeeds without assessments and removes the adoption rows", async () => {
    const plant = await withUser(a, (tx) => createPlant(tx, a, input({ name: "Disposable" })));
    const r = await withUser(a, (tx) => deletePlant(tx, a, plant.id));
    expect(r).toEqual({ ok: true });
    expect(await withUser(a, (tx) => getPlant(tx, plant.id))).toBeNull();
    expect(await adoptedOf(a, plant.id)).toHaveLength(0);
  });

  it("delete is refused when the plant has an assessment (a draft counts)", async () => {
    const plant = await withUser(a, (tx) => createPlant(tx, a, input({ name: "Protected" })));
    await withUser(a, (tx) =>
      tx.insert(assessments).values({
        ownerId: a,
        plantId: plant.id,
        periodStart: "2026-08-01",
        months: 1,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        status: "draft",
      }),
    );
    const r = await withUser(a, (tx) => deletePlant(tx, a, plant.id));
    expect(r).toEqual({ ok: false, error: "hasAssessments" });
    const still = await withUser(a, (tx) => getPlant(tx, plant.id));
    expect(still?.assessmentCount).toBe(1);

    // and the database refuses on its own (foreign key without cascade)
    const code = await sqlState(() =>
      withUser(a, (tx) => tx.delete(plants).where(eq(plants.id, plant.id))),
    );
    expect(code).toBe(FK_VIOLATION);
  });

  it("user B cannot update or delete A's plant through the service", async () => {
    const plant = await withUser(a, (tx) => createPlant(tx, a, input({ name: "Private" })));
    expect(await withUser(b, (tx) => updatePlant(tx, b, plant.id, input({ name: "Hacked" })))).toBeNull();
    expect(await withUser(b, (tx) => deletePlant(tx, b, plant.id))).toEqual({
      ok: false,
      error: "notFound",
    });
    // even naming A as owner, row-level security hides the row
    expect(await withUser(b, (tx) => updatePlant(tx, a, plant.id, input({ name: "Hacked" })))).toBeNull();
    expect(await withUser(b, (tx) => deletePlant(tx, a, plant.id))).toEqual({
      ok: false,
      error: "notFound",
    });
    const intact = await withUser(a, (tx) =>
      tx.select().from(plants).where(and(eq(plants.id, plant.id))),
    );
    expect(intact[0].name).toBe("Private");
  });
});
