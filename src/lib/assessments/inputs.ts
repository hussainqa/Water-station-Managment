import { REQUIRED_INPUTS, type Method, type RawInputs } from "@/lib/evaluation";
import type { InputLabels } from "@/db/schema/reference";

/**
 * Pure rules about the raw inputs of one indicator: which keys exist, which must be
 * whole numbers, and how a payload is reduced to the keys that are stored.
 */

export const DURATION_UNITS = ["h", "min"] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

/** Counting inputs of the system indicators (prototype: `int` flags). */
const SYSTEM_INTEGER_INPUTS: Record<string, readonly string[]> = {
  "SC-03": ["value"],
  "WQ-01": ["value"],
  "WQ-04": ["value"],
  "CS-01": ["value"],
  "WQ-02": ["numerator", "denominator"],
  "WQ-03": ["numerator", "denominator"],
  "CS-02": ["numerator", "denominator"],
  "CS-03": ["numerator", "denominator"],
};

/**
 * Input keys that must be integers. `count` of an average is always one (evaluateInputs
 * adds it). User-defined indicators have no integer inputs besides that.
 */
export function integerInputKeys(code: string | null, method: Method): string[] {
  void method;
  return code ? [...(SYSTEM_INTEGER_INPUTS[code] ?? [])] : [];
}

/** The keys stored per reading: the method's required inputs, plus `unit` for a duration. */
export function storedInputKeys(method: Method): string[] {
  return method === "duration" ? [...REQUIRED_INPUTS.duration, "unit"] : [...REQUIRED_INPUTS[method]];
}

export type InputDef = {
  key: string;
  labelAr: string;
  labelEn: string;
  integer: boolean;
  /** Only the duration input: the units the engineer may pick (stored value is in hours). */
  unitChoices: readonly DurationUnit[] | null;
};

export function inputDefs(
  method: Method,
  code: string | null,
  labels: InputLabels,
): InputDef[] {
  const ints = new Set(integerInputKeys(code, method));
  if (method === "average") ints.add("count");
  return REQUIRED_INPUTS[method].map((key) => ({
    key,
    labelAr: labels[key]?.ar ?? key,
    labelEn: labels[key]?.en ?? labels[key]?.ar ?? key,
    integer: ints.has(key),
    unitChoices: method === "duration" && key === "value" ? DURATION_UNITS : null,
  }));
}

/**
 * Reduces whatever the client sent to the stored shape: only known keys, every key
 * present (null when absent), a duration unit of 'h' or 'min' (default 'h').
 * Never keeps a `value` or `status`.
 */
export function sanitizeInputs(
  method: Method,
  raw: Record<string, unknown> | null | undefined,
): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const key of storedInputKeys(method)) {
    const v = raw?.[key];
    if (key === "unit") {
      out.unit = typeof v === "string" && v.trim() === "min" ? "min" : "h";
    } else if (typeof v === "string" || (typeof v === "number" && Number.isFinite(v))) {
      out[key] = v;
    } else {
      out[key] = null;
    }
  }
  return out;
}

export function asRawInputs(stored: unknown): RawInputs {
  return stored && typeof stored === "object" ? (stored as RawInputs) : {};
}
