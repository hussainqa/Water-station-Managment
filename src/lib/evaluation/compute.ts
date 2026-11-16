import { parseNumber } from "./number";
import type {
  EvaluationResult,
  EvaluationSpec,
  InputErrors,
  InputState,
  Method,
  RawInputs,
} from "./types";

/** Required input keys per method (`unit` of duration is optional, so not listed). */
export const REQUIRED_INPUTS: Record<Method, readonly string[]> = {
  direct: ["value"],
  direct_percent: ["value"],
  duration: ["value"],
  ratio: ["numerator", "denominator"],
  // The engineer enters the average itself (client request, Nov 2026). Readings saved before
  // stored `total` and `count`; upgradeLegacyInputs turns those into `value`.
  average: ["value"],
};

/**
 * Readings of an average saved before it became a single entered value hold `total` and
 * `count`. When `value` is blank and both are valid (count a positive whole number), the
 * value is total / count; otherwise the inputs are returned unchanged.
 */
export function upgradeLegacyInputs(method: Method, raw: RawInputs): RawInputs {
  if (method !== "average" || parseNumber(raw.value) !== null) return raw;
  const total = parseNumber(raw.total);
  const count = parseNumber(raw.count);
  if (total === null || count === null || Number.isNaN(total) || Number.isNaN(count)) return raw;
  if (total < 0 || count <= 0 || !Number.isInteger(count)) return raw;
  return { ...raw, value: String(Number((total / count).toPrecision(12))) };
}

export function evaluateInputs(spec: EvaluationSpec, inputs: RawInputs): EvaluationResult {
  const { method } = spec;
  const rawInputs = upgradeLegacyInputs(method, inputs);
  const required = REQUIRED_INPUTS[method];
  const integerKeys = new Set(spec.integerInputs ?? []);

  const errors: InputErrors = {};
  const parsed: Record<string, number> = {};
  let filled = 0;

  for (const key of required) {
    const n = parseNumber(rawInputs[key]);
    if (n === null) continue;
    filled++;
    if (Number.isNaN(n)) errors[key] = "invalid_number";
    else if (n < 0) errors[key] = "negative";
    else if (integerKeys.has(key) && !Number.isInteger(n)) errors[key] = "not_integer";
    else if (method === "direct_percent" && key === "value" && n > 100) errors[key] = "out_of_range";
    else parsed[key] = n;
  }

  if (Object.keys(errors).length === 0 && method === "ratio") {
    const { numerator, denominator } = parsed;
    if (denominator === 0) errors.denominator = "zero_denominator";
    else if (numerator !== undefined && denominator !== undefined && numerator > denominator) {
      errors.numerator = "exceeds_denominator";
    }
  }

  let state: InputState;
  if (Object.keys(errors).length > 0) state = "error";
  else if (filled === required.length) state = "complete";
  else if (filled > 0) state = "partial";
  else state = "missing";

  let value: number | null = null;
  if (state === "complete") {
    value = calculate(method, parsed, rawInputs);
    if (value !== null && !Number.isFinite(value)) value = null;
  }
  return { state, errors, value };
}

function calculate(method: Method, p: Record<string, number>, raw: RawInputs): number | null {
  switch (method) {
    case "direct":
    case "direct_percent":
    case "average":
      return p.value;
    case "duration": {
      const unit = typeof raw.unit === "string" ? raw.unit.trim() : raw.unit;
      return unit === "min" ? p.value / 60 : p.value;
    }
    case "ratio":
      // Multiply first: (29 / 100) * 100 is 28.999999999999996, which would push a value
      // sitting exactly on a limit to the worse status.
      return (p.numerator * 100) / p.denominator;
  }
}

/** Server-side recompute: never trust a client-sent value. */
export function computeValue(method: Method, rawInputs: RawInputs): number | null {
  return evaluateInputs({ method }, rawInputs).value;
}
