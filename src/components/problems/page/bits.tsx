"use client";

import { BadgeCheck, CircleCheck, CircleHelp, ClipboardCheck, Hourglass, ListChecks, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProblemStage, SelectedObstacle } from "@/lib/problems/types";
import { cn } from "cn";

const stageLook: Record<ProblemStage, { icon: LucideIcon; tone: string }> = {
  awaiting_obstacles: { icon: Hourglass, tone: "bg-warning-soft text-warning" },
  choosing_action: { icon: ListChecks, tone: "bg-primary/10 text-primary" },
  treated: { icon: CircleCheck, tone: "bg-ok-soft text-ok" },
  documented: { icon: ClipboardCheck, tone: "bg-teal-soft text-teal" },
};

/** Stage as icon + text + colour. */
export function StageChip({ stage, className }: { stage: ProblemStage; className?: string }) {
  const t = useTranslations("problems");
  const { icon: Icon, tone } = stageLook[stage];
  return (
    <span
      data-testid="stage-chip"
      data-stage={stage}
      role="status"
      aria-label={`${t("stageLabel")}: ${t(`stage.${stage}`)}`}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold leading-none",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{t(`stage.${stage}`)}</span>
    </span>
  );
}

export function ClassificationPill({ value, className }: { value: "confirmed" | "possible"; className?: string }) {
  const t = useTranslations("problems.obstacles");
  const Icon = value === "confirmed" ? BadgeCheck : CircleHelp;
  return (
    <span
      data-testid="classification-pill"
      data-classification={value}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold",
        value === "confirmed" ? "bg-primary/10 text-primary" : "bg-secondary text-fg-2",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {t(value)}
    </span>
  );
}

export function obstacleLabel(o: SelectedObstacle, locale: string): string {
  return o.kind === "custom" ? o.name : locale === "en" && o.textEn ? o.textEn : o.textAr;
}

/** Card chrome shared by the three sections. */
export const sectionCard = "rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) sm:p-5";

export function StepHeading({ n, id, children }: { n: number; id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="m-0 flex items-center gap-2.5 text-[17px] font-bold">
      <span
        aria-hidden="true"
        className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground"
      >
        {n}
      </span>
      {children}
    </h2>
  );
}
