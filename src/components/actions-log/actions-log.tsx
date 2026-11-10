"use client";

import { useState } from "react";
import { BookOpen, CircleCheck, ListChecks, SearchX, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { periodLabel } from "@/components/assessments/results/helpers";
import { StageChip } from "@/components/problems/list/stage-chip";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ActionLogEntry } from "@/lib/problems/types";
import { cn } from "cn";
import { LOG_FILTERS, filterLog, logCounts, type LogFilter } from "./helpers";

type Props = { entries: ActionLogEntry[]; hasAny: boolean };

export function ActionsLog({ entries, hasAny }: Props) {
  const t = useTranslations("problemsList.log");
  const [filter, setFilter] = useState<LogFilter>("all");
  const counts = logCounts(entries);
  const shown = filterLog(entries, filter);

  return (
    <>
      <PageHeader title={t("title")} description={t("lead")} />
      <div className="mt-5 flex flex-col gap-4">
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-(--shadow-card)">
            {hasAny ? (
              <EmptyState icon={SearchX} title={t("emptyFiltered.title")} text={t("emptyFiltered.text")} />
            ) : (
              <EmptyState
                icon={Wrench}
                title={t("empty.title")}
                text={t("empty.text")}
                action={
                  <Link href="/problems" className={cn(buttonVariants({ variant: "secondary" }), "h-10 rounded-xl px-5")}>
                    {t("empty.cta")}
                  </Link>
                }
              />
            )}
          </div>
        ) : (
          <>
            <div role="group" aria-label={t("filtersLabel")} className="flex flex-wrap gap-2">
              {LOG_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  data-testid={`log-filter-${f}`}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    filter === f
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  {t(`filter.${f}`)}
                  <span data-testid={`log-count-${f}`} className="num rounded-full bg-background px-1.5 text-[12px] text-fg-2">
                    {counts[f]}
                  </span>
                </button>
              ))}
            </div>
            {shown.length ? (
              <ul aria-label={t("listLabel")} className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 xl:grid-cols-2">
                {shown.map((e) => (
                  <LogRow key={e.key} entry={e} />
                ))}
              </ul>
            ) : (
              <p data-testid="log-empty-tab" className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-center text-[14px] text-fg-3">
                {t("emptyTab")}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function LogRow({ entry: e }: { entry: ActionLogEntry }) {
  const t = useTranslations("problemsList.log");
  const locale = useLocale();
  const en = locale === "en";
  const text = e.kind === "custom" ? e.name : en && e.textEn ? e.textEn : e.textAr;
  const ind = e.indicator;
  const indName = en && ind.nameEn ? ind.nameEn : ind.nameAr;
  const obstacle = e.linkedObstacle
    ? e.linkedObstacle.kind === "system"
      ? { code: e.linkedObstacle.code, text: en && e.linkedObstacle.textEn ? e.linkedObstacle.textEn : e.linkedObstacle.textAr }
      : { code: null, text: e.linkedObstacle.name }
    : null;
  const rank = e.kind === "system" ? e.rank : null;

  return (
    <li
      data-testid="log-row"
      data-key={e.key}
      data-chosen={e.chosen}
      data-implemented={!!e.implementedOn}
      data-study={e.needsStudy}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 sm:px-4"
    >
      <div className="flex items-start gap-3">
        {rank !== null ? (
          <div
            data-testid="log-rank"
            className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-accent text-accent-foreground"
          >
            <small className="text-[10.5px] leading-none">{t("rank")}</small>
            <b className="num mt-0.5 text-[17px] leading-none">{rank}</b>
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {e.kind === "custom" ? (
            <span data-testid="log-custom" className="mb-1 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[12px] text-fg-2">
              {t("caseSpecific")}
            </span>
          ) : null}
          <h3 data-testid="log-text" className="m-0 break-words text-[15px] font-semibold leading-snug">
            {text}
          </h3>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" data-testid="log-states">
        {e.implementedOn ? (
          <span
            data-testid="state-implemented"
            className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-[12.5px] font-semibold leading-none text-ok"
          >
            <CircleCheck aria-hidden="true" className="size-3.5" />
            {t("state.implemented")} · <span className="num">{e.implementedOn}</span>
          </span>
        ) : e.chosen ? (
          <span
            data-testid="state-chosen"
            className="inline-flex items-center gap-1.5 rounded-full bg-nolimits-soft px-2.5 py-1 text-[12.5px] font-semibold leading-none text-nolimits"
          >
            <ListChecks aria-hidden="true" className="size-3.5" />
            {t("state.chosen")}
          </span>
        ) : null}
        {e.needsStudy ? (
          <span
            data-testid="state-study"
            className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[12.5px] font-semibold leading-none text-warning"
          >
            <BookOpen aria-hidden="true" className="size-3.5" />
            {t("state.needsStudy")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3 text-[13px]">
        <p className="m-0 text-fg-3" data-testid="log-obstacle">
          <span className="font-medium text-fg-2">{t("obstacle")}: </span>
          {obstacle ? (
            <>
              <span>{obstacle.text}</span>
            </>
          ) : (
            t("noObstacle")
          )}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="m-0 min-w-0 flex-1 text-fg-3">
            <span className="font-medium text-fg-2">{t("problem")}: </span>
            {ind.code ? <bdi dir="ltr" className="num me-1 inline-block font-mono text-[12px]">{ind.code}</bdi> : null}
            {indName} · {e.plantName} · {periodLabel(e.periodStart, e.months, locale)}
          </p>
          <StageChip stage={e.problemStage} />
          <Link
            href={`/problems/${e.problemId}`}
            data-testid="log-problem-link"
            className={cn(buttonVariants({ variant: "secondary" }), "h-8 rounded-[10px] px-3 text-[13px] max-sm:w-full")}
          >
            {t("openProblem")}
          </Link>
        </div>
      </div>
    </li>
  );
}
