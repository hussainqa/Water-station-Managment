"use client";

import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { periodLabel, crossedLimit } from "@/components/assessments/results/helpers";
import { useRowText } from "@/components/assessments/results/row-text";
import { StatusBadge } from "@/components/indicators/status-badge";
import { ThresholdScale } from "@/components/indicators/threshold-scale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { updateDescriptionAction } from "@/lib/problems/actions";
import { DESCRIPTION_MAX } from "@/lib/problems/schemas";
import { sectionCard, StepHeading } from "./bits";
import { useProblem } from "./problem-context";

function Fact({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted p-3">
      <dt className="text-[12px] text-fg-3">{label}</dt>
      <dd data-testid={testId} className="m-0 mt-1 text-[14px] font-semibold leading-snug">
        {children}
      </dd>
    </div>
  );
}

/** Stage 1 of the method: the problem and its measurement facts. */
export function ProblemFacts() {
  const t = useTranslations("problems");
  const rt = useRowText();
  const { problem, mutate, locale, failureText } = useProblem();
  const h = problem.header;
  const unit = h.indicator.unit;
  const descId = useId();
  const [text, setText] = useState(h.description);
  const [busy, setBusy] = useState(false);
  const dirty = text.trim() !== h.description.trim();

  const crossed = h.readingStatus ? crossedLimit(h.limits, h.readingStatus, unit) : null;
  const indicatorName = rt.name({ nameAr: h.indicator.nameAr, nameEn: h.indicator.nameEn });

  async function save() {
    setBusy(true);
    const value = text.trim();
    const r = await mutate(
      { t: "description", value },
      async () => {
        const res = await updateDescriptionAction({ problemId: h.id, description: value });
        return res;
      },
      { silent: true },
    );
    setBusy(false);
    if (r.ok) {
      setText(value);
      toast.success(t("facts.saved"));
    } else {
      toast.error(failureText(r));
    }
  }

  return (
    <section className={sectionCard} aria-labelledby="step-problem" data-testid="section-problem">
      <StepHeading n={1} id="step-problem">
        {t("steps.problem")}
      </StepHeading>
      <dl className="m-0 mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Fact label={t("facts.plant")} testId="fact-plant">
          <bdi>{h.plantName}</bdi>
        </Fact>
        <Fact label={t("facts.indicator")} testId="fact-indicator">
          {indicatorName}
        </Fact>
        <Fact label={t("facts.period")} testId="fact-period">
          <Link
            href={`/assessments/${h.assessmentId}`}
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            aria-label={`${t("facts.periodLink")}: ${periodLabel(h.periodStart, h.months, locale)}`}
          >
            {periodLabel(h.periodStart, h.months, locale)}
            <ChevronRight aria-hidden="true" className="size-3.5 rtl:rotate-180" />
          </Link>
        </Fact>
        <Fact label={t("facts.detected")} testId="fact-detected">
          <span className="num">{h.detectedOn}</span>
        </Fact>
        <Fact label={t("facts.value")} testId="fact-value">
          <span className="num">{rt.value(h.value, unit)}</span>
        </Fact>
        <Fact label={t("facts.limit")} testId="fact-limit">
          {crossed ? <span className="num">{rt.limit(crossed)}</span> : "—"}
        </Fact>
        <Fact label={t("facts.status")} testId="fact-status">
          {h.readingStatus ? <StatusBadge status={h.readingStatus} /> : "—"}
        </Fact>
        <Fact label={t("facts.origin")} testId="fact-origin">
          {h.origin === "manual" ? t("facts.manual") : t("facts.auto")}
        </Fact>
      </dl>
      <div className="mt-4 max-w-xl">
        <ThresholdScale limits={h.limits} value={h.value} unit={unit} size="lg" showStatus={false} />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <label htmlFor={descId} className="text-[13px] font-semibold">
          {t("facts.description")}
        </label>
        <Textarea
          id={descId}
          data-testid="description"
          value={text}
          maxLength={DESCRIPTION_MAX}
          rows={3}
          placeholder={t("facts.descriptionPlaceholder")}
          onChange={(e) => setText(e.target.value)}
          className="min-h-20 text-[14px]"
        />
        <div>
          <Button
            type="button"
            data-testid="description-save"
            variant="secondary"
            disabled={busy || !dirty}
            aria-busy={busy}
            onClick={save}
            className="h-10 rounded-[11px] px-4 text-[14px]"
          >
            {busy ? t("facts.saving") : t("facts.save")}
          </Button>
        </div>
      </div>
    </section>
  );
}

