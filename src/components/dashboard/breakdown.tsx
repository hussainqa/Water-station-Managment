import { Factory } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { periodLabel } from "@/components/assessments/results/helpers";
import { STATUS_LOOK, STATUS_ORDER } from "@/components/assessments/results/status-look";
import { EmptyState } from "@/components/shell/empty-state";
import { Link } from "@/i18n/navigation";
import type { PlantBreakdown } from "@/lib/dashboard/types";
import { cn } from "cn";

/** solid segment colours of the stacked bar (the legend and the counts carry icon + text) */
const SEGMENT: Record<string, string> = {
  ok: "bg-ok",
  warning: "bg-warning",
  critical: "bg-critical",
  insufficient_data: "bg-insufficient",
  no_limits: "bg-nolimits",
};

function Legend() {
  const tStatus = useTranslations("common.status");
  const t = useTranslations("dashboard.breakdown");
  return (
    <ul
      aria-label={t("legend")}
      data-testid="breakdown-legend"
      className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-[12.5px] text-fg-2"
    >
      {STATUS_ORDER.map((s) => {
        const { icon: Icon, text } = STATUS_LOOK[s];
        return (
          <li key={s} className="inline-flex items-center gap-1.5">
            <i aria-hidden="true" className={cn("block size-2.5 rounded-[3px]", SEGMENT[s])} />
            <Icon aria-hidden="true" className={cn("size-3.5", text)} />
            <span>{tStatus(s)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function PlantCard({ item }: { item: PlantBreakdown }) {
  const t = useTranslations("dashboard.breakdown");
  const tStatus = useTranslations("common.status");
  const locale = useLocale();
  const l = item.latest;
  const period = l ? periodLabel(l.periodStart, l.months, locale) : "";
  const present = l ? STATUS_ORDER.filter((s) => l.counts[s] > 0) : [];

  return (
    <li
      data-testid="breakdown-plant"
      data-plant-id={item.plantId}
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="min-w-0 break-words text-[14.5px] font-semibold">
          {item.plantName}
          {l ? <span data-testid="breakdown-period" className="ms-1.5 text-[13px] font-normal text-fg-3">· {period}</span> : null}
        </h3>
        {l ? (
          <span data-testid="breakdown-summary" className="text-[13px] text-fg-2">
            {t("summary", { ok: l.counts.ok, total: l.total })}
          </span>
        ) : null}
      </div>
      {l ? (
        <>
          <div
            role="img"
            aria-label={t("barLabel", {
              plant: item.plantName,
              period,
              parts: present.map((s) => `${tStatus(s)} ${l.counts[s]}`).join(", "),
            })}
            className="flex h-3 w-full gap-px overflow-hidden rounded-full bg-muted"
          >
            {present.map((s) => (
              <span
                key={s}
                data-status={s}
                className={cn("block h-full", SEGMENT[s])}
                style={{ flexGrow: l.counts[s], flexBasis: 0 }}
              />
            ))}
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {present.map((s) => {
              const { icon: Icon, tone, text } = STATUS_LOOK[s];
              return (
                <li
                  key={s}
                  data-status={s}
                  className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium", tone, text)}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  <span className="num">{l.counts[s]}</span>
                  <span>{tStatus(s)}</span>
                </li>
              );
            })}
          </ul>
          <Link
            href={`/assessments/${l.assessmentId}`}
            data-testid="breakdown-open"
            aria-label={t("openLabel", { plant: item.plantName, period })}
            className="w-fit text-[13px] font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t("open")}
          </Link>
        </>
      ) : (
        <>
          <div aria-hidden="true" className="h-3 w-full rounded-full bg-muted" />
          <p data-testid="breakdown-none" className="m-0 text-[13px] text-fg-3">
            {t("notAssessed")}
          </p>
        </>
      )}
    </li>
  );
}

export function Breakdown({ items }: { items: PlantBreakdown[] }) {
  const t = useTranslations("dashboard.breakdown");
  const any = items.some((i) => i.latest);
  return (
    <section
      data-testid="breakdown"
      aria-labelledby="dash-breakdown-title"
      className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) sm:p-5"
    >
      <h2 id="dash-breakdown-title" className="text-[17px] font-bold">{t("title")}</h2>
      <p className="m-0 mt-0.5 text-[13px] text-fg-3">{t("text")}</p>
      {!any ? <EmptyState icon={Factory} title={t("empty.title")} text={t("empty.text")} className="py-6" /> : null}
      <ul
        aria-label={t("listLabel")}
        className="m-0 mt-4 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(100%,19rem),1fr))]"
      >
        {items.map((i) => (
          <PlantCard key={i.plantId} item={i} />
        ))}
      </ul>
      {any ? (
        <div className="mt-4">
          <Legend />
        </div>
      ) : null}
    </section>
  );
}
