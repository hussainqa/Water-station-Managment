"use client";

import { createContext, useCallback, useContext, useMemo, useOptimistic, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  deleteCustomActionAction,
  setActionChosenAction,
  setActionImplementedAction,
  setActionNeedsStudyAction,
  setCustomActionChosenAction,
  setCustomActionImplementedAction,
  setCustomActionNeedsStudyAction,
} from "@/lib/problems/actions";
import type { ObstacleTarget, ProblemFailure, ProblemResult } from "@/lib/problems/schemas";
import type {
  ActionState,
  ActionTexts,
  CatalogAction,
  CatalogObstacle,
  MutationData,
  ProblemDto,
  ReferenceCatalog,
} from "@/lib/problems/types";
import { applyPatch, type Patch } from "./optimistic";

type MutationResult = ProblemResult<MutationData>;

export type MutateOptions = {
  /** the caller shows the error itself (no toast) */
  silent?: boolean;
};

type Ctx = {
  problem: ProblemDto;
  catalog: ReferenceCatalog;
  locale: string;
  /** Arabic text in the Arabic UI, English text (fallback Arabic) in the English UI */
  pick: (ar: string, en: string | null | undefined) => string;
  /** runs a server action with an optimistic patch; rolls back (and toasts) on failure */
  mutate: (patch: Patch | null, call: () => Promise<MutationResult>, opts?: MutateOptions) => Promise<MutationResult>;
  failureText: (f: ProblemFailure) => string;
  obstacleByCode: Map<string, CatalogObstacle>;
  actionByCode: Map<string, CatalogAction>;
};

const ProblemCtx = createContext<Ctx | null>(null);

export function useProblem(): Ctx {
  const c = useContext(ProblemCtx);
  if (!c) throw new Error("useProblem outside ProblemProvider");
  return c;
}

export function ProblemProvider({
  initial,
  catalog,
  children,
}: {
  initial: ProblemDto;
  catalog: ReferenceCatalog;
  children: ReactNode;
}) {
  const t = useTranslations("problems");
  const locale = useLocale();
  const [problem, addOptimistic] = useOptimistic(initial, applyPatch);
  const [, startTransition] = useTransition();

  const failureText = useCallback(
    (f: ProblemFailure): string => {
      if (f.error === "validation") {
        const first = Object.values(f.fieldErrors ?? {})[0];
        if (first && t.has(`errors.${first}`)) return t(`errors.${first}`);
      }
      return t.has(`errors.${f.error}`) ? t(`errors.${f.error}`) : t("errors.generic");
    },
    [t],
  );

  const mutate = useCallback<Ctx["mutate"]>(
    (patch, call, opts) =>
      new Promise<MutationResult>((resolve) => {
        startTransition(async () => {
          if (patch) addOptimistic(patch);
          let r: MutationResult;
          try {
            r = await call();
          } catch {
            r = { ok: false, error: "generic" };
          }
          if (!r.ok && !opts?.silent) toast.error(failureText(r));
          resolve(r);
        });
      }),
    [addOptimistic, failureText],
  );

  const pick = useCallback<Ctx["pick"]>(
    (ar, en) => (locale === "en" && en ? en : ar),
    [locale],
  );

  const obstacleByCode = useMemo(
    () => new Map(catalog.obstacleAxes.flatMap((a) => a.obstacles).map((o) => [o.code, o])),
    [catalog],
  );
  const actionByCode = useMemo(
    () => new Map(catalog.actionAxes.flatMap((a) => a.actions).map((o) => [o.code, o])),
    [catalog],
  );

  const value = useMemo<Ctx>(
    () => ({ problem, catalog, locale, pick, mutate, failureText, obstacleByCode, actionByCode }),
    [problem, catalog, locale, pick, mutate, failureText, obstacleByCode, actionByCode],
  );
  return <ProblemCtx.Provider value={value}>{children}</ProblemCtx.Provider>;
}

// --- action operations ------------------------------------------------------------------------

export type ActionOps = {
  choose: (chosen: boolean) => Promise<MutationResult>;
  study: (needsStudy: boolean) => Promise<MutationResult>;
  implement: (date: string | null) => Promise<MutationResult>;
};

/**
 * The write operations of one system action. `linked` is the selected obstacle the action is
 * chosen under (null from places without one). `onLocal` lets a view that holds its own copy
 * of the states (the "show all" dialog) follow the change at once.
 */
export function useSystemActionOps(
  texts: ActionTexts,
  state: ActionState,
  linked: ObstacleTarget | null,
  onLocal?: (s: Partial<ActionState>) => void,
): ActionOps {
  const { problem, mutate } = useProblem();
  const problemId = problem.header.id;
  const code = texts.actionCode;

  const run = async (
    local: Partial<ActionState>,
    revert: Partial<ActionState>,
    call: () => Promise<MutationResult>,
    silent: boolean,
  ) => {
    onLocal?.(local);
    const r = await mutate({ t: "action", texts, state: local }, call, { silent });
    if (!r.ok) onLocal?.(revert);
    return r;
  };
  return {
    choose: (chosen) =>
      run(
        chosen
          ? { chosen: true, linkedObstacle: linked }
          : { chosen: false, implementedOn: null, linkedObstacle: null },
        { chosen: state.chosen, implementedOn: state.implementedOn, linkedObstacle: state.linkedObstacle },
        () => setActionChosenAction({ problemId, actionCode: code, chosen, linkedObstacle: chosen ? linked : null }),
        false,
      ),
    study: (needsStudy) =>
      run(
        { needsStudy },
        { needsStudy: state.needsStudy },
        () => setActionNeedsStudyAction({ problemId, actionCode: code, needsStudy }),
        false,
      ),
    implement: (date) =>
      run(
        { implementedOn: date },
        { implementedOn: state.implementedOn },
        () => setActionImplementedAction({ problemId, actionCode: code, implementedOn: date }),
        true,
      ),
  };
}

export function useCustomActionOps(customActionId: string): ActionOps & { remove: () => Promise<MutationResult> } {
  const { problem, mutate } = useProblem();
  const problemId = problem.header.id;
  return useMemo(
    () => ({
      choose: (chosen: boolean) =>
        mutate({ t: "customAction", id: customActionId, state: { chosen } }, () =>
          setCustomActionChosenAction({ problemId, customActionId, chosen }),
        ),
      study: (needsStudy: boolean) =>
        mutate({ t: "customAction", id: customActionId, state: { needsStudy } }, () =>
          setCustomActionNeedsStudyAction({ problemId, customActionId, needsStudy }),
        ),
      implement: (date: string | null) =>
        mutate(
          { t: "customAction", id: customActionId, state: { implementedOn: date } },
          () => setCustomActionImplementedAction({ problemId, customActionId, implementedOn: date }),
          { silent: true },
        ),
      remove: () => mutate(null, () => deleteCustomActionAction({ problemId, customActionId }), { silent: true }),
    }),
    [mutate, problemId, customActionId],
  );
}
