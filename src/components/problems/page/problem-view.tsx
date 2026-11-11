"use client";

import { ChevronLeft, CircleCheck, ClipboardCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { periodLabel } from "@/components/assessments/results/helpers";
import { useRowText } from "@/components/assessments/results/row-text";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { setObstacleOnlyAction } from "@/lib/problems/actions";
import type { ProblemDto, ReferenceCatalog } from "@/lib/problems/types";
import { ActionsSection } from "./actions-section";
import { AuditTrail } from "./audit-trail";
import { StageChip } from "./bits";
import { ProblemFacts } from "./facts";
import { ObstaclesSection } from "./obstacles-section";
import { ProblemProvider, useProblem } from "./problem-context";

function Banner() {
  const t = useTranslations("problems.banner");
  const tReports = useTranslations("reports.links");
  const { problem, mutate } = useProblem();
  if (problem.open) return null;
  const treated = problem.stage === "treated";
  const Icon = treated ? CircleCheck : ClipboardCheck;
  return (
    <div
      role="status"
      data-testid="done-banner"
      data-stage={problem.stage}
      className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-ok/30 bg-ok-soft p-3.5 text-ok"
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <p className="m-0 min-w-0 flex-1 basis-60 text-[14px] font-medium">{treated ? t("treated") : t("documented")}</p>
      {!treated && problem.obstacleOnly ? (
        <Button
          type="button"
          data-testid="obstacle-only-undo"
          variant="outline"
          onClick={() =>
            mutate({ t: "obstacleOnly", value: false }, () =>
              setObstacleOnlyAction({ problemId: problem.header.id, value: false }),
            )
          }
          className="h-9 rounded-[10px] bg-card px-3 text-[13.5px]"
        >
          {t("undo")}
        </Button>
      ) : null}
      {!treated ? (
        <Link
          href={`/reports?assessment=${problem.header.assessmentId}`}
          data-testid="problem-report-link"
          className="basis-full text-[13px] font-medium text-primary underline-offset-4 hover:underline"
        >
          {tReports("problemPeriod")}
        </Link>
      ) : null}
    </div>
  );
}

function Inner() {
  const t = useTranslations("problems");
  const tReports = useTranslations("reports.links");
  const rt = useRowText();
  const { problem, locale } = useProblem();
  const h = problem.header;
  const name = rt.name({ nameAr: h.indicator.nameAr, nameEn: h.indicator.nameEn });
  return (
    <>
      <Link
        href={`/assessments/${h.assessmentId}`}
        className="mb-2 inline-flex items-center gap-1 text-[13.5px] font-medium text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
        {t("back")} · <bdi>{h.plantName}</bdi> · {periodLabel(h.periodStart, h.months, locale)}
      </Link>
      <PageHeader title={t("title")} description={
          <>
            <bdi>{name}</bdi> · <bdi>{h.plantName}</bdi>
          </>
        } actions={
          <>
            <StageChip stage={problem.stage} />
            {problem.stage !== "documented" ? (
              <Link
                href={`/reports?assessment=${h.assessmentId}`}
                data-testid="problem-report-link"
                className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
              >
                {tReports("problemPeriod")}
              </Link>
            ) : null}
          </>
        }
      />
      <Banner />
      <div className="mt-5 flex flex-col gap-5">
        <ProblemFacts />
        <ObstaclesSection />
        <ActionsSection />
        <AuditTrail />
      </div>
    </>
  );
}

export function ProblemView({ initial, catalog }: { initial: ProblemDto; catalog: ReferenceCatalog }) {
  return (
    <ProblemProvider initial={initial} catalog={catalog}>
      <Inner />
    </ProblemProvider>
  );
}
