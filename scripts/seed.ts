/**
 * Loads the reference data in docs/handoff/data into the database.
 * Used by `npm run db:seed` (and by `npm run db:reset`).
 *
 * - Validates both JSON files before touching the database.
 * - Runs in ONE transaction: every row is upserted, and reference rows that are no
 *   longer in the files are deleted. Running it twice leaves identical data.
 * - Only reference tables are touched. If a delete is blocked by a foreign key from a
 *   user table, the whole seed aborts with a readable message (nothing cascades).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";
import { z } from "zod";
import { connectAsOwner } from "./lib/owner-db";

const DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../docs/handoff/data",
);

// ---------------------------------------------------------------- file schemas

const bilingual = z.object({ ar: z.string().min(1), en: z.string().min(1) });
const code = z.string().min(1);
const int = z.number().int();

const indicatorsFile = z.object({
  groups: z.array(z.object({ code, name: bilingual })),
  indicators: z.array(
    z.object({
      code,
      group: code,
      name: bilingual,
      method: z.enum(["direct", "direct_percent", "duration", "ratio", "average"]),
      unit: z.string(),
      better: z.enum(["higher", "lower"]),
      inputs: z.record(z.string(), bilingual),
      default_limits_illustrative: z.object({
        target: z.number(),
        warning: z.number(),
        critical: z.number(),
      }),
    }),
  ),
});

const obstaclesActionsFile = z.object({
  axes: z.array(
    z.object({ index: int, obstacle_axis: bilingual, action_axis: bilingual }),
  ),
  obstacles: z.array(
    z.object({
      code,
      source_row: int,
      axis: int,
      seq_in_axis: int,
      text: bilingual,
      importance_order_in_axis: int.nullable(),
      // null = known gap in the research source (O-39): seeded with no links.
      linked_actions: z
        .array(
          z.object({
            action: code,
            rank: int,
            correlation_r: z.number(),
            priority_pct: z.number(),
          }),
        )
        .nullable(),
    }),
  ),
  actions: z.array(
    z.object({
      code,
      source_row: int,
      axis: int,
      seq_in_axis: int,
      text: bilingual,
      rii: z.number(),
    }),
  ),
});

function readJson<T extends z.ZodType>(file: string, schema: T): z.output<T> {
  const raw: unknown = JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8"));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${file}: ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid ${file}:\n${issues}`);
  }
  return parsed.data;
}

/** Cross-reference checks the per-field schemas cannot express. */
function checkReferences(
  ind: z.output<typeof indicatorsFile>,
  oa: z.output<typeof obstaclesActionsFile>,
) {
  const problems: string[] = [];
  const groups = new Set(ind.groups.map((g) => g.code));
  ind.indicators.forEach((x, i) => {
    if (!groups.has(x.group))
      problems.push(`indicators.json: indicators.${i}.group: unknown group "${x.group}"`);
  });
  const axes = new Set(oa.axes.map((a) => a.index));
  const actions = new Set(oa.actions.map((a) => a.code));
  oa.obstacles.forEach((o, i) => {
    if (!axes.has(o.axis))
      problems.push(`obstacles_actions.json: obstacles.${i}.axis: unknown axis ${o.axis}`);
    (o.linked_actions ?? []).forEach((l, j) => {
      if (!actions.has(l.action))
        problems.push(
          `obstacles_actions.json: obstacles.${i}.linked_actions.${j}.action: unknown action "${l.action}" (${o.code})`,
        );
    });
  });
  oa.actions.forEach((a, i) => {
    if (!axes.has(a.axis))
      problems.push(`obstacles_actions.json: actions.${i}.axis: unknown axis ${a.axis}`);
  });
  if (problems.length) throw new Error(`Bad references:\n  ${problems.join("\n  ")}`);
}

// -------------------------------------------------------------------- database

/** Deletes rows of `table` whose `keyColumn` is not in `keep`. */
async function deleteMissing(
  db: Client,
  table: string,
  keyColumn: string,
  keep: (string | number)[],
) {
  const type = typeof keep[0] === "number" ? "int" : "text";
  try {
    await db.query(`DELETE FROM ${table} WHERE ${keyColumn} <> ALL($1::${type}[])`, [keep]);
  } catch (error) {
    throw new Error(
      `Cannot remove stale rows from ${table}: still referenced by other data. ` +
        `Fix or remove the references first (${error instanceof Error ? error.message : error})`,
    );
  }
}

