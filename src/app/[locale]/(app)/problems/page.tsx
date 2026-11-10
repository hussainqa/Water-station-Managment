import { setRequestLocale } from "next-intl/server";
import { ProblemsList } from "@/components/problems/list/problems-list";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/auth/session";
import { getFilters } from "@/lib/context/filters";
import { listProblems } from "@/lib/problems/service";

export default async function Page({ params }: PageProps<"/[locale]/problems">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const filters = await getFilters();
  const { items, hasAny } = await withUser(user.id, async (tx) => {
    const items = await listProblems(tx, user.id, {
      plantId: filters.plantId,
      range: filters.range,
      now: new Date(),
    });
    const hasAny =
      items.length > 0 || (await listProblems(tx, user.id, { range: "all", now: new Date() })).length > 0;
    return { items, hasAny };
  });
  return <ProblemsList items={items} hasAny={hasAny} />;
}
