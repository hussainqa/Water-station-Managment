"use client";

import { Factory, MapPin, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { PlantStateKey } from "@/lib/plants/state";
import { utilisation } from "@/lib/plants/state";
import { numberFormat } from "./format";
import { Sparkline } from "./sparkline";
import { StateChip } from "./state-chip";

/** What the client needs from a plant row (serialisable). */
export type PlantCardData = {
  id: string;
  name: string;
  governorate: string;
  location: string;
  waterSource: string;
  designCapacity: number;
  actualCapacity: number | null;
  engineer: string;
  notes: string;
  assessmentCount: number;
  state: PlantStateKey;
  /** share of readings within limits per past assessment, oldest first; empty until Phase 3 */
  trend: number[];
};

type Props = {
  plant: PlantCardData;
  onEdit: (p: PlantCardData) => void;
  onDelete: (p: PlantCardData) => void;
};

export function PlantCard({ plant, onEdit, onDelete }: Props) {
  const t = useTranslations("plants");
  const locale = useLocale();
  const n0 = numberFormat(locale, 0);
  const n1 = numberFormat(locale, 1);
  const util = utilisation(plant.actualCapacity, plant.designCapacity);
  const blocked = plant.assessmentCount > 0;
  const where = [t(`governorates.${plant.governorate}`), plant.location].filter(Boolean).join(" — ");

  return (
    <article
      data-testid="plant-card"
      aria-label={plant.name}
      className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Factory aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-[11rem] flex-1">
          <h3 className="break-words text-base font-semibold leading-snug">{plant.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 break-words">{where}</span>
          </p>
        </div>
        <StateChip state={plant.state} />
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13.5px]">
        <dt className="text-fg-3">{t("card.waterSource")}</dt>
        <dd className="m-0 min-w-0 font-medium">{t(`sources.${plant.waterSource}`)}</dd>
        <dt className="text-fg-3">{t("card.engineer")}</dt>
        <dd className="m-0 min-w-0 break-words font-medium">{plant.engineer || t("card.none")}</dd>
      </dl>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-2 text-[12.5px] text-foreground/80">
          <span>{t("card.capacity")}</span>
          <span className="num">
            {plant.actualCapacity === null ? t("card.none") : n0.format(plant.actualCapacity)} / {n0.format(plant.designCapacity)}{" "}
            {t("card.unit")}
          </span>
        </div>
        <div
          role="img"
          aria-label={t("card.utilisationBar", { percent: util === null ? t("card.none") : `${n1.format(util)}%` })}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <i
            className="block h-full rounded-full bg-teal"
            style={{ width: `${Math.min(100, util ?? 0)}%` }}
          />
        </div>
        <div className="flex justify-between gap-2 text-[12.5px]">
          <span className="text-fg-3">{t("card.utilisation")}</span>
          <span className="num">{util === null ? t("card.none") : `${n1.format(util)}%`}</span>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[12.5px] text-fg-3">
            {t("card.past", { count: plant.assessmentCount })}
          </span>
          <Sparkline values={plant.trend} />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onEdit(plant)}
          aria-label={t("card.edit", { name: plant.name })}
          className="size-9"
        >
          <Pencil aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(plant)}
          aria-label={t("card.delete", { name: plant.name })}
          aria-disabled={blocked ? true : undefined}
          title={blocked ? t("delete.blocked") : undefined}
          className={
            blocked
              ? "size-9 cursor-not-allowed opacity-50 hover:bg-transparent"
              : "size-9 text-critical hover:bg-critical-soft hover:text-critical"
          }
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
