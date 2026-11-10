"use client";

import { Fragment } from "react";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/indicators/status-badge";
import { localName } from "@/components/indicators/format";
import { Button } from "@/components/ui/button";
import { statusOf } from "@/lib/evaluation";
import type { WizardGroup } from "@/lib/assessments/types";
import { Callout, StatePill, card } from "./bits";
import { countStates, formatValue, formulaText, type Details, type Evaluated } from "./lib";
import { displayUnit } from "./unit";
import { periodLabel } from "./lib";
import { cn } from "cn";

type Props = {
  plantName: string;
  details: Details;
  groups: WizardGroup[];
  rows: Evaluated[];
  ack: boolean;
  onAck: (v: boolean) => void;
  onEdit: (ref: string) => void;
};

export function StepReview({ plantName, details: d, groups, rows, ack, onAck, onEdit }: Props) {
  const t = useTranslations("wizard");
  const tUnits = useTranslations("indicators");
  const locale = useLocale();
  const c = countStates(rows);
  const incomplete = rows.filter((r) => r.result.state === "missing" || r.result.state === "partial");
  const errored = rows.filter((r) => r.result.state === "error");
  const byRef = new Map(rows.map((r) => [r.ind.ref, r]));

  return (
    <div className="flex flex-col gap-4">
      <section className={card} aria-labelledby="wiz-step-title">
        <h2 id="wiz-step-title" data-step-heading tabIndex={-1} className="text-lg font-bold outline-none">
          {t("review.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("review.desc")}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2.5 text-sm lg:grid-cols-4">
          {[
            [t("review.plant"), plantName],
            [t("review.period"), periodLabel(d.periodStart, d.months, locale)],
            [t("review.range"), `${d.startDate} — ${d.endDate}`, true],
            [t("review.enteredBy"), d.enteredBy],
          ].map(([k, v, num]) => (
            <div key={String(k)} className="rounded-xl bg-muted p-3">
              <dt className="text-xs text-fg-3">{k}</dt>
              <dd className={cn("m-0 mt-0.5 font-semibold", num && "num rtl:text-end")}>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <table className="w-full border-collapse text-sm max-md:block">
            <thead className="max-md:sr-only">
              <tr className="bg-muted text-start text-[12.5px] text-fg-3">
                <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("review.indicator")}</th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("review.inputs")}</th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("review.value")}</th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("review.entryStatus")}</th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">{t("review.statusPreview")}</th>
                <th scope="col" className="w-px px-3 py-2.5"><span className="sr-only">{t("review.edit")}</span></th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {groups.map((g) => {
                const list = g.indicators.map((i) => byRef.get(i.ref)).filter((r): r is Evaluated => !!r);
                if (!list.length) return null;
                return (
                  <Fragment key={g.key}>
                    <tr className="bg-secondary max-md:block">
                      <th scope="colgroup" colSpan={6} className="px-3 py-2 text-start text-[13px] font-bold max-md:block">
                        {localName(g, locale)}
                      </th>
                    </tr>
                    {list.map((r) => (
                      <ReviewRow key={r.ind.ref} row={r} onEdit={onEdit} locale={locale} unit={displayUnit(r.ind, tUnits as never)} />
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2.5 text-[12.5px] text-fg-3">{t("review.previewNote")}</p>
      </section>

      {errored.length ? (
        <Callout tone="crit" role="alert">
          <p className="font-semibold">{t("review.errorsTitle")}</p>
          <p className="mt-1">{t("review.errorsFix", { count: errored.length })}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {errored.map((r) => (
              <li key={r.ind.ref}>
                <button
                  type="button"
                  onClick={() => onEdit(r.ind.ref)}
                  className="rounded-lg bg-card px-2.5 py-1 text-[13px] font-semibold text-critical underline underline-offset-4"
                >
                  {r.ind.code ?? localName(r.ind, locale)}
                </button>
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {incomplete.length ? (
        <Callout tone="warn">
          <p className="font-semibold">{t("review.missingTitle", { count: incomplete.length })}</p>
          <p className="mt-1">
            {incomplete.map((r) => localName(r.ind, locale)).join(locale === "ar" ? "، " : ", ")}. {t("review.missingText")}
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 font-medium">
            <input
              type="checkbox"
              className="mt-0.5 size-[18px] shrink-0 accent-primary"
              checked={ack}
              onChange={(e) => onAck(e.target.checked)}
            />
            <span>{t("review.ack")}</span>
          </label>
        </Callout>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {t("review.summary", { complete: c.complete, missing: c.missing + c.partial, errors: c.error })}
      </p>
    </div>
  );
}

function ReviewRow({
  row,
  onEdit,
  locale,
  unit,
}: {
  row: Evaluated;
  onEdit: (ref: string) => void;
  locale: string;
  unit: string;
}) {
  const t = useTranslations("wizard");
  const { ind, reading, result } = row;
  const tone =
    result.state === "error" ? "bg-critical-soft" : result.state === "complete" ? "" : "bg-warning-soft";
  const status = result.state === "complete" ? statusOf(result.value, ind.limits) : null;
  const cell = "px-3 py-2.5 align-top max-md:flex max-md:items-start max-md:justify-between max-md:gap-3 max-md:py-1.5";
  const lab = "hidden shrink-0 text-xs text-fg-3 max-md:block";
  return (
    <tr data-review={ind.ref} data-state={result.state} className={cn("border-t border-border max-md:block max-md:px-0 max-md:py-2", tone)}>
      <th scope="row" className={cn(cell, "text-start font-medium")}>
        <span className="min-w-0">
          {localName(ind, locale)}
          {ind.code ? <small className="num block text-xs text-fg-3">{ind.code}</small> : null}
        </span>
      </th>
      <td className={cell}>
        <span className={lab}>{t("review.inputs")}</span>
        <span className="min-w-0 text-[13px] text-muted-foreground max-md:text-end">
          {ind.inputs.map((f) => (
            <span key={f.key} className="block">
              {locale === "en" ? f.labelEn : f.labelAr}:{" "}
              <span className="num font-medium text-foreground">{reading.inputs[f.key] || t("review.none")}</span>
              {f.unitChoices && reading.inputs.unit === "min" ? ` ${t("readings.unitShort.min")}` : ""}
            </span>
          ))}
        </span>
      </td>
      <td className={cell}>
        <span className={lab}>{t("review.value")}</span>
        <span className="num whitespace-nowrap font-semibold" title={formulaText(ind.method, reading.inputs, result.value, unit, "min") ?? undefined}>
          {result.value !== null ? `${formatValue(result.value)} ${unit}`.trim() : t("review.none")}
        </span>
      </td>
      <td className={cell}>
        <span className={lab}>{t("review.entryStatus")}</span>
        <span className="flex flex-col items-start gap-1 max-md:items-end">
          <StatePill state={result.state} />
          {Object.entries(result.errors).map(([k, code]) => (
            <span key={k} className="text-xs text-critical">
              {t(`errors.${code}` as never)}
            </span>
          ))}
        </span>
      </td>
      <td className={cell}>
        <span className={lab}>{t("review.statusPreview")}</span>
        {status ? (
          <StatusBadge status={status} />
        ) : result.state === "error" ? (
          <span className="text-fg-3">{t("review.none")}</span>
        ) : (
          <StatusBadge status="insufficient_data" />
        )}
      </td>
      <td className={cn(cell, "max-md:justify-end")}>
        <Button variant="ghost" size="sm" onClick={() => onEdit(ind.ref)}>
          {t("review.edit")}
        </Button>
      </td>
    </tr>
  );
}
