import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsOwner } from "../../scripts/lib/owner-db";

let db: Client;

beforeAll(async () => {
  db = await connectAsOwner();
});

afterAll(async () => {
  await db.end();
});

async function count(table: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`);
  return Number(rows[0].n);
}

describe("seeded reference data", () => {
  it("has the expected row counts", async () => {
    expect(await count("indicator_groups")).toBe(4);
    expect(await count("indicators")).toBe(15);
    expect(await count("indicator_default_limits")).toBe(15);
    expect(await count("obstacle_axes")).toBe(7);
    expect(await count("action_axes")).toBe(7);
    expect(await count("obstacles")).toBe(40);
    expect(await count("corrective_actions")).toBe(65);
    expect(await count("obstacle_action_links")).toBe(229);
  });

  it("seeds O-39 with no links and no importance order", async () => {
    const { rows } = await db.query(
      "SELECT importance_order FROM obstacles WHERE code = 'O-39'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].importance_order).toBeNull();
    const links = await db.query(
      "SELECT 1 FROM obstacle_action_links WHERE obstacle_code = 'O-39'",
    );
    expect(links.rowCount).toBe(0);
  });

  it("seeds SC-02 correctly", async () => {
    const { rows } = await db.query(
      "SELECT method, unit, better, name_ar FROM indicators WHERE code = 'SC-02'",
    );
    expect(rows).toEqual([
      {
        method: "direct_percent",
        unit: "%",
        better: "lower",
        name_ar: "نسبة المستفيدين الذين يعانون من انقطاع الخدمة",
      },
    ]);
  });

  it("has contiguous link ranks 1..n for every obstacle", async () => {
    const { rows } = await db.query(
      `SELECT obstacle_code FROM obstacle_action_links
       GROUP BY obstacle_code HAVING min(rank) <> 1 OR max(rank) <> count(*)`,
    );
    expect(rows).toEqual([]);
  });

  it("only links an obstacle and an action of the same axis", async () => {
    const { rows } = await db.query(
      `SELECT l.obstacle_code, l.action_code FROM obstacle_action_links l
       JOIN obstacles o ON o.code = l.obstacle_code
       JOIN corrective_actions a ON a.code = l.action_code
       WHERE o.axis_idx <> a.axis_idx`,
    );
    expect(rows).toEqual([]);
  });

  it("exposes corrective_actions_ranked without rii, ordered by rii descending", async () => {
    const view = await db.query(
      "SELECT * FROM corrective_actions_ranked ORDER BY sort_position",
    );
    expect(view.rows).toHaveLength(65);
    expect(view.fields.map((f) => f.name)).not.toContain("rii");
    expect(view.rows.map((r) => r.sort_position)).toEqual(
      Array.from({ length: 65 }, (_, i) => i + 1),
    );

    const rii = await db.query<{ code: string; rii: number }>(
      "SELECT code, rii FROM corrective_actions",
    );
    const riiByCode = new Map(rii.rows.map((r) => [r.code, r.rii]));
    const values = view.rows.map((r) => riiByCode.get(r.code) as number);
    expect(values.every((v) => typeof v === "number")).toBe(true);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});
