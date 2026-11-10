import { setRequestLocale } from "next-intl/server";
import { IndicatorsView } from "@/components/indicators/indicators-view";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/auth/session";
import { getFilters } from "@/lib/context/filters";
import { getPlantOptions } from "@/lib/context/plants";
import { listIndicatorsForUser } from "@/lib/indicators/service";

export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]/indicators">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [plants, filters, sp] = await Promise.all([
    getPlantOptions(user.id),
    getFilters(),
    searchParams,
  ]);

  // ?plant= (the picker on this page) wins over the plant chosen in the top bar.
  const asked = typeof sp.plant === "string" ? sp.plant : undefined;
  const plantId = plants.some((p) => p.id === asked) ? (asked as string) : filters.plantId;

  const data = await withUser(user.id, (tx) => listIndicatorsForUser(tx, user.id, plantId));
  return <IndicatorsView data={data} plants={plants} plantId={plantId} />;
}
