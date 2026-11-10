import { useTranslations } from "next-intl";
import { scaleSeries } from "./sparkline-scale";

/**
 * Trend of the share of evaluated indicators within limits over the last approved
 * assessments, scaled to its own min-max range (not an absolute 0-100 axis), so the
 * accessible text gives the first and last values. Draws only a dash until there are at least two. Never invents data.
 */
export function Sparkline({ values }: { values: readonly number[] }) {
  const t = useTranslations("plants.card");
  if (values.length < 2) {
    return (
      <span role="img" aria-label={t("noHistory")} className="text-sm text-fg-3">
        {t("none")}
      </span>
    );
  }
  const w = 84;
  const h = 24;
  const step = w / (values.length - 1);
  const pts = scaleSeries(values, h).map((y, i) => `${(i * step).toFixed(1)},${y.toFixed(1)}`);
  const pct = (v: number) => `${Math.round(v)}%`;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={t("trendLabel", { first: pct(values[0]), last: pct(values[values.length - 1]), count: values.length })}
      className="text-teal rtl:-scale-x-100"
    >
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
