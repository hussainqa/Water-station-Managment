import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { myProfile } from "@/db/schema";
import { withUser } from "@/db/with-user";
import { auth } from "@/lib/auth";
import { authPool } from "@/lib/auth/db";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { sqlState } from "./helpers";

const PERMISSION_DENIED = "42501";
const AUTH_TABLES = ["users", "sessions", "accounts", "verifications"] as const;

describe("the app role cannot reach the auth tables", () => {
  let owner: Client;
  let a: string;
  let b: string;
  const emailA = `auth-a-${randomUUID()}@test.local`;
  const emailB = `auth-b-${randomUUID()}@test.local`;

  beforeAll(async () => {
    owner = await connectAsOwner();
    const signUp = (email: string, name: string) =>
      auth.api.signUpEmail({
        body: { name, email, password: "test-password-1", jobTitle: "Engineer" },
      });
    a = (await signUp(emailA, "User A")).user.id;
    b = (await signUp(emailB, "User B")).user.id;
  });

  afterAll(async () => {
    await owner.query("delete from users where email = any($1)", [
      [emailA, emailB],
    ]);
    await owner.end();
    await pool.end();
    await authPool.end();
  });

  it("connects as three different roles", async () => {
    const app = await pool.query("select current_user");
    const authRole = await authPool.query("select current_user");
    expect(app.rows[0].current_user).toBe("wtp_app");
    expect(authRole.rows[0].current_user).toBe("wtp_auth");
  });

  for (const table of AUTH_TABLES) {
    it(`app role: select / insert / update / delete on ${table} is denied`, async () => {
      expect(await sqlState(() => pool.query(`select * from ${table}`))).toBe(
        PERMISSION_DENIED,
      );
      expect(await sqlState(() => pool.query(`select id from ${table}`))).toBe(
        PERMISSION_DENIED,
      );
      expect(
        await sqlState(() => pool.query(`insert into ${table} default values`)),
      ).toBe(PERMISSION_DENIED);
      expect(
        await sqlState(() => pool.query(`update ${table} set id = id`)),
      ).toBe(PERMISSION_DENIED);
      expect(await sqlState(() => pool.query(`delete from ${table}`))).toBe(
        PERMISSION_DENIED,
      );
    });

    it(`app role has no privilege of any kind on ${table}`, async () => {
      const { rows } = await owner.query(
        `select has_table_privilege('wtp_app', $1, 'SELECT') as sel,
                has_any_column_privilege('wtp_app', $1, 'SELECT') as col_sel,
                has_table_privilege('wtp_app', $1, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as other`,
        [table],
      );
      expect(rows[0]).toEqual({ sel: false, col_sel: false, other: false });
    });
  }

  it("still denied inside withUser (setting a user id grants nothing)", async () => {
    const state = await sqlState(() =>
      withUser(a, (tx) => tx.execute(sql`select email, id from users`)),
    );
    expect(state).toBe(PERMISSION_DENIED);
    const hashes = await sqlState(() =>
      withUser(a, (tx) => tx.execute(sql`select password from accounts`)),
    );
    expect(hashes).toBe(PERMISSION_DENIED);
  });

  it("my_profile returns exactly the current user's row", async () => {
    const mine = await withUser(a, (tx) => tx.select().from(myProfile));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      id: a,
      fullName: "User A",
      jobTitle: "Engineer",
      email: emailA,
      locale: "ar",
      theme: "system",
    });
    const other = await withUser(a, (tx) =>
      tx.select().from(myProfile).where(eq(myProfile.id, b)),
    );
    expect(other).toHaveLength(0);
  });

  it("my_profile exposes profile columns only and is empty without a user", async () => {
    const res = await pool.query("select * from my_profile");
    expect(res.rows).toHaveLength(0);
    expect(res.fields.map((f) => f.name)).toEqual([
      "id",
      "full_name",
      "job_title",
      "email",
      "locale",
      "theme",
    ]);
    const bare = await db.select().from(myProfile);
    expect(bare).toHaveLength(0);
  });

  it("my_profile is read-only for the app role", async () => {
    const state = await sqlState(() =>
      withUser(a, (tx) =>
        tx.execute(sql`update my_profile set full_name = 'x'`),
      ),
    );
    expect(state).toBe(PERMISSION_DENIED);
  });

  it("the auth role cannot reach domain or reference data", async () => {
    for (const table of ["plants", "assessments", "indicators", "corrective_actions", "my_profile"]) {
      expect(
        await sqlState(() => authPool.query(`select * from ${table}`)),
      ).toBe(PERMISSION_DENIED);
    }
  });

  it("the auth role is not privileged", async () => {
    const { rows } = await owner.query(
      "select rolsuper, rolbypassrls, rolcreaterole from pg_roles where rolname = 'wtp_auth'",
    );
    expect(rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
    });
  });
});
