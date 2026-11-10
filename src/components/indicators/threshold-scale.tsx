import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { statusOf, type Limits } from "@/lib/evaluation";
import { cn } from "cn";
import { formatLimit } from "./format";
import { markerTone, scaleGeometry, type BandStatus } from "./scale-geometry";
import { StatusBadge } from "./status-badge";

export type ThresholdScaleProps = {
  /** Approved limits, or null for "no approved limits" (draws the chip instead). */
  limits: Limits | null;
  /** Optional value to mark on the scale. */
  value?: number | null;
  /** Unit text. "%" also bounds the scale to 0..100 and is appended to tick labels. */
  unit?: string;
  size?: "sm" | "lg";
  /** Tick labels under the bands (default true). */
  showTicks?: boolean;
  /** Status badge under the scale (default: when a value is given). */
  showStatus?: boolean;
  className?: string;
};

const band: Record<BandStatus, string> = {
  ok: "bg-ok/35",
  warning: "bg-warning/35",
  critical: "bg-critical/35",
};
const marker = {
  ok: "bg-ok",
  warning: "bg-warning",
  critical: "bg-critical",
  neutral: "bg-insufficient",
} as const;

/**
 * The threshold scale: value marker over ok / warning / critical bands.
 * Follows the reading direction (low values start at the reading start). The bands and
 * marker are decorative; the accessible name states the limits, the value and its
 * status, and the status badge carries icon + text next to the colour.
 */
export function ThresholdScale({
  limits,
  value = null,
  unit,
  size = "sm",
  showTicks = true,
  showStatus,
  className,
}: ThresholdScaleProps) {
  const t = useTranslations("indicators.scale");
  const tStatus = useTranslations("common.status");

  if (!limits) {
    return (
      <div
        data-testid="scale-none"
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full bg-nolimits-soft px-2.5 py-1 text-[12.5px] font-medium text-nolimits",
          className,
        )}
      >
        <Info aria-hidden="true" className="size-3.5 shrink-0" />
        <span>{t("noLimits")}</span>
      </div>
    );
  }

  const percent = unit === "%";
  const geo = scaleGeometry(limits, value, {
    bounds: percent ? { min: 0, max: 100 } : undefined,
    minTickGap: size === "lg" ? 6 : 9,
  });
  const status = statusOf(value, limits);
  const hasValue = value !== null && value !== undefined && Number.isFinite(value);
  const withUnit = (n: number) => `${formatLimit(n)}${percent ? "%" : ""}`;

  const f = (n: number) => withUnit(n);
  const description =
    limits.kind === "range"
      ? t("range", { minOk: f(limits.minOk), maxOk: f(limits.maxOk), critMin: f(limits.critMin), critMax: f(limits.critMax) })
      : t(limits.kind, { target: f(limits.target), warning: f(limits.warning), critical: f(limits.critical) });
  const label = hasValue
    ? `${description}. ${t("value", { value: withUnit(value as number) })}: ${tStatus(status)}`
    : description;

  return (
    <div className={cn("flex min-w-[150px] flex-col gap-1.5", className)}>
      <div role="img" aria-label={label} data-testid="threshold-scale" className="relative pt-1.5">
        <div
          aria-hidden="true"
          className={cn("flex gap-0.5 overflow-hidden rounded-full", size === "lg" ? "h-3" : "h-2")}
        >
          {geo.segments.map((s, i) => (
            <i
              key={i}
              data-band={s.status}
              className={cn("block h-full", band[s.status])}
              style={{ width: `${s.size}%` }}
            />
          ))}
        </div>
        {geo.marker !== null ? (
          <b
            aria-hidden="true"
            data-testid="scale-marker"
            className={cn(
              "absolute top-0 -translate-x-1/2 rounded-[3px] shadow-[0_0_0_2px_var(--surface)] rtl:translate-x-1/2",
              size === "lg" ? "h-[26px] w-[5px]" : "h-5 w-1",
              marker[markerTone(status)],
            )}
            style={{ insetInlineStart: `${geo.marker}%` }}
          />
        ) : null}
        {showTicks ? (
          <div aria-hidden="true" className="relative mt-1 h-[18px] text-[11px] text-fg-3">
            {geo.ticks.map((tick) => (
              // The positioned wrapper keeps the page direction; only the number is isolated LTR.
              <span
                key={tick.value}
                className="absolute -translate-x-1/2 whitespace-nowrap rtl:translate-x-1/2"
                style={{ insetInlineStart: `${tick.pos}%` }}
              >
                <span className="num">{withUnit(tick.value)}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {(showStatus ?? hasValue) && hasValue ? <StatusBadge status={status} /> : null}
    </div>
  );
}
