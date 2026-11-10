import { dateKeyOf } from "@/lib/assessments/schemas";
import type { Limits } from "@/lib/evaluation";

/**
 * Pure rules of the problems feature: the derived status of a problem, the ordering of
 * selected obstacles, the implementation-date rule and the limit a reading crossed.
 * No I/O, no clock: `now` is always a parameter.
 *
 * The status is DERIVED, never stored (owner decision):
 *   any chosen action (system or custom)        -> treated
 *   else the "obstacle only" flag is set        -> documented
 *   else at least one obstacle is selected      -> choosing_action
 *   else                                        -> awaiting_obstacles
 * A problem is OPEN while it is awaiting_obstacles or choosing_action.
 */

export const PROBLEM_STAGES = [
  "awaiting_obstacles",
  "choosing_action",
  "documented",
  "treated",
] as const;
export type ProblemStage = (typeof PROBLEM_STAGES)[number];

export const OPEN_STAGES: readonly ProblemStage[] = ["awaiting_obstacles", "choosing_action"];

export type StageInput = {
  /** selected obstacles, system + unlisted */
  obstacleCount: number;
  /** chosen actions, system + case-specific */
  chosenActionCount: number;
  obstacleOnly: boolean;
};

export function deriveStage(i: StageInput): ProblemStage {
  if (i.chosenActionCount > 0) return "treated";
  if (i.obstacleOnly) return "documented";
  if (i.obstacleCount > 0) return "choosing_action";
  return "awaiting_obstacles";
}

export function isOpenStage(stage: ProblemStage): boolean {
  return stage === "awaiting_obstacles" || stage === "choosing_action";
}

// --- ordering of selected obstacles (and so of the suggestions) --------------------------------

export type Classification = "confirmed" | "possible";

export type OrderableObstacle = {
  kind: "system" | "custom";
  classification: Classification;
  /** system obstacles only */
  axisIdx?: number | null;
  seqInAxis?: number | null;
  /** stable tie-break for unlisted obstacles (their name, then id) */
  sortKey?: string;
};

/**
 * Confirmed before possible; within each, system obstacles in axis order then source
 * order, and unlisted obstacles after the system ones. Returns a new array.
 */
export function orderSelectedObstacles<T extends OrderableObstacle>(list: readonly T[]): T[] {
  const cls = (c: Classification) => (c === "confirmed" ? 0 : 1);
  return [...list].sort((a, b) => {
    if (cls(a.classification) !== cls(b.classification)) {
      return cls(a.classification) - cls(b.classification);
    }
    if (a.kind !== b.kind) return a.kind === "system" ? -1 : 1;
    if (a.kind === "system") {
      return (
        (a.axisIdx ?? 0) - (b.axisIdx ?? 0) ||
        (a.seqInAxis ?? 0) - (b.seqInAxis ?? 0)
      );
    }
    const ka = a.sortKey ?? "";
    const kb = b.sortKey ?? "";
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** Linked actions of one obstacle by `rank` (ascending). Returns a new array. */
export function orderByRank<T extends { rank: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.rank - b.rank);
}

// --- implementation date -----------------------------------------------------------------------

export type DateCheck = "ok" | "invalid" | "future" | "beforeDetected";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateKey(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * The actual implementation date: a real 'YYYY-MM-DD' date, not after today in Baghdad
 * (relative to `now`) and not before the day the problem was detected.
 */
export function checkImplementationDate(date: string, detectedOn: string, now: Date): DateCheck {
  if (!isValidDateKey(date)) return "invalid";
  if (date > dateKeyOf(now)) return "future";
  if (date < detectedOn) return "beforeDetected";
  return "ok";
}

// --- the limit a reading crossed ---------------------------------------------------------------

export type LimitCrossed = {
  status: "warning" | "critical";
  /** the limit value from the assessment's limits snapshot */
  limit: number;
  /** for range limits: which end was crossed; null for one-sided limits */
  side: "min" | "max" | null;
};

export function limitCrossed(
  limits: Limits | null | undefined,
  status: string | null | undefined,
  value: number | null | undefined,
): LimitCrossed | null {
  if (!limits || value === null || value === undefined) return null;
  if (status !== "warning" && status !== "critical") return null;
  if (limits.kind === "higher" || limits.kind === "lower") {
    return { status, limit: status === "critical" ? limits.critical : limits.warning, side: null };
  }
  if (status === "critical") {
    return value < limits.critMin
      ? { status, limit: limits.critMin, side: "min" }
      : { status, limit: limits.critMax, side: "max" };
  }
  return value < limits.minOk
    ? { status, limit: limits.minOk, side: "min" }
    : { status, limit: limits.maxOk, side: "max" };
}
