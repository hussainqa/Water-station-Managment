import * as z from "zod";
import {
  periodMonthsSchema,
  addMonths,
  defaultPeriodDates,
  periodEndMonth,
  type PeriodMonths,
} from "@/lib/evaluation";
import { formatRef, parseRef } from "@/lib/indicators/ref";

/**
 * Shared by the server actions, the service and the client forms. Messages and error
 * codes are translation keys (assessments.errors.<code>), never display text.
 * Nothing here reads the clock: `now` is always a parameter.
 */

export type FieldErrors = Record<string, string>;

/** Time zone that decides "the current month" (the app serves Iraq). */
export const APP_TIME_ZONE = "Asia/Baghdad";

export const NOTE_MAX = 2000;
export const ENTERED_BY_MAX = 200;
export const INPUT_VALUE_MAX = 64;

// --- error codes ----------------------------------------------------------------------

export type AssessmentErrorCode =
  | "validation"
  | "futurePeriod"
  | "plantNotFound"
  | "notFound"
  | "duplicate"
  | "overlap"
  | "alreadyApproved"
  | "notApproved"
  | "indicatorNotAdopted"
  | "readingNotSelected"
  | "noIndicatorsSelected"
  | "inputErrors"
  | "missingData"
  | "readingNotFound"
  | "notEligible"
  | "problemExists"
  | "generic";

export type ConflictingAssessment = {
  id: string;
  status: "draft" | "approved";
  /** 'YYYY-MM' */
  periodStart: string;
  months: number;
};

/** Every way a service function or action can fail, with the data the UI needs. */
export type AssessmentFailure =
  | { ok: false; error: "validation"; fieldErrors: FieldErrors }
  | { ok: false; error: "futurePeriod"; fieldErrors?: FieldErrors }
  | { ok: false; error: "duplicate" | "overlap"; conflict?: ConflictingAssessment }
  | {
      ok: false;
      error: "indicatorNotAdopted" | "readingNotSelected" | "inputErrors" | "missingData";
      /** indicator refs ("sys:SC-01" / "usr:<uuid>") that caused the failure */
      refs: string[];
    }
  | { ok: false; error: "problemExists"; problemId?: string }
  | {
      ok: false;
      error:
        | "plantNotFound"
        | "notFound"
        | "alreadyApproved"
        | "notApproved"
        | "noIndicatorsSelected"
        | "readingNotFound"
        | "notEligible"
        | "generic";
    };

export type AssessmentResult<T> = { ok: true; data: T } | AssessmentFailure;

export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

// --- period (pure) ----------------------------------------------------------------------

const MONTH_RE = /^(20\d{2})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isMonthKey(s: unknown): s is string {
  return typeof s === "string" && MONTH_RE.test(s);
}

export function isRealDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