// ------------------------------------------------- client changes on top of the files

/**
 * An average is entered directly as one value (client request, Nov 2026), so the system
 * average indicators get one `value` label instead of the file's total/count labels.
 */
const AVERAGE_VALUE_LABELS: Record<string, { ar: string; en: string }> = {
  "RT-01": { ar: "متوسط زمن الاستجابة", en: "Average response time" },
  "RT-02": { ar: "متوسط زمن المعالجة", en: "Average resolution time" },
  "RT-03": { ar: "متوسط زمن بدء التعامل مع الشكوى", en: "Average time to start handling" },
  "RT-04": { ar: "متوسط المدة من الاستلام حتى المعالجة", en: "Average time from receipt to resolution" },
};

function inputLabelsOf(x: z.output<typeof indicatorsFile>["indicators"][number]) {
  if (x.method !== "average") return x.inputs;
  return { value: AVERAGE_VALUE_LABELS[x.code] ?? { ar: "المتوسط", en: "Average" } };
}

/**
 * Corrective actions the researcher supplied for obstacles that have no significant link in
 * the source (table "جدول العوائق والإجراءات للمبرمج", Nov 2026). They carry a rank only:
 * there is no correlation or priority for them, so those columns stay null.
 */
const SUPPLEMENTARY_LINKS: { obstacle: string; action: string; rank: number }[] = [
  { obstacle: "O-02", action: "A-02", rank: 1 }, // T.F.2
  { obstacle: "O-10", action: "A-10", rank: 1 }, // O.F.5
  { obstacle: "O-12", action: "A-12", rank: 1 }, // M.F.2
];

function checkSupplementaryLinks(oa: z.output<typeof obstaclesActionsFile>) {
  const problems: string[] = [];
  for (const l of SUPPLEMENTARY_LINKS) {
    const o = oa.obstacles.find((x) => x.code === l.obstacle);
    const a = oa.actions.find((x) => x.code === l.action);
    if (!o) problems.push(`supplementary link: unknown obstacle ${l.obstacle}`);
    else if (o.linked_actions?.length)
      problems.push(`supplementary link: ${l.obstacle} already has links in the file`);
    if (!a) problems.push(`supplementary link: unknown action ${l.action}`);
    else if (o && a.axis !== o.axis) problems.push(`supplementary link: ${l.obstacle} and ${l.action} differ in axis`);
  }
  if (problems.length) throw new Error(`Bad supplementary links:\n  ${problems.join("\n  ")}`);
}

