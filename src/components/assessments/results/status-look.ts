import { CircleCheck, CircleHelp, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Status } from "@/lib/evaluation";

export const STATUS_ORDER: Status[] = ["ok", "warning", "critical", "insufficient_data", "no_limits"];

/** Icon + tone of a status (same pairs as StatusBadge). Colour never stands alone. */
export const STATUS_LOOK: Record<Status, { icon: LucideIcon; tone: string; text: string }> = {
  ok: { icon: CircleCheck, tone: "bg-ok-soft", text: "text-ok" },
  warning: { icon: TriangleAlert, tone: "bg-warning-soft", text: "text-warning" },
  critical: { icon: OctagonAlert, tone: "bg-critical-soft", text: "text-critical" },
  insufficient_data: { icon: CircleHelp, tone: "bg-insufficient-soft", text: "text-insufficient" },
  no_limits: { icon: Info, tone: "bg-nolimits-soft", text: "text-nolimits" },
};
