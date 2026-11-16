import {
  addMonths,
  defaultPeriodDates,
  evaluateInputs,
  parseNumber,
  periodEndMonth,
  type EvaluationResult,
  type InputState,
  type PeriodMonths,
} from "@/lib/evaluation";
import { lastSelectableStart, validatePeriod, type FieldErrors } from "@/lib/assessments/schemas";
import type { DraftDto, WizardGroup, WizardIndicator } from "@/lib/assessments/types";

/** Pure helpers of the new-assessment wizard (no clock: `now` is always a parameter). */

export type Raw = Record<string, string>;
export type ReadingState = { inputs: Raw; note: string };
export type Details = {
  plantId: string;
  periodStart: string;
  months: PeriodMonths;
  startDate: string;
  endDate: string;
  enteredBy: string;
};

export const STEPS = [1, 2, 3, 4] as const;
export type Step = (typeof STEPS)[number];
export const PERIOD_CHOICES: PeriodMonths[] = [1, 3, 6, 9, 12];

/** Start months a period of this length may begin at: its END month is not after the current month. Latest first. */
export function monthOptions(months: number, now: Date, count = 24): string[] {
  const latest = lastSelectableStart(months, now);
  return Array.from({ length: count }, (_, i) => addMonths(latest, -i));
}

/** "أيلول 2026" / "September 2026" (Western digits). */
export function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ-u-nu-latn" : "en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function periodLabel(start: string, months: number, locale: string): string {
  if (months === 1) return monthLabel(start, locale);
  return `${monthLabel(start, locale)} – ${monthLabel(periodEndMonth(start, months), locale)}`;
}

/** Default details for a new assessment: latest allowed monthly period, whole-period dates. */
export function defaultDetails(plantId: string, enteredBy: string, now: Date): Details {
  const periodStart = lastSelectableStart(1, now);
  return { plantId, periodStart, months: 1, enteredBy, ...defaultPeriodDates(periodStart, 1) };
}

/** Changes length and/or start month; dates follow the period again. Start is pulled back if the new length would end in the future. */
export function withPeriod(
  d: Details,
  patch: { months?: PeriodMonths; periodStart?: string },
  now: Date,
): Details {
  const months = patch.months ?? d.months;
  let periodStart = patch.periodStart ?? d.periodStart;
  const latest = lastSelectableStart(months, now);
  if (periodStart > latest) periodStart = latest;
  return { ...d, months, periodStart, ...defaultPeriodDates(periodStart, months) };
}

/** Step 1 rules (period + dates from the server's validatePeriod, plus plant and entered-by). */
export function detailsErrors(d: Details, now: Date): FieldErrors {
  const errors: FieldErrors = {};
  if (!d.plantId) errors.plantId = "invalidPlant";
  if (!d.enteredBy.trim()) errors.enteredBy = "required";
  const p = validatePeriod(d, now);
  if (!p.ok) Object.assign(errors, p.fieldErrors);
  return errors;
}

export function allIndicators(groups: WizardGroup[]): WizardIndicator[] {
  return groups.flatMap((g) => g.indicators);
}

export type CheckState = "all" | "some" | "none";
export function groupCheckState(group: WizardGroup, selected: ReadonlySet<string>): CheckState {
  const n = group.indicators.filter((i) => selected.has(i.ref)).length;
  return n === 0 ? "none" : n === group.indicators.length ? "all" : "some";
}

/** Toggles a whole group: anything but "all" selects the whole group, "all" clears it. */
export function toggleGroup(group: WizardGroup, selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  const all = groupCheckState(group, selected) === "all";
  for (const i of group.indicators) {
    if (all) next.delete(i.ref);
    else next.add(i.ref);
  }
  return next;
}

export function emptyReading(ind: WizardIndicator): ReadingState {
  const inputs: Raw = {};
  for (const f of ind.inputs) inputs[f.key] = "";
  if (ind.method === "duration") inputs.unit = "h";
  return { inputs, note: "" };
}

/** Stored (server) reading -> editable strings. */
export function readingFromServer(
  ind: WizardIndicator,
  stored: Record<string, string | number | null>,
  note: string,
): ReadingState {
  const r = emptyReading(ind);
  for (const k of Object.keys(r.inputs)) {
    const v = stored[k];
    if (v !== null && v !== undefined) r.inputs[k] = String(v);
  }
  if (ind.method === "duration" && r.inputs.unit !== "min") r.inputs.unit = "h";
  return { inputs: r.inputs, note };
}

