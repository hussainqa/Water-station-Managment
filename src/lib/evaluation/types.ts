import { z } from "zod";

export const METHODS = ["direct", "direct_percent", "duration", "ratio", "average"] as const;
export const methodSchema = z.enum(METHODS);
export type Method = z.infer<typeof methodSchema>;

export const BETTER = ["higher", "lower"] as const;
export const betterSchema = z.enum(BETTER);
export type Better = z.infer<typeof betterSchema>;

export const LIMIT_KINDS = ["higher", "lower", "range"] as const;
export const limitKindSchema = z.enum(LIMIT_KINDS);
export type LimitKind = z.infer<typeof limitKindSchema>;

export const STATUSES = ["ok", "warning", "critical", "insufficient_data", "no_limits"] as const;
export const statusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof statusSchema>;

export const INPUT_STATES = ["complete", "partial", "missing", "error"] as const;
export const inputStateSchema = z.enum(INPUT_STATES);
export type InputState = z.infer<typeof inputStateSchema>;

export const PERIOD_MONTHS = [1, 3, 6, 9, 12] as const;
export const periodMonthsSchema = z.union([
  z.literal(1),
  z.literal(3),
  z.literal(6),
  z.literal(9),
  z.literal(12),
]);
export type PeriodMonths = z.infer<typeof periodMonthsSchema>;

/** Raw form value for one input key. */
export type RawInputValue = string | number | null | undefined;
export type RawInputs = Record<string, RawInputValue>;

export type InputErrorCode =
  | "invalid_number"
  | "negative"
  | "not_integer"
  | "out_of_range"
  | "exceeds_denominator"
  | "zero_denominator";

export type InputErrors = Record<string, InputErrorCode>;

export interface EvaluationSpec {
  method: Method;
  /** Input keys that must be integers. */
  integerInputs?: readonly string[];
}

export interface EvaluationResult {
  state: InputState;
  errors: InputErrors;
  value: number | null;
}

const finite = z.number().refine(Number.isFinite, "must be finite");

export const limitsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("higher"),
    target: finite,
    warning: finite,
    critical: finite,
  }),
  z.object({
    kind: z.literal("lower"),
    target: finite,
    warning: finite,
    critical: finite,
  }),
  z.object({
    kind: z.literal("range"),
    critMin: finite,
    minOk: finite,
    maxOk: finite,
    critMax: finite,
  }),
]);
export type Limits = z.infer<typeof limitsSchema>;

/** indicatorRef -> approved limits at the time (null = no approved limits). */
export const limitsSnapshotSchema = z.record(z.string(), limitsSchema.nullable());
export type LimitsSnapshot = z.infer<typeof limitsSnapshotSchema>;
