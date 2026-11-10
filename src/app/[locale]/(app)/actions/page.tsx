import { setRequestLocale } from "next-intl/server";
import { ActionsLog } from "@/components/actions-log/actions-log";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/auth/session";
import { getFilters } from "@/lib/context/filters";
import { listActionLog } from "@/lib/problems/service";

export default async function Page({ params }: PageProps<"/[locale]/actions">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const filters = await getFilters();
  const { entries, hasAny } = await withUser(user.id, async (tx) => {
    const entries = await listActionLog(tx, user.id, {
      plantId: filters.plantId,
      range: filters.range,
      now: new Date(),
    });
    const hasAny =
      entries.length > 0 || (await listActionLog(tx, user.id, { range: "all", now: new Date() })).length > 0;
    return { entries, hasAny };
  });
  return <ActionsLog entries={entries} hasAny={hasAny} />;
}
