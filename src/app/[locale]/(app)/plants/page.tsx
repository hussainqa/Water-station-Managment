import { setRequestLocale } from "next-intl/server";
import { PlantsView } from "@/components/plants/plants-view";
import type { PlantCardData } from "@/components/plants/plant-card";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/auth/session";
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
  const rows = await withUser(user.id, (tx) => listPlants(tx));

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
    // Phase 3 passes the latest approved assessment's summary here
    state: plantState(null),
    trend: [],
  }));

  return <PlantsView plants={plants} openNew={sp.new === "1"} />;
}
