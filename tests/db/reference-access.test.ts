import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { sqlState } from "./helpers";

afterAll(async () => {
  await pool.end();
});

const DENIED = "42501";
const run = (q: string) => () => db.execute(sql.raw(q));

describe("reference data is read-only for the app", () => {
  it.each([
    "indicators",
    "obstacles",
    "obstacle_axes",
    "action_axes",
    "indicator_groups",
    "indicator_default_limits",
  ])("can SELECT from %s", async (t) => {
    const res = await db.execute(sql.raw(`select * from ${t} limit 1`));
    expect(Array.isArray(res.rows)).toBe(true);
  });

  it.each([
    "insert into indicator_groups (code, name_ar, name_en, sort) values ('ZZ', 'x', 'x', 999)",
    "update indicator_groups set name_ar = 'x'",
    "delete from indicator_groups",
    "insert into obstacles (code) values ('ZZ')",
    "update obstacles set code = code",
    "delete from obstacles",
    "update corrective_actions set text_ar = 'x'",
    "delete from corrective_actions",
    "insert into corrective_actions (code) values ('ZZ')",
  ])("is denied: %s", async (q) => {
    expect(await sqlState(run(q))).toBe(DENIED);
  });
});

describe("research figures are hidden", () => {
  it.each([
    "select rii from corrective_actions",
    "select * from corrective_actions",
    "select correlation_r from obstacle_action_links",
    "select priority_pct from obstacle_action_links",
    "select * from obstacle_action_links",
  ])("is denied: %s", async (q) => {
    expect(await sqlState(run(q))).toBe(DENIED);
  });

  it("allows the granted columns", async () => {
    await db.execute(sql`select code, text_ar from corrective_actions`);
    await db.execute(sql`select obstacle_code, action_code, rank from obstacle_action_links`);
  });

  it("exposes corrective_actions_ranked without rii", async () => {
    const res = await pool.query("select * from corrective_actions_ranked limit 1");
    expect(res.fields.map((f) => f.name)).toEqual([
      "code",
      "axis_idx",
      "seq_in_axis",
      "text_ar",
      "text_en",
      "sort_position",
    ]);
  });

  it("has no column privilege on the hidden columns", async () => {
    const r = await pool.query(
      `select
         has_column_privilege('wtp_app','corrective_actions','rii','SELECT') as rii,
         has_column_privilege('wtp_app','obstacle_action_links','correlation_r','SELECT') as r,
         has_column_privilege('wtp_app','obstacle_action_links','priority_pct','SELECT') as pct,
         has_column_privilege('wtp_app','corrective_actions','code','SELECT') as code`,
    );
    expect(r.rows[0]).toEqual({ rii: false, r: false, pct: false, code: true });
  });
});
