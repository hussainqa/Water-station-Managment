"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ResultRow } from "@/lib/assessments/types";
import { formatNumber, formatPercentValue, type Phrase } from "./helpers";

/** Translators for the text of one results row: names, values with units, limit phrases. */
export function useRowText() {
  const locale = useLocale();
  const tInd = useTranslations("indicators");
  const t = useTranslations("assessments");

  /** keeps "95%" and "1.1" in reading order inside Arabic sentences */
  const iso = (s: string) => `\u2066${s}\u2069`;
  const unitLabel = (unit: string) => (unit && tInd.has(`units.${unit}`) ? tInd(`units.${unit}`) : unit);
  return {
    locale,
    name: (r: Pick<ResultRow, "nameAr" | "nameEn">) => (locale === "en" && r.nameEn ? r.nameEn : r.nameAr),
    unitLabel,
    /** "99.6%" or "1.1 ساعة"; the number alone when there is no unit */
    value: (value: number | null, unit: string) => {
      if (value === null) return t("results.noValue");
      return unit === "%" || !unit ? iso(formatPercentValue(value, unit)) : `${iso(formatNumber(value))} ${unitLabel(unit)}`;
    },
    limit: (p: Phrase) =>
      t(`limit.${p.key}`, Object.fromEntries(Object.entries(p.values).map(([k, v]) => [k, iso(v)]))),
    inputLabel: (d: { labelAr: string; labelEn: string }) => (locale === "en" ? d.labelEn || d.labelAr : d.labelAr),
  };
}
