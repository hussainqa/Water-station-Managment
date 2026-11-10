"use client";

import { useState, useTransition } from "react";
import { Calendar, ChevronDown, Factory } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setFilters } from "@/lib/context/actions";
import { RANGE_VALUES, type Range } from "@/lib/context/filters-schema";

type Props = {
  plants: { id: string; name: string }[];
  plantId: string | null;
  range: Range;
};

const pill =
  "relative flex min-h-10 min-w-0 items-center gap-2 rounded-xl border border-border bg-card ps-3 pe-2 has-[select:focus-visible]:ring-3 has-[select:focus-visible]:ring-ring/50 has-[select:disabled]:opacity-70";
const select =
  "min-h-10 min-w-0 max-w-[220px] cursor-pointer appearance-none bg-transparent pe-5 ps-0 text-sm font-medium text-foreground outline-none disabled:cursor-default max-[760px]:max-w-[130px]";

/** Plant and monitoring-period selectors. The choice is saved in cookies and the page refreshes. */
export function ContextSelectors({ plants, plantId, range }: Props) {
  const t = useTranslations("shell");
  const [plant, setPlant] = useState(plantId ?? "all");
  const [period, setPeriod] = useState<string>(String(range));
  const [, startTransition] = useTransition();

  function save(input: { plantId?: string | null; range?: Range }, revert: () => void) {
    startTransition(async () => {
      const r = await setFilters(input);
      if (!r.ok) {
        revert();
        toast.error(t("filters.saveFailed"));
      }
    });
  }

  return (
    <>
      <label className={pill}>
        <Factory aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
        <span className="text-[12.5px] text-fg-3 max-[760px]:hidden">{t("filters.plant")}</span>
        <select
          aria-label={t("filters.plant")}
          className={select}
          value={plant}
          disabled={plants.length === 0}
          onChange={(e) => {
            const prev = plant;
            const next = e.target.value;
            setPlant(next);
            save({ plantId: next === "all" ? null : next }, () => setPlant(prev));
          }}
        >
          <option value="all">{t("filters.allPlants")}</option>
          {plants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute end-2.5 size-4 text-foreground" />
      </label>

      <label className={pill}>
        <Calendar aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
        <span className="text-[12.5px] text-fg-3 max-[760px]:hidden">{t("filters.period")}</span>
        <select
          aria-label={t("filters.period")}
          className={select}
          value={period}
          onChange={(e) => {
            const prev = period;
            const next = e.target.value;
            setPeriod(next);
            const parsed = RANGE_VALUES.find((v) => String(v) === next);
            if (parsed === undefined) return;
            save({ range: parsed }, () => setPeriod(prev));
          }}
        >
          {RANGE_VALUES.map((v) => (
            <option key={v} value={String(v)}>
              {t(`filters.range.${v}`)}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute end-2.5 size-4 text-foreground" />
      </label>
    </>
  );
}
