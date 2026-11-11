import { Activity, CircleCheck, Factory, ListChecks, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DashboardTiles } from "@/lib/dashboard/types";
import { cn } from "cn";

type TileProps = {
  id: string;
  icon: LucideIcon;
  tone: string;
  label: string;
  value: number;
  suffix?: string;
  foot: string;
  className?: string;
};

function Tile({ id, icon: Icon, tone, label, value, suffix, foot, className }: TileProps) {
  return (
    <li
      data-testid={`tile-${id}`}
      className={cn("flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)", className)}
    >
      <div className="flex items-center gap-2.5 text-[13.5px] font-medium text-fg-2">
        <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-[10px]", tone)}>
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0">{label}</span>
      </div>
      <p className="m-0 flex items-baseline gap-1.5 text-[30px] font-bold leading-none">
        <span data-testid="tile-value" className="num">{value}</span>
        {suffix ? <span data-testid="tile-suffix" className="num text-[16px] font-medium text-fg-3">{suffix}</span> : null}
      </p>
      <p className="m-0 text-[12.5px] leading-snug text-fg-3">{foot}</p>
    </li>
  );
}

export function Tiles({ tiles }: { tiles: DashboardTiles }) {
  const t = useTranslations("dashboard.tiles");
  const followFoot =
    tiles.followUpCritical > 0
      ? t("followUp.critical", { count: tiles.followUpCritical })
      : tiles.handled > 0
        ? t("followUp.handled", { count: tiles.handled })
        : t("followUp.none");
  return (
    <ul
      aria-label={t("label")}
      data-testid="dashboard-tiles"
      className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 xl:grid-cols-5 [&>li:last-child]:max-sm:col-span-2"
    >
      <Tile
        id="plants"
        icon={Factory}
        tone="bg-accent text-primary"
        label={t("plants.label")}
        value={tiles.plants}
        foot={t("plants.foot", { count: tiles.plantsAssessed })}
      />
      <Tile
        id="assessments"
        icon={Activity}
        tone="bg-teal-soft text-teal"
        label={t("assessments.label")}
        value={tiles.assessments}
        foot={tiles.drafts > 0 ? t("assessments.drafts", { count: tiles.drafts }) : t("assessments.foot")}
      />
      <Tile
        id="within"
        icon={CircleCheck}
        tone="bg-ok-soft text-ok"
        label={t("within.label")}
        value={tiles.withinLimits}
        suffix={tiles.evaluated > 0 ? `/ ${tiles.evaluated}` : undefined}
        foot={t("within.foot")}
      />
      <Tile
        id="followup"
        icon={TriangleAlert}
        tone="bg-warning-soft text-warning"
        label={t("followUp.label")}
        value={tiles.followUp}
        foot={followFoot}
      />
      <Tile
        id="problems"
        icon={ListChecks}
        tone="bg-critical-soft text-critical"
        label={t("problems.label")}
        value={tiles.openProblems}
        foot={t("problems.foot")}
      />
    </ul>
  );
}
