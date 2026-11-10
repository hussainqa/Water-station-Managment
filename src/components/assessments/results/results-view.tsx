"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, Minus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/indicators/status-badge";
import { StageChip } from "@/components/problems/list/stage-chip";
import { ThresholdScale } from "@/components/indicators/threshold-scale";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AssessmentResults, ResultRow } from "@/lib/assessments/types";
import type { Status } from "@/lib/evaluation";
import type { ProblemStageMap } from "@/lib/problems/types";
import { cn } from "cn";
import { CompletenessRing } from "./completeness-ring";
import {
  changeView,
  crossedLimit,
  describeAudit,
  describeLimits,
  formatDateTime,
  formatNumber,
  periodLabel,
  splitCallouts,
} from "./helpers";
import { KpiDrawer } from "./kpi-drawer";
import { useRowText } from "./row-text";
import { STATUS_LOOK, STATUS_ORDER } from "./status-look";
import { useOpenProblem } from "./use-open-problem";

const card = "rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) sm:p-5";

export function ResultsView({ results, stages = {} }: { results: AssessmentResults; stages?: ProblemStageMap }) {
  const t = useTranslations("assessments");
  const rt = useRowText();
  const locale = useLocale();
  const { header } = results;
  const [selected, setSelected] = useState<{ ref: string; open: boolean } | null>(null);
  const { open: openProblem, pendingRef } = useOpenProblem(header.id);

  const rows = useMemo(() => results.groups.flatMap((g) => g.rows), [results.groups]);
  const byRef = useMemo(() => new Map(rows.map((r) => [r.ref, r])), [rows]);
  const selectedRow = selected ? (byRef.get(selected.ref) ?? null) : null;
  const { active: callouts, handled } = splitCallouts(rows, stages);
  const period = periodLabel(header.periodStart, header.months, locale);
  const nameOf = (ref: string) => {
    const r = byRef.get(ref);
    return r ? rt.name(r) : ref;
  };

  return (
    <>
      <Link
        href="/assessments"
        className="mb-2 inline-flex items-center gap-1 text-[13.5px] font-medium text-primary underline-offset-4 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
        {t("results.back")}
      </Link>
      <PageHeader title={t("results.title")} description={`${header.plantName} · ${period}`} />

      <div className="mt-5 flex flex-col gap-4">
        <SummaryCard results={results} period={period} />

        {callouts.length ? (
          <section aria-label={t("results.callouts")} data-testid="callouts" className="flex flex-col gap-2.5">
            {callouts.map((r) => (
              <Callout key={r.ref} row={r} onOpen={() => openProblem(r.ref)} pending={pendingRef === r.ref} />
            ))}
          </section>
        ) : null}

        {handled.length ? (
          <section
            aria-labelledby="handled-h"
            data-testid="handled-callouts"
            className="rounded-xl border border-border bg-muted/50 px-4 py-3"
          >
            <h2 id="handled-h" className="text-[13.5px] font-semibold text-fg-2">
              {t("results.handledTitle")}
            </h2>
            <p className="m-0 mt-0.5 text-[12.5px] text-fg-3">{t("results.handledText")}</p>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
              {handled.map((r) => (
                <HandledLine key={r.ref} row={r} stage={stages[r.ref]} />
              ))}
            </ul>
          </section>
        ) : null}

        <section className={card} aria-labelledby="results-h">
          <h2 id="results-h" className="text-[17px] font-bold">
            {t("results.table")}
          </h2>
          <p className="m-0 mt-0.5 text-[13px] text-fg-3">{t("results.tableHint")}</p>
          <ResultsTable
            results={results}
            stages={stages}
            onSelect={(ref) => setSelected({ ref, open: true })}
          />
          <p className="m-0 mt-3 text-[12.5px] text-fg-3">{t("results.note")}</p>
        </section>

        <section className={card} aria-labelledby="audit-h" data-testid="audit">
          <h2 id="audit-h" className="text-[17px] font-bold">
            {t("results.auditTitle")}
          </h2>
          <p className="m-0 mt-0.5 text-[13px] text-fg-3">{t("results.auditText")}</p>
          {results.audit.length ? (
            <ol className="m-0 mt-3 flex list-none flex-col p-0">
              {results.audit.map((e) => {
                const d = describeAudit(e, nameOf);
                return (
                  <li
                    key={e.id}
                    data-testid="audit-entry"
                    data-action={e.action}
                    className="relative flex gap-3 border-s border-border pb-4 ps-4 last:pb-0"
                  >
                    <i aria-hidden="true" className="absolute -start-[5px] top-1.5 size-2.5 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="m-0 text-[14px] font-medium">{t(`audit.${d.key}`, d.values)}</p>
                      <p className="m-0 mt-0.5 text-[12.5px] text-fg-3">
                        {e.actor} · <span className="num">{formatDateTime(e.at)}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="m-0 mt-3 text-[13px] text-fg-3">{t("results.auditEmpty")}</p>
          )}
        </section>
      </div>

      <KpiDrawer
        header={header}
        row={selectedRow}
        open={!!selected?.open && !!selectedRow}
        onOpenChange={(open) => setSelected((s) => (s ? { ...s, open } : s))}
        onOpenProblem={openProblem}
        problemPending={!!selectedRow && pendingRef === selectedRow.ref}
      />
    </>
  );
}

// --- summary ------------------------------------------------------------------------------------

function SummaryCard({ results, period }: { results: AssessmentResults; period: string }) {
  const t = useTranslations("assessments");
  const locale = useLocale();
  const { header, completeness, counts } = results;
  const percent = Math.round(completeness.percent);
  const facts: [string, React.ReactNode][] = [
    [t("results.plant"), header.plantName],
    [t("results.period"), period],
    [t("results.periodType"), t(`period.type.${header.months}`)],
    [
      t("results.dates"),
      <span key="d">
        <span className="num">{header.startDate}</span> — <span className="num">{header.endDate}</span>
      </span>,
    ],
    [t("results.enteredBy"), header.enteredBy || "—"],
    [t("results.approvedAt"), header.approvedAt ? <span key="a" className="num">{formatDateTime(header.approvedAt, locale)}</span> : "—"],
  ];

  return (
    <section className={card} aria-label={t("results.summary")} data-testid="summary">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex items-center gap-3.5">
          <CompletenessRing percent={completeness.percent} />
          <div>
            <div className="text-[12.5px] text-fg-3">{t("results.completeness")}</div>
            <div data-testid="completeness-percent" className="num text-[22px] font-semibold leading-tight">
              {percent}%
            </div>
            <div data-testid="completeness-text" className="text-[12.5px] text-fg-3">
              <span className="sr-only">{t("results.completenessRing", { percent })}. </span>
              {t("results.evaluated", { withValue: completeness.withValue, total: completeness.total })}
            </div>
          </div>
        </div>
        <dl className="m-0 grid w-full min-w-0 grid-cols-2 gap-2.5 sm:w-auto sm:flex-1 sm:grid-cols-3 xl:grid-cols-6">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-xl bg-muted p-3">
              <dt className="text-[12px] text-fg-3">{label}</dt>
              <dd className="m-0 mt-1 break-words text-[14px] font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ul
        aria-label={t("results.counts")}
        data-testid="counts"
        className="m-0 mt-4 grid list-none grid-cols-2 gap-2.5 border-t border-border p-0 pt-4 sm:grid-cols-3 lg:grid-cols-5"
      >
        {STATUS_ORDER.map((s) => (
          <CountTile key={s} status={s} count={counts[s]} />
        ))}
      </ul>
    </section>
  );
}

function CountTile({ status, count }: { status: Status; count: number }) {
  const tStatus = useTranslations("common.status");
  const { icon: Icon, tone, text } = STATUS_LOOK[status];
  return (
    <li data-testid="count-tile" data-status={status} className={cn("flex items-center gap-3 rounded-xl px-3.5 py-3", tone)}>
      <Icon aria-hidden="true" className={cn("size-5 shrink-0", text)} />
      <span className="min-w-0">
        <span data-testid="count-value" className={cn("num block text-[20px] font-semibold leading-none", text)}>
          {count}
        </span>
        <span className={cn("mt-1 block text-[12.5px] font-medium leading-tight", text)}>{tStatus(status)}</span>
      </span>
    </li>
  );
}

// --- callouts -----------------------------------------------------------------------------------

function Callout({ row, onOpen, pending }: { row: ResultRow; onOpen: () => void; pending: boolean }) {
  const t = useTranslations("assessments");
  const rt = useRowText();
  const { icon: Icon, tone, text } = STATUS_LOOK[row.status];
  const crossed = crossedLimit(row.limits, row.status, row.unit);
  const message = t(row.status === "critical" ? "results.calloutCritical" : "results.calloutWarning", {
    name: rt.name(row),
    value: rt.value(row.value, row.unit),
    limit: crossed ? rt.limit(crossed) : "—",
  });
  return (
    <div
      data-testid="callout"
      data-status={row.status}
      data-ref={row.ref}
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-xl px-4 py-3", tone)}
    >
      <Icon aria-hidden="true" className={cn("size-5 shrink-0", text)} />
      <p className="m-0 min-w-[14rem] flex-1 text-[14px] leading-relaxed">{message}</p>
      {row.problemId ? (
        <Link
          href={`/problems/${row.problemId}`}
          data-testid="callout-problem-link"
          className={cn(buttonVariants({ variant: row.status === "critical" ? "default" : "secondary" }), "h-9 rounded-[10px] px-3.5 text-[13.5px] max-sm:w-full")}
        >
          {t("results.openProblem")}
        </Link>
      ) : row.canOpenManualProblem ? (
        <Button
          type="button"
          variant="secondary"
          data-testid="callout-open-problem"
          disabled={pending}
          aria-busy={pending}
          onClick={onOpen}
          className="h-9 rounded-[10px] px-3.5 text-[13.5px] max-sm:w-full"
        >
          {pending ? t("results.creatingProblem") : t("results.createProblem")}
        </Button>
      ) : null}
    </div>
  );
}

function HandledLine({ row, stage }: { row: ResultRow; stage: ProblemStageMap[string] }) {
  const t = useTranslations("assessments");
  const rt = useRowText();
  return (
    <li
      data-testid="handled-callout"
      data-ref={row.ref}
      data-stage={stage.stage}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px]"
    >
      <span className="min-w-0 flex-1 break-words">
        {row.code ? <bdi dir="ltr" className="num me-1.5 inline-block font-mono text-[12px] text-fg-3">{row.code}</bdi> : null}
        {rt.name(row)}
      </span>
      <StageChip stage={stage.stage} />
      <Link
        href={`/problems/${stage.problemId}`}
        data-testid="handled-problem-link"
        className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
      >
        {t("results.handledLink")}
      </Link>
    </li>
  );
}

// --- table --------------------------------------------------------------------------------------

const cell =
  "px-3 py-3 align-middle text-start max-lg:flex max-lg:items-center max-lg:justify-between max-lg:gap-4 max-lg:px-0 max-lg:py-1.5 max-lg:before:shrink-0 max-lg:before:text-[12px] max-lg:before:text-fg-3 max-lg:before:content-[attr(data-label)]";

function ResultsTable({
  results,
  stages,
  onSelect,
}: {
  results: AssessmentResults;
  stages: ProblemStageMap;
  onSelect: (ref: string) => void;
}) {
  const t = useTranslations("assessments");
  const rt = useRowText();
  const hasPrevious = results.previous !== null;

  return (
    <div className="mt-3">
      <table data-testid="results-table" className="w-full border-collapse text-[14px] max-lg:block">
        <caption className="sr-only">{t("results.tableCaption")}</caption>
        <thead className="max-lg:hidden">
          <tr className="border-b border-border text-[12.5px] text-fg-3">
            <th scope="col" className="px-3 py-2 text-start font-medium">{t("results.col.indicator")}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{t("results.col.value")}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{t("results.col.limit")}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{t("results.col.scale")}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{t("results.col.status")}</th>
            <th scope="col" className="px-3 py-2 text-start font-medium">{t("results.col.change")}</th>
            <th scope="col" className="w-px px-3 py-2"><span className="sr-only">{t("results.details")}</span></th>
          </tr>
        </thead>
        {results.groups.map((g) => (
          <tbody key={g.key} data-testid="results-group" data-group={g.key} className="max-lg:block">
            <tr className="max-lg:block">
              <th
                scope="colgroup"
                colSpan={7}
                className="bg-muted px-3 py-2 text-start text-[13px] font-semibold text-fg-2 max-lg:mt-3 max-lg:rounded-lg"
              >
                {rt.locale === "en" && g.nameEn ? g.nameEn : g.nameAr}
              </th>
            </tr>
            {g.rows.map((r) => {
              const lim = r.limits ? describeLimits(r.limits, r.unit) : null;
              const label = rt.name(r);
              return (
                <tr
                  key={r.ref}
                  data-testid="result-row"
                  data-ref={r.ref}
                  data-status={r.status}
                  onClick={() => onSelect(r.ref)}
                  className="cursor-pointer border-b border-border transition-colors hover:bg-muted/60 max-lg:mt-2 max-lg:block max-lg:rounded-xl max-lg:border max-lg:p-3.5"
                >
                  <td className={cn(cell, "max-lg:block max-lg:before:hidden max-lg:pb-2")}>
                    <button
                      type="button"
                      aria-label={t("results.detailsFor", { name: label })}
                      onClick={() => onSelect(r.ref)}
                      className="block max-w-full text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-md"
                    >
                      <span className="block break-words font-medium">{label}</span>
                      {r.code ? <span className="num mt-0.5 block font-mono text-[12px] text-fg-3">{r.code}</span> : null}
                    </button>
                    {stages[r.ref] ? (
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid="row-problem">
                        <StageChip stage={stages[r.ref].stage} className="px-2 py-0.5 text-[12px]" />
                        <Link
                          href={`/problems/${stages[r.ref].problemId}`}
                          data-testid="row-problem-link"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[12.5px] font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {t("results.problemLink")}
                        </Link>
                      </span>
                    ) : null}
                  </td>
                  <td data-label={t("results.col.value")} className={cell}>
                    <span data-testid="row-value" className="num font-medium">
                      {rt.value(r.value, r.unit)}
                    </span>
                  </td>
                  <td data-label={t("results.col.limit")} className={cell}>
                    {lim ? (
                      <span className="max-lg:text-end">
                        <span className="block text-[13px]">{rt.limit(lim.target)}</span>
                        <span className="block text-[12px] text-fg-3">
                          {t("results.critical")}: {rt.limit(lim.critical)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-nolimits">{t("results.noLimits")}</span>
                    )}
                  </td>
                  <td data-label={t("results.col.scale")} className={cn(cell, "min-w-[170px] max-lg:min-w-0")}>
                    {r.limits ? (
                      <ThresholdScale limits={r.limits} value={r.value} unit={r.unit} showTicks={false} showStatus={false} className="min-w-[150px] max-lg:w-[60%]" />
                    ) : (
                      <span className="text-fg-3">—</span>
                    )}
                  </td>
                  <td data-label={t("results.col.status")} className={cell}>
                    <StatusBadge status={r.status} className="whitespace-nowrap" />
                  </td>
                  <td data-label={t("results.col.change")} className={cell}>
                    <ChangeCell row={r} hasPrevious={hasPrevious} />
                  </td>
                  <td aria-hidden="true" className="w-px px-3 py-3 max-lg:hidden">
                    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-primary">
                      {t("results.details")}
                      <ChevronLeft className="size-4 rotate-180 rtl:rotate-0" />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function ChangeCell({ row, hasPrevious }: { row: ResultRow; hasPrevious: boolean }) {
  const t = useTranslations("assessments");
  const rt = useRowText();
  const view = changeView(row);
  if (!view) {
    return (
      <span data-testid="row-change" data-change="none" className="text-[12.5px] text-fg-3">
        {hasPrevious ? t("results.noComparable") : t("results.noPrevious")}
      </span>
    );
  }
  const Arrow = view.direction === "up" ? ArrowUp : view.direction === "down" ? ArrowDown : Minus;
  const tone = view.judgement === "improved" ? "text-ok" : view.judgement === "worsened" ? "text-critical" : "text-fg-3";
  return (
    <span data-testid="row-change" data-change={view.judgement} className="flex flex-col gap-0.5 max-lg:items-end">
      <span className={cn("flex items-center gap-1 font-medium", tone)}>
        <Arrow aria-hidden="true" className="size-4 shrink-0" />
        <span className="num">{formatNumber(view.delta)}</span>
        {row.unit === "%" ? <span className="text-[12px]">{t("results.points")}</span> : null}
        <span className="text-[12.5px]">{t(`results.${view.judgement}`)}</span>
      </span>
      <span className="text-[12px] text-fg-3">
        {t("results.previousWas", { value: rt.value(row.previousValue, row.unit) })}
      </span>
    </span>
  );
}
