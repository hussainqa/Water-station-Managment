import { CircleCheck, CircleDashed, FileCheck2, ListChecks, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProblemStage } from "@/lib/problems/types";
import { cn } from "cn";

const LOOK: Record<ProblemStage, { icon: LucideIcon; tone: string }> = {
  awaiting_obstacles: { icon: CircleDashed, tone: "bg-warning-soft text-warning" },
  choosing_action: { icon: ListChecks, tone: "bg-nolimits-soft text-nolimits" },
  treated: { icon: CircleCheck, tone: "bg-ok-soft text-ok" },
  documented: { icon: FileCheck2, tone: "bg-insufficient-soft text-insufficient" },
};

/** Problem stage as icon + text + colour. Labels: problemsList.stage.<stage>. */
export function StageChip({ stage, className }: { stage: ProblemStage; className?: string }) {
  const t = useTranslations("problemsList.stage");
  const { icon: Icon, tone } = LOOK[stage];
  return (
    <span
      data-testid="stage-chip"
      data-stage={stage}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold leading-none",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{t(stage)}</span>
    </span>
  );
}
