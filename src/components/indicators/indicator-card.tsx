"use client";

import { Pencil, SlidersHorizontal, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { IndicatorDto } from "@/lib/indicators/types";
import { localName } from "./format";
import { ThresholdScale } from "./threshold-scale";

type Props = {
  indicator: IndicatorDto;
  /** Plant the adoption switch refers to; null = no plant chosen (no switch). */
  plant: { id: string; name: string } | null;
  adopted: boolean;
  onAdoptedChange: (adopted: boolean) => void;
  onLimits: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * One indicator. Client note 9: code, name and description only. The method, unit,
 * direction and calculation line live inside the limits / edit dialogs.
 */
export function IndicatorCard({ indicator: i, plant, adopted, onAdoptedChange, onLimits, onEdit, onDelete }: Props) {
  const t = useTranslations("indicators");
  const locale = useLocale();
  const name = localName(i, locale);

  return (
    <article
      data-testid="indicator-card"
      data-ref={i.ref}
      aria-label={name}
      className="grid min-w-0 gap-4 border-b border-border py-4 last:border-b-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-6"
    >
      <div className="min-w-0">
        <h4 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15.5px] font-semibold leading-snug">
          {i.code ? (
            <span className="num rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12.5px] font-medium text-foreground/80">
              {i.code}
            </span>
          ) : (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[12px] font-medium text-accent-foreground">
              {t("card.userTag")}
            </span>
          )}
          <span className="min-w-0 break-words">{name}</span>
        </h4>
        {i.description ? (
          <p className="mt-1 break-words text-[13px] text-muted-foreground">{i.description}</p>
        ) : null}
      </div>

      <div data-testid="indicator-limits-state" className="min-w-0">
        <ThresholdScale limits={i.limits} unit={i.unit} />
      </div>

      <div className="flex flex-col gap-2.5 lg:items-end">
        {plant ? (
          <label className="flex items-center gap-2 text-[13px]">
            <span>{adopted ? t("card.adopted") : t("card.notAdopted")}</span>
            <Switch
              checked={adopted}
              onCheckedChange={(v) => onAdoptedChange(v)}
              aria-label={t("card.switchLabel", { name, plant: plant.name })}
            />
          </label>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
          <Button type="button" variant="outline" onClick={onLimits} className="h-9 rounded-[10px] px-3 text-[13px]">
            <SlidersHorizontal aria-hidden="true" />
            {t("card.limits")}
          </Button>
          {!i.isSystem ? (
            <>
              <Button type="button" variant="ghost" onClick={onEdit} aria-label={`${t("card.edit")}: ${name}`} className="h-9 rounded-[10px] px-3 text-[13px]">
                <Pencil aria-hidden="true" />
                {t("card.edit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={i.used ? undefined : onDelete}
                aria-disabled={i.used ? true : undefined}
                aria-describedby={i.used ? `${i.ref}-blocked` : undefined}
                aria-label={`${t("card.delete")}: ${name}`}
                title={i.used ? t("card.deleteBlocked") : undefined}
                className={`h-9 rounded-[10px] px-3 text-[13px] ${i.used ? "cursor-not-allowed opacity-50" : "text-critical hover:text-critical"}`}
              >
                <Trash2 aria-hidden="true" />
                {t("card.delete")}
              </Button>
              {i.used ? (
                <span id={`${i.ref}-blocked`} className="w-full text-[12px] text-fg-3 lg:text-end">
                  {t("card.deleteBlocked")}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
