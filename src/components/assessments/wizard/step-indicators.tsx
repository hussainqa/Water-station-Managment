"use client";

import { ListChecks } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState } from "@/components/shell/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { localName } from "@/components/indicators/format";
import { Link } from "@/i18n/navigation";
import type { WizardContext } from "@/lib/assessments/types";
import { TriStateCheckbox, card } from "./bits";
import { allIndicators, groupCheckState, toggleGroup } from "./lib";

type Props = {
  context: WizardContext;
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
};

export function StepIndicators({ context, selected, onChange }: Props) {
  const t = useTranslations("wizard");
  const locale = useLocale();
  const all = allIndicators(context.groups);

  if (all.length === 0) {
    return (
      <section className={card} aria-labelledby="wiz-step-title">
        <h2 id="wiz-step-title" data-step-heading tabIndex={-1} className="sr-only">
          {t("indicators.title")}
        </h2>
        <EmptyState
          icon={ListChecks}
          title={t("indicators.noneAdopted.title")}
          text={t("indicators.noneAdopted.text")}
          action={
            <Link href="/indicators" className={buttonVariants({ size: "lg" })}>{t("indicators.noneAdopted.cta")}</Link>
          }
        />
      </section>
    );
  }

  return (
    <section className={card} aria-labelledby="wiz-step-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="wiz-step-title" data-step-heading tabIndex={-1} className="text-lg font-bold outline-none">
            {t("indicators.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("indicators.desc", { plant: context.plant.name })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="h-9" onClick={() => onChange(new Set(all.map((i) => i.ref)))}>
            {t("indicators.selectAll")}
          </Button>
          <Button variant="ghost" size="lg" className="h-9" onClick={() => onChange(new Set())}>
            {t("indicators.clear")}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-5">
        {context.groups.map((g) => {
          const state = groupCheckState(g, selected);
          const count = g.indicators.filter((i) => selected.has(i.ref)).length;
          return (
            <fieldset key={g.key} data-group={g.key} className="min-w-0 rounded-xl border border-border p-3 sm:p-4">
              <legend className="px-1">
                <label className="flex cursor-pointer items-center gap-2.5 font-semibold">
                  <TriStateCheckbox
                    checked={state === "all"}
                    indeterminate={state === "some"}
                    onChange={() => onChange(toggleGroup(g, selected))}
                    data-testid="group-checkbox"
                  />
                  <span>{localName(g, locale)}</span>
                  <span className="num text-[12.5px] font-normal text-fg-3">
                    {t("indicators.groupCount", { selected: count, total: g.indicators.length })}
                  </span>
                </label>
              </legend>
              <ul className="mt-2 flex flex-col gap-2">
                {g.indicators.map((i) => {
                  const on = selected.has(i.ref);
                  return (
                    <li key={i.ref}>
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 ${on ? "border-primary/40 bg-accent" : "border-border bg-card hover:bg-muted"}`}
                      >
                        <TriStateCheckbox
                          className="mt-0.5"
                          checked={on}
                          onChange={() => {
                            const next = new Set(selected);
                            if (on) next.delete(i.ref);
                            else next.add(i.ref);
                            onChange(next);
                          }}
                          data-ref={i.ref}
                        />
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          {i.code ? (
                            <span className="num rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs">{i.code}</span>
                          ) : null}
                          <span className="font-medium">{localName(i, locale)}</span>
                          {!i.isSystem ? (
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-fg-3">
                              {t("indicators.userAdded")}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}
