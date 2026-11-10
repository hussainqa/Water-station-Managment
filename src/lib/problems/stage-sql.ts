import { sql } from "drizzle-orm";

/**
 * SQL twin of `isOpenStage(deriveStage(...))` in ./stage.ts, for queries that count open
 * problems without loading them: a problem is OPEN when no action is chosen (system or
 * case-specific) and the "obstacle only" flag is not set. Keep the two in step.
 *
 * Use it in a query that has `problems` in its FROM clause under that name (RLS applies to
 * the sub-selects too). Column references are literal on purpose: Drizzle drops the table
 * name from columns in single-table selects, which would bind them to the inner table.
 * Imports no other module of this feature so the assessments service can use it.
 */
export const openProblemSql = sql`(
  not problems.obstacle_only
  and not exists (select 1 from problem_actions pa where pa.problem_id = problems.id and pa.chosen)
  and not exists (select 1 from custom_actions ca where ca.problem_id = problems.id and ca.chosen)
)`;
