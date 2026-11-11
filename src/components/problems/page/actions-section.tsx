"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { BookOpen, Check, ListChecks, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setObstacleOnlyAction } from "@/lib/problems/actions";
import type { ObstacleTarget } from "@/lib/problems/schemas";
import type { CustomActionDto, PlainAction, SelectedObstacle, SuggestionGroup } from "@/lib/problems/types";
import { ActionDialog } from "./action-dialog";
import { CustomActionCard, SystemActionCard } from "./action-card";
import { ClassificationPill, obstacleLabel, sectionCard, StepHeading } from "./bits";
import { useProblem } from "./problem-context";
import { filterActions } from "./search";
import { ShowAllDialog } from "./show-all-dialog";

const targetOf = (o: SelectedObstacle): ObstacleTarget =>
  o.kind === "system" ? { kind: "system", code: o.code } : { kind: "custom", id: o.id };

const INITIAL_PLAIN = 8;

/** Text-only actions (no rank, no numbering): with an optional "show more" and search. */
function PlainActionList({
  actions,
  linked,
  limited,
  testId,
}: {
  actions: PlainAction[];
  linked: ObstacleTarget;
  /** unlisted obstacle: first few + "show more" + search box */
  limited?: boolean;
  testId: string;
}) {
  const t = useTranslations("problems.actions");
  const searchId = useId();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [expanded, setExpanded] = useState(false);
  const filtered = useMemo(() => filterActions(actions, deferred), [actions, deferred]);
  const searching = !!deferred.trim();
  const shown = limited && !expanded && !searching ? filtered.slice(0, INITIAL_PLAIN) : filtered;
  const hidden = filtered.length - shown.length;
  return (
    <div className="flex flex-col gap-2.5" data-testid={testId}>
      {limited ? (
        <div className="relative max-w-md">
          <label htmlFor={searchId} className="sr-only">
            {t("searchLabel")}
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <Input
            id={searchId}
            data-testid="plain-search"
            type="search"
            value={query}
            placeholder={t("searchPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 rounded-[11px] border-line-2 ps-9 text-[14px] md:text-[14px]"
          />
        </div>
      ) : null}
      {shown.map((a) => (
        <SystemActionCard
          key={a.actionCode}
          texts={{ actionCode: a.actionCode, textAr: a.textAr, textEn: a.textEn }}
          state={a}
          linked={linked}
        />
      ))}
      {limited && filtered.length === 0 ? <p className="m-0 text-[13.5px] text-fg-3">{t("noMatch")}</p> : null}
      {limited && !searching && filtered.length > INITIAL_PLAIN ? (
        <div>
          <Button
            type="button"
            data-testid="plain-more"
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="h-9 rounded-[10px] px-3 text-[13.5px]"
          >
            {expanded ? t("showFewer") : t("showMore", { count: hidden })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ObstacleGroup({ group }: { group: SuggestionGroup }) {
  const t = useTranslations("problems.actions");
  const { locale } = useProblem();
  const o = group.obstacle;
  const target = targetOf(o);
  const system = o.kind === "system";
  const noLinked = system && group.linked.length === 0;
  return (
    <section
      data-testid="action-group"
      data-obstacle={o.key}
      aria-labelledby={`ag-${o.key}`}
      className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start gap-2">
        <h3 id={`ag-${o.key}`} data-testid="group-title" dir="auto" className="m-0 min-w-0 flex-1 basis-60 text-[14.5px] font-bold leading-relaxed">
          {obstacleLabel(o, locale)}
        </h3>
        <ClassificationPill value={o.classification} />
      </div>
      {system && group.linked.length ? (
        <div className="flex flex-col gap-2.5" data-testid="linked-actions">
          {group.linked.map((a) => (
            <SystemActionCard
              key={a.actionCode}
              texts={{ actionCode: a.actionCode, textAr: a.textAr, textEn: a.textEn }}
              state={a}
              rank={a.rank}
              linked={target}
            />
          ))}
        </div>
      ) : null}
      {noLinked ? (
        <>
          <p
            data-testid="no-linked"
            className="m-0 rounded-xl bg-card p-3 text-[13.5px] text-fg-2"
          >
            {t("noLinked")}
          </p>
          {group.axisActions.length ? (
            <>
              <h4 className="m-0 text-[13.5px] font-semibold text-fg-2">{t("axisActions")}</h4>
              <PlainActionList actions={group.axisActions} linked={target} testId="axis-actions" />
            </>
          ) : null}
        </>
      ) : null}
      {!system ? (
        <>
          <p className="m-0 text-[13px] text-fg-2" data-testid="unlisted-hint">
            {t("unlistedHint")}
          </p>
          <PlainActionList actions={group.allActions} linked={target} limited testId="all-actions" />
        </>
      ) : null}
    </section>
  );
}

function Summary() {
  const t = useTranslations("problems.summary");
  const tA = useTranslations("problems.actions");
  const { problem, pick } = useProblem();
  const chosen = problem.chosenActions;
  const implemented = chosen.filter((c) => c.implementedOn).length;
  const study = useMemo(() => {
    const codes = new Set<string>();
    for (const g of problem.suggestions) {
      for (const a of [...g.linked, ...g.axisActions, ...g.allActions]) if (a.needsStudy) codes.add(a.actionCode);
    }
    for (const c of problem.chosenActions) if (c.kind === "system" && c.needsStudy) codes.add(c.actionCode);
    const custom = problem.customActions.filter((c) => c.needsStudy).length;
    return codes.size + custom;
  }, [problem.suggestions, problem.chosenActions, problem.customActions]);

  const tile = (testId: string, label: string, n: number, tone: string, Icon: typeof Check) => (
    <div className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${tone}`} data-testid={testId}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-tight">{label}</span>
      <b className="num text-[18px] leading-none" data-testid={`${testId}-n`}>
        {n}
      </b>
    </div>
  );

  return (
    <section
      aria-labelledby="summary-h"
      data-testid="actions-summary"
      className="rounded-2xl border border-border bg-card p-3.5 lg:sticky lg:top-20"
    >
      <h3 id="summary-h" className="m-0 text-[14.5px] font-bold">
        {t("title")}
      </h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
        {tile("sum-chosen", t("chosen"), chosen.length, "bg-primary/10 text-primary", ListChecks)}
        {tile("sum-implemented", t("implemented"), implemented, "bg-ok-soft text-ok", Check)}
        {tile("sum-study", t("study"), study, "bg-nolimits-soft text-nolimits", BookOpen)}
      </div>
      {chosen.length ? (
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
          {chosen.map((c) => {
            const key = c.kind === "system" ? c.actionCode : c.customActionId;
            const text = c.kind === "system" ? pick(c.textAr, c.textEn) : c.name;
            return (
              <li
                key={key}
                data-testid="summary-item"
                data-implemented={!!c.implementedOn}
                className="rounded-xl bg-muted p-2.5 text-[13px]"
              >
                <p className="m-0 font-medium leading-snug">{text}</p>
                <p className={`m-0 mt-1 text-[12.5px] font-semibold ${c.implementedOn ? "text-ok" : "text-primary"}`}>
                  {c.implementedOn ? (
                    <>
                      {tA("implementedOn")} <span className="num">{c.implementedOn}</span>
                    </>
                  ) : (
                    t("notImplemented")
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 mt-3 text-[13px] text-fg-3">{t("none")}</p>
      )}
    </section>
  );
}

/** Stage 3 of the method: corrective actions per selected obstacle, show-all, case-specific, obstacle only. */
export function ActionsSection() {
  const t = useTranslations("problems.actions");
  const tp = useTranslations("problems");
  const { problem, mutate, failureText, locale } = useProblem();
  const [showAll, setShowAll] = useState(false);
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; action: CustomActionDto } | null>(null);
  const [obstacleOnlyError, setObstacleOnlyError] = useState<string | null>(null);

  const hasObstacles = problem.obstacles.length > 0;
  const nothingChosen = problem.chosenActions.length === 0;

  const linkedName = (target: ObstacleTarget | null) => {
    if (!target) return null;
    const o = problem.obstacles.find((x) => (target.kind === "system" ? x.kind === "system" && x.code === target.code : x.kind === "custom" && x.id === target.id));
    return o ? obstacleLabel(o, locale) : null;
  };

  async function keepOnly() {
    setObstacleOnlyError(null);
    const r = await mutate({ t: "obstacleOnly", value: true }, () => setObstacleOnlyAction({ problemId: problem.header.id, value: true }), {
      silent: true,
    });
    if (!r.ok) setObstacleOnlyError(failureText(r));
  }

  return (
    <section className={sectionCard} aria-labelledby="step-actions" data-testid="section-actions" id="actions">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StepHeading n={3} id="step-actions">
          {tp("steps.actions")}
        </StepHeading>
        <div className="flex flex-wrap items-center gap-2 max-[560px]:w-full max-[560px]:[&>*]:flex-1">
          <Button
            type="button"
            data-testid="show-all"
            variant="outline"
            onClick={() => setShowAll(true)}
            className="h-10 rounded-[11px] px-4 text-[14px]"
          >
            <ListChecks aria-hidden="true" />
            {t("showAll")}
          </Button>
          <Button
            type="button"
            data-testid="add-action"
            variant="secondary"
            onClick={() => setDialog({ mode: "add" })}
            className="h-10 rounded-[11px] px-4 text-[14px]"
          >
            <Plus aria-hidden="true" />
            {t("add")}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
          {hasObstacles ? (
            problem.suggestions.map((g) => <ObstacleGroup key={g.obstacle.key} group={g} />)
          ) : (
            <div className="rounded-xl bg-muted p-6 text-center" data-testid="actions-empty">
              <p className="m-0 font-semibold">{t("emptyTitle")}</p>
              <p className="m-0 mt-1 text-[13.5px] text-fg-2">{t("emptyText")}</p>
            </div>
          )}

          {problem.customActions.length ? (
            <section data-testid="custom-actions" aria-labelledby="custom-actions-h" className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-3 sm:p-4">
              <h3 id="custom-actions-h" className="m-0 text-[14.5px] font-bold">
                {t("custom")}
              </h3>
              {problem.customActions.map((a) => (
                <CustomActionCard
                  key={a.id}
                  action={a}
                  linkedName={linkedName(a.linkedObstacle)}
                  onEdit={() => setDialog({ mode: "edit", action: a })}
                />
              ))}
            </section>
          ) : null}

          {hasObstacles && nothingChosen && !problem.obstacleOnly ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted p-3.5" data-testid="obstacle-only-prompt">
              <div className="min-w-0 flex-1 basis-60">
                <p className="m-0 text-[14px] font-semibold">{t("obstacleOnlyTitle")}</p>
                <p className="m-0 mt-0.5 text-[13px] text-fg-2">{t("obstacleOnlyText")}</p>
              </div>
              <Button
                type="button"
                data-testid="obstacle-only"
                variant="secondary"
                onClick={keepOnly}
                className="h-10 rounded-[11px] px-4 text-[14px] max-[420px]:w-full"
              >
                {t("obstacleOnly")}
              </Button>
              {obstacleOnlyError ? (
                <p role="alert" className="m-0 basis-full text-[13px] font-medium text-critical">
                  {obstacleOnlyError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="order-1 lg:order-2">
          <Summary />
        </div>
      </div>

      <ShowAllDialog open={showAll} onOpenChange={setShowAll} />
      <ActionDialog
        key={dialog ? (dialog.mode === "edit" ? dialog.action.id : "add") : "closed"}
        state={dialog}
        onOpenChange={(o) => {
          if (!o) setDialog(null);
        }}
      />
    </section>
  );
}
