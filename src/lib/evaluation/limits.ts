import type { Limits } from "./types";

export type LimitsErrorCode = "not_finite" | "bad_order";

/** Returns null when valid, otherwise the list of error codes. */
export function validateLimits(limits: Limits): LimitsErrorCode[] | null {
  const nums =
    limits.kind === "range"
      ? [limits.critMin, limits.minOk, limits.maxOk, limits.critMax]
      : [limits.target, limits.warning, limits.critical];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return ["not_finite"];

  let ordered: boolean;
  switch (limits.kind) {
    case "higher":
      ordered = limits.critical < limits.warning && limits.warning <= limits.target;
      break;
    case "lower":
      ordered = limits.target <= limits.warning && limits.warning < limits.critical;
      break;
    case "range":
      ordered =
        limits.critMin < limits.minOk && limits.minOk < limits.maxOk && limits.maxOk < limits.critMax;
      break;
  }
  return ordered ? null : ["bad_order"];
}
