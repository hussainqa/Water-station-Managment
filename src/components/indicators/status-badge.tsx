import { CircleCheck, CircleHelp, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Status } from "@/lib/evaluation";
import { cn } from "cn";

const look: Record<Status, { icon: LucideIcon; tone: string }> = {
  ok: { icon: CircleCheck, tone: "bg-ok-soft text-ok" },
  warning: { icon: TriangleAlert, tone: "bg-warning-soft text-warning" },
  critical: { icon: OctagonAlert, tone: "bg-critical-soft text-critical" },
  insufficient_data: { icon: CircleHelp, tone: "bg-insufficient-soft text-insufficient" },
  no_limits: { icon: Info, tone: "bg-nolimits-soft text-nolimits" },
};

/** Status as icon + text + colour (never colour alone). Labels come from common.status. */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: Status;
  /** Overrides the default common.status.<status> text. */
  label?: string;
  className?: string;
}) {
  const t = useTranslations("common.status");
  const { icon: Icon, tone } = look[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold leading-none",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{label ?? t(status)}</span>
    </span>
  );
}
