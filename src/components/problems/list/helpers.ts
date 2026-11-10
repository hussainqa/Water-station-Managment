import type { ProblemListItem, ProblemStage } from "@/lib/problems/types";

/** Splits the (already ordered) list into the open and the handled section, keeping order. */
export function sectionProblems<T extends Pick<ProblemListItem, "open">>(
  items: readonly T[],
): { open: T[]; handled: T[] } {
  return { open: items.filter((i) => i.open), handled: items.filter((i) => !i.open) };
}

/** Stages in display order (open first). */
export const STAGE_ORDER: readonly ProblemStage[] = [
  "awaiting_obstacles",
  "choosing_action",
  "treated",
  "documented",
];
