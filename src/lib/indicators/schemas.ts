import * as z from "zod";
import {
  REQUIRED_INPUTS,
  betterSchema,
  limitsSchema,
  methodSchema,
  parseNumber,
  validateLimits,
  type Limits,
  type LimitKind,
  type Method,
} from "@/lib/evaluation";
import { parseGroupKey, refSchema, type GroupKey } from "./ref";

/**
 * Shared by the server actions and the client forms. Messages are translation
 * codes (indicators.errors.<code>), never display text.
 */

export type FieldErrors = Record<string, string>;

export type ErrorCode =
  | "validation"
  | "notFound"
  | "plantNotFound"
  | "inUse"
  | "hasIndicators"
  | "methodLocked"
  | "generic";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: ErrorCode; fieldErrors?: FieldErrors };

export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String);
    const key = path[0] === "labels" && path[1] ? `labels.${path[1]}` : (path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

// --- limits -------------------------------------------------------------------------

export type LimitsErrorCode =
  | "incomplete"
  | "notNumber"
  | "badOrderHigher"
  | "badOrderLower"
  | "badOrderRange"
  | "outOfPercentRange";

export const LIMIT_FIELDS: Record<LimitKind, readonly string[]> = {
  higher: ["target", "warning", "critical"],
  lower: ["target", "warning", "critical"],
  range: ["minOk", "maxOk", "critMin", "critMax"],
};

/** Turns the raw text fields of the limits form into `Limits`, or says what is wrong. */
export function parseLimitsForm(
  kind: LimitKind,
  raw: Record<string, string | undefined>,
): { ok: true; limits: Limits } | { ok: false; error: LimitsErrorCode } {
  const nums: Record<string, number> = {};
  let incomplete = false;
  for (const f of LIMIT_FIELDS[kind]) {
    const n = parseNumber(raw[f]);
    if (n === null) incomplete = true;
    else if (Number.isNaN(n)) return { ok: false, error: "notNumber" };
    else nums[f] = n;
  }
  if (incomplete) return { ok: false, error: "incomplete" };
  const limits: Limits =
    kind === "range"
      ? { kind, minOk: nums.minOk, maxOk: nums.maxOk, critMin: nums.critMin, critMax: nums.critMax }
      : { kind, target: nums.target, warning: nums.warning, critical: nums.critical };
  return { ok: true, limits };
}

/** Ordering (via validateLimits) plus the 0-100 bound of a direct percentage. */
export function checkLimits(limits: Limits, method: Method): LimitsErrorCode | null {
  const bad = validateLimits(limits);
  if (bad) {
    if (bad[0] === "not_finite") return "notNumber";
    return limits.kind === "higher"
      ? "badOrderHigher"
      : limits.kind === "lower"
        ? "badOrderLower"
        : "badOrderRange";
  }
  if (method === "direct_percent") {
    const nums =
      limits.kind === "range"
        ? [limits.critMin, limits.minOk, limits.maxOk, limits.critMax]
        : [limits.target, limits.warning, limits.critical];
    if (nums.some((n) => n < 0 || n > 100)) return "outOfPercentRange";
  }
  return null;
}

export const saveLimitsInputSchema = z.object({
  ref: refSchema,
  none: z.boolean(),
  limits: limitsSchema.optional(),
});
export type SaveLimitsInput = z.input<typeof saveLimitsInputSchema>;

// --- indicator form -----------------------------------------------------------------

export const NAME_MAX = 200;
export const DESCRIPTION_MAX = 1000;
export const UNIT_MAX = 40;

const labelPair = z.object({ ar: z.string(), en: z.string() });

export const indicatorFormSchema = z
  .object({
    nameAr: z.string(),
    nameEn: z.string(),
    description: z.string(),
    /** "sys:<code>" | "usr:<uuid>" | "new" */
    group: z.string(),
    newGroupAr: z.string(),
    newGroupEn: z.string(),
    method: methodSchema,
    better: betterSchema,
    unit: z.string(),
    labels: z.record(z.string(), labelPair),
    adoptAll: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    const nameAr = v.nameAr.trim();
    if (!nameAr) add(["nameAr"], "nameRequired");
    else if (nameAr.length > NAME_MAX) add(["nameAr"], "tooLong");
    if (v.nameEn.trim().length > NAME_MAX) add(["nameEn"], "tooLong");
    if (v.description.trim().length > DESCRIPTION_MAX) add(["description"], "tooLong");

    if (v.group === "new") {
      const g = v.newGroupAr.trim();
      if (!g) add(["newGroupAr"], "groupNameRequired");
      else if (g.length > NAME_MAX) add(["newGroupAr"], "tooLong");
      if (v.newGroupEn.trim().length > NAME_MAX) add(["newGroupEn"], "tooLong");
    } else if (!parseGroupKey(v.group)) {
      add(["group"], "groupInvalid");
    }

    if (v.method === "direct" || v.method === "average") {
      const unit = v.unit.trim();
      if (!unit) add(["unit"], "unitRequired");
      else if (unit.length > UNIT_MAX) add(["unit"], "tooLong");
    }

    for (const key of REQUIRED_INPUTS[v.method]) {
      const label = v.labels[key];
      if (!label || !label.ar.trim()) add(["labels", key, "ar"], "labelRequired");
      else if (label.ar.trim().length > NAME_MAX || label.en.trim().length > NAME_MAX) {
        add(["labels", key, "ar"], "tooLong");
      }
    }
  })
  .transform((v) => {
    const fixedUnit =
      v.method === "ratio" || v.method === "direct_percent"
        ? "%"
        : v.method === "duration"
          ? "h"
          : v.unit.trim();
    const inputLabels: Record<string, { ar: string; en: string }> = {};
    for (const key of REQUIRED_INPUTS[v.method]) {
      const ar = v.labels[key].ar.trim();
      inputLabels[key] = { ar, en: v.labels[key].en.trim() || ar };
    }
    const group:
      | { kind: "existing"; key: GroupKey }
      | { kind: "new"; nameAr: string; nameEn: string | null } =
      v.group === "new"
        ? { kind: "new", nameAr: v.newGroupAr.trim(), nameEn: v.newGroupEn.trim() || null }
        : { kind: "existing", key: parseGroupKey(v.group) as GroupKey };
    return {
      nameAr: v.nameAr.trim(),
      nameEn: v.nameEn.trim() || null,
      description: v.description.trim() || null,
      group,
      method: v.method,
      better: v.better,
      unit: fixedUnit,
      inputLabels,
      adoptAll: v.adoptAll,
    };
  });

export type IndicatorFormInput = z.input<typeof indicatorFormSchema>;
export type IndicatorFormData = z.output<typeof indicatorFormSchema>;

export const groupNameSchema = z
  .object({ nameAr: z.string(), nameEn: z.string() })
  .superRefine((v, ctx) => {
    const ar = v.nameAr.trim();
    if (!ar) ctx.addIssue({ code: "custom", path: ["nameAr"], message: "groupNameRequired" });
    else if (ar.length > NAME_MAX) ctx.addIssue({ code: "custom", path: ["nameAr"], message: "tooLong" });
    if (v.nameEn.trim().length > NAME_MAX) {
      ctx.addIssue({ code: "custom", path: ["nameEn"], message: "tooLong" });
    }
  })
  .transform((v) => ({ nameAr: v.nameAr.trim(), nameEn: v.nameEn.trim() || null }));
export type GroupNameInput = z.input<typeof groupNameSchema>;

export const adoptionInputSchema = z.object({
  plantId: z.uuid(),
  ref: refSchema,
  adopted: z.boolean(),
});
