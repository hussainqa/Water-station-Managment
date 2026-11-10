import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/auth/session";
import { getFilters } from "@/lib/context/filters";
import { getPlantOptions } from "@/lib/context/plants";
import { countOpenProblems } from "@/lib/problems/service";

export default async function AppLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [plants, filters, openProblems] = await Promise.all([
    getPlantOptions(user.id),
    getFilters(),
    withUser(user.id, (tx) => countOpenProblems(tx, user.id)),
  ]);

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        jobTitle: user.jobTitle ?? "",
        theme: user.theme ?? "system",
      }}
      plants={plants}
      plantId={filters.plantId}
      range={filters.range}
      openProblems={openProblems}
    >
      {children}
    </AppShell>
  );
}
