"use client";

import { Hand, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate, periodLabel } from "@/components/assessments/results/helpers";
import { useRowText } from "@/components/assessments/results/row-text";
import { StatusBadge } from "@/components/indicators/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ProblemListItem } from "@/lib/problems/types";
import { cn } from "cn";
import { StageChip } from "./stage-chip";

export function ProblemRow({ item }: { item: ProblemListItem }) {
  const t = useTranslations("problemsList.list");
  const rt = useRowText();
  const locale = useLocale();
  const ind = item.indicator;
  const name = locale === "en" && ind.nameEn ? ind.nameEn : ind.nameAr;
  const OriginIcon = item.origin === "auto" ? Zap : Hand;

  return (
    <li
      data-testid="problem-row"
      data-id={item.id}
      data-stage={item.stage}
      data-code={ind.code ?? ""}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 sm:px-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_16rem]">
          <p className="m-0 text-[12.5px] text-fg-3">
            {ind.code ? <span className="num rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12px]">{ind.code}</span> : null}
            <bdi className={ind.code ? "ms-1.5" : ""}>{item.plantName}</bdi> ·{" "}
            <span>{periodLabel(item.periodStart, item.months, locale)}</span>
          </p>
          <h3 className="mt-1 break-words text-[16px] font-semibold">{name}</h3>
        </div>
        <StageChip stage={item.stage} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-fg-3">
        <span className="inline-flex items-center gap-2">
          {t("recorded")}:
          <span data-testid="problem-value" className="num font-semibold text-foreground">
            {rt.value(item.value, ind.unit)}
          </span>
          {item.readingStatus ? <StatusBadge status={item.readingStatus} /> : null}
        </span>
        <span>
          {t("detected")} <span className="whitespace-nowrap">{formatDate(item.detectedOn, locale)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <OriginIcon aria-hidden="true" className="size-3.5" />
          {t(`origin.${item.origin}`)}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p data-testid="problem-counts" className="m-0 flex flex-wrap gap-x-2 text-[12.5px] text-fg-3">
          <span data-testid="count-obstacles" data-count={item.obstacleCount}>{t("obstacles", { count: item.obstacleCount })}</span>
          <span aria-hidden="true">·</span>
          <span data-testid="count-chosen" data-count={item.chosenActionCount}>{t("chosen", { count: item.chosenActionCount })}</span>
          <span aria-hidden="true">·</span>
          <span data-testid="count-implemented" data-count={item.implementedActionCount}>{t("implemented", { count: item.implementedActionCount })}</span>
        </p>
        <Link
          href={`/problems/${item.id}`}
          data-testid="problem-link"
          className={cn(
            buttonVariants({ variant: item.open ? "default" : "secondary" }),
            "h-9 rounded-[10px] px-3.5 text-[13.5px] max-sm:w-full",
          )}
        >
          {item.open ? t("identify") : t("view")}
        </Link>
      </div>
    </li>
  );
}
