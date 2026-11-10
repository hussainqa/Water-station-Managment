import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  primaryKey,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { betterDirection, indicatorMethod, limitKind } from "./enums";

/**
 * Reference data (HANDOFF 5.1): seeded from docs/handoff/data, shared by all users,
 * read-only for the app role.
 */

export type InputLabels = Record<string, { ar: string; en: string }>;

export const indicatorGroups = pgTable("indicator_groups", {
  code: text("code").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  sort: integer("sort").notNull(),
});

export const indicators = pgTable(
  "indicators",
  {
    code: text("code").primaryKey(),
    groupCode: text("group_code")
      .notNull()
      .references(() => indicatorGroups.code),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    method: indicatorMethod("method").notNull(),
    unit: text("unit").notNull(),
    better: betterDirection("better").notNull(),
    inputLabels: jsonb("input_labels").$type<InputLabels>().notNull(),
    sort: integer("sort").notNull(),
    isSystem: boolean("is_system").notNull().default(true),
  },
  (t) => [index("indicators_group_idx").on(t.groupCode)],
);

/**
 * Starting limits offered when a user adopts a system indicator. The values in
 * indicators.json are illustrative (proposed during prototyping, not from the thesis)
 * and are to be replaced once the researcher confirms them.
 */
export const indicatorDefaultLimits = pgTable("indicator_default_limits", {
  indicatorCode: text("indicator_code")
    .primaryKey()
    .references(() => indicators.code, { onDelete: "cascade" }),
  kind: limitKind("kind").notNull(),
  target: doublePrecision("target"),
  warning: doublePrecision("warning"),
  critical: doublePrecision("critical"),
  minOk: doublePrecision("min_ok"),
  maxOk: doublePrecision("max_ok"),
  critMin: doublePrecision("crit_min"),
  critMax: doublePrecision("crit_max"),
});

export const obstacleAxes = pgTable("obstacle_axes", {
  idx: integer("idx").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
});

export const actionAxes = pgTable("action_axes", {
  idx: integer("idx").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
});

export const obstacles = pgTable(
  "obstacles",
  {
    code: text("code").primaryKey(),
    axisIdx: integer("axis_idx")
      .notNull()
      .references(() => obstacleAxes.idx),
    seqInAxis: integer("seq_in_axis").notNull(),
    sourceRow: integer("source_row").notNull(),
    textAr: text("text_ar").notNull(),
    textEn: text("text_en").notNull(),
    /** Research importance order. Never displayed (client note 12). Null for O-39. */
    importanceOrder: integer("importance_order"),
  },
  (t) => [unique("obstacles_axis_seq_uq").on(t.axisIdx, t.seqInAxis)],
);

/**
 * `rii` is hidden from the app role by column-level grants (client note 13).
 * App code must read actions through `correctiveActionsRanked`, never this table.
 */
export const correctiveActions = pgTable(
  "corrective_actions",
  {
    code: text("code").primaryKey(),
    axisIdx: integer("axis_idx")
      .notNull()
      .references(() => actionAxes.idx),
    seqInAxis: integer("seq_in_axis").notNull(),
    sourceRow: integer("source_row").notNull(),
    textAr: text("text_ar").notNull(),
    textEn: text("text_en").notNull(),
    rii: doublePrecision("rii").notNull(),
  },
  (t) => [unique("corrective_actions_axis_seq_uq").on(t.axisIdx, t.seqInAxis)],
);

/**
 * `correlation_r` and `priority_pct` are hidden from the app role by column-level
 * grants. App code selects obstacle_code, action_code and rank only.
 */
export const obstacleActionLinks = pgTable(
  "obstacle_action_links",
  {
    obstacleCode: text("obstacle_code")
      .notNull()
      .references(() => obstacles.code, { onDelete: "cascade" }),
    actionCode: text("action_code")
      .notNull()
      .references(() => correctiveActions.code, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    correlationR: doublePrecision("correlation_r").notNull(),
    priorityPct: doublePrecision("priority_pct").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.obstacleCode, t.actionCode] }),
    unique("obstacle_action_links_rank_uq").on(t.obstacleCode, t.rank),
  ],
);

/**
 * All 65 actions with a research sort position (1 = strongest) and no RII value.
 * Defined in drizzle/0001_security.sql; owned by the owner role so it can read `rii`.
 */
export const correctiveActionsRanked = pgView("corrective_actions_ranked", {
  code: text("code").notNull(),
  axisIdx: integer("axis_idx").notNull(),
  seqInAxis: integer("seq_in_axis").notNull(),
  textAr: text("text_ar").notNull(),
  textEn: text("text_en").notNull(),
  sortPosition: integer("sort_position").notNull(),
}).existing();