export function evalReading(ind: WizardIndicator, inputs: Raw): EvaluationResult {
  return evaluateInputs(
    { method: ind.method, integerInputs: ind.inputs.filter((f) => f.integer).map((f) => f.key) },
    inputs,
  );
}

/** Up to one decimal, two when the value is below 1; Western digits, no grouping. */
export function formatValue(n: number): string {
  const digits = Math.abs(n) < 1 && !Number.isInteger(n) ? 2 : 1;
  return Number(n.toFixed(digits)).toString();
}

function operand(raw: string): string {
  const n = parseNumber(raw);
  return n === null || Number.isNaN(n) ? raw : Number(n.toFixed(6)).toString();
}

/**
 * The calculation written out with the entered numbers, e.g. "676 ÷ 720 × 100 = 93.9 %".
 * Null until the reading is complete and valid. `unit` is the display unit of the value.
 */
export function formulaText(
  method: WizardIndicator["method"],
  inputs: Raw,
  value: number | null,
  unit: string,
  minLabel = "min",
): string | null {
  if (value === null) return null;
  const v = formatValue(value);
  const u = unit ? ` ${unit}` : "";
  switch (method) {
    case "direct":
    case "direct_percent":
    case "average":
      return `${operand(inputs.value ?? "")} = ${v}${u}`;
    case "duration":
      return inputs.unit === "min"
        ? `${operand(inputs.value ?? "")} ${minLabel} ÷ 60 = ${v}${u}`
        : `${operand(inputs.value ?? "")}${u} = ${v}${u}`;
    case "ratio":
      return `${operand(inputs.numerator ?? "")} ÷ ${operand(inputs.denominator ?? "")} × 100 = ${v}${u}`;
  }
}

export type Evaluated = { ind: WizardIndicator; reading: ReadingState; result: EvaluationResult };

export function evaluateAll(
  selected: WizardIndicator[],
  readings: Record<string, ReadingState>,
): Evaluated[] {
  return selected.map((ind) => {
    const reading = readings[ind.ref] ?? emptyReading(ind);
    return { ind, reading, result: evalReading(ind, reading.inputs) };
  });
}

export type Counts = Record<InputState, number>;
export function countStates(rows: Evaluated[]): Counts {
  const c: Counts = { complete: 0, partial: 0, missing: 0, error: 0 };
  for (const r of rows) c[r.result.state]++;
  return c;
}

/** Step 4: errors block; incomplete indicators need the acknowledgement; at least one complete value. */
export function canApprove(c: Counts, acknowledged: boolean): boolean {
  const incomplete = c.partial + c.missing;
  return c.error === 0 && c.complete > 0 && (incomplete === 0 || acknowledged);
}

/** Where to reopen a draft when the URL gives no step. */
type ResumeInfo = Pick<DraftDto, "selection"> & Partial<Pick<DraftDto, "readings">>;

/** True once the engineer has typed at least one reading or note. */
function hasEnteredReadings(draft: ResumeInfo): boolean {
  return (draft.readings ?? []).some(
    (r) =>
      (r.note ?? "").trim() !== "" ||
      Object.entries(r.inputs ?? {}).some(
        ([key, v]) => key !== "unit" && v !== null && String(v).trim() !== "",
      ),
  );
}

/**
 * Where a resumed draft opens. New drafts are pre-selected, so a selection alone does
 * not mean step 2 was reviewed: open the readings step only once readings exist.
 */
export function resumeStep(draft: ResumeInfo): Step {
  if (draft.selection.length === 0) return 2;
  return hasEnteredReadings(draft) ? 3 : 2;
}

/** Furthest step a draft may be opened at from the URL. */
export function clampStep(requested: number | null, draft: ResumeInfo | null): Step {
  if (!draft) return 1;
  const max: Step = draft.selection.length === 0 ? 2 : 4;
  if (requested === null || !Number.isInteger(requested) || requested < 1) return resumeStep(draft);
  return Math.min(requested, max) as Step;
}
