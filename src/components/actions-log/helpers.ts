import type { ActionLogEntry } from "@/lib/problems/types";

export type LogFilter = "all" | "chosen" | "implemented" | "needsStudy";
export const LOG_FILTERS: readonly LogFilter[] = ["all", "chosen", "implemented", "needsStudy"];

type Flags = Pick<ActionLogEntry, "chosen" | "needsStudy" | "implementedOn">;

export function matchesFilter(e: Flags, f: LogFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "chosen":
      return e.chosen && !e.implementedOn;
    case "implemented":
      return !!e.implementedOn;
    case "needsStudy":
      return e.needsStudy;
  }
}

export function filterLog<T extends Flags>(list: readonly T[], f: LogFilter): T[] {
  return list.filter((e) => matchesFilter(e, f));
}

export function logCounts(list: readonly Flags[]): Record<LogFilter, number> {
  const out = { all: list.length, chosen: 0, implemented: 0, needsStudy: 0 };
  for (const e of list) {
    for (const f of ["chosen", "implemented", "needsStudy"] as const) if (matchesFilter(e, f)) out[f]++;
  }
  return out;
}
