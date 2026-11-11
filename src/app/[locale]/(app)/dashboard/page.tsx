import { Factory, Plus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alerts } from "@/components/dashboard/alerts";
import { Breakdown } from "@/components/dashboard/breakdown";
import { LatestAssessments } from "@/components/dashboard/latest";
import { Tiles } from "@/components/dashboard/tiles";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { withUser } from "@/db/with-user";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";
import { getFilters } from "@/lib/context/filters";
import { getPlantOptions } from "@/lib/context/plants";
import { getDashboard } from "@/lib/dashboard/service";
import { cn } from "cn";

export default async function DashboardPage({
  params,
}: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, tShell, plants, filters] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("shell"),
    getPlantOptions(user.id),
    getFilters(),
  ]);

  if (plants.length === 0) {
    return (
      <>
        <PageHeader title={tShell("pages.dashboard")} />
        <section className="rounded-2xl border border-border bg-card shadow-(--shadow-card)">
          <EmptyState
            icon={Factory}
            title={tShell("dashboard.empty.title")}
            text={tShell("dashboard.empty.text")}
            action={
              <Link
                href="/plants?new=1"
                className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 rounded-[13px] px-5 text-[15px]")}
              >
                <Plus aria-hidden="true" className="size-[18px]" />
                {tShell("dashboard.empty.cta")}
              </Link>
            }
          />
        </section>
      </>
    );
  }

  const data = await withUser(user.id, (tx) =>
    getDashboard(tx, user.id, { plantId: filters.plantId, range: filters.range, now: new Date() }),
  );
  const range = tShell(`filters.range.${filters.range}`);
  const selected = filters.plantId ? plants.find((p) => p.id === filters.plantId) : null;
  const eyebrow = selected
    ? t("eyebrowOne", { plant: selected.name, range })
    : t("eyebrow", { plants: plants.length, range });

  return (
    <>
      <PageHeader
        title={tShell("pages.dashboard")}
        description={eyebrow}
        actions={
          <Link
            href="/assessments/new"
            data-testid="dashboard-new"
            className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 rounded-[13px] px-5 text-[15px]")}
          >
            <Plus aria-hidden="true" className="size-[18px]" />
            {t("newAssessment")}
          </Link>
        }
      />
      <div className="mt-5 flex flex-col gap-5">
        <Tiles tiles={data.tiles} />
        <Breakdown items={data.breakdown} />
        <Alerts alerts={data.alerts} />
        <LatestAssessments items={data.latest} />
      </div>
    </>
  );
}
