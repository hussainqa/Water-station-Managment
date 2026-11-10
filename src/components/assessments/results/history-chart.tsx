"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatusBadge } from "@/components/indicators/status-badge";
import { getIndicatorHistoryAction } from "@/lib/assessments/actions";
import type { HistoryPoint, ResultRow } from "@/lib/assessments/types";
import { chartDomain, formatNumber, shapeHistory, type ChartRow } from "./helpers";
import { useRowText } from "./row-text";

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; points: HistoryPoint[] };

type Props = {
  plantId: string;
  months: number;
  row: ResultRow;
};

const AXIS = { fontSize: 11, fill: "var(--fg-3)" } as const;

/**
 * The indicator across this plant's approved assessments of the same length, oldest to
 * newest in reading direction (the x axis is reversed in Arabic). Dashed lines are the
 * warning and critical limits of each assessment's own snapshot. A collapsed table carries
 * the same numbers for assistive technology.
 */
export function HistoryChart({ plantId, months, row }: Props) {
  const t = useTranslations("assessments.drawer");
  const rt = useRowText();
  const locale = useLocale();
  const rtl = locale === "ar";
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let live = true;
    getIndicatorHistoryAction({ plantId, ref: row.ref, months }).then(
      (r) => live && setLoad(r.ok ? { state: "ready", points: r.data } : { state: "error" }),
      () => live && setLoad({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [plantId, row.ref, months]);

  const data = useMemo(() => (load.state === "ready" ? shapeHistory(load.points, locale) : null), [load, locale]);

  if (load.state === "loading") {
    return (
      <p role="status" className="py-6 text-center text-[13px] text-fg-3">
        {t("historyLoading")}
      </p>
    );
  }
  if (load.state === "error" || !data) {
    return (
      <p role="alert" className="py-6 text-center text-[13px] text-critical">
        {t("historyFailed")}
      </p>
    );
  }
  if (data.rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-fg-3">{t("historyEmpty")}</p>;
  }

  const name = rt.name(row);
  const first = data.rows[0];
  const last = data.rows[data.rows.length - 1];
  const summary = t("historySummary", { count: data.rows.length, name, first: first.full, last: last.full });
  const domain = chartDomain(data, row.unit);
  const single = data.rows.length === 1;
  const hasMissing = data.rows.some((r) => r.value === null);
  const fmt = (n: number | null) => (n === null ? "—" : formatNumber(n));
  const pair = (a: number | null, b: number | null) => [a, b].filter((x) => x !== null).map(fmt).join(" – ");

  const limitLine = (key: "warnA" | "warnB" | "critA" | "critB", color: string) => {
    if (!data.rows.some((r) => r[key] !== null)) return null;
    if (single) {
      const y = data.rows[0][key];
      return y === null ? null : (
        <ReferenceLine key={key} y={y} stroke={color} strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain" />
      );
    }
    return (
      <Line
        key={key}
        dataKey={key}
        type="stepAfter"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="5 4"
        dot={false}
        activeDot={false}
        connectNulls
        isAnimationActive={false}
        legendType="none"
      />
    );
  };

  return (
    <div data-testid="history" className="flex flex-col gap-2.5">
      <div role="img" aria-label={summary} data-testid="history-chart" className="h-[210px] w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={data.rows} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              reversed={rtl}
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: "var(--line-2)" }}
              interval="preserveStartEnd"
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              orientation={rtl ? "right" : "left"}
              domain={domain}
              tick={AXIS}
              tickLine={false}
              axisLine={false}
              width={38}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            {limitLine("warnA", "var(--warn)")}
            {limitLine("warnB", "var(--warn)")}
            {limitLine("critA", "var(--crit)")}
            {limitLine("critB", "var(--crit)")}
            <Line
              dataKey="value"
              name={t("legendValue")}
              type="monotone"
              stroke="var(--s1)"
              strokeWidth={2.25}
              dot={{ r: 3.5, fill: "var(--s1)", stroke: "var(--surface)", strokeWidth: 1.5 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--line-2)" }}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--line-2)",
                borderRadius: 10,
                fontSize: 12.5,
                direction: rtl ? "rtl" : "ltr",
              }}
              labelFormatter={(_l, payload) => (payload?.[0]?.payload as ChartRow | undefined)?.full ?? ""}
              formatter={(v) => [fmt(typeof v === "number" ? v : null), t("legendValue")]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px] text-fg-3">
        <li className="flex items-center gap-1.5">
          <i aria-hidden="true" className="inline-block h-[3px] w-4 rounded-full" style={{ background: "var(--s1)" }} />
          {t("legendValue")}
        </li>
        {data.hasLimits ? (
          <>
            <li className="flex items-center gap-1.5">
              <i aria-hidden="true" className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--warn)" }} />
              {t("legendWarning")}
            </li>
            <li className="flex items-center gap-1.5">
              <i aria-hidden="true" className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--crit)" }} />
              {t("legendCritical")}
            </li>
          </>
        ) : null}
      </ul>
      {single ? <p className="m-0 text-[12.5px] text-fg-3">{t("historyOnePoint")}</p> : null}
      {hasMissing ? <p className="m-0 text-[12.5px] text-fg-3">{t("historyMissing")}</p> : null}

      <details className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px]">
        <summary className="cursor-pointer font-medium">{t("table")}</summary>
        <div className="mt-2 overflow-x-auto">
          <table data-testid="history-table" className="w-full border-collapse text-start text-[12.5px]">
            <caption className="sr-only">{summary}</caption>
            <thead>
              <tr className="text-fg-3">
                <th scope="col" className="py-1 pe-3 text-start font-medium">{t("tablePeriod")}</th>
                <th scope="col" className="py-1 pe-3 text-start font-medium">{t("tableValue")}</th>
                <th scope="col" className="py-1 pe-3 text-start font-medium">{t("tableStatus")}</th>
                <th scope="col" className="py-1 text-start font-medium">{t("tableLimits")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} data-testid="history-row" className="border-t border-border">
                  <th scope="row" className="py-1.5 pe-3 text-start font-normal">{r.full}</th>
                  <td className="num py-1.5 pe-3 text-start">{fmt(r.value)}</td>
                  <td className="py-1.5 pe-3">{r.status ? <StatusBadge status={r.status} /> : "—"}</td>
                  <td className="num py-1.5 text-start">
                    {r.warnA === null ? "—" : `${pair(r.warnA, r.warnB)} / ${pair(r.critA, r.critB)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
