import { useTranslations } from "next-intl";

/**
 * Trend of the share of readings within limits over the last assessments.
 * Draws nothing but a dash until a plant has at least two approved assessments
 * (Phase 3 passes the values). Never invents data.
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
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (Math.max(0, Math.min(100, v)) / 100) * h).toFixed(1)}`);
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      className="text-teal rtl:-scale-x-100"
    >
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
