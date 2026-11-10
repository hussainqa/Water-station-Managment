"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChevronLeft, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/indicators/status-badge";
import { ThresholdScale } from "@/components/indicators/threshold-scale";
import { buttonVariants, Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AssessmentHeader, ResultRow } from "@/lib/assessments/types";
import { cn } from "cn";
import { HistoryChart } from "./history-chart";
import { calculationView, describeLimits, periodLabel } from "./helpers";
import { NoteEditor } from "./note-editor";
import { useRowText } from "./row-text";
import { STATUS_LOOK } from "./status-look";

type Props = {
  header: AssessmentHeader;
  row: ResultRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProblem: (ref: string) => void;
  problemPending: boolean;
};

/**
 * Indicator detail: a panel from the end side from 640 px up, a bottom sheet below. One popup
 * restyled with CSS (no JS breakpoint). Focus is trapped, Esc and the overlay close it.
 */
export function KpiDrawer({ header, row, open, onOpenChange, onOpenProblem, problemPending }: Props) {
  const t = useTranslations("assessments");
  const rt = useRowText();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 isolate z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup
          data-testid="kpi-drawer"
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-popover text-sm text-popover-foreground shadow-(--shadow-pop) outline-none ring-1 ring-foreground/10",
            // phone: bottom sheet
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl transition duration-200 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full",
            // 640 px and up: panel on the end side
            "sm:top-0 sm:bottom-0 sm:start-auto sm:end-0 sm:max-h-none sm:w-[34rem] sm:max-w-[calc(100%-2rem)] sm:rounded-none sm:rounded-s-2xl",
            "sm:data-ending-style:translate-y-0 sm:data-starting-style:translate-y-0 sm:data-ending-style:translate-x-full sm:data-starting-style:translate-x-full rtl:sm:data-ending-style:-translate-x-full rtl:sm:data-starting-style:-translate-x-full",
          )}
        >
          {row ? (
            <>
              <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 pb-3 pt-5">
                <div className="min-w-0 flex-1">
                  {row.code ? (
                    <span className="num inline-block rounded-md bg-muted px-2 py-0.5 font-mono text-[12px] text-fg-2">
                      {row.code}
                    </span>
                  ) : null}
                  <DialogPrimitive.Title className="mt-1.5 break-words font-heading text-[18px] font-bold leading-snug">
                    {rt.name(row)}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted-foreground">
                    {t("drawer.subtitle", {
                      plant: header.plantName,
                      period: periodLabel(header.periodStart, header.months, rt.locale),
                    })}
                  </DialogPrimitive.Description>
                </div>
                <DialogPrimitive.Close
                  aria-label={t("drawer.close")}
                  render={<Button variant="ghost" size="icon" className="text-muted-foreground" />}
                >
                  <X aria-hidden="true" />
                </DialogPrimitive.Close>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                <DrawerBody header={header} row={row} />
              </div>

              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-popover px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:pb-4">
                {row.problemId ? (
                  <Link
                    href={`/problems/${row.problemId}`}
                    data-testid="drawer-problem-link"
                    className={cn(buttonVariants(), "h-10 gap-1.5 rounded-[11px] px-4 text-[14px]")}
                  >
                    {t("drawer.openProblem")}
                    <ChevronLeft aria-hidden="true" className="rotate-180 rtl:rotate-0" />
                  </Link>
                ) : row.canOpenManualProblem ? (
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="drawer-open-problem"
                    disabled={problemPending}
                    aria-busy={problemPending}
                    onClick={() => onOpenProblem(row.ref)}
                    className="h-10 rounded-[11px] px-4 text-[14px]"
                  >
                    {problemPending ? t("results.creatingProblem") : t("drawer.createProblem")}
                  </Button>
                ) : null}
                <DialogPrimitive.Close render={<Button variant="outline" className="h-10 rounded-[11px] px-4 text-[14px]" />}>
                  {t("drawer.close")}
                </DialogPrimitive.Close>
              </div>
            </>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DrawerBody({ header, row }: { header: AssessmentHeader; row: ResultRow }) {
  const t = useTranslations("assessments");
  const rt = useRowText();
  const look = STATUS_LOOK[row.status];
  const lim = row.limits ? describeLimits(row.limits, row.unit) : null;
  const calc = calculationView(row);
  const better =
    row.limits?.kind === "range" ? t("drawer.range") : t(row.limits?.kind === "lower" || (!row.limits && row.better === "lower") ? "drawer.lower" : "drawer.higher");
  const inputs = row.inputDefs
    .map((d) => ({ d, v: row.inputs[d.key] }))
    .filter((x) => x.v !== null && x.v !== undefined && x.v !== "");

  return (
    <div className="flex flex-col gap-5">
      <dl className="m-0 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-muted p-3">
          <dt className="text-[12px] text-fg-3">{t("drawer.value")}</dt>
          <dd data-testid="drawer-value" className="num m-0 mt-1 text-[18px] font-semibold">
            {rt.value(row.value, row.unit)}
          </dd>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <dt className="text-[12px] text-fg-3">{t("drawer.status")}</dt>
          <dd className="m-0 mt-1.5">
            <StatusBadge status={row.status} />
          </dd>
        </div>
        <div className="col-span-2 rounded-xl bg-muted p-3">
          <dt className="text-[12px] text-fg-3">{t("drawer.better")}</dt>
          <dd className="m-0 mt-1 text-[14px] font-medium">{better}</dd>
        </div>
      </dl>

      <ThresholdScale limits={row.limits} value={row.value} unit={row.unit} size="lg" showStatus={false} className="w-full" />

      <p className={cn("m-0 flex gap-2.5 rounded-xl p-3 text-[13.5px] leading-relaxed", look.tone)}>
        <look.icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", look.text)} />
        <span>
          <b className="font-semibold">{t("drawer.result")}</b> {t(`drawer.resultText.${row.status}`)}
        </span>
      </p>

      <section aria-labelledby="dr-limits">
        <h3 id="dr-limits" className="mb-1.5 text-[13px] font-semibold">
          {t("drawer.limits")}
        </h3>
        {lim ? (
          <dl data-testid="drawer-limits" className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[14px]">
            <dt className="text-fg-3">{t("drawer.target")}</dt>
            <dd className="m-0 font-medium">{rt.limit(lim.target)}</dd>
            <dt className="text-fg-3">{t("drawer.warning")}</dt>
            <dd className="m-0 font-medium">{rt.limit(lim.warning)}</dd>
            <dt className="text-fg-3">{t("drawer.criticalLimit")}</dt>
            <dd className="m-0 font-medium">{rt.limit(lim.critical)}</dd>
          </dl>
        ) : (
          <p className="m-0 text-[14px] text-nolimits">{t("drawer.noLimits")}</p>
        )}
      </section>

      <section aria-labelledby="dr-calc">
        <h3 id="dr-calc" className="mb-1.5 text-[13px] font-semibold">
          {t("drawer.calculation")}
        </h3>
        <p data-testid="drawer-calc" className="m-0 text-[14px]">
          {t(`drawer.calc.${calc.key}`, calc.values as Record<string, string>)}
        </p>
        {inputs.length ? (
          <p className="m-0 mt-1.5 text-[13px] text-fg-3">
            {t("drawer.inputs")}:{" "}
            {inputs.map(({ d, v }, i) => (
              <span key={d.key}>
                {i ? " · " : ""}
                {rt.inputLabel(d)} <span className="num">{String(v)}</span>
              </span>
            ))}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="dr-history">
        <h3 id="dr-history" className="mb-1.5 text-[13px] font-semibold">
          {t("drawer.history")}
        </h3>
        <HistoryChart plantId={header.plantId} months={header.months} row={row} />
      </section>

      <NoteEditor key={row.ref} assessmentId={header.id} refKey={row.ref} initial={row.note} />
    </div>
  );
}
