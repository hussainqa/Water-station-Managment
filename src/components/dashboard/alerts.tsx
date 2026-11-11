import { CircleCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { crossedLimit, periodLabel } from "@/components/assessments/results/helpers";
import { StatusBadge } from "@/components/indicators/status-badge";
import { StageChip } from "@/components/problems/list/stage-chip";
import { EmptyState } from "@/components/shell/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { DashboardAlert } from "@/lib/dashboard/types";
import { cn } from "cn";
import { iso, valueText } from "./format";

function useAlertText() {
  const locale = useLocale();
  const tInd = useTranslations("indicators");
  const tAsm = useTranslations("assessments");
  const t = useTranslations("dashboard.alerts");
  const unitLabel = (unit: string) => (unit && tInd.has(`units.${unit}`) ? tInd(`units.${unit}`) : unit);
  return {
    t,
    name: (a: DashboardAlert) => (locale === "en" && a.nameEn ? a.nameEn : a.nameAr),
    period: (a: DashboardAlert) => periodLabel(a.periodStart, a.months, locale),
    value: (a: DashboardAlert) => valueText(a.value, a.unit, unitLabel, "—"),
    limit: (a: DashboardAlert) => {
      const p = crossedLimit(a.limits, a.status, a.unit);
      return p
        ? tAsm(`limit.${p.key}`, Object.fromEntries(Object.entries(p.values).map(([k, v]) => [k, iso(v)])))
        : "—";
    },
  };
}

function Action({ a }: { a: DashboardAlert }) {
  const x = useAlertText();
  const name = x.name(a);
  return a.problem ? (
    <div className="flex flex-col items-start gap-1.5">
      <Link
        href={`/problems/${a.problem.id}`}
        data-testid="alert-open-problem"
        aria-label={x.t("openProblemLabel", { indicator: name, plant: a.plantName })}
        className={cn(buttonVariants({ variant: "secondary" }), "h-8 rounded-[9px] px-3 text-[13px]")}
      >
        {x.t("openProblem")}
      </Link>
      <StageChip stage={a.problem.stage} />
    </div>
  ) : (
    <div className="flex flex-col items-start gap-1.5">
      <Link
        href={`/assessments/${a.assessmentId}`}
        data-testid="alert-open-results"
        aria-label={x.t("openResultsLabel", { plant: a.plantName, period: x.period(a), indicator: name })}
        className={cn(buttonVariants({ variant: "outline" }), "h-8 rounded-[9px] px-3 text-[13px]")}
      >
        {x.t("openResults")}
      </Link>
      <span className="text-[12px] text-fg-3">{x.t("noProblemHint")}</span>
    </div>
  );
}

function AlertsTable({ alerts }: { alerts: DashboardAlert[] }) {
  const x = useAlertText();
  const th = "px-3 py-2.5 text-start text-[12.5px] font-medium text-fg-3";
  return (
    <div className="mt-3 hidden overflow-x-auto xl:block">
      <table data-testid="alerts-table" aria-label={x.t("tableLabel")} className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={th}>{x.t("cols.plant")}</th>
            <th scope="col" className={th}>{x.t("cols.indicator")}</th>
            <th scope="col" className={th}>{x.t("cols.value")}</th>
            <th scope="col" className={th}>{x.t("cols.limit")}</th>
            <th scope="col" className={th}>{x.t("cols.status")}</th>
            <th scope="col" className={th}>{x.t("cols.date")}</th>
            <th scope="col" className={th}>{x.t("cols.action")}</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a) => (
            <tr
              key={`${a.assessmentId}-${a.ref}`}
              data-testid="alert-row"
              data-status={a.status}
              data-ref={a.ref}
              data-plant-id={a.plantId}
              className="border-b border-border last:border-b-0 align-top"
            >
              <td className="px-3 py-3" data-testid="alert-plant">{a.plantName}</td>
              <td className="px-3 py-3 font-medium" data-testid="alert-indicator">{x.name(a)}</td>
              <td className="num px-3 py-3" data-testid="alert-value">{x.value(a)}</td>
              <td className="px-3 py-3" data-testid="alert-limit">{x.limit(a)}</td>
              <td className="px-3 py-3"><StatusBadge status={a.status} /></td>
              <td className="num px-3 py-3 whitespace-nowrap" data-testid="alert-date">{a.assessedOn}</td>
              <td className="min-w-[10.5rem] px-3 py-3"><Action a={a} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlertCards({ alerts }: { alerts: DashboardAlert[] }) {
  const x = useAlertText();
  return (
    <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-2.5 p-0 md:grid-cols-2 xl:hidden" aria-label={x.t("tableLabel")}>
      {alerts.map((a) => (
        <li
          key={`${a.assessmentId}-${a.ref}`}
          data-testid="alert-row"
          data-status={a.status}
          data-ref={a.ref}
          data-plant-id={a.plantId}
          className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface-2 p-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-[12.5px] text-fg-3" data-testid="alert-plant">{a.plantName}</p>
              <p className="m-0 mt-0.5 break-words text-[15px] font-semibold" data-testid="alert-indicator">{x.name(a)}</p>
            </div>
            <StatusBadge status={a.status} className="shrink-0" />
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px]">
            <div>
              <dt className="text-[12px] text-fg-3">{x.t("cols.value")}</dt>
              <dd className="num m-0 font-medium" data-testid="alert-value">{x.value(a)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-fg-3">{x.t("cols.limit")}</dt>
              <dd className="m-0" data-testid="alert-limit">{x.limit(a)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-fg-3">{x.t("cols.date")}</dt>
              <dd className="num m-0" data-testid="alert-date">{a.assessedOn}</dd>
            </div>
          </dl>
          <Action a={a} />
        </li>
      ))}
    </ul>
  );
}

export function Alerts({ alerts }: { alerts: DashboardAlert[] }) {
  const t = useTranslations("dashboard.alerts");
  const critical = alerts.filter((a) => a.status === "critical").length;
  const warning = alerts.length - critical;
  return (
    <section
      data-testid="alerts"
      aria-labelledby="dash-alerts-title"
      className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="dash-alerts-title" className="text-[17px] font-bold">{t("title")}</h2>
          <p className="m-0 mt-0.5 text-[13px] text-fg-3">{t("text")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5" data-testid="alerts-chips">
          <StatusBadge status="critical" label={t("critical", { count: critical })} />
          <StatusBadge status="warning" label={t("warning", { count: warning })} />
        </div>
      </div>
      {alerts.length ? (
        <>
          <AlertsTable alerts={alerts} />
          <AlertCards alerts={alerts} />
        </>
      ) : (
        <EmptyState icon={CircleCheck} title={t("empty.title")} text={t("empty.text")} className="py-8" />
      )}
    </section>
  );
}
