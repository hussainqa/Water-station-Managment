"use client";

import { memo, useCallback, useDeferredValue, useId, useMemo, useState } from "react";
import { ChevronDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Segmented } from "@/components/indicators/form-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteCustomObstacleAction, setObstacleAction, unsetObstacleAction } from "@/lib/problems/actions";
import type { BlockingAction, ProblemFailure } from "@/lib/problems/schemas";
import { NOTE_MAX } from "@/lib/problems/schemas";
import type { CatalogObstacle, SelectedObstacle } from "@/lib/problems/types";
import { cn } from "cn";
import { ClassificationPill, sectionCard, StepHeading } from "./bits";
import { ObstacleDialog } from "./obstacle-dialog";
import { useProblem } from "./problem-context";
import { filterObstacleAxes, matchesTokens, queryTokens } from "./search";

type SystemSel = Extract<SelectedObstacle, { kind: "system" }>;
type CustomSel = Extract<SelectedObstacle, { kind: "custom" }>;
type Classification = "confirmed" | "possible";

// --- helpers shared by the rows -----------------------------------------------------------------

function useBlockingText() {
  const { pick } = useProblem();
  return (b: BlockingAction) => (b.kind === "system" ? pick(b.textAr, b.textEn) : b.name);
}

function BlockedNotice({
  title,
  blocking,
  onDismiss,
  testId,
}: {
  title: string;
  blocking: BlockingAction[];
  onDismiss: () => void;
  testId: string;
}) {
  const t = useTranslations("problems.obstacles");
  const text = useBlockingText();
  return (
    <div role="alert" data-testid={testId} className="rounded-xl bg-critical-soft p-3 text-[13.5px] text-critical">
      <p className="m-0 font-semibold">{title}</p>
      <p className="m-0 mt-1">{t("blockedText")}</p>
      <ul className="m-0 mt-1.5 list-disc ps-5">
        {blocking.map((b, i) => (
          <li key={i} data-testid="blocking-action">
            {text(b)}
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" onClick={onDismiss} className="mt-1.5 h-8 rounded-lg px-2 text-[13px] text-critical">
        {t("blockedDismiss")}
      </Button>
    </div>
  );
}

function NoteField({
  initial,
  label,
  onSave,
  testId,
}: {
  initial: string;
  label: string;
  onSave: (note: string) => Promise<boolean>;
  testId: string;
}) {
  const t = useTranslations("problems.obstacles");
  const id = useId();
  const [text, setText] = useState(initial);
  const [savedText, setSavedText] = useState(initial);
  const [saved, setSaved] = useState(false);
  const dirty = text.trim() !== savedText.trim();

  async function commit() {
    const v = text.trim();
    if (v === savedText.trim()) return;
    const ok = await onSave(v);
    if (ok) {
      setSavedText(v);
      setSaved(true);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      <Textarea
        id={id}
        data-testid={testId}
        value={text}
        maxLength={NOTE_MAX}
        rows={2}
        placeholder={t("notePlaceholder")}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        onBlur={commit}
        className="min-h-16 text-[14px]"
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          data-testid={`${testId}-save`}
          variant="secondary"
          disabled={!dirty}
          // keeps the focus in the field so the blur handler does not save a second time
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          className="h-8 rounded-lg px-3 text-[13px]"
        >
          {t("noteSave")}
        </Button>
        <span aria-live="polite" className="text-[12.5px] text-ok">
          {saved && !dirty ? t("noteSaved") : ""}
        </span>
      </div>
    </div>
  );
}

function ClassificationControl({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Classification;
  onChange: (v: Classification) => void;
}) {
  const t = useTranslations("problems.obstacles");
  return (
    <Segmented<Classification>
      name={name}
      label={t("classification")}
      value={value}
      onChange={onChange}
      options={[
        { value: "confirmed", label: t("confirmed") },
        { value: "possible", label: t("possible") },
      ]}
      className="max-w-sm"
    />
  );
}

// --- one system obstacle ------------------------------------------------------------------------

type RowProps = {
  o: CatalogObstacle;
  sel: SystemSel | undefined;
  blocked: BlockingAction[] | null;
  locale: string;
  onToggle: (o: CatalogObstacle, checked: boolean) => void;
  onClassify: (o: CatalogObstacle, sel: SystemSel, c: Classification) => void;
  onNote: (o: CatalogObstacle, sel: SystemSel, note: string) => Promise<boolean>;
  onDismiss: () => void;
};

const ObstacleRow = memo(function ObstacleRow({ o, sel, blocked, locale, onToggle, onClassify, onNote, onDismiss }: RowProps) {
  const t = useTranslations("problems.obstacles");
  const textId = useId();
  const text = locale === "en" && o.textEn ? o.textEn : o.textAr;
  const on = !!sel;
  return (
    <li
      data-testid="obstacle-row"
      data-code={o.code}
      data-selected={on}
      className={cn(
        "rounded-xl border p-3 transition-colors",
        on ? "border-primary/50 bg-primary/[0.04]" : "border-border bg-card",
      )}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox
          checked={on}
          aria-labelledby={textId}
          onCheckedChange={(v) => onToggle(o, v === true)}
          className="mt-1 size-5 rounded-md"
        />
        <span
          aria-hidden="true"
          data-testid="obstacle-number"
          className="num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[12px] font-semibold text-fg-2"
        >
          {o.seqInAxis}
        </span>
        <span id={textId} data-testid="obstacle-text" className="min-w-0 flex-1 text-[14.5px] leading-relaxed">
          {text}
        </span>
        {sel ? <ClassificationPill value={sel.classification} /> : null}
      </label>
      {sel ? (
        <div className="mt-3 flex flex-col gap-3 ps-8 sm:ps-11">
          <ClassificationControl
            name={`cls-${o.code}`}
            value={sel.classification}
            onChange={(c) => onClassify(o, sel, c)}
          />
          <NoteField
            testId="obstacle-note"
            label={t("note")}
            initial={sel.note}
            onSave={(note) => onNote(o, sel, note)}
          />
        </div>
      ) : null}
      {blocked ? (
        <div className="mt-3">
          <BlockedNotice title={t("blockedTitle")} blocking={blocked} onDismiss={onDismiss} testId="blocked-notice" />
        </div>
      ) : null}
    </li>
  );
});

// --- one unlisted obstacle ----------------------------------------------------------------------

function CustomObstacleRow({ sel, onEdit }: { sel: CustomSel; onEdit: (o: CustomSel) => void }) {
  const t = useTranslations("problems.obstacles");
  const { problem, mutate, failureText } = useProblem();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockingAction[] | null>(null);
  const problemId = problem.header.id;

  const save = (patch: { classification: Classification; note?: string }) =>
    mutate({ t: "obstacleSet", obstacle: { ...sel, ...patch } }, () =>
      setObstacleAction({ problemId, target: { kind: "custom", id: sel.id }, ...patch }),
    );

  async function remove() {
    setError(null);
    setBlocking(null);
    const r = await mutate(null, () => deleteCustomObstacleAction({ problemId, customObstacleId: sel.id }), {
      silent: true,
    });
    if (r.ok) return;
    setConfirm(false);
    if (r.error === "customObstacleHasChosenActions" && "blocking" in r) setBlocking(r.blocking);
    else setError(failureText(r as ProblemFailure));
  }

  return (
    <li data-testid="custom-obstacle-row" data-id={sel.id} className="rounded-xl border border-primary/50 bg-primary/[0.04] p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <span className="mb-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11.5px] font-semibold text-fg-2">
            {t("unlistedTag")}
          </span>
          <p data-testid="obstacle-text" dir="auto" className="m-0 text-[14.5px] font-medium leading-relaxed">
            {sel.name}
          </p>
          {sel.description ? <p className="m-0 mt-1 text-[13.5px] text-fg-2">{sel.description}</p> : null}
          {sel.rationale ? (
            <p className="m-0 mt-1 text-[13px] text-fg-3">
              {t("rationale")}: {sel.rationale}
            </p>
          ) : null}
        </div>
        <ClassificationPill value={sel.classification} />
        <div className="flex shrink-0 items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("edit")} data-testid="obstacle-edit" onClick={() => onEdit(sel)}>
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("delete")}
            data-testid="obstacle-delete"
            onClick={() => {
              setError(null);
              setBlocking(null);
              setConfirm(true);
            }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <ClassificationControl
          name={`cls-${sel.key}`}
          value={sel.classification}
          onChange={(c) => save({ classification: c })}
        />
        <NoteField
          testId="obstacle-note"
          label={t("note")}
          initial={sel.note}
          onSave={async (note) => (await save({ classification: sel.classification, note })).ok}
        />
      </div>
      {confirm ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-critical-soft p-2.5 text-[13.5px]">
          <span className="font-medium text-critical">{t("deleteConfirm")}</span>
          <Button type="button" variant="destructive" data-testid="obstacle-delete-confirm" onClick={remove} className="h-9 rounded-[10px] px-3 text-[13.5px]">
            {t("delete")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirm(false)} className="h-9 rounded-[10px] px-3 text-[13.5px]">
            {t("blockedDismiss")}
          </Button>
        </div>
      ) : null}
      {blocking ? (
        <div className="mt-3">
          <BlockedNotice
            title={t("deleteBlockedTitle")}
            blocking={blocking}
            onDismiss={() => setBlocking(null)}
            testId="delete-blocked-notice"
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" data-testid="obstacle-delete-error" className="m-0 mt-3 text-[13px] font-medium text-critical">
          {error}
        </p>
      ) : null}
    </li>
  );
}

// --- the section ----------------------------------------------------------------------------------

/** Stage 2 of the method: the 40 obstacles in 7 collapsible axes, search, filter, unlisted ones. */
export function ObstaclesSection() {
  const t = useTranslations("problems.obstacles");
  const tp = useTranslations("problems");
  const { problem, catalog, locale, pick, mutate, failureText } = useProblem();
  const problemId = problem.header.id;
  const searchId = useId();

  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [blocked, setBlocked] = useState<{ code: string; blocking: BlockingAction[] } | null>(null);
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; obstacle: CustomSel } | null>(null);

  const systemSel = useMemo(() => {
    const m = new Map<string, SystemSel>();
    for (const o of problem.obstacles) if (o.kind === "system") m.set(o.code, o);
    return m;
  }, [problem.obstacles]);
  const customSel = useMemo(
    () => problem.obstacles.filter((o): o is CustomSel => o.kind === "custom"),
    [problem.obstacles],
  );
  const selectedCodes = useMemo(() => new Set(systemSel.keys()), [systemSel]);
  const selectedCount = problem.obstacles.length;

  const axes = useMemo(
    () => filterObstacleAxes(catalog.obstacleAxes, { query: deferred, selectedOnly, selected: selectedCodes }),
    [catalog.obstacleAxes, deferred, selectedOnly, selectedCodes],
  );
  const customVisible = useMemo(() => {
    const tokens = queryTokens(deferred);
    return customSel.filter((c) => matchesTokens(tokens, { textAr: `${c.name} ${c.description}`, textEn: "" }));
  }, [customSel, deferred]);

  const openAxis = useCallback((idx: number) => setOpen((s) => (s[idx] ? s : { ...s, [idx]: true })), []);

  const onToggle = useCallback(
    async (o: CatalogObstacle, checked: boolean) => {
      setBlocked(null);
      openAxis(o.axisIdx);
      if (checked) {
        const next: SystemSel = {
          kind: "system",
          key: o.code,
          code: o.code,
          axisIdx: o.axisIdx,
          seqInAxis: o.seqInAxis,
          textAr: o.textAr,
          textEn: o.textEn,
          classification: "confirmed",
          note: "",
        };
        await mutate({ t: "obstacleSet", obstacle: next }, () =>
          setObstacleAction({ problemId, target: { kind: "system", code: o.code }, classification: "confirmed" }),
        );
        return;
      }
      const r = await mutate(
        { t: "obstacleUnset", code: o.code },
        () => unsetObstacleAction({ problemId, obstacleCode: o.code }),
        { silent: true },
      );
      if (r.ok) return;
      if (r.error === "obstacleHasChosenActions" && "blocking" in r) {
        setBlocked({ code: o.code, blocking: r.blocking });
      } else {
        toast.error(failureText(r as ProblemFailure));
      }
    },
    [mutate, problemId, failureText, openAxis],
  );

  const onClassify = useCallback(
    (o: CatalogObstacle, sel: SystemSel, c: Classification) => {
      if (sel.classification === c) return;
      void mutate({ t: "obstacleSet", obstacle: { ...sel, classification: c } }, () =>
        setObstacleAction({ problemId, target: { kind: "system", code: o.code }, classification: c }),
      );
    },
    [mutate, problemId],
  );

  const onNote = useCallback(
    async (o: CatalogObstacle, sel: SystemSel, note: string) => {
      const r = await mutate({ t: "obstacleSet", obstacle: { ...sel, note } }, () =>
        setObstacleAction({ problemId, target: { kind: "system", code: o.code }, classification: sel.classification, note }),
      );
      return r.ok;
    },
    [mutate, problemId],
  );

  const dismiss = useCallback(() => setBlocked(null), []);

  const forceOpen = !!deferred.trim() || selectedOnly;
  const isOpen = (idx: number, nSel: number) => open[idx] ?? (forceOpen || nSel > 0);

  const nothing = axes.length === 0 && customVisible.length === 0;

  return (
    <section className={sectionCard} aria-labelledby="step-obstacles" data-testid="section-obstacles">
      <StepHeading n={2} id="step-obstacles">
        {tp("steps.obstacles")}
      </StepHeading>
      <p className="m-0 mt-1.5 text-[13.5px] text-fg-2" data-testid="obstacles-helper">
        {t("helper")}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor={searchId} className="sr-only">
            {t("searchLabel")}
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <Input
            id={searchId}
            data-testid="obstacle-search"
            type="search"
            value={query}
            placeholder={t("searchPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 rounded-[11px] border-line-2 ps-9 text-[15px] md:text-[15px]"
          />
        </div>
        <Segmented<"all" | "selected">
          name="obstacle-filter"
          label={t("filterLabel")}
          value={selectedOnly ? "selected" : "all"}
          onChange={(v) => setSelectedOnly(v === "selected")}
          options={[
            { value: "all", label: t("filterAll") },
            { value: "selected", label: t("filterSelected", { count: selectedCount }) },
          ]}
          className="[&>legend]:sr-only [&_label]:whitespace-nowrap [&_label]:px-4"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3" data-testid="obstacle-axes">
        {nothing ? (
          <div className="rounded-xl bg-muted p-6 text-center" data-testid="obstacles-empty">
            <p className="m-0 font-semibold">{t("empty.title")}</p>
            <p className="m-0 mt-1 text-[13.5px] text-fg-2">{t("empty.text")}</p>
          </div>
        ) : null}
        {axes.map((axis) => {
          const nSel = axis.obstacles.reduce((n, o) => n + (selectedCodes.has(o.code) ? 1 : 0), 0);
          const total = catalog.obstacleAxes.find((a) => a.idx === axis.idx)?.obstacles.length ?? axis.obstacles.length;
          const expanded = isOpen(axis.idx, nSel);
          const panelId = `axis-${axis.idx}`;
          return (
            <div key={axis.idx} data-testid="obstacle-axis" data-axis={axis.idx} className="rounded-2xl border border-border">
              <h3 className="m-0">
                <button
                  type="button"
                  data-testid="axis-toggle"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen((s) => ({ ...s, [axis.idx]: !expanded }))}
                  className="flex w-full items-center gap-2.5 rounded-2xl p-3 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-4"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={cn("size-4 shrink-0 text-fg-3 transition-transform", !expanded && "-rotate-90 rtl:rotate-90")}
                  />
                  <span className="min-w-0 flex-1 text-[14.5px] font-bold leading-snug">{pick(axis.nameAr, axis.nameEn)}</span>
                  <span className="shrink-0 text-[12.5px] text-fg-3">{t("axisCount", { count: total })}</span>
                  {nSel ? (
                    <span
                      data-testid="axis-selected"
                      className="num shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-semibold text-primary"
                    >
                      {t("axisSelected", { count: nSel })}
                    </span>
                  ) : null}
                </button>
              </h3>
              {expanded ? (
                <ul id={panelId} className="m-0 flex list-none flex-col gap-2 p-3 pt-0 sm:px-4 sm:pb-4">
                  {axis.obstacles.map((o) => (
                    <ObstacleRow
                      key={o.code}
                      o={o}
                      sel={systemSel.get(o.code)}
                      blocked={blocked?.code === o.code ? blocked.blocking : null}
                      locale={locale}
                      onToggle={onToggle}
                      onClassify={onClassify}
                      onNote={onNote}
                      onDismiss={dismiss}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
        {customVisible.length ? (
          <div data-testid="custom-obstacles" className="rounded-2xl border border-border">
            <h3 className="m-0 p-3 text-[14.5px] font-bold sm:px-4">{t("unlistedGroup")}</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-3 pt-0 sm:px-4 sm:pb-4">
              {customVisible.map((c) => (
                <CustomObstacleRow key={c.id} sel={c} onEdit={(o) => setDialog({ mode: "edit", obstacle: o })} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-muted p-3.5">
        <div className="min-w-0 flex-1 basis-60">
          <p className="m-0 text-[14px] font-semibold">{t("addPromptTitle")}</p>
          <p className="m-0 mt-0.5 text-[13px] text-fg-2">{t("addPromptText")}</p>
        </div>
        <Button
          type="button"
          data-testid="add-obstacle"
          variant="secondary"
          onClick={() => setDialog({ mode: "add" })}
          className="h-10 rounded-[11px] px-4 text-[14px] max-[420px]:w-full"
        >
          <Plus aria-hidden="true" />
          {t("add")}
        </Button>
      </div>

      <ObstacleDialog
        key={dialog ? (dialog.mode === "edit" ? dialog.obstacle.id : "add") : "closed"}
        state={dialog}
        onOpenChange={(o) => {
          if (!o) setDialog(null);
        }}
      />
    </section>
  );
}
