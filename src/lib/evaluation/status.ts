import type { Better, Limits, Status } from "./types";

/** All comparisons are strict: a value exactly on a limit gets the better status. */
export function statusOf(
  value: number | null | undefined,
  limits: Limits | null | undefined,
): Status {
  if (value === null || value === undefined || Number.isNaN(value)) return "insufficient_data";
  if (!limits) return "no_limits";
  switch (limits.kind) {
    case "higher":
      if (value < limits.critical) return "critical";
      if (value < limits.warning) return "warning";
      return "ok";
    case "lower":
      if (value > limits.critical) return "critical";
      if (value > limits.warning) return "warning";
      return "ok";
    case "range":
      if (value < limits.critMin || value > limits.critMax) return "critical";
      if (value < limits.minOk || value > limits.maxOk) return "warning";
      return "ok";
  }
}

export type ChangeDirection = "improved" | "worsened" | "unchanged";

const EPSILON = 1e-9;

/**
 * Compare current to previous. `limitsOrBetter` is a direction ('higher'/'lower')
 * or the indicator's limits (range compares distance to the midpoint of the OK band).
 * Returns null when either value is missing or the direction is unknown.
 */
export function changeDirection(
  current: number | null | undefined,
  previous: number | null | undefined,
  limitsOrBetter: Limits | Better | null | undefined,
): ChangeDirection | null {
  if (current == null || previous == null || Number.isNaN(current) || Number.isNaN(previous)) {
    return null;
  }
  if (!limitsOrBetter) return null;
  const delta = current - previous;
  if (Math.abs(delta) < EPSILON) return "unchanged";

  const kind = typeof limitsOrBetter === "string" ? limitsOrBetter : limitsOrBetter.kind;
  if (kind === "higher") return delta > 0 ? "improved" : "worsened";
  if (kind === "lower") return delta < 0 ? "improved" : "worsened";
  if (typeof limitsOrBetter === "string") return null;
  if (limitsOrBetter.kind !== "range") return null;
  const mid = (limitsOrBetter.minOk + limitsOrBetter.maxOk) / 2;
  const dCur = Math.abs(current - mid);
  const dPrev = Math.abs(previous - mid);
  if (Math.abs(dCur - dPrev) < EPSILON) return "unchanged";
  return dCur < dPrev ? "improved" : "worsened";
}
