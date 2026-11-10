import { CircleAlert, CircleCheck, CircleDashed, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PlantStateKey } from "@/lib/plants/state";
import { cn } from "cn";

const styles: Record<PlantStateKey, { icon: LucideIcon; cls: string }> = {
  stable: { icon: CircleCheck, cls: "bg-ok-soft text-ok" },
  warnings: { icon: TriangleAlert, cls: "bg-warning-soft text-warning" },
  review: { icon: CircleAlert, cls: "bg-critical-soft text-critical" },
  notAssessed: { icon: CircleDashed, cls: "bg-insufficient-soft text-insufficient" },
};

/** State of a plant: icon + text + colour, never colour alone. */
export function StateChip({ state }: { state: PlantStateKey }) {
  const t = useTranslations("plants.state");
  const { icon: Icon, cls } = styles[state];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold leading-[1.7] whitespace-nowrap",
        cls,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {t(state)}
    </span>
  );
}
