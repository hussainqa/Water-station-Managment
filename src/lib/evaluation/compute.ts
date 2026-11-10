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
  average: ["total", "count"],
};

export function evaluateInputs(spec: EvaluationSpec, rawInputs: RawInputs): EvaluationResult {
  const { method } = spec;
  const required = REQUIRED_INPUTS[method];
  const integerKeys = new Set(spec.integerInputs ?? []);
  if (method === "average") integerKeys.add("count");

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

  if (Object.keys(errors).length === 0) {
    if (method === "ratio") {
      const { numerator, denominator } = parsed;
      if (denominator === 0) errors.denominator = "zero_denominator";
      else if (numerator !== undefined && denominator !== undefined && numerator > denominator) {
        errors.numerator = "exceeds_denominator";
      }
    } else if (method === "average" && parsed.count === 0) {
      errors.count = "zero_count";
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
      return p.value;
    case "duration": {
      const unit = typeof raw.unit === "string" ? raw.unit.trim() : raw.unit;
      return unit === "min" ? p.value / 60 : p.value;
    }
    case "ratio":
      return (p.numerator / p.denominator) * 100;
    case "average":
      return p.total / p.count;
  }
}

/** Server-side recompute: never trust a client-sent value. */
export function computeValue(method: Method, rawInputs: RawInputs): number | null {
  return evaluateInputs({ method }, rawInputs).value;
}
