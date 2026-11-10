/**
 * Pure helpers for the plant card. No I/O, safe for client and unit tests.
 */

export type PlantStateKey = "stable" | "warnings" | "review" | "notAssessed";

/** What Phase 3 feeds from the latest approved assessment of a plant. */
export type LatestAssessmentSummary = {
  critical: number;
  warning: number;
  /** open problems of this plant */
  openProblems: number;
} | null;

/** Mirrors the prototype's stationState(). */
export function plantState(latest: LatestAssessmentSummary | undefined): PlantStateKey {
  if (!latest) return "notAssessed";
  if (latest.openProblems > 0) return "review";
  if (latest.critical > 0 || latest.warning > 0) return "warnings";
  return "stable";
}

/** actual / design as a percentage, or null when it cannot be computed. */
export function utilisation(
  actual: number | null | undefined,
  design: number | null | undefined,
): number | null {
  if (actual === null || actual === undefined) return null;
  if (!design || design <= 0) return null;
  return (actual / design) * 100;
}

/** Case-insensitive match on name, location, governorate label and engineer. */
export function matchesPlant(
  query: string,
  fields: readonly (string | null | undefined)[],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.join(" ").toLowerCase().includes(q);
}
