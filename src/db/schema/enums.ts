import { pgEnum } from "drizzle-orm/pg-core";

// Values match src/lib/evaluation/types.ts. Keep the two in sync.
export const indicatorMethod = pgEnum("indicator_method", [
  "direct",
  "direct_percent",
  "duration",
  "ratio",
  "average",
]);
export const betterDirection = pgEnum("better_direction", ["higher", "lower"]);
export const limitKind = pgEnum("limit_kind", ["higher", "lower", "range"]);
export const readingStatus = pgEnum("reading_status", [
  "ok",
  "warning",
  "critical",
  "insufficient_data",
  "no_limits",
]);
export const assessmentStatus = pgEnum("assessment_status", [
  "draft",
  "approved",
]);
export const problemOrigin = pgEnum("problem_origin", ["auto", "manual"]);
export const obstacleClassification = pgEnum("obstacle_classification", [
  "confirmed",
  "possible",
]);
