import { setRequestLocale } from "next-intl/server";
import { AssessmentsList } from "@/components/assessments/list/assessments-list";
import { withUser } from "@/db/with-user";
import { listAssessments, listLatestAssessments } from "@/lib/assessments/service";
import { requireUser } from "@/lib/auth/session";
import { getFilters } from "@/lib/context/filters";
import { getPlantOptions } from "@/lib/context/plants";

export default async function Page({ params }: PageProps<"/[locale]/assessments">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [filters, plants] = await Promise.all([getFilters(), getPlantOptions(user.id)]);
  const { items, hasAny } = await withUser(user.id, async (tx) => {
    const items = await listAssessments(tx, user.id, {
      plantId: filters.plantId,
      range: filters.range,
      now: new Date(),
    });
    const hasAny = items.length > 0 || (await listLatestAssessments(tx, user.id, 1)).length > 0;
    return { items, hasAny };
  });
  return <AssessmentsList items={items} hasAny={hasAny} hasPlants={plants.length > 0} />;
}
