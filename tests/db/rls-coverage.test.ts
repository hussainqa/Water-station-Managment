import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsOwner } from "../../scripts/lib/owner-db";

let owner: Client;

beforeAll(async () => {
  owner = await connectAsOwner();
});
afterAll(async () => {
  await owner.end();
});

async function ownedTables(): Promise<string[]> {
  const r = await owner.query(
    `select c.relname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attname = 'owner_id' and not a.attisdropped
      where n.nspname = 'public' and c.relkind in ('r','p')
      order by c.relname`,
  );
  return r.rows.map((x) => x.relname as string);
}

describe("every table with owner_id is protected by RLS", () => {
  it("finds the expected user-owned tables", async () => {
    const tables = await ownedTables();
    expect(tables.length).toBeGreaterThan(0);
    expect(tables).toEqual(
      expect.arrayContaining(["plants", "assessments", "problems", "audit_events"]),
    );
  });

  it("each has RLS enabled, an owner-scoped wtp_app policy, and is not owned by wtp_app", async () => {
    const tables = await ownedTables();
    const problems: string[] = [];
    for (const t of tables) {
      const cls = await owner.query(
        `select c.relrowsecurity, pg_get_userbyid(c.relowner) as owner
           from pg_class c where c.oid = format('public.%I', $1::text)::regclass`,
        [t],
      );
      if (!cls.rows[0].relrowsecurity) problems.push(`${t}: RLS not enabled`);
      if (cls.rows[0].owner === "wtp_app") problems.push(`${t}: owned by wtp_app`);

      const pol = await owner.query(
        `select polname, pg_get_expr(polqual, polrelid) as using_expr,
                pg_get_expr(polwithcheck, polrelid) as check_expr,
                (select array_agg(pg_get_userbyid(r)) from unnest(polroles) r) as roles
           from pg_policy where polrelid = format('public.%I', $1::text)::regclass`,
        [t],
      );
      const ok = pol.rows.some((p) => {
        const roles = (p.roles ?? []) as string[];
        const mentions = (e: string | null) => !!e && /app_user_id\(\)/.test(e) && /owner_id/.test(e);
        return roles.includes("wtp_app") && mentions(p.using_expr) && mentions(p.check_expr);
      });
      if (!ok) problems.push(`${t}: no wtp_app policy with USING and WITH CHECK on owner_id = app_user_id()`);
    }
    expect(problems).toEqual([]);
  });

  it("audit_events is append-only for wtp_app", async () => {
    const r = await owner.query(
      `select has_table_privilege('wtp_app','public.audit_events','SELECT') as sel,
              has_table_privilege('wtp_app','public.audit_events','INSERT') as ins,
              has_table_privilege('wtp_app','public.audit_events','UPDATE') as upd,
              has_table_privilege('wtp_app','public.audit_events','DELETE') as del`,
    );
    expect(r.rows[0]).toEqual({ sel: true, ins: true, upd: false, del: false });
  });
});
