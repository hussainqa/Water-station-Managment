import type { Limits, PeriodMonths, Status } from "@/lib/evaluation";
import { isOpenStage, type ProblemStage } from "@/lib/problems/stage";
import type { AuditEntry, HistoryPoint, ResultRow } from "@/lib/assessments/types";

/**
 * Pure view helpers of the results screens: period labels, number text, callout order,
 * audit sentences, limit wording and the chart series. No I/O, no clock.
 */

const TIME_ZONE = "Asia/Baghdad";

const intlLocale = (locale: string) => (locale === "ar" ? "ar-IQ-u-nu-latn" : "en");

const monthFormats = new Map<string, Intl.DateTimeFormat>();
function monthFormat(locale: string, style: "long" | "short") {
  const key = `${locale}:${style}`;
  let f = monthFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale(locale), { month: style, timeZone: "UTC" });
    monthFormats.set(key, f);
  }
  return f;
}

/** 'YYYY-MM' -> { year, month (1-12) } */
export function parseMonthKey(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

export function addMonthsToKey(key: string, n: number): string {
  const { year, month } = parseMonthKey(key);
  const t = year * 12 + (month - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export function monthName(key: string, locale: string, style: "long" | "short" = "long"): string {
  const { year, month } = parseMonthKey(key);
  return monthFormat(locale, style).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** "أيلول 2026" for one month; "آذار – آب 2026" or "تشرين الثاني 2025 – كانون الثاني 2026" for a range. */
export function periodLabel(periodStart: string, months: number, locale: string): string {
  const end = addMonthsToKey(periodStart, Math.max(1, months) - 1);
  const ys = parseMonthKey(periodStart).year;
  const ye = parseMonthKey(end).year;
  if (months <= 1) return `${monthName(periodStart, locale)} ${ys}`;
  return ys === ye
    ? `${monthName(periodStart, locale)} – ${monthName(end, locale)} ${ye}`
    : `${monthName(periodStart, locale)} ${ys} – ${monthName(end, locale)} ${ye}`;
}

/** Short axis label: "Aug" or "Mar–Aug" (year appended by the chart when the series spans years). */
export function periodShortLabel(periodStart: string, months: number, locale: string): string {
  if (months <= 1) return monthName(periodStart, locale, "short");
  const end = addMonthsToKey(periodStart, months - 1);
  return `${monthName(periodStart, locale, "short")}–${monthName(end, locale, "short")}`;
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();
function dayFormat(locale: string) {
  let f = dayFormats.get(locale);
  if (!f) {
    // Day, month name, year: "6 أيلول 2026" / "6 September 2026". A month name cannot be read as
    // a day, and the Arabic reads naturally right to left (Western digits, like the rest).
    f = new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    dayFormats.set(locale, f);
  }
  return f;
}

/** A calendar day ('YYYY-MM-DD') as "6 أيلول 2026" / "6 September 2026"; empty gives an em dash. */
export function formatDate(day: string | null | undefined, locale: string): string {
  if (!day) return "—";
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return day;
  return dayFormat(locale).format(new Date(Date.UTC(y, m - 1, d)));
}

/** A timestamp in the app's time zone: "6 أيلول 2026 · 10:20" / "6 September 2026 · 10:20". */
export function formatDateTime(iso: string, locale: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${formatDate(`${p("year")}-${p("month")}-${p("day")}`, locale)} · ${p("hour")}:${p("minute")}`;
}

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, useGrouping: false });

/** Plain Latin-digit number; null/NaN gives an em dash. */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return nf.format(n);
}

/** `12.5%` for percentages; other units are appended by the caller (translated). */
export function formatPercentValue(n: number | null | undefined, unit: string): string {
  const s = formatNumber(n);
  return unit === "%" && s !== "—" ? `${s}%` : s;
}

// --- callouts ---------------------------------------------------------------------------------

const CALLOUT_ORDER: Status[] = ["critical", "warning"];

/** One callout per deviation: critical first, then warning; table order is kept inside each. */
export function calloutRows<T extends { status: Status }>(rows: readonly T[]): T[] {
  return CALLOUT_ORDER.flatMap((s) => rows.filter((r) => r.status === s));
}

/**
 * Splits the deviations into active callouts and handled ones: a deviation whose problem is
 * treated or documented is no longer an alert. Each part keeps the callout order.
 */
export function splitCallouts<T extends { status: Status; ref: string }>(
  rows: readonly T[],
  stages: Record<string, { stage: ProblemStage }>,
): { active: T[]; handled: T[] } {
  const all = calloutRows(rows);
  const isHandled = (r: T) => {
    const s = stages[r.ref]?.stage;
    return s !== undefined && !isOpenStage(s);
  };
  return { active: all.filter((r) => !isHandled(r)), handled: all.filter(isHandled) };
}

// --- change vs previous period ----------------------------------------------------------------

export type ChangeView = {
  direction: "up" | "down" | "flat";
  /** how the move is judged */
  judgement: "improved" | "worsened" | "unchanged";
  /** absolute difference */
  delta: number;
};

export function changeView(row: Pick<ResultRow, "value" | "previousValue" | "change">): ChangeView | null {
  if (!row.change || row.value === null || row.previousValue === null) return null;
  const diff = row.value - row.previousValue;
  return {
    direction: Math.abs(diff) < 1e-9 ? "flat" : diff > 0 ? "up" : "down",
    judgement: row.change,
    delta: Math.abs(diff),
  };
}

// --- limits wording ---------------------------------------------------------------------------

export type Phrase = { key: string; values: Record<string, string> };

export type LimitsText = {
  target: Phrase;
  warning: Phrase;
  critical: Phrase;
};

/** Message keys (under assessments.limit.*) and values that describe the snapshot limits. */
export function describeLimits(limits: Limits, unit: string): LimitsText {
  const f = (n: number) => formatPercentValue(n, unit);
  if (limits.kind === "higher") {
    return {
      target: { key: "targetHigher", values: { v: f(limits.target) } },
      warning: { key: "below", values: { v: f(limits.warning) } },
      critical: { key: "below", values: { v: f(limits.critical) } },
    };
  }
  if (limits.kind === "lower") {
    return {
      target: { key: "targetLower", values: { v: f(limits.target) } },
      warning: { key: "above", values: { v: f(limits.warning) } },
      critical: { key: "above", values: { v: f(limits.critical) } },
    };
  }
  return {
    target: { key: "targetRange", values: { min: f(limits.minOk), max: f(limits.maxOk) } },
    warning: { key: "outside", values: { min: f(limits.minOk), max: f(limits.maxOk) } },
    critical: { key: "outside", values: { min: f(limits.critMin), max: f(limits.critMax) } },
  };
}

/** The limit a deviation crossed: the warning limit for a warning, the critical one for a critical. */
export function crossedLimit(limits: Limits | null, status: Status, unit: string): Phrase | null {
  if (!limits || (status !== "warning" && status !== "critical")) return null;
  const d = describeLimits(limits, unit);
  return status === "critical" ? d.critical : d.warning;
}

// --- audit trail ------------------------------------------------------------------------------

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Translates an audit action code and its payload into a message key (assessments.audit.*)
 * and values. `nameOf` resolves an indicator ref to its display name. Unknown codes fall
 * back to the generic "unknown" sentence, never to the raw code.
 */
export function describeAudit(
  entry: Pick<AuditEntry, "action" | "payload" | "actor">,
  nameOf: (ref: string) => string,
): Phrase {
  const p = entry.payload ?? {};
  switch (entry.action) {
    case "draft_created":
      return { key: "draft_created", values: {} };
    case "draft_deleted":
      return { key: "draft_deleted", values: {} };
    case "readings_entered":
      return { key: "readings_entered", values: { count: String(int(p.count)), enteredBy: str(p.enteredBy, entry.actor) } };
    case "missing_data_acknowledged":
      return { key: "missing_data_acknowledged", values: { count: String(int(p.count)) } };
    case "approved":
      return {
        key: "approved",
        values: {
          indicators: String(int(p.indicators)),
          ok: String(int(p.ok)),
          warning: String(int(p.warning)),
          critical: String(int(p.critical)),
          problems: String(int(p.problems)),
        },
      };
    case "note_changed":
      return { key: "note_changed", values: { indicator: nameOf(str(p.ref)) } };
    case "problem_opened_auto":
      return { key: "problem_opened_auto", values: { indicator: nameOf(str(p.ref)) } };
    case "problem_opened_manual":
      return { key: "problem_opened_manual", values: { indicator: nameOf(str(p.ref)) } };
    default:
      return { key: "unknown", values: {} };
  }
}

// --- history chart ----------------------------------------------------------------------------

export type ChartRow = {
  id: string;
  /** axis label */
  label: string;
  /** long label for the table and tooltip */
  full: string;
  value: number | null;
  status: Status | null;
  /** reference lines of the SNAPSHOT of that assessment (null where they do not apply) */
  warnA: number | null;
  warnB: number | null;
  critA: number | null;
  critB: number | null;
};

export type ChartData = {
  rows: ChartRow[];
  withValue: number;
  /** the limits have more than one shape over time (lines drawn as steps) */
  hasLimits: boolean;
  isRange: boolean;
};

/** Points oldest to newest. Labels carry a 2-digit year when the series spans calendar years. */
export function shapeHistory(points: readonly HistoryPoint[], locale: string): ChartData {
  const years = new Set(points.map((p) => parseMonthKey(p.periodStart).year));
  const multi = years.size > 1;
  const rows = points.map((p): ChartRow => {
    const l = p.limits;
    let warnA: number | null = null;
    let warnB: number | null = null;
    let critA: number | null = null;
    let critB: number | null = null;
    if (l?.kind === "range") {
      warnA = l.minOk;
      warnB = l.maxOk;
      critA = l.critMin;
      critB = l.critMax;
    } else if (l) {
      warnA = l.warning;
      critA = l.critical;
    }
    const short = periodShortLabel(p.periodStart, p.months as PeriodMonths, locale);
    const yy = String(parseMonthKey(p.periodStart).year).slice(2);
    return {
      id: p.assessmentId,
      label: multi ? `${short} ${yy}` : short,
      full: periodLabel(p.periodStart, p.months, locale),
      value: p.value,
      status: p.status,
      warnA,
      warnB,
      critA,
      critB,
    };
  });
  return {
    rows,
    withValue: rows.filter((r) => r.value !== null).length,
    hasLimits: points.some((p) => p.limits !== null),
    isRange: points.some((p) => p.limits?.kind === "range"),
  };
}

/** Y-axis domain with a little room; percentages stay inside 0-100. */
export function chartDomain(data: ChartData, unit: string): [number, number] {
  const nums = data.rows.flatMap((r) =>
    [r.value, r.warnA, r.warnB, r.critA, r.critB].filter((n): n is number => n !== null),
  );
  if (!nums.length) return [0, 1];
  let lo = Math.min(...nums);
  let hi = Math.max(...nums);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  if (unit === "%") {
    lo = Math.max(0, lo);
    hi = Math.min(100, hi);
  } else if (lo < 0 && Math.min(...nums) >= 0) lo = 0;
  return [Math.floor(lo * 10) / 10, Math.ceil(hi * 10) / 10];
}

// --- calculation text -------------------------------------------------------------------------

export type CalcView =
  | { key: "direct"; values: { value: string } }
  | { key: "ratio"; values: { numerator: string; denominator: string; value: string } }
  | { key: "average"; values: { total: string; count: string; value: string } }
  | { key: "duration"; values: { raw: string; unit: "h" | "min"; value: string } }
  | { key: "none"; values: Record<string, never> };

/** Writes the calculation out with the recorded inputs; "none" when there is no value or the inputs are missing. */
export function calculationView(row: Pick<ResultRow, "method" | "inputs" | "value" | "unit">): CalcView {
  if (row.value === null) return { key: "none", values: {} };
  const i = row.inputs;
  const n = (k: string) => (i[k] === null || i[k] === undefined || i[k] === "" ? null : Number(i[k]));
  const value = formatPercentValue(row.value, row.unit);
  switch (row.method) {
    case "direct":
    case "direct_percent":
      return { key: "direct", values: { value } };
    case "ratio": {
      const a = n("numerator");
      const b = n("denominator");
      if (a === null || b === null) return { key: "none", values: {} };
      return { key: "ratio", values: { numerator: formatNumber(a), denominator: formatNumber(b), value } };
    }
    case "average": {
      // entered directly; readings approved before that keep their total ÷ count
      if (n("value") !== null) return { key: "direct", values: { value } };
      const a = n("total");
      const b = n("count");
      if (a === null || b === null) return { key: "none", values: {} };
      return { key: "average", values: { total: formatNumber(a), count: formatNumber(b), value } };
    }
    case "duration": {
      const raw = n("value");
      if (raw === null) return { key: "none", values: {} };
      return {
        key: "duration",
        values: { raw: formatNumber(raw), unit: i.unit === "min" ? "min" : "h", value },
      };
    }
    default:
      return { key: "none", values: {} };
  }
}
