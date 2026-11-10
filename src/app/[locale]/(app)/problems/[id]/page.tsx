import { notFound } from "next/navigation";
import { ChevronLeft, Hourglass } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { eq } from "drizzle-orm";
import { periodLabel, formatNumber } from "@/components/assessments/results/helpers";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { assessments, plants, problems, userIndicators } from "@/db/schema/app";
import { indicators } from "@/db/schema/reference";
import { withUser } from "@/db/with-user";
import { Link } from "@/i18n/navigation";
import { idSchema } from "@/lib/assessments/schemas";
import { requireUser } from "@/lib/auth/session";
import { cn } from "cn";

/**
 * Placeholder of the problem page (the real page is Phase 4): the link target of the results
 * screens, with the few facts that are cheap to load.
 */
export default async function Page({ params }: PageProps<"/[locale]/problems/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) notFound();

  const row = await withUser(user.id, async (tx) => {
    const [p] = await tx
      .select({
        value: problems.value,
        origin: problems.origin,
        assessmentId: problems.assessmentId,
        code: problems.indicatorCode,
        sysAr: indicators.nameAr,
        sysEn: indicators.nameEn,
        usrAr: userIndicators.nameAr,
        usrEn: userIndicators.nameEn,
        plantName: plants.name,
        periodStart: assessments.periodStart,
        months: assessments.months,
      })
      .from(problems)
      .innerJoin(assessments, eq(assessments.id, problems.assessmentId))
      .innerJoin(plants, eq(plants.id, assessments.plantId))
      .leftJoin(indicators, eq(indicators.code, problems.indicatorCode))
      .leftJoin(userIndicators, eq(userIndicators.id, problems.userIndicatorId))
      .where(eq(problems.id, id));
    return p ?? null;
  });
  if (!row) notFound();

  const t = await getTranslations("assessments.problem");
  const indicatorName =
    locale === "en" ? (row.sysEn ?? row.usrEn ?? row.sysAr ?? row.usrAr) : (row.sysAr ?? row.usrAr);
  const period = periodLabel(row.periodStart.slice(0, 7), row.months, locale);

  return (
    <>
      <Link
        href={`/assessments/${row.assessmentId}`}
        className="mb-2 inline-flex items-center gap-1 text-[13.5px] font-medium text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
        {t("back")}
      </Link>
      <PageHeader title={t("title")} description={`${row.plantName} · ${period}`} />
      <section data-testid="problem-placeholder" className="mt-5 rounded-2xl border border-border bg-card shadow-(--shadow-card)">
        <dl className="m-0 grid grid-cols-2 gap-2.5 border-b border-border p-4 sm:grid-cols-4">
          <div className="rounded-xl bg-muted p-3">
            <dt className="text-[12px] text-fg-3">{t("plant")}</dt>
            <dd className="m-0 mt-1 text-[14px] font-semibold">{row.plantName}</dd>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <dt className="text-[12px] text-fg-3">{t("indicator")}</dt>
            <dd className="m-0 mt-1 text-[14px] font-semibold">{indicatorName ?? "—"}</dd>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <dt className="text-[12px] text-fg-3">{t("value")}</dt>
            <dd className="num m-0 mt-1 text-[14px] font-semibold">{formatNumber(row.value)}</dd>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <dt className="text-[12px] text-fg-3">{t("origin")}</dt>
            <dd className="m-0 mt-1 text-[14px] font-semibold">{row.origin === "manual" ? t("manual") : t("auto")}</dd>
          </div>
        </dl>
        <EmptyState
          icon={Hourglass}
          title={t("soonTitle")}
          text={t("soon")}
          action={
            <Link
              href={`/assessments/${row.assessmentId}`}
              className={cn(buttonVariants({ variant: "secondary" }), "h-10 rounded-[11px] px-4 text-[14px]")}
            >
              {t("toResults")}
            </Link>
          }
        />
      </section>
    </>
  );
}
