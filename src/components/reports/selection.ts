import type { ReportOptions } from "@/lib/reports/types";

export type ReportType = "period" | "history";
export type Selection = {
  plantId: string;
  type: ReportType;
  assessmentId: string | null;
  months: number | null;
};

type Plant = ReportOptions["plants"][number];

export const defaultMonths = (plant: Plant | undefined): number | null =>
  plant ? (plant.lengths.includes(1) ? 1 : (plant.lengths[0] ?? null)) : null;

/** Fills the selection for a plant: newest assessment, monthly (or the first length the plant has). */
export function selectionForPlant(options: ReportOptions, plantId: string, type: ReportType): Selection {
  const plant = options.plants.find((p) => p.id === plantId);
  return {
    plantId,
    type,
    assessmentId: plant?.assessments[0]?.id ?? null,
    months: defaultMonths(plant),
  };
}

/**
 * Starting selection from the URL (/reports?assessment=<id> or ?plant=<id>&type=history&months=3),
 * the top-bar plant and the plants the user has. Unknown ids fall back; nothing is trusted.
 */
export function resolveSelection(
  options: ReportOptions,
  params: { assessment?: string; plant?: string; type?: string; months?: string },
  topBarPlantId: string | null,
): Selection | null {
  if (!options.plants.length) return null;
  const byAssessment = params.assessment
    ? options.plants.find((p) => p.assessments.some((a) => a.id === params.assessment))
    : undefined;
  if (byAssessment) {
    return { ...selectionForPlant(options, byAssessment.id, "period"), assessmentId: params.assessment ?? null };
  }
  const plant =
    options.plants.find((p) => p.id === params.plant) ??
    options.plants.find((p) => p.id === topBarPlantId) ??
    options.plants.find((p) => p.assessments.length) ??
    options.plants[0];
  const type: ReportType = params.type === "history" ? "history" : "period";
  const sel = selectionForPlant(options, plant.id, type);
  const m = Number(params.months);
  if (type === "history" && plant.lengths.includes(m as never)) sel.months = m;
  return sel;
}

export function reportQuery(sel: Selection, lang: string): string | null {
  if (sel.type === "period") {
    return sel.assessmentId ? `type=period&assessment=${sel.assessmentId}&lang=${lang}` : null;
  }
  return sel.months ? `type=history&plant=${sel.plantId}&months=${sel.months}&lang=${lang}` : null;
}

/** The shareable page URL of a selection. */
export function pageQuery(sel: Selection): string {
  return sel.type === "period"
    ? sel.assessmentId
      ? `?assessment=${sel.assessmentId}`
      : `?plant=${sel.plantId}`
    : `?plant=${sel.plantId}&type=history${sel.months ? `&months=${sel.months}` : ""}`;
}
