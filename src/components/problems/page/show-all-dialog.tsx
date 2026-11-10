"use client";

import { memo, useCallback, useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { Link2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/shared/responsive-dialog";
import { Input } from "@/components/ui/input";
import { getAllActionsAction } from "@/lib/problems/actions";
import type { ActionState, AllActionEntry, AllActionsDto } from "@/lib/problems/types";
import { SystemActionCard } from "./action-card";
import { useProblem } from "./problem-context";
import { filterActionAxes } from "./search";

const ShowAllCard = memo(function ShowAllCard({
  entry,
  onPatch,
}: {
  entry: AllActionEntry;
  onPatch: (code: string, s: Partial<ActionState>) => void;
}) {
  const t = useTranslations("problems");
  const { problem, pick } = useProblem();
  const onLocal = useCallback((s: Partial<ActionState>) => onPatch(entry.actionCode, s), [onPatch, entry.actionCode]);
  const first = entry.linkedTo[0];
  const nameOf = (code: string) => {
    const o = problem.obstacles.find((x) => x.kind === "system" && x.code === code);
    return o && o.kind === "system" ? pick(o.textAr, o.textEn) : "";
  };
  return (
    <SystemActionCard
      texts={{ actionCode: entry.actionCode, textAr: entry.textAr, textEn: entry.textEn }}
      state={entry}
      rank={entry.linkedTo.length === 1 ? first.rank : null}
      linked={first ? { kind: "system", code: first.obstacleCode } : null}
      onLocal={onLocal}
      extra={
        first ? (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="linked-mark">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-semibold text-primary">
              <Link2 aria-hidden="true" className="size-3" />
              {t("showAll.linkedMark")}
            </span>
            {entry.linkedTo.length > 1
              ? entry.linkedTo.map((l) => (
                  <span
                    key={l.obstacleCode}
                    data-testid="linked-rank"
                    title={nameOf(l.obstacleCode)}
                    className="rounded-full bg-secondary px-2 py-0.5 text-[12px] font-semibold text-fg-2"
                  >
                    {t("actions.rankValue", { n: l.rank })}
                  </span>
                ))
              : null}
          </div>
        ) : null
      }
    />
  );
});

/** "Show all corrective actions" (client note 14): all 65 grouped by action axis, searchable. */
export function ShowAllDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations("problems.showAll");
  const ta = useTranslations("problems.actions");
  const { problem, pick } = useProblem();
  const searchId = useId();
  const [data, setData] = useState<AllActionsDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const problemId = problem.header.id;

  // refetch when the problem changes while the dialog is open (obstacles, any audited write)
  const version = `${problem.audit[0]?.id ?? ""}:${problem.obstacles.map((o) => o.key).join(",")}`;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getAllActionsAction(problemId).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setData(r.data);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, problemId, version]);

  const onPatch = useCallback((code: string, s: Partial<ActionState>) => {
    setData((d) =>
      d
        ? {
            ...d,
            axes: d.axes.map((a) => ({
              ...a,
              actions: a.actions.map((x) => {
                if (x.actionCode !== code) return x;
                const next = { ...x, ...s };
                if (!next.chosen) next.implementedOn = null;
                return next;
              }),
            })),
          }
        : d,
    );
  }, []);

  const axes = useMemo(() => (data ? filterActionAxes(data.axes, deferred) : []), [data, deferred]);
  const total = data ? data.axes.reduce((n, a) => n + a.actions.length, 0) : 0;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        closeLabel={t("close")}
        size="lg"
        data-testid="show-all-dialog"
        className="max-sm:h-[92dvh] sm:h-[88dvh] sm:max-w-4xl"
      >
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("title")}</ResponsiveDialogTitle>
          {data ? (
            <ResponsiveDialogDescription>{t("description", { count: total, axes: data.axes.length })}</ResponsiveDialogDescription>
          ) : null}
        </ResponsiveDialogHeader>
        <div className="shrink-0 px-5 pb-3">
          <label htmlFor={searchId} className="sr-only">
            {ta("searchLabel")}
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
            <Input
              id={searchId}
              data-testid="show-all-search"
              type="search"
              value={query}
              placeholder={ta("searchPlaceholder")}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 rounded-[11px] border-line-2 ps-9 text-[15px] md:text-[15px]"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/50 px-5 py-4" data-testid="show-all-body">
          {!data && !failed ? <p className="m-0 text-center text-fg-3">{t("loading")}</p> : null}
          {failed && !data ? <p role="alert" className="m-0 text-center text-critical">{t("loadFailed")}</p> : null}
          {data && axes.length === 0 ? <p className="m-0 text-center text-fg-3">{ta("noMatch")}</p> : null}
          <div className="flex flex-col gap-6">
            {axes.map((axis) => (
              <section key={axis.idx} data-testid="show-all-axis" data-axis={axis.idx} aria-labelledby={`sa-${axis.idx}`}>
                <h3 id={`sa-${axis.idx}`} className="m-0 mb-2.5 flex flex-wrap items-baseline gap-2 text-[14.5px] font-bold">
                  {pick(axis.nameAr, axis.nameEn)}
                  <span className="text-[12.5px] font-normal text-fg-3">{t("axisCount", { count: axis.actions.length })}</span>
                </h3>
                <div className="flex flex-col gap-2.5">
                  {axis.actions.map((a) => (
                    <ShowAllCard key={a.actionCode} entry={a} onPatch={onPatch} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