/** 'YYYY-MM-DD' of `now` in the app time zone. */
export function dateKeyOf(now: Date, timeZone: string = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 'YYYY-MM' of `now` in the app time zone. */
export function monthKeyOf(now: Date, timeZone: string = APP_TIME_ZONE): string {
  return dateKeyOf(now, timeZone).slice(0, 7);
}

/** 'YYYY-MM' -> months since year 0 (for comparisons). */
export function monthIndex(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return y * 12 + (m - 1);
}

export const monthKeySchema = z.string().regex(MONTH_RE, { message: "invalidMonth" });

const monthsInput = z.union([
  periodMonthsSchema,
  z
    .string()
    .trim()
    .transform((s) => Number(s))
    .pipe(periodMonthsSchema),
]);

const optionalDate = z
  .string()
  .nullish()
  .transform((s) => (s ? s.trim() : null));

export const assessmentDetailsSchema = z.object({
  plantId: z.uuid({ message: "invalidPlant" }),
  /** 'YYYY-MM' */
  periodStart: monthKeySchema,
  months: monthsInput,
  /** 'YYYY-MM-DD'; omitted/blank = the first day of the period */
  startDate: optionalDate,
  /** 'YYYY-MM-DD'; omitted/blank = the last day of the period */
  endDate: optionalDate,
  enteredBy: z.string().trim().max(ENTERED_BY_MAX, { message: "tooLong" }).default(""),
});
export type AssessmentDetailsInput = z.input<typeof assessmentDetailsSchema>;

export type AssessmentDetails = {
  plantId: string;
  periodStart: string;
  months: PeriodMonths;
  /** 'YYYY-MM-DD' */
  startDate: string;
  endDate: string;
  enteredBy: string;
};

export type PeriodCheck =
  | { ok: true; startDate: string; endDate: string }
  | { ok: false; error: "validation" | "futurePeriod"; fieldErrors: FieldErrors };

/**
 * Period rules: the END month (start + length - 1) may not be after the current month;
 * dates default from the period, stay inside it and stay ordered. Pure: `now` is injected.
 */
export function validatePeriod(
  p: {
    periodStart: string;
    months: number;
    startDate?: string | null;
    endDate?: string | null;
  },
  now: Date,
): PeriodCheck {
  if (!isMonthKey(p.periodStart)) {
    return { ok: false, error: "validation", fieldErrors: { periodStart: "invalidMonth" } };
  }
  const end = periodEndMonth(p.periodStart, p.months);
  if (monthIndex(end) > monthIndex(monthKeyOf(now))) {
    return { ok: false, error: "futurePeriod", fieldErrors: { periodStart: "futurePeriod" } };
  }
  const defaults = defaultPeriodDates(p.periodStart, p.months);
  const startDate = p.startDate || defaults.startDate;
  const endDate = p.endDate || defaults.endDate;
  const fieldErrors: FieldErrors = {};
  if (!isRealDate(startDate)) fieldErrors.startDate = "invalidDate";
  else if (startDate < defaults.startDate || startDate > defaults.endDate) {
    fieldErrors.startDate = "outsidePeriod";
  }
  if (!isRealDate(endDate)) fieldErrors.endDate = "invalidDate";
  else if (endDate < defaults.startDate || endDate > defaults.endDate) {
    fieldErrors.endDate = "outsidePeriod";
  }
  if (!fieldErrors.startDate && !fieldErrors.endDate && endDate < startDate) {
    fieldErrors.endDate = "beforeStart";
  }
  if (Object.keys(fieldErrors).length) return { ok: false, error: "validation", fieldErrors };
  return { ok: true, startDate, endDate };
}

/** Zod shape + period rules in one call. The service runs this on every write. */
export function validateDetails(
  input: unknown,
  now: Date,
):
  | { ok: true; data: AssessmentDetails }
  | Extract<AssessmentFailure, { error: "validation" | "futurePeriod" }> {
  const parsed = assessmentDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const v = parsed.data;
  const period = validatePeriod(v, now);
  if (!period.ok) return period;
  return {
    ok: true,
    data: {
      plantId: v.plantId,
      periodStart: v.periodStart,
      months: v.months,
      startDate: period.startDate,
      endDate: period.endDate,
      enteredBy: v.enteredBy,
    },
  };
}

/** Next month a period of this length could start at, for UI defaults. */
export function lastSelectableStart(months: number, now: Date): string {
  return addMonths(monthKeyOf(now), -(months - 1));
}

// --- selection / readings ---------------------------------------------------------------

const refString = z.string().transform((s, ctx) => {
  const r = parseRef(s);
  if (!r) {
    ctx.addIssue({ code: "custom", message: "invalidRef" });
    return z.NEVER;
  }
  return formatRef(r);
});

export const selectionSchema = z.object({
  id: z.uuid({ message: "invalidId" }),
  refs: z
    .array(refString)
    .max(500)
    .transform((a) => [...new Set(a)]),
});
export type SelectionInput = z.input<typeof selectionSchema>;

const rawInputValue = z.union([
  z.string().max(INPUT_VALUE_MAX, { message: "tooLong" }),
  z.number(),
  z.null(),
]);

/**
 * One reading as sent by the browser. Only `inputs` and `note` are read: unknown keys
 * (a client-computed `value` or `status`) are stripped here and ignored by the service.
 */
export const readingPayloadSchema = z.object({
  inputs: z.record(z.string().max(32), rawInputValue),
  note: z.string().max(NOTE_MAX, { message: "tooLong" }).optional(),
});
export type ReadingPayload = z.infer<typeof readingPayloadSchema>;

export const readingsSchema = z.object({
  id: z.uuid({ message: "invalidId" }),
  readings: z
    .record(z.string(), readingPayloadSchema)
    .transform((rec, ctx) => {
      const out: Record<string, ReadingPayload> = {};
      for (const [key, v] of Object.entries(rec)) {
        const r = parseRef(key);
        if (!r) {
          ctx.addIssue({ code: "custom", message: "invalidRef", path: [key] });
          return z.NEVER;
        }
        out[formatRef(r)] = v;
      }
      return out;
    }),
});
export type ReadingsInput = z.input<typeof readingsSchema>;

export const approveSchema = z.object({
  id: z.uuid({ message: "invalidId" }),
  acknowledgeMissing: z.boolean().default(false),
});
export type ApproveInput = z.input<typeof approveSchema>;

export const noteSchema = z.object({
  id: z.uuid({ message: "invalidId" }),
  ref: refString,
  note: z.string().max(NOTE_MAX, { message: "tooLong" }),
});
export type NoteInput = z.input<typeof noteSchema>;

export const idSchema = z.uuid({ message: "invalidId" });

export const historyQuerySchema = z.object({
  plantId: z.uuid({ message: "invalidPlant" }),
  ref: refString,
  months: monthsInput,
});
export type HistoryQueryInput = z.input<typeof historyQuerySchema>;

export const openProblemSchema = z.object({
  id: z.uuid({ message: "invalidId" }),
  ref: refString,
});
