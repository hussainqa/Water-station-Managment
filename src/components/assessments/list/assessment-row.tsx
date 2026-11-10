"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { periodLabel } from "@/components/assessments/results/helpers";
import { STATUS_LOOK, STATUS_ORDER } from "@/components/assessments/results/status-look";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AssessmentListItem } from "@/lib/assessments/types";
import { cn } from "cn";
import { DeleteDraftDialog } from "./delete-draft-dialog";

type Props = {
  item: AssessmentListItem;
  /** compact variant of the dashboard: no delete, no entered-by line */
  compact?: boolean;
};

export function AssessmentRow({ item, compact = false }: Props) {
  const t = useTranslations("assessments");
  const tStatus = useTranslations("common.status");
  const locale = useLocale();
  const [del, setDel] = useState(false);
  const period = periodLabel(item.periodStart, item.months, locale);
  const draft = item.status === "draft";
  const pct = Math.round(item.completeness);

  return (
    <li
      data-testid="assessment-row"
      data-status={item.status}
      data-id={item.id}
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border bg-card p-3.5 sm:px-4"
    >
      <div className="min-w-[12rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="break-words text-[15px] font-semibold">{item.plantName}</h3>
          <span
            data-testid="row-status"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold",
              draft ? "bg-insufficient-soft text-insufficient" : "bg-ok-soft text-ok",
            )}
          >
            {draft ? <Pencil aria-hidden="true" className="size-3.5" /> : <STATUS_LOOK.ok.icon aria-hidden="true" className="size-3.5" />}
            {t(`list.status.${item.status}`)}
          </span>
        </div>
        <p className="m-0 mt-1 text-[13.5px] text-muted-foreground">
          <span data-testid="row-period">{period}</span>
          {item.months > 1 ? <span className="ms-2 rounded-md bg-muted px-1.5 py-0.5 text-[12px]">{t(`period.type.${item.months}`)}</span> : null}
          {!compact ? <span> · {t("list.enteredBy", { name: item.enteredBy })}</span> : null}
        </p>
      </div>

      <div className="flex min-w-[9rem] flex-col gap-1" data-testid="row-completeness">
        <span className="text-[12px] text-fg-3">
          {t("list.completeness")}: <span className="num font-medium text-foreground">{pct}%</span>
        </span>
        <span aria-hidden="true" className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
          <i className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--teal)" }} />
        </span>
      </div>

      <div className="flex min-w-[10rem] flex-1 flex-wrap items-center gap-1.5">
        {item.counts ? (
          STATUS_ORDER.filter((s) => item.counts![s] > 0).map((s) => {
            const { icon: Icon, tone, text } = STATUS_LOOK[s];
            return (
              <span
                key={s}
                data-testid="count-chip"
                data-status={s}
                className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium", tone, text)}
              >
                <Icon aria-hidden="true" className="size-3.5" />
                <span className="num">{item.counts![s]}</span>
                <span>{tStatus(s)}</span>
              </span>
            );
          })
        ) : (
          <span className="text-[12.5px] text-fg-3">{t("list.noResult")}</span>
        )}
        {!draft && !compact ? (
          <span data-testid="row-problems" className="ms-1 text-[12.5px] text-fg-3">
            {t("list.problems", { count: item.openProblems })}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2 max-sm:w-full">
        {draft ? (
          <>
            <Link
              href={`/assessments/new?draft=${item.id}`}
              data-testid="row-resume"
              className={cn(buttonVariants({ variant: "default" }), "h-9 rounded-[10px] px-3.5 text-[13.5px] max-sm:flex-1")}
            >
              {t("list.resume")}
            </Link>
            {!compact ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-testid="row-delete"
                onClick={() => setDel(true)}
                aria-label={t("list.deleteLabel", { plant: item.plantName, period })}
                title={t("list.delete")}
                className="size-9 text-critical hover:bg-critical-soft hover:text-critical"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </>
        ) : (
          <Link
            href={`/assessments/${item.id}`}
            data-testid="row-open"
            className={cn(buttonVariants({ variant: "secondary" }), "h-9 rounded-[10px] px-3.5 text-[13.5px] max-sm:flex-1")}
          >
            {t("list.open")}
          </Link>
        )}
      </div>
      {draft && !compact ? <DeleteDraftDialog open={del} onOpenChange={setDel} id={item.id} plant={item.plantName} period={period} /> : null}
    </li>
  );
}
