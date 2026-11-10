import { setRequestLocale } from "next-intl/server";
import { PlantsView } from "@/components/plants/plants-view";
import type { PlantCardData } from "@/components/plants/plant-card";
import { periodLabel } from "@/components/assessments/results/helpers";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/auth/session";
import { getPlantPerformance } from "@/lib/assessments/service";
import { listPlants } from "@/lib/plants/service";
import { plantState } from "@/lib/plants/state";

export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]/plants">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const sp = await searchParams;
  const [rows, perf] = await withUser(user.id, async (tx) => [
    await listPlants(tx),
    await getPlantPerformance(tx, user.id),
  ] as const);
  const perfBy = new Map(perf.map((p) => [p.plantId, p]));

  const plants: PlantCardData[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    governorate: p.governorate,
    location: p.location,
    waterSource: p.waterSource,
    designCapacity: p.designCapacity,
    actualCapacity: p.actualCapacity,
    engineer: p.engineer,
    notes: p.notes,
    assessmentCount: p.assessmentCount,
    approvedCount: perfBy.get(p.id)?.approvedCount ?? 0,
    state: plantState(perfBy.get(p.id)?.summary ?? null),
    trend: perfBy.get(p.id)?.series ?? [],
    latest: perfBy.get(p.id)?.latest
      ? {
          id: perfBy.get(p.id)!.latest!.assessmentId,
          label: periodLabel(perfBy.get(p.id)!.latest!.periodStart, perfBy.get(p.id)!.latest!.months, locale),
        }
      : null,
  }));

  return <PlantsView plants={plants} openNew={sp.new === "1"} />;
}
