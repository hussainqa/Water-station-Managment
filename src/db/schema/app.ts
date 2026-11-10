import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import {
  assessmentStatus,
  betterDirection,
  indicatorMethod,
  limitKind,
  obstacleClassification,
  problemOrigin,
  readingStatus,
} from "./enums";
import {
  correctiveActions,
  indicatorGroups,
  indicators,
  obstacles,
  type InputLabels,
} from "./reference";

/**
 * User-owned data (HANDOFF 5.2).
 *
 * Rules that hold for EVERY table in this file:
 *  - it has `owner_id`, and row-level security restricts every operation to
 *    owner_id = current_setting('app.user_id') (see drizzle/0001_security.sql);
 *  - a child row carries the same owner as its parent, enforced by a composite
 *    foreign key (parent_id, owner_id) -> parent (id, owner_id);
 *  - a reference to an indicator / obstacle is a pair of nullable columns
 *    (system code, user-defined id) with a CHECK that exactly one is set.
 *
 * tests/db/rls-coverage.test.ts fails if a table here is missing its policy.
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const ownerId = () =>
  uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const exactlyOne = (a: string, b: string) =>
  sql.raw(`num_nonnulls(${a}, ${b}) = 1`);
const atMostOne = (a: string, b: string) =>
  sql.raw(`num_nonnulls(${a}, ${b}) <= 1`);

// --- Indicators defined by the user -----------------------------------------

export const userIndicatorGroups = pgTable(
  "user_indicator_groups",
  {
    id: id(),
    ownerId: ownerId(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    createdAt: createdAt(),
  },
  (t) => [unique("user_indicator_groups_id_owner_uq").on(t.id, t.ownerId)],
);

export const userIndicators = pgTable(
  "user_indicators",
  {
    id: id(),
    ownerId: ownerId(),
    // group_ref: a system group or one of the user's own groups
    groupCode: text("group_code").references(() => indicatorGroups.code),
    userGroupId: uuid("user_group_id"),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en"),
    description: text("description"),
    method: indicatorMethod("method").notNull(),
    unit: text("unit").notNull().default(""),
    better: betterDirection("better").notNull(),
    inputLabels: jsonb("input_labels").$type<InputLabels>().notNull(),
    adoptAllPlants: boolean("adopt_all_plants").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique("user_indicators_id_owner_uq").on(t.id, t.ownerId),
    foreignKey({
      name: "user_indicators_user_group_fk",
      columns: [t.userGroupId, t.ownerId],
      foreignColumns: [userIndicatorGroups.id, userIndicatorGroups.ownerId],
    }),
    check(
      "user_indicators_group_ref_ck",
      exactlyOne("group_code", "user_group_id"),
    ),
    index("user_indicators_owner_idx").on(t.ownerId),
  ],
);

// --- Plants -------------------------------------------------------------------

export const plants = pgTable(
  "plants",
  {
    id: id(),
    ownerId: ownerId(),
    name: text("name").notNull(),
    governorate: text("governorate").notNull(),
    location: text("location").notNull().default(""),
    waterSource: text("water_source").notNull(),
    designCapacity: doublePrecision("design_capacity").notNull(),
    actualCapacity: doublePrecision("actual_capacity"),
    engineer: text("engineer").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    unique("plants_id_owner_uq").on(t.id, t.ownerId),
    index("plants_owner_idx").on(t.ownerId),
    check("plants_design_capacity_ck", sql`${t.designCapacity} > 0`),
    check(
      "plants_actual_capacity_ck",
      sql`${t.actualCapacity} is null or ${t.actualCapacity} >= 0`,
    ),
  ],
);

export const plantIndicators = pgTable(
  "plant_indicators",
  {
    id: id(),
    ownerId: ownerId(),
    plantId: uuid("plant_id").notNull(),
    indicatorCode: text("indicator_code").references(() => indicators.code),
    userIndicatorId: uuid("user_indicator_id"),
    adopted: boolean("adopted").notNull().default(true),
  },
  (t) => [
    foreignKey({
      name: "plant_indicators_plant_fk",
      columns: [t.plantId, t.ownerId],
      foreignColumns: [plants.id, plants.ownerId],
    }).onDelete("cascade"),
    foreignKey({
      name: "plant_indicators_user_indicator_fk",
      columns: [t.userIndicatorId, t.ownerId],
      foreignColumns: [userIndicators.id, userIndicators.ownerId],
    }).onDelete("cascade"),
    check(
      "plant_indicators_indicator_ref_ck",
      exactlyOne("indicator_code", "user_indicator_id"),
    ),
    uniqueIndex("plant_indicators_system_uq")
      .on(t.plantId, t.indicatorCode)
      .where(sql`${t.indicatorCode} is not null`),
    uniqueIndex("plant_indicators_user_uq")
      .on(t.plantId, t.userIndicatorId)
      .where(sql`${t.userIndicatorId} is not null`),
  ],
);

// --- Current limits (one row per user per indicator) ---------------------------

export const indicatorLimits = pgTable(
  "indicator_limits",
  {
    id: id(),
    ownerId: ownerId(),
    indicatorCode: text("indicator_code").references(() => indicators.code),
    userIndicatorId: uuid("user_indicator_id"),
    kind: limitKind("kind").notNull(),
    target: doublePrecision("target"),
    warning: doublePrecision("warning"),
    critical: doublePrecision("critical"),
    minOk: doublePrecision("min_ok"),
    maxOk: doublePrecision("max_ok"),
    critMin: doublePrecision("crit_min"),
    critMax: doublePrecision("crit_max"),
    /** true = "no approved limits" for this indicator */
    none: boolean("none").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "indicator_limits_user_indicator_fk",
      columns: [t.userIndicatorId, t.ownerId],
      foreignColumns: [userIndicators.id, userIndicators.ownerId],
    }).onDelete("cascade"),
    check(
      "indicator_limits_indicator_ref_ck",
      exactlyOne("indicator_code", "user_indicator_id"),
    ),
    uniqueIndex("indicator_limits_system_uq")
      .on(t.ownerId, t.indicatorCode)
      .where(sql`${t.indicatorCode} is not null`),
    uniqueIndex("indicator_limits_user_uq")
      .on(t.ownerId, t.userIndicatorId)
      .where(sql`${t.userIndicatorId} is not null`),
  ],
);

