import { monthIndex } from "@/lib/assessments/schemas";
import type { ProblemStage } from "@/lib/problems/stage";

/** Pure rules of the dashboard. No I/O, no clock: `now` is the caller's concern. */

export type ApprovedRef = {
  id: string;
  plantId: string;
  /** 'YYYY-MM' or 'YYYY-MM-DD' */
  periodStart: string;
  months: number;
  /** ISO timestamp or epoch ms */
  approvedAt: string | number | null;
};

const at = (v: string | number | null) =>
  v === null ? 0 : typeof v === "number" ? v : new Date(v).getTime();

/** Month index of the last month of the period. */
export function endIndex(a: Pick<ApprovedRef, "periodStart" | "months">): number {
  return monthIndex(a.periodStart.slice(0, 7)) + a.months - 1;
}

/** "Period ends within the last N months, the current month counting as 1." */
export function endsInRange(
  a: Pick<ApprovedRef, "periodStart" | "months">,
  range: "all" | number,
  currentMonth: string,
): boolean {
  return range === "all" || endIndex(a) >= monthIndex(currentMonth) - range + 1;
}

/** latest end month; ties: the shortest length; then the latest approval. */
export function compareLatest(a: ApprovedRef, b: ApprovedRef): number {
  return endIndex(b) - endIndex(a) || a.months - b.months || at(b.approvedAt) - at(a.approvedAt);
}

/** The latest assessment of each plant (see compareLatest). Plants without one are absent. */
export function pickLatestPerPlant<T extends ApprovedRef>(list: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const a of list) {
    const cur = out.get(a.plantId);
    if (!cur || compareLatest(a, cur) < 0) out.set(a.plantId, a);
  }
  return out;
}

/** An alert stays on the list unless its problem is treated or documented. */
export function isHandled(stage: ProblemStage | null | undefined): boolean {
  return stage === "treated" || stage === "documented";
}

export function alertCompare(
  a: { status: "warning" | "critical"; plantOrder: number; indicatorOrder: number },
  b: { status: "warning" | "critical"; plantOrder: number; indicatorOrder: number },
): number {
  const s = (x: string) => (x === "critical" ? 0 : 1);
  return s(a.status) - s(b.status) || a.plantOrder - b.plantOrder || a.indicatorOrder - b.indicatorOrder;
}

/** Most recent first: approval time, or creation time for a draft. */
export function activityKey(i: { approvedAt: string | null; createdAt: string }): number {
  return new Date(i.approvedAt ?? i.createdAt).getTime();
}
