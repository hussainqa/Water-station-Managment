import { ClipboardList, Factory, Plus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AssessmentRow } from "@/components/assessments/list/assessment-row";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { withUser } from "@/db/with-user";
import { Link } from "@/i18n/navigation";
import { listLatestAssessments } from "@/lib/assessments/service";
import { requireUser } from "@/lib/auth/session";
import { getPlantOptions } from "@/lib/context/plants";
import { cn } from "cn";

export default async function DashboardPage({
  params,
}: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [t, plants] = await Promise.all([
    getTranslations("shell"),
    getPlantOptions(user.id),
  ]);

  const latest = plants.length
    ? await withUser(user.id, (tx) => listLatestAssessments(tx, user.id, 5))
    : [];

  return (
    <>
      <PageHeader title={t("pages.dashboard")} />
      <section className="rounded-2xl border border-border bg-card shadow-(--shadow-card)">
        {plants.length === 0 ? (
          <EmptyState
            icon={Factory}
            title={t("dashboard.empty.title")}
            text={t("dashboard.empty.text")}
            action={
              <Link
                href="/plants?new=1"
                className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 rounded-[13px] px-5 text-[15px]")}
              >
                <Plus aria-hidden="true" className="size-[18px]" />
                {t("dashboard.empty.cta")}
              </Link>
            }
          />
        ) : latest.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t("dashboard.latest.empty.title")}
            text={t("dashboard.latest.empty.text")}
            action={
              <Link
                href="/assessments/new"
                className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 rounded-[13px] px-5 text-[15px]")}
              >
                <Plus aria-hidden="true" className="size-[18px]" />
                {t("dashboard.latest.empty.cta")}
              </Link>
            }
          />
        ) : (
          <div data-testid="latest-assessments" className="p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-[17px] font-bold">{t("dashboard.latest.title")}</h2>
                <p className="m-0 mt-0.5 text-[13px] text-fg-3">{t("dashboard.latest.text")}</p>
              </div>
              <Link href="/assessments" className="text-[13.5px] font-semibold text-primary underline-offset-4 hover:underline">
                {t("dashboard.latest.all")}
              </Link>
            </div>
            <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
              {latest.map((i) => (
                <AssessmentRow key={i.id} item={i} compact />
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
