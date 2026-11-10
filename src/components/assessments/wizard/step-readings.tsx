"use client";

import { useLocale, useTranslations } from "next-intl";
import { Field, control, nativeSelect } from "@/components/indicators/form-bits";
import { localName } from "@/components/indicators/format";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_MAX } from "@/lib/assessments/schemas";
import { StatePill, card } from "./bits";
import { countStates, formulaText, type Evaluated, type ReadingState } from "./lib";
import { displayUnit } from "./unit";
import { cn } from "cn";

type Props = {
  rows: Evaluated[];
  onChange: (ref: string, next: ReadingState) => void;
  desc: string;
};

export function StepReadings({ rows, onChange, desc }: Props) {
  const t = useTranslations("wizard");
  const c = countStates(rows);
  return (
    <div className="flex flex-col gap-4">
      <section className={card} aria-labelledby="wiz-step-title">
        <h2 id="wiz-step-title" data-step-heading tabIndex={-1} className="text-lg font-bold outline-none">
          {t("readings.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px]">
          <span data-testid="wizard-progress-text">
            {t("readings.progress", { done: c.complete, total: rows.length })}
          </span>
          {c.error ? (
            <span className="font-medium text-critical">{t("readings.errorCount", { count: c.error })}</span>
          ) : null}
        </div>
        <Progress
          className="mt-2 [&_[data-slot=progress-track]]:h-1.5"
          value={c.complete}
          max={Math.max(rows.length, 1)}
          aria-label={t("readings.progressLabel")}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((r) => (
          <ReadingCard key={r.ind.ref} row={r} onChange={(next) => onChange(r.ind.ref, next)} />
        ))}
      </div>
    </div>
  );
}

function ReadingCard({ row, onChange }: { row: Evaluated; onChange: (r: ReadingState) => void }) {
  const t = useTranslations("wizard");
  const tUnits = useTranslations("indicators");
  const locale = useLocale();
  const { ind, reading, result } = row;
  const unit = displayUnit(ind, tUnits as never);
  const setInput = (key: string, v: string) =>
    onChange({ ...reading, inputs: { ...reading.inputs, [key]: v } });
  const direct = ind.method === "direct" || ind.method === "direct_percent";
  const calc = ind.method === "ratio" || ind.method === "average" || ind.method === "duration";
  const formulaFinal =
    result.value !== null
      ? formulaText(ind.method, reading.inputs, result.value, unit, t("readings.unitShort.min"))
      : null;

  return (
    <article
      data-reading={ind.ref}
      data-state={result.state}
      aria-label={localName(ind, locale)}
      className={cn(card, "flex flex-col gap-3.5", result.state === "error" && "border-critical/50")}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {ind.code ? <span className="num rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs">{ind.code}</span> : null}
          <h3 className="mt-1 text-[15px] font-semibold leading-snug">{localName(ind, locale)}</h3>
        </div>
        <StatePill state={result.state} />
      </header>

      {ind.inputs.map((f) => {
        const code = result.errors[f.key];
        const label = locale === "en" ? f.labelEn : f.labelAr;
        const unitChoices = f.unitChoices;
        return (
          <Field key={f.key} label={label} error={code ? t(`errors.${code}` as never) : undefined}>
            {({ id, describedBy, invalid }) => (
              <div className="flex gap-2">
                <Input
                  id={id}
                  data-input={`${ind.ref}.${f.key}`}
                  className={`${control} num min-w-0 flex-1 text-start`}
                  dir="ltr"
                  inputMode={f.integer ? "numeric" : "decimal"}
                  autoComplete="off"
                  value={reading.inputs[f.key] ?? ""}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  onChange={(e) => setInput(f.key, e.target.value)}
                />
                {unitChoices ? (
                  <select
                    className={cn(nativeSelect, "w-auto shrink-0")}
                    aria-label={t("readings.unitLabel")}
                    value={reading.inputs.unit === "min" ? "min" : "h"}
                    onChange={(e) => setInput("unit", e.target.value)}
                  >
                    {unitChoices.map((u) => (
                      <option key={u} value={u}>
                        {t(`readings.units.${u}`)}
                      </option>
                    ))}
                  </select>
                ) : direct && unit ? (
                  <span className="flex min-w-12 items-center justify-center rounded-[11px] bg-secondary px-3 text-[13px] text-fg-3">
                    {unit}
                  </span>
                ) : null}
              </div>
            )}
          </Field>
        );
      })}

      <div
        data-testid="computed"
        className="rounded-xl border border-dashed border-line-2 bg-muted p-3"
        aria-live="polite"
      >
        {result.value !== null && formulaFinal ? (
          <>
            <span className="rounded-md bg-teal-soft px-2 py-0.5 text-xs font-semibold text-teal">
              {calc ? t("readings.calculated") : t("readings.recorded")}
            </span>
            <p className="num mt-1.5 text-[15px] font-semibold" data-testid="formula">
              {formulaFinal}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-fg-3">
            {result.state === "error" ? t("readings.valueFix") : t("readings.valueWaiting")}
          </p>
        )}
      </div>

      <details open={reading.note !== "" || undefined} className="text-sm">
        <summary className="w-fit cursor-pointer rounded-md py-1 text-[13px] font-medium text-primary">
          {t("readings.addNote")}
        </summary>
        <Textarea
          className="mt-2"
          aria-label={t("readings.note")}
          placeholder={t("readings.notePlaceholder")}
          maxLength={NOTE_MAX}
          value={reading.note}
          onChange={(e) => onChange({ ...reading, note: e.target.value })}
        />
      </details>
    </article>
  );
}
