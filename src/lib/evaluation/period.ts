import type { PeriodMonths, Status } from "./types";

/** 'YYYY-MM' */
export type MonthKey = string;

function parseKey(key: MonthKey): { y: number; m: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid month key: ${key}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) throw new Error(`Invalid month key: ${key}`);
  return { y, m };
}

function toKey(index: number): MonthKey {
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

function toIndex(key: MonthKey): number {
  const { y, m } = parseKey(key);
  return y * 12 + (m - 1);
}

export function addMonths(key: MonthKey, n: number): MonthKey {
  return toKey(toIndex(key) + n);
}

/** Last month included in the period: start + months - 1. */
export function periodEndMonth(startKey: MonthKey, months: number): MonthKey {
  return addMonths(startKey, months - 1);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function defaultPeriodDates(
  startKey: MonthKey,
  months: PeriodMonths | number,
): { startDate: string; endDate: string } {
  const end = parseKey(periodEndMonth(startKey, months));
  const start = parseKey(startKey);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    startDate: `${String(start.y).padStart(4, "0")}-${pad(start.m)}-01`,
    endDate: `${String(end.y).padStart(4, "0")}-${pad(end.m)}-${pad(daysInMonth(end.y, end.m))}`,
  };
}

export interface CurrentPeriod {
  plantId: string;
  periodStart: MonthKey;
  months: number;
}

export interface AssessmentCandidate extends CurrentPeriod {
  id: string;
  status: "draft" | "approved";
}

export function findPreviousAssessment<T extends AssessmentCandidate>(
  current: CurrentPeriod,
  candidates: readonly T[],
): T | undefined {
  const currentStart = toIndex(current.periodStart);
  let best: T | undefined;
  let bestEnd = -Infinity;
  for (const c of candidates) {
    if (c.status !== "approved") continue;
    if (c.plantId !== current.plantId || c.months !== current.months) continue;
    const end = toIndex(periodEndMonth(c.periodStart, c.months));
    if (end >= currentStart) continue;
    if (end > bestEnd) {
      best = c;
      bestEnd = end;
    }
  }
  return best;
}

export function shouldAutoOpenProblem(status: Status): boolean {
  return status === "critical";
}

export function canOpenManualProblem(status: Status): boolean {
  return status === "warning" || status === "critical";
}
