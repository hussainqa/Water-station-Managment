import type { IndicatorDto, IndicatorGroupDto } from "@/lib/indicators/types";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, useGrouping: false });

/** Plain Latin-digit number for limits and values (shown inside the `num` class). */
export function formatLimit(n: number): string {
  return nf.format(n);
}

type Named = Pick<IndicatorDto | IndicatorGroupDto, "nameAr" | "nameEn">;

/** Arabic UI shows the Arabic name; English UI shows the English name when there is one. */
export function localName(item: Named, locale: string): string {
  return locale === "en" && item.nameEn ? item.nameEn : item.nameAr;
}

/** Input label of a method key, in the UI language. */
export function localLabel(label: { ar: string; en: string } | undefined, locale: string): string {
  if (!label) return "";
  return locale === "en" ? label.en || label.ar : label.ar;
}