async function seed(
  db: Client,
  ind: z.output<typeof indicatorsFile>,
  oa: z.output<typeof obstaclesActionsFile>,
) {
  // --- indicator groups
  for (const [i, g] of ind.groups.entries()) {
    await db.query(
      `INSERT INTO indicator_groups (code, name_ar, name_en, sort) VALUES ($1,$2,$3,$4)
       ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar,
         name_en = EXCLUDED.name_en, sort = EXCLUDED.sort`,
      [g.code, g.name.ar, g.name.en, i + 1],
    );
  }

  // --- indicators and their default limits
  for (const [i, x] of ind.indicators.entries()) {
    await db.query(
      `INSERT INTO indicators
         (code, group_code, name_ar, name_en, method, unit, better, input_labels, sort, is_system)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,true)
       ON CONFLICT (code) DO UPDATE SET group_code = EXCLUDED.group_code,
         name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, method = EXCLUDED.method,
         unit = EXCLUDED.unit, better = EXCLUDED.better, input_labels = EXCLUDED.input_labels,
         sort = EXCLUDED.sort, is_system = true`,
      [x.code, x.group, x.name.ar, x.name.en, x.method, x.unit, x.better, JSON.stringify(inputLabelsOf(x)), i + 1],
    );
    const l = x.default_limits_illustrative;
    await db.query(
      `INSERT INTO indicator_default_limits (indicator_code, kind, target, warning, critical)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (indicator_code) DO UPDATE SET kind = EXCLUDED.kind, target = EXCLUDED.target,
         warning = EXCLUDED.warning, critical = EXCLUDED.critical,
         min_ok = NULL, max_ok = NULL, crit_min = NULL, crit_max = NULL`,
      [x.code, x.better, l.target, l.warning, l.critical],
    );
  }

  // --- axes
  for (const a of oa.axes) {
    await db.query(
      `INSERT INTO obstacle_axes (idx, name_ar, name_en) VALUES ($1,$2,$3)
       ON CONFLICT (idx) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en`,
      [a.index, a.obstacle_axis.ar, a.obstacle_axis.en],
    );
    await db.query(
      `INSERT INTO action_axes (idx, name_ar, name_en) VALUES ($1,$2,$3)
       ON CONFLICT (idx) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en`,
      [a.index, a.action_axis.ar, a.action_axis.en],
    );
  }

  // --- obstacles and corrective actions
  for (const o of oa.obstacles) {
    await db.query(
      `INSERT INTO obstacles
         (code, axis_idx, seq_in_axis, source_row, text_ar, text_en, importance_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO UPDATE SET axis_idx = EXCLUDED.axis_idx,
         seq_in_axis = EXCLUDED.seq_in_axis, source_row = EXCLUDED.source_row,
         text_ar = EXCLUDED.text_ar, text_en = EXCLUDED.text_en,
         importance_order = EXCLUDED.importance_order`,
      [o.code, o.axis, o.seq_in_axis, o.source_row, o.text.ar, o.text.en, o.importance_order_in_axis],
    );
  }
  for (const a of oa.actions) {
    await db.query(
      `INSERT INTO corrective_actions
         (code, axis_idx, seq_in_axis, source_row, text_ar, text_en, rii)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO UPDATE SET axis_idx = EXCLUDED.axis_idx,
         seq_in_axis = EXCLUDED.seq_in_axis, source_row = EXCLUDED.source_row,
         text_ar = EXCLUDED.text_ar, text_en = EXCLUDED.text_en, rii = EXCLUDED.rii`,
      [a.code, a.axis, a.seq_in_axis, a.source_row, a.text.ar, a.text.en, a.rii],
    );
  }

  // --- links: no user table references them, so replace wholesale
  await db.query("DELETE FROM obstacle_action_links");
  for (const o of oa.obstacles) {
    for (const l of o.linked_actions ?? []) {
      await db.query(
        `INSERT INTO obstacle_action_links
           (obstacle_code, action_code, rank, correlation_r, priority_pct)
         VALUES ($1,$2,$3,$4,$5)`,
        [o.code, l.action, l.rank, l.correlation_r, l.priority_pct],
      );
    }
  }
  for (const l of SUPPLEMENTARY_LINKS) {
    await db.query(
      `INSERT INTO obstacle_action_links (obstacle_code, action_code, rank) VALUES ($1,$2,$3)`,
      [l.obstacle, l.action, l.rank],
    );
  }

  // --- remove reference rows that are no longer in the files (children before parents)
  await deleteMissing(db, "indicator_default_limits", "indicator_code", ind.indicators.map((x) => x.code));
  await deleteMissing(db, "indicators", "code", ind.indicators.map((x) => x.code));
  await deleteMissing(db, "indicator_groups", "code", ind.groups.map((g) => g.code));
  await deleteMissing(db, "obstacles", "code", oa.obstacles.map((o) => o.code));
  await deleteMissing(db, "corrective_actions", "code", oa.actions.map((a) => a.code));
  await deleteMissing(db, "obstacle_axes", "idx", oa.axes.map((a) => a.index));
  await deleteMissing(db, "action_axes", "idx", oa.axes.map((a) => a.index));
}

const TABLES = [
  "indicator_groups",
  "indicators",
  "indicator_default_limits",
  "obstacle_axes",
  "action_axes",
  "obstacles",
  "corrective_actions",
  "obstacle_action_links",
];

async function main() {
  const ind = readJson("indicators.json", indicatorsFile);
  const oa = readJson("obstacles_actions.json", obstaclesActionsFile);
  checkReferences(ind, oa);
  checkSupplementaryLinks(oa);

  const db = await connectAsOwner();
  try {
    await db.query("BEGIN");
    try {
      await seed(db, ind, oa);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }

    console.log("Seeded reference data:");
    for (const table of TABLES) {
      const { rows } = await db.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`);
      console.log(`  ${table.padEnd(26)} ${rows[0].n}`);
    }
    const supplemented = new Set(SUPPLEMENTARY_LINKS.map((l) => l.obstacle));
    const unlinked = oa.obstacles
      .filter((o) => !o.linked_actions?.length && !supplemented.has(o.code))
      .map((o) => o.code);
    console.log(`Obstacles seeded without linked actions: ${unlinked.join(", ")}`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
