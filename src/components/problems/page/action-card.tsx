"use client";

import { memo, useId, useState, type ReactNode } from "react";
import { BookOpen, Check, CircleCheck, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { ObstacleTarget, ProblemFailure } from "@/lib/problems/schemas";
import type { ActionState, ActionTexts } from "@/lib/problems/types";
import { useCustomActionOps, useProblem, useSystemActionOps, type ActionOps } from "./problem-context";

type CardProps = {
  /** the visible action text */
  title: string;
  /** rank under an obstacle; null/undefined = no number at all */
  rank?: number | null;
  /** extra rank chips (show-all view: one per selected obstacle it is linked to) */
  extra?: ReactNode;
  state: Pick<ActionState, "chosen" | "needsStudy" | "implementedOn">;
  ops: ActionOps;
  testId?: string;
  code?: string;
  /** body below the title (custom actions) */
  children?: ReactNode;
  /** end-side tools (edit / delete) */
  tools?: ReactNode;
  tag?: string;
};

const btn = "h-9 rounded-[10px] px-3 text-[13.5px]";

function Lifecycle({ state }: { state: CardProps["state"] }) {
  const t = useTranslations("problems.actions");
  const step = state.implementedOn ? 3 : state.chosen ? 2 : 1;
  const on = (n: number) =>
    n <= step
      ? n === 3
        ? "bg-ok-soft text-ok"
        : n === 2
          ? "bg-primary/10 text-primary"
          : "bg-secondary text-foreground"
      : "bg-transparent text-fg-3";
  const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold";
  return (
    <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label={t("stateSuggested")}>
      <li className={cn(chip, on(1))} data-on={step >= 1}>
        {t("stateSuggested")}
      </li>
      <li className={cn(chip, on(2))} data-on={step >= 2} data-testid="state-chosen">
        {step >= 2 ? <Check aria-hidden="true" className="size-3" /> : null}
        {t("stateChosen")}
      </li>
      <li className={cn(chip, on(3))} data-on={step >= 3} data-testid="state-implemented">
        {step >= 3 ? <Check aria-hidden="true" className="size-3" /> : null}
        {t("stateImplemented")}
      </li>
      {state.needsStudy ? (
        <li className={cn(chip, "bg-nolimits-soft text-nolimits")} data-testid="state-study">
          <BookOpen aria-hidden="true" className="size-3" />
          {t("stateStudy")}
        </li>
      ) : null}
    </ol>
  );
}

export function ActionCardView({ title, rank, extra, state, ops, testId, code, children, tools, tag }: CardProps) {
  const t = useTranslations("problems");
  const dateId = useId();
  const errId = useId();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { failureText } = useProblem();

  async function saveDate(value: string | null) {
    setBusy(true);
    setError(null);
    const r = await ops.implement(value);
    setBusy(false);
    if (r.ok) {
      setEditing(false);
      setDate("");
    } else {
      setError(failureText(r as ProblemFailure));
    }
  }

  return (
    <article
      data-testid={testId ?? "action-card"}
      data-action={code}
      data-chosen={state.chosen}
      data-implemented={!!state.implementedOn}
      data-study={state.needsStudy}
      className={cn(
        "flex gap-3 rounded-2xl border bg-card p-3.5 transition-colors sm:p-4",
        state.chosen ? "border-primary/60 bg-primary/[0.04]" : "border-border",
      )}
    >
      {rank != null ? (
        <div
          data-testid="rank"
          className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary"
          title={t("actions.rankValue", { n: rank })}
        >
          <small className="text-[10px] font-semibold leading-none">{t("actions.rank")}</small>
          <b className="num mt-0.5 text-[16px] leading-none">{rank}</b>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {tag ? (
              <span className="mb-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11.5px] font-semibold text-fg-2">
                {tag}
              </span>
            ) : null}
            <h4 data-testid="action-text" dir="auto" className="m-0 text-[14.5px] font-semibold leading-relaxed">
              {title}
            </h4>
          </div>
          {tools ? <div className="flex shrink-0 items-center gap-1">{tools}</div> : null}
        </div>
        {extra}
        {children}
        <Lifecycle state={state} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            data-testid="choose"
            variant={state.chosen ? "default" : "outline"}
            aria-pressed={state.chosen}
            onClick={() => ops.choose(!state.chosen)}
            className={btn}
          >
            {state.chosen ? <CircleCheck aria-hidden="true" /> : null}
            {state.chosen ? t("actions.chosen") : t("actions.choose")}
          </Button>
          <Button
            type="button"
            data-testid="study"
            variant={state.needsStudy ? "secondary" : "ghost"}
            aria-pressed={state.needsStudy}
            onClick={() => ops.study(!state.needsStudy)}
            className={btn}
          >
            <BookOpen aria-hidden="true" />
            {t("actions.needsStudy")}
          </Button>
          {state.chosen ? (
            state.implementedOn ? (
              <span className="ms-auto inline-flex flex-wrap items-center gap-2">
                <span
                  data-testid="implemented-on"
                  className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-[12.5px] font-semibold text-ok"
                >
                  <Check aria-hidden="true" className="size-3.5" />
                  {t("actions.implementedOn")} <span className="num">{state.implementedOn}</span>
                </span>
                <Button type="button" data-testid="impl-clear" variant="ghost" onClick={() => saveDate(null)} className={btn}>
                  {t("actions.implClear")}
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                data-testid="impl-open"
                variant="secondary"
                aria-expanded={editing}
                onClick={() => setEditing((v) => !v)}
                className={cn(btn, "ms-auto")}
              >
                {t("actions.recordImpl")}
              </Button>
            )
          ) : null}
        </div>
        {state.chosen && !state.implementedOn && editing ? (
          <div className="flex flex-col gap-2 rounded-xl bg-secondary p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={dateId} className="text-[13px] font-medium">
                {t("actions.implDate")}
              </label>
              <input
                id={dateId}
                data-testid="impl-date"
                type="date"
                value={date}
                aria-describedby={error ? errId : undefined}
                aria-invalid={error ? true : undefined}
                onChange={(e) => {
                  setDate(e.target.value);
                  setError(null);
                }}
                className="num h-9 rounded-[10px] border border-line-2 bg-card px-2.5 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
              />
              <Button
                type="button"
                data-testid="impl-save"
                disabled={busy || !date}
                onClick={() => saveDate(date)}
                className={btn}
              >
                {t("actions.implSave")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                className={btn}
              >
                {t("actions.implCancel")}
              </Button>
            </div>
            <p className="m-0 text-[12.5px] text-fg-3">{t("actions.implHint")}</p>
            {error ? (
              <p id={errId} role="alert" data-testid="impl-error" className="m-0 text-[13px] font-medium text-critical">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

// --- system actions ---------------------------------------------------------------------------

type SystemProps = {
  texts: ActionTexts;
  state: ActionState;
  rank?: number | null;
  /** the obstacle the action is chosen under from this place */
  linked: ObstacleTarget | null;
  extra?: ReactNode;
  onLocal?: (s: Partial<ActionState>) => void;
};

export const SystemActionCard = memo(function SystemActionCard({ texts, state, rank, linked, extra, onLocal }: SystemProps) {
  const { pick } = useProblem();
  const ops = useSystemActionOps(texts, state, linked, onLocal);
  return (
    <ActionCardView
      title={pick(texts.textAr, texts.textEn)}
      rank={rank}
      extra={extra}
      state={state}
      ops={ops}
      code={texts.actionCode}
    />
  );
});

// --- case-specific actions --------------------------------------------------------------------

type CustomProps = {
  action: import("@/lib/problems/types").CustomActionDto;
  linkedName: string | null;
  onEdit: () => void;
};

export function CustomActionCard({ action, linkedName, onEdit }: CustomProps) {
  const t = useTranslations("problems.actions");
  const { failureText } = useProblem();
  const ops = useCustomActionOps(action.id);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const r = await ops.remove();
    if (!r.ok) {
      setError(failureText(r as ProblemFailure));
      setConfirm(false);
    }
  }

  return (
    <ActionCardView
      title={action.name}
      state={action}
      ops={ops}
      testId="custom-action-card"
      tag={t("customTag")}
      tools={
        <>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("edit")} data-testid="custom-edit" onClick={onEdit}>
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("delete")}
            data-testid="custom-delete"
            onClick={() => {
              setError(null);
              setConfirm(true);
            }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </>
      }
    >
      {action.description ? <p className="m-0 text-[13.5px] text-fg-2">{action.description}</p> : null}
      {action.rationale ? (
        <p className="m-0 text-[13px] text-fg-3">
          {t("customRationale")}: {action.rationale}
        </p>
      ) : null}
      {linkedName ? (
        <p className="m-0 text-[13px] text-fg-3">
          {t("customLinked")}: {linkedName}
        </p>
      ) : null}
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-critical-soft p-2.5 text-[13.5px]">
          <span className="font-medium text-critical">{t("deleteConfirm")}</span>
          <Button type="button" variant="destructive" data-testid="custom-delete-confirm" onClick={remove} className={btn}>
            {t("delete")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirm(false)} className={btn}>
            {t("implCancel")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" data-testid="custom-delete-error" className="m-0 text-[13px] font-medium text-critical">
          {error}
        </p>
      ) : null}
    </ActionCardView>
  );
}
