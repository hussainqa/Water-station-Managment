"use client";

import { useLocale, useTranslations } from "next-intl";
import { Callout, card } from "./bits";
import { Field, control, nativeSelect } from "@/components/indicators/form-bits";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import type { ConflictingAssessment, FieldErrors } from "@/lib/assessments/schemas";
import { periodEndMonth, type PeriodMonths } from "@/lib/evaluation";
import { PERIOD_CHOICES, monthLabel, monthOptions, periodLabel, withPeriod, type Details } from "./lib";

type Props = {
  plants: { id: string; name: string }[];
  details: Details;
  onChange: (d: Details) => void;
  errors: FieldErrors;
  conflict: { kind: "duplicate" | "overlap"; with?: ConflictingAssessment } | null;
  now: Date;
};

export function StepDetails({ plants, details: d, onChange, errors, conflict, now }: Props) {
  const t = useTranslations("wizard");
  const locale = useLocale();
  const err = (k: string) => (errors[k] ? t(`errors.${errors[k]}` as never) : undefined);
  const options = monthOptions(d.months, now);
  if (!options.includes(d.periodStart)) options.push(d.periodStart);
  const set = (patch: Partial<Details>) => onChange({ ...d, ...patch });

  return (
    <section className={card} aria-labelledby="wiz-step-title">
      <h2 id="wiz-step-title" data-step-heading tabIndex={-1} className="text-lg font-bold outline-none">
        {t("details.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("details.desc")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t("details.plant")} required error={err("plantId")}>
          {({ id, describedBy, invalid }) => (
            <select
              id={id}
              className={nativeSelect}
              value={d.plantId}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => set({ plantId: e.target.value })}
            >
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t("details.period")} required>
          {({ id }) => (
            <select
              id={id}
              className={nativeSelect}
              value={d.months}
              onChange={(e) => onChange(withPeriod(d, { months: Number(e.target.value) as PeriodMonths }, now))}
            >
              {PERIOD_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {t(`details.periods.${n}` as never)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label={d.months === 1 ? t("details.month") : t("details.startMonth")}
          required
          error={err("periodStart")}
          hint={d.months > 1 ? t("details.periodRange", { range: periodLabel(d.periodStart, d.months, locale) }) : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <select
              id={id}
              className={nativeSelect}
              value={d.periodStart}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => onChange(withPeriod(d, { periodStart: e.target.value }, now))}
            >
              {options.map((key) => (
                <option key={key} value={key}>
                  {monthLabel(key, locale)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t("details.enteredBy")} required error={err("enteredBy")}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              className={control}
              value={d.enteredBy}
              autoComplete="name"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => set({ enteredBy: e.target.value })}
            />
          )}
        </Field>
        <Field label={t("details.startDate")} error={err("startDate")} hint={t("details.datesHint")}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="date"
              dir="ltr"
              className={`${control} num text-start`}
              value={d.startDate}
              min={`${d.periodStart}-01`}
              max={`${periodEndMonth(d.periodStart, d.months)}-31`}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => set({ startDate: e.target.value })}
            />
          )}
        </Field>
        <Field label={t("details.endDate")} error={err("endDate")}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="date"
              dir="ltr"
              className={`${control} num text-start`}
              value={d.endDate}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => set({ endDate: e.target.value })}
            />
          )}
        </Field>
      </div>

      {conflict ? (
        <Callout tone="warn" role="alert" className="mt-4">
          <p data-testid="wizard-conflict" className="font-semibold">
            {t(`conflict.${conflict.kind}`, {
              period: conflict.with ? periodLabel(conflict.with.periodStart, conflict.with.months, locale) : "",
            })}
          </p>
          {conflict.with ? (
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-card px-2.5 py-0.5 text-[12.5px] font-medium">
                {t(`conflict.${conflict.with.status}`)}
              </span>
              <Link
                className="font-semibold text-primary underline underline-offset-4"
                href={
                  conflict.with.status === "draft"
                    ? `/assessments/new?draft=${conflict.with.id}`
                    : `/assessments/${conflict.with.id}`
                }
              >
                {conflict.with.status === "draft" ? t("conflict.resume") : t("conflict.open")}
              </Link>
            </p>
          ) : null}
        </Callout>
      ) : null}
    </section>
  );
}
