"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { STEPS, type Step } from "./lib";
import { cn } from "cn";

const NAMES = { 1: "details", 2: "indicators", 3: "readings", 4: "review" } as const;

/** Done steps can be revisited; upcoming steps are reached with "Next" once the current one is valid. */
export function Stepper({
  step,
  canGoBackTo,
  onGo,
}: {
  step: Step;
  canGoBackTo: (n: Step) => boolean;
  onGo: (n: Step) => void;
}) {
  const t = useTranslations("wizard");
  return (
    <nav aria-label={t("stepper.label")}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {STEPS.map((n, i) => {
          const done = n < step;
          const cur = n === step;
          const name = t(`steps.${NAMES[n]}`);
          return (
            <li key={n} className="flex items-center gap-1.5">
              {i ? <span aria-hidden="true" className="h-px w-5 bg-line-2 sm:w-7" /> : null}
              <button
                type="button"
                data-step={n}
                aria-current={cur ? "step" : undefined}
                disabled={!done || !canGoBackTo(n)}
                onClick={() => onGo(n)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-1.5 py-1 text-[13.5px] font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  cur ? "text-foreground" : done ? "text-muted-foreground" : "text-fg-3",
                )}
              >
                <span
                  className={cn(
                    "num grid size-[26px] shrink-0 place-items-center rounded-full border-[1.5px] text-[12.5px]",
                    cur && "border-primary bg-primary text-primary-foreground",
                    done && "border-ok bg-ok text-white",
                    !cur && !done && "border-line-2",
                  )}
                >
                  {done ? <Check aria-hidden="true" className="size-3.5" /> : n}
                </span>
                <span className={cn(!cur && "max-sm:sr-only")}>
                  {name}
                  {done ? <span className="sr-only"> ({t("stepper.done")})</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