// --- Assessments ----------------------------------------------------------------

export const assessments = pgTable(
  "assessments",
  {
    id: id(),
    ownerId: ownerId(),
    plantId: uuid("plant_id").notNull(),
    /** First day of the starting month. */
    periodStart: date("period_start").notNull(),
    months: integer("months").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    enteredBy: text("entered_by").notNull().default(""),
    status: assessmentStatus("status").notNull().default("draft"),
    /** Limits in force at approval, keyed by indicator ref. Results always use this. */
    limitsSnapshot: jsonb("limits_snapshot"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("assessments_id_owner_uq").on(t.id, t.ownerId),
    foreignKey({
      name: "assessments_plant_fk",
      columns: [t.plantId, t.ownerId],
      foreignColumns: [plants.id, plants.ownerId],
    }), // no cascade: a plant with assessments (drafts included) cannot be deleted
    unique("assessments_plant_period_uq").on(
      t.plantId,
      t.periodStart,
      t.months,
    ),
    check("assessments_months_ck", sql`${t.months} in (1, 3, 6, 9, 12)`),
    check(
      "assessments_period_start_ck",
      sql`extract(day from ${t.periodStart}) = 1`,
    ),
    check("assessments_dates_ck", sql`${t.endDate} >= ${t.startDate}`),
    check(
      "assessments_approved_ck",
      sql`${t.status} = 'draft' or (${t.approvedAt} is not null and ${t.limitsSnapshot} is not null)`,
    ),
    index("assessments_owner_idx").on(t.ownerId),
  ],
);

export const assessmentReadings = pgTable(
  "assessment_readings",
  {
    id: id(),
    ownerId: ownerId(),
    assessmentId: uuid("assessment_id").notNull(),
    indicatorCode: text("indicator_code").references(() => indicators.code),
    userIndicatorId: uuid("user_indicator_id"),
    inputs: jsonb("inputs")
      .$type<Record<string, string | number | null>>()
      .notNull()
      .default({}),
    /** Computed on the server at approval; never taken from the client. */
    value: doublePrecision("value"),
    status: readingStatus("status"),
    note: text("note").notNull().default(""),
  },
  (t) => [
    foreignKey({
      name: "assessment_readings_assessment_fk",
      columns: [t.assessmentId, t.ownerId],
      foreignColumns: [assessments.id, assessments.ownerId],
    }).onDelete("cascade"),
    foreignKey({
      name: "assessment_readings_user_indicator_fk",
      columns: [t.userIndicatorId, t.ownerId],
      foreignColumns: [userIndicators.id, userIndicators.ownerId],
    }),
    check(
      "assessment_readings_indicator_ref_ck",
      exactlyOne("indicator_code", "user_indicator_id"),
    ),
    uniqueIndex("assessment_readings_system_uq")
      .on(t.assessmentId, t.indicatorCode)
      .where(sql`${t.indicatorCode} is not null`),
    uniqueIndex("assessment_readings_user_uq")
      .on(t.assessmentId, t.userIndicatorId)
      .where(sql`${t.userIndicatorId} is not null`),
  ],
);

// --- Problems, obstacles, corrective actions ---------------------------------------

export const problems = pgTable(
  "problems",
  {
    id: id(),
    ownerId: ownerId(),
    assessmentId: uuid("assessment_id").notNull(),
    indicatorCode: text("indicator_code").references(() => indicators.code),
    userIndicatorId: uuid("user_indicator_id"),
    detectedOn: date("detected_on").notNull(),
    value: doublePrecision("value"),
    origin: problemOrigin("origin").notNull(),
    description: text("description").notNull().default(""),
    /** "Keep the obstacle only and prepare the report" */
    obstacleOnly: boolean("obstacle_only").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique("problems_id_owner_uq").on(t.id, t.ownerId),
    foreignKey({
      name: "problems_assessment_fk",
      columns: [t.assessmentId, t.ownerId],
      foreignColumns: [assessments.id, assessments.ownerId],
    }).onDelete("cascade"),
    foreignKey({
      name: "problems_user_indicator_fk",
      columns: [t.userIndicatorId, t.ownerId],
      foreignColumns: [userIndicators.id, userIndicators.ownerId],
    }),
    check(
      "problems_indicator_ref_ck",
      exactlyOne("indicator_code", "user_indicator_id"),
    ),
    // One problem per indicator per assessment (HANDOFF section 4).
    uniqueIndex("problems_system_uq")
      .on(t.assessmentId, t.indicatorCode)
      .where(sql`${t.indicatorCode} is not null`),
    uniqueIndex("problems_user_uq")
      .on(t.assessmentId, t.userIndicatorId)
      .where(sql`${t.userIndicatorId} is not null`),
    index("problems_owner_idx").on(t.ownerId),
  ],
);

export const customObstacles = pgTable(
  "custom_obstacles",
  {
    id: id(),
    ownerId: ownerId(),
    problemId: uuid("problem_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    rationale: text("rationale").notNull().default(""),
  },
  (t) => [
    unique("custom_obstacles_id_owner_uq").on(t.id, t.ownerId),
    foreignKey({
      name: "custom_obstacles_problem_fk",
      columns: [t.problemId, t.ownerId],
      foreignColumns: [problems.id, problems.ownerId],
    }).onDelete("cascade"),
  ],
);

export const problemObstacles = pgTable(
  "problem_obstacles",
  {
    id: id(),
    ownerId: ownerId(),
    problemId: uuid("problem_id").notNull(),
    // obstacle_ref: a system obstacle or a custom one
    obstacleCode: text("obstacle_code").references(() => obstacles.code),
    customObstacleId: uuid("custom_obstacle_id"),
    classification: obstacleClassification("classification").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [
    foreignKey({
      name: "problem_obstacles_problem_fk",
      columns: [t.problemId, t.ownerId],
      foreignColumns: [problems.id, problems.ownerId],
    }).onDelete("cascade"),
    foreignKey({
      name: "problem_obstacles_custom_obstacle_fk",
      columns: [t.customObstacleId, t.ownerId],
      foreignColumns: [customObstacles.id, customObstacles.ownerId],
    }).onDelete("cascade"),
    check(
      "problem_obstacles_obstacle_ref_ck",
      exactlyOne("obstacle_code", "custom_obstacle_id"),
    ),
    uniqueIndex("problem_obstacles_system_uq")
      .on(t.problemId, t.obstacleCode)
      .where(sql`${t.obstacleCode} is not null`),
    uniqueIndex("problem_obstacles_custom_uq")
      .on(t.problemId, t.customObstacleId)
      .where(sql`${t.customObstacleId} is not null`),
  ],
);

/** A system corrective action attached to a problem. chosen != implemented. */
export const problemActions = pgTable(
  "problem_actions",
  {
    id: id(),
    ownerId: ownerId(),
    problemId: uuid("problem_id").notNull(),
    actionCode: text("action_code")
      .notNull()
      .references(() => correctiveActions.code),
    chosen: boolean("chosen").notNull().default(false),
    needsStudy: boolean("needs_study").notNull().default(false),
    implementedOn: date("implemented_on"),
    linkedObstacleCode: text("linked_obstacle_code").references(
      () => obstacles.code,
    ),
    linkedCustomObstacleId: uuid("linked_custom_obstacle_id"),
  },
  (t) => [
    foreignKey({
      name: "problem_actions_problem_fk",
      columns: [t.problemId, t.ownerId],
      foreignColumns: [problems.id, problems.ownerId],
    }).onDelete("cascade"),
    foreignKey({
      name: "problem_actions_custom_obstacle_fk",
      columns: [t.linkedCustomObstacleId, t.ownerId],
      foreignColumns: [customObstacles.id, customObstacles.ownerId],
    }),
    check(
      "problem_actions_linked_obstacle_ck",
      atMostOne("linked_obstacle_code", "linked_custom_obstacle_id"),
    ),
    unique("problem_actions_problem_action_uq").on(t.problemId, t.actionCode),
    // Recording implementation requires the action to be chosen.
    check(
      "problem_actions_implemented_ck",
      sql`${t.implementedOn} is null or ${t.chosen}`,
    ),
  ],
);

/** A case-specific action written by the engineer. */
export const customActions = pgTable(
  "custom_actions",
  {
    id: id(),
    ownerId: ownerId(),
    problemId: uuid("problem_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    rationale: text("rationale").notNull().default(""),
    linkedObstacleCode: text("linked_obstacle_code").references(
      () => obstacles.code,
    ),
    linkedCustomObstacleId: uuid("linked_custom_obstacle_id"),
    chosen: boolean("chosen").notNull().default(false),
    needsStudy: boolean("needs_study").notNull().default(false),
    implementedOn: date("implemented_on"),
  },
  (t) => [
    foreignKey({
      name: "custom_actions_problem_fk",
      columns: [t.problemId, t.ownerId],
      foreignColumns: [problems.id, problems.ownerId],
    }).onDelete("cascade"),
    foreignKey({
      name: "custom_actions_custom_obstacle_fk",
      columns: [t.linkedCustomObstacleId, t.ownerId],
      foreignColumns: [customObstacles.id, customObstacles.ownerId],
    }),
    check(
      "custom_actions_linked_obstacle_ck",
      atMostOne("linked_obstacle_code", "linked_custom_obstacle_id"),
    ),
    check(
      "custom_actions_implemented_ck",
      sql`${t.implementedOn} is null or ${t.chosen}`,
    ),
  ],
);

// --- Audit trail -------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    ownerId: ownerId(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    payload: jsonb("payload").notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_entity_idx").on(t.ownerId, t.entity, t.entityId)],
);

// --- The signed-in user's own profile ---------------------------------------------------

/**
 * One row: the current user (drizzle/0002_auth_role.sql). The app role cannot read the
 * `users` table itself. Query inside withUser(); outside it the view is empty.
 * To change these fields call Better Auth (auth.api.updateUser), not SQL.
 */
export const myProfile = pgView("my_profile", {
  id: uuid("id").notNull(),
  fullName: text("full_name").notNull(),
  jobTitle: text("job_title").notNull(),
  email: text("email").notNull(),
  locale: text("locale").notNull(),
  theme: text("theme").notNull(),
}).existing();
