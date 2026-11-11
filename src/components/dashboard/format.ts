import { formatNumber, formatPercentValue } from "@/components/assessments/results/helpers";

/** keeps "95%" and "1.1" in reading order inside Arabic sentences */
export const iso = (s: string) => `⁦${s}⁩`;

/** "99.6%" or "1.1 h" (unit label already translated); null gives the fallback text. */
export function valueText(
  value: number | null,
  unit: string,
  unitLabel: (unit: string) => string,
  fallback: string,
): string {
  if (value === null) return fallback;
  return unit === "%" || !unit
    ? iso(formatPercentValue(value, unit))
    : `${iso(formatNumber(value))} ${unitLabel(unit)}`;
}
