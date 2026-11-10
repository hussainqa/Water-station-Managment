import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { db, pool } from "@/db/client";
import { plants } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { auth } from "@/lib/auth";
import { sqlState } from "./helpers";

const RLS_VIOLATION = "42501";

async function signUp(label: string) {
  const email = `rls-${label}-${randomBytes(6).toString("hex")}@test.local`;
  const res = await auth.api.signUpEmail({
    body: {
      name: `RLS ${label}`,
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
  governorate: "Cairo",
  waterSource: "river",
  designCapacity: 100,
});

describe("one user cannot reach another user's plants", () => {
  let a: string;
  let b: string;
  let plantA: string;
  const createdUsers: string[] = [];

  beforeAll(async () => {
    a = await signUp("a");
    createdUsers.push(a);
    b = await signUp("b");
    createdUsers.push(b);
    expect(a).not.toBe(b);
  });

  afterAll(async () => {
    const owner = await connectAsOwner();
    try {
      if (createdUsers.length) {
        await owner.query("delete from users where id = any($1::uuid[])", [createdUsers]);
      }
    } finally {
      await owner.end();
      await pool.end();
    }
  });

  it("1. A can insert and read their own plant", async () => {
    const [row] = await withUser(a, (tx) =>
      tx.insert(plants).values(newPlant(a, "A plant")).returning(),
    );
    plantA = row.id;
    expect(row.ownerId).toBe(a);
    const read = await withUser(a, (tx) => tx.select().from(plants).where(eq(plants.id, plantA)));
    expect(read).toHaveLength(1);
    expect(read[0].name).toBe("A plant");
  });

  it("2. B cannot list or fetch A's plant", async () => {
    const all = await withUser(b, (tx) => tx.select().from(plants));
    expect(all.find((p) => p.id === plantA)).toBeUndefined();
    expect(all.every((p) => p.ownerId === b)).toBe(true);
    const byId = await withUser(b, (tx) => tx.select().from(plants).where(eq(plants.id, plantA)));
    expect(byId).toHaveLength(0);
  });

  it("3. B cannot update A's plant", async () => {
    const res = await withUser(b, (tx) =>
      tx.update(plants).set({ name: "hacked" }).where(eq(plants.id, plantA)).returning(),
    );
    expect(res).toHaveLength(0);
    const raw = await withUser(b, (tx) =>
      tx.execute(sql`update plants set name = 'hacked' where id = ${plantA}`),
    );
    expect(raw.rowCount).toBe(0);
    const [row] = await withUser(a, (tx) => tx.select().from(plants).where(eq(plants.id, plantA)));
    expect(row.name).toBe("A plant");
  });

  it("4. B cannot delete A's plant", async () => {
    const res = await withUser(b, (tx) =>
      tx.delete(plants).where(eq(plants.id, plantA)).returning(),
    );
    expect(res).toHaveLength(0);
    const read = await withUser(a, (tx) => tx.select().from(plants).where(eq(plants.id, plantA)));
    expect(read).toHaveLength(1);
  });

  it("5. B cannot insert a plant owned by A (RLS violation)", async () => {
    const state = await sqlState(() =>
      withUser(b, (tx) => tx.insert(plants).values(newPlant(a, "forged"))),
    );
    expect(state).toBe(RLS_VIOLATION);
    const forged = await withUser(a, (tx) =>
      tx.select().from(plants).where(eq(plants.name, "forged")),
    );
    expect(forged).toHaveLength(0);
  });

  it("5b. B cannot re-assign their own plant to A via update", async () => {
    const [mine] = await withUser(b, (tx) =>
      tx.insert(plants).values(newPlant(b, "B plant")).returning(),
    );
    const state = await sqlState(() =>
      withUser(b, (tx) => tx.update(plants).set({ ownerId: a }).where(eq(plants.id, mine.id))),
    );
    expect(state).toBe(RLS_VIOLATION);
    await withUser(b, (tx) => tx.delete(plants).where(eq(plants.id, mine.id)));
  });

  it("6. B can insert their own plant and A cannot see it", async () => {
    const [row] = await withUser(b, (tx) =>
      tx.insert(plants).values(newPlant(b, "B plant 2")).returning(),
    );
    expect(row.ownerId).toBe(b);
    const seenByA = await withUser(a, (tx) =>
      tx.select().from(plants).where(eq(plants.id, row.id)),
    );
    expect(seenByA).toHaveLength(0);
    const seenByB = await withUser(b, (tx) =>
      tx.select().from(plants).where(and(eq(plants.id, row.id), eq(plants.ownerId, b))),
    );
    expect(seenByB).toHaveLength(1);
  });

  it("7. with no app.user_id set, reads return nothing and inserts are rejected", async () => {
    // Application code must NEVER query user-owned tables on `db` outside withUser().
    // This is done here only to prove that the database fails closed.
    const rows = await db.select().from(plants);
    expect(rows).toHaveLength(0);
    const state = await sqlState(() => db.insert(plants).values(newPlant(a, "no-context")));
    expect(state).toBe(RLS_VIOLATION);
  });

  it("8. withUser rejects a non-UUID user id", async () => {
    for (const bad of ["not-a-uuid", "", "'; drop table plants; --", `${a}' or '1'='1`]) {
      await expect(withUser(bad, async () => "ran")).rejects.toThrow();
    }
  });

  it("9. app.user_id does not leak out of withUser", async () => {
    for (let i = 0; i < 12; i++) {
      await withUser(a, (tx) => tx.select().from(plants));
      const res = await pool.query("select current_setting('app.user_id', true) as v");
      const v = res.rows[0].v as string | null;
      expect(v === null || v === "").toBe(true);
    }
  });

  it("10. the app connection is the restricted role", async () => {
    const cu = await pool.query("select current_user as u");
    expect(cu.rows[0].u).toBe("wtp_app");
    const r = await pool.query(
      "select rolsuper, rolbypassrls from pg_roles where rolname = 'wtp_app'",
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].rolsuper).toBe(false);
    expect(r.rows[0].rolbypassrls).toBe(false);
  });
});
