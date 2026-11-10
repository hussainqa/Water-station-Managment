import { and, asc, desc, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import type { UserTx } from "@/db/with-user";
import {
  assessmentReadings,
  assessments,
  auditEvents,
  customActions,
  customObstacles,
  plants,
  problemActions,
  problemObstacles,
  problems,
  userIndicators,
} from "@/db/schema/app";
import {
  actionAxes,
  correctiveActions,
  correctiveActionsRanked,
  indicators,
  obstacleActionLinks,
  obstacleAxes,
  obstacles,
} from "@/db/schema/reference";
import { limitsSnapshotSchema, type Limits, type PeriodMonths, type Status } from "@/lib/evaluation";
import { monthIndex, monthKeyOf } from "@/lib/assessments/schemas";
import {
  idSchema,
  type AddCustomActionInput,
  type AddCustomObstacleInput,
  type BlockingAction,
  type DeleteCustomActionInput,
  type DeleteCustomObstacleInput,
  type ObstacleTarget,
  type ProblemFailure,
  type ProblemResult,
  type SetActionChosenInput,
  type SetActionImplementedInput,
  type SetActionNeedsStudyInput,
  type SetCustomActionChosenInput,
  type SetCustomActionImplementedInput,
  type SetCustomActionNeedsStudyInput,
  type SetObstacleInput,
  type SetObstacleOnlyInput,
  type UnsetObstacleInput,
  type UpdateCustomActionInput,
  type UpdateCustomObstacleInput,
  type UpdateDescriptionInput,
} from "./schemas";
import {
  checkImplementationDate,
  deriveStage,
  isOpenStage,
  limitCrossed,
  orderSelectedObstacles,
  orderByRank,
  type ProblemStage,
} from "./stage";
import { openProblemSql } from "./stage-sql";
import type {
  ActionLogEntry,
  ActionLogObstacle,
  ActionState,
  AllActionEntry,
  AllActionsDto,
  ChosenAction,
  CustomActionDto,
  IndicatorInfo,
  MutationData,
  PlainAction,
  ProblemAuditAction,
  ProblemAuditEntry,
  ProblemAuditPayloads,
  ProblemDto,
  ProblemHeader,
  ProblemListItem,
  ProblemStageMap,
  RankedAction,
  ReferenceCatalog,
  SelectedObstacle,
  SuggestionGroup,
} from "./types";

/**
 * Data functions for problems, obstacles and corrective actions. Every function takes the
 * transaction from `withUser()` (row-level security limits each query to the signed-in
 * user) and the verified `userId`. Time is never read here: `now` travels in `ctx`/options;
 * the action layer supplies `new Date()`.
 *
 * Hidden research figures (RII, correlation, priority %, importance order) are never
 * selected: every query lists its columns, and the app role cannot read them anyway.
 * The status of a problem is DERIVED from rows (see ./stage.ts), never stored.
 *
 * Keep this file free of `server-only` imports (tests and scripts load it under Node).
 */

export type Ctx = { now: Date; actor: string };

const ok = <T>(data: T): ProblemResult<T> => ({ ok: true, data });
const fail = (error: Exclude<ProblemFailure, { error: "validation" }>["error"]): ProblemFailure =>
  ({ ok: false, error }) as ProblemFailure;
const NOT_FOUND = fail("notFound");

const isUuid = (s: unknown): s is string => idSchema.safeParse(s).success;

// --- small helpers ---------------------------------------------------------------------------

const keyOfTarget = (t: ObstacleTarget): string => (t.kind === "system" ? t.code : `custom:${t.id}`);

function targetOf(code: string | null, customId: string | null): ObstacleTarget | null {
  if (code) return { kind: "system", code };
  if (customId) return { kind: "custom", id: customId };
  return null;
}

const linkCols = (t: ObstacleTarget | null | undefined) => ({
  linkedObstacleCode: t?.kind === "system" ? t.code : null,
  linkedCustomObstacleId: t?.kind === "custom" ? t.id : null,
});

const obstacleAudit = (code: string | null, customId: string | null) => ({
  obstacleCode: code,
  customObstacleId: customId,
});

type ProblemRow = typeof problems.$inferSelect;

async function loadProblem(
  tx: UserTx,
  userId: string,
  id: string,
  lock = false,
): Promise<ProblemRow | null> {
  if (!isUuid(id)) return null;
  const q = tx
    .select()
    .from(problems)
    .where(and(eq(problems.id, id), eq(problems.ownerId, userId)));
  const [r] = lock ? await q.for("update") : await q;
  return r ?? null;
}

type Counts = { obstacleCount: number; chosenCount: number; obstacleOnly: boolean };

async function countsOf(tx: UserTx, userId: string, problemId: string): Promise<Counts> {
  const [r] = await tx
    .select({
      obstacleOnly: problems.obstacleOnly,
      obstacleCount: sql<number>`(select count(*)::int from problem_obstacles x where x.problem_id = problems.id)`,
      chosenCount: sql<number>`((select count(*) from problem_actions x where x.problem_id = problems.id and x.chosen) + (select count(*) from custom_actions x where x.problem_id = problems.id and x.chosen))::int`,
    })
    .from(problems)
    .where(and(eq(problems.id, problemId), eq(problems.ownerId, userId)));
  return r;
}

const stageFrom = (c: Counts): ProblemStage =>
  deriveStage({ obstacleCount: c.obstacleCount, chosenActionCount: c.chosenCount, obstacleOnly: c.obstacleOnly });

async function stageOf(tx: UserTx, userId: string, problemId: string): Promise<ProblemStage> {
  return stageFrom(await countsOf(tx, userId, problemId));
}

// --- reference data ------------------------------------------------------------------------------

/**
 * The 40 obstacles in their 7 axes and the 65 actions in their 7 axes, source order, both
 * languages. Pure reference data (same for every user), so the result can be cached.
 * Selects explicit columns only: never `importance_order`, never `rii`.
 */
export async function getReferenceCatalog(tx: UserTx): Promise<ReferenceCatalog> {
  const oAxes = await tx.select().from(obstacleAxes).orderBy(asc(obstacleAxes.idx));
  const oRows = await tx
    .select({
      code: obstacles.code,
      axisIdx: obstacles.axisIdx,
      seqInAxis: obstacles.seqInAxis,
      textAr: obstacles.textAr,
      textEn: obstacles.textEn,
    })
    .from(obstacles)
    .orderBy(asc(obstacles.axisIdx), asc(obstacles.seqInAxis));
  const aAxes = await tx.select().from(actionAxes).orderBy(asc(actionAxes.idx));
  const aRows = await tx
    .select({
      code: correctiveActions.code,
      axisIdx: correctiveActions.axisIdx,
      seqInAxis: correctiveActions.seqInAxis,
      textAr: correctiveActions.textAr,
      textEn: correctiveActions.textEn,
    })
    .from(correctiveActions)
    .orderBy(asc(correctiveActions.axisIdx), asc(correctiveActions.seqInAxis));
  return {
    obstacleAxes: oAxes.map((a) => ({
      idx: a.idx,
      nameAr: a.nameAr,
      nameEn: a.nameEn,
      obstacles: oRows.filter((o) => o.axisIdx === a.idx),
    })),
    actionAxes: aAxes.map((a) => ({
      idx: a.idx,
      nameAr: a.nameAr,
      nameEn: a.nameEn,
      actions: aRows.filter((o) => o.axisIdx === a.idx),
    })),
  };
}

type ActionRef = {
  code: string;
  axisIdx: number;
  seqInAxis: number;
  textAr: string;
  textEn: string;
  /** hidden ordering of the "unlisted obstacle" view: used to sort, never returned */
  sortPosition: number;
};

/** All 65 actions with their hidden sort position (the app role reads it through the view). */
async function loadActionRefs(tx: UserTx): Promise<ActionRef[]> {
  return tx
    .select({
      code: correctiveActionsRanked.code,
      axisIdx: correctiveActionsRanked.axisIdx,
      seqInAxis: correctiveActionsRanked.seqInAxis,
      textAr: correctiveActionsRanked.textAr,
      textEn: correctiveActionsRanked.textEn,
      sortPosition: correctiveActionsRanked.sortPosition,
    })
    .from(correctiveActionsRanked)
    .orderBy(asc(correctiveActionsRanked.axisIdx), asc(correctiveActionsRanked.seqInAxis));
}

async function loadLinks(
  tx: UserTx,
  codes: string[],
): Promise<Map<string, { actionCode: string; rank: number }[]>> {
  const map = new Map<string, { actionCode: string; rank: number }[]>();
  if (!codes.length) return map;
  const rows = await tx
    .select({
      obstacleCode: obstacleActionLinks.obstacleCode,
      actionCode: obstacleActionLinks.actionCode,
      rank: obstacleActionLinks.rank,
    })
    .from(obstacleActionLinks)
    .where(inArray(obstacleActionLinks.obstacleCode, codes));
  for (const r of rows) {
    const list = map.get(r.obstacleCode) ?? [];
    list.push({ actionCode: r.actionCode, rank: r.rank });
    map.set(r.obstacleCode, list);
  }
  for (const [k, v] of map) map.set(k, orderByRank(v));
  return map;
}

// --- problem rows with their context ---------------------------------------------------------

const endIndexSql = sql`(extract(year from ${assessments.periodStart})::int * 12 + extract(month from ${assessments.periodStart})::int - 1 + ${assessments.months} - 1)`;

async function baseRows(tx: UserTx, userId: string, where: SQL | undefined) {
  return tx
    .select({
      p: problems,
      plantId: plants.id,
      plantName: plants.name,
      periodStart: assessments.periodStart,
      months: assessments.months,
      limitsSnapshot: assessments.limitsSnapshot,
      sysCode: indicators.code,
      sysNameAr: indicators.nameAr,
      sysNameEn: indicators.nameEn,
      sysUnit: indicators.unit,
      usrId: userIndicators.id,
      usrNameAr: userIndicators.nameAr,
      usrNameEn: userIndicators.nameEn,
      usrUnit: userIndicators.unit,
      readingStatus: assessmentReadings.status,
      obstacleCount: sql<number>`(select count(*)::int from problem_obstacles x where x.problem_id = ${problems.id})`,
      chosenCount: sql<number>`((select count(*) from problem_actions x where x.problem_id = ${problems.id} and x.chosen) + (select count(*) from custom_actions x where x.problem_id = ${problems.id} and x.chosen))::int`,
      implementedCount: sql<number>`((select count(*) from problem_actions x where x.problem_id = ${problems.id} and x.implemented_on is not null) + (select count(*) from custom_actions x where x.problem_id = ${problems.id} and x.implemented_on is not null))::int`,
    })
    .from(problems)
    .innerJoin(
      assessments,
      and(eq(assessments.id, problems.assessmentId), eq(assessments.ownerId, problems.ownerId)),
    )
    .innerJoin(plants, and(eq(plants.id, assessments.plantId), eq(plants.ownerId, assessments.ownerId)))
    .leftJoin(indicators, eq(indicators.code, problems.indicatorCode))
    .leftJoin(
      userIndicators,
      and(eq(userIndicators.id, problems.userIndicatorId), eq(userIndicators.ownerId, problems.ownerId)),
    )
    .leftJoin(
      assessmentReadings,
      and(
        eq(assessmentReadings.assessmentId, problems.assessmentId),
        eq(assessmentReadings.ownerId, problems.ownerId),
        or(
          eq(assessmentReadings.indicatorCode, problems.indicatorCode),
          eq(assessmentReadings.userIndicatorId, problems.userIndicatorId),
        ),
      ),
    )
    .where(and(eq(problems.ownerId, userId), where));
}

type BaseRow = Awaited<ReturnType<typeof baseRows>>[number];

function indicatorOf(r: BaseRow): IndicatorInfo {
  if (r.p.indicatorCode) {
    return {
      ref: `sys:${r.p.indicatorCode}`,
      code: r.p.indicatorCode,
      nameAr: r.sysNameAr ?? r.p.indicatorCode,
      nameEn: r.sysNameEn,
      unit: r.sysUnit ?? "",
    };
  }
  return {
    ref: `usr:${r.p.userIndicatorId}`,
    code: null,
    nameAr: r.usrNameAr ?? "",
    nameEn: r.usrNameEn,
    unit: r.usrUnit ?? "",
  };
}

const stageOfRow = (r: BaseRow): ProblemStage =>
  deriveStage({
    obstacleCount: r.obstacleCount,
    chosenActionCount: r.chosenCount,
    obstacleOnly: r.p.obstacleOnly,
  });

// --- the problem page ----------------------------------------------------------------------

type ActionRowMap = Map<string, typeof problemActions.$inferSelect>;

const stateOfSystem = (row: typeof problemActions.$inferSelect | undefined): ActionState => ({
  chosen: row?.chosen ?? false,
  needsStudy: row?.needsStudy ?? false,
  implementedOn: row?.implementedOn ?? null,
  linkedObstacle: row ? targetOf(row.linkedObstacleCode, row.linkedCustomObstacleId) : null,
});

async function loadSelected(tx: UserTx, userId: string, problemId: string): Promise<SelectedObstacle[]> {
  const rows = await tx
    .select({
      customObstacleId: problemObstacles.customObstacleId,
      obstacleCode: problemObstacles.obstacleCode,
      classification: problemObstacles.classification,
      note: problemObstacles.note,
      coName: customObstacles.name,
      coDescription: customObstacles.description,
      coRationale: customObstacles.rationale,
      axisIdx: obstacles.axisIdx,
      seqInAxis: obstacles.seqInAxis,
      textAr: obstacles.textAr,
      textEn: obstacles.textEn,
    })
    .from(problemObstacles)
    .leftJoin(
      customObstacles,
      and(
        eq(customObstacles.id, problemObstacles.customObstacleId),
        eq(customObstacles.ownerId, problemObstacles.ownerId),
      ),
    )
    .leftJoin(obstacles, eq(obstacles.code, problemObstacles.obstacleCode))
    .where(and(eq(problemObstacles.problemId, problemId), eq(problemObstacles.ownerId, userId)));
  const list = rows.map((r): SelectedObstacle & { sortKey: string } =>
    r.obstacleCode
      ? {
          kind: "system",
          key: r.obstacleCode,
          code: r.obstacleCode,
          axisIdx: r.axisIdx ?? 0,
          seqInAxis: r.seqInAxis ?? 0,
          textAr: r.textAr ?? "",
          textEn: r.textEn ?? "",
          classification: r.classification,
          note: r.note,
          sortKey: "",
        }
      : {
          kind: "custom",
          key: `custom:${r.customObstacleId}`,
          id: r.customObstacleId as string,
          name: r.coName ?? "",
          description: r.coDescription ?? "",
          rationale: r.coRationale ?? "",
          classification: r.classification,
          note: r.note,
          sortKey: `${(r.coName ?? "").toLowerCase()}\u0000${r.customObstacleId}`,
        },
  );
  return orderSelectedObstacles(list).map((o) => {
    const { sortKey, ...rest } = o;
    void sortKey;
    return rest as SelectedObstacle;
  });
}

async function loadActionRows(tx: UserTx, userId: string, problemId: string): Promise<ActionRowMap> {
  const rows = await tx
    .select()
    .from(problemActions)
    .where(and(eq(problemActions.problemId, problemId), eq(problemActions.ownerId, userId)));
  return new Map(rows.map((r) => [r.actionCode, r]));
}

async function loadCustomActions(tx: UserTx, userId: string, problemId: string) {
  return tx
    .select()
    .from(customActions)
    .where(and(eq(customActions.problemId, problemId), eq(customActions.ownerId, userId)))
    .orderBy(asc(customActions.name), asc(customActions.id));
}

const customDto = (c: typeof customActions.$inferSelect): CustomActionDto => ({
  id: c.id,
  name: c.name,
  description: c.description,
  rationale: c.rationale,
  linkedObstacle: targetOf(c.linkedObstacleCode, c.linkedCustomObstacleId),
  chosen: c.chosen,
  needsStudy: c.needsStudy,
  implementedOn: c.implementedOn,
});

/**
 * Everything the problem page shows, in a handful of queries: header (with the limit crossed,
 * from the assessment's limits SNAPSHOT), derived stage, selected obstacles, suggestions
 * per obstacle with each action's state, the chosen-actions summary, case-specific actions,
 * the flag and the audit trail (newest first).
 */
export async function getProblem(
  tx: UserTx,
  userId: string,
  problemId: string,
): Promise<ProblemResult<ProblemDto>> {
  if (!isUuid(problemId)) return NOT_FOUND;
  const [r] = await baseRows(tx, userId, eq(problems.id, problemId));
  if (!r) return NOT_FOUND;

  const selected = await loadSelected(tx, userId, problemId);
  const actionRows = await loadActionRows(tx, userId, problemId);
  const customs = await loadCustomActions(tx, userId, problemId);
  const refs = await loadActionRefs(tx);
  const systemCodes = selected.flatMap((o) => (o.kind === "system" ? [o.code] : []));
  const links = await loadLinks(tx, systemCodes);
  const trail = await tx
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.ownerId, userId),
        eq(auditEvents.entity, "problem"),
        eq(auditEvents.entityId, problemId),
      ),
    )
    .orderBy(desc(auditEvents.at), desc(auditEvents.id));

  const refByCode = new Map(refs.map((a) => [a.code, a]));
  const plain = (a: ActionRef): PlainAction => ({
    actionCode: a.code,
    textAr: a.textAr,
    textEn: a.textEn,
    ...stateOfSystem(actionRows.get(a.code)),
  });
  const byHiddenOrder = [...refs].sort((a, b) => a.sortPosition - b.sortPosition);

  const suggestions: SuggestionGroup[] = selected.map((obstacle) => {
    if (obstacle.kind === "custom") {
      return { obstacle, linked: [], axisActions: [], allActions: byHiddenOrder.map(plain) };
    }
    const linked: RankedAction[] = (links.get(obstacle.code) ?? []).flatMap((l) => {
      const a = refByCode.get(l.actionCode);
      return a ? [{ ...plain(a), rank: l.rank }] : [];
    });
    const axisActions = linked.length
      ? []
      : refs.filter((a) => a.axisIdx === obstacle.axisIdx).map(plain); // already in source order
    return { obstacle, linked, axisActions, allActions: [] };
  });

  // chosen-actions summary: by position of the obstacle they were chosen under, then rank
  const position = new Map(selected.map((o, i) => [o.key, i]));
  const chosenSystem: ChosenAction[] = [...actionRows.values()]
    .filter((a) => a.chosen)
    .map((row) => {
      const a = refByCode.get(row.actionCode) as ActionRef;
      const state = stateOfSystem(row);
      const lo = state.linkedObstacle;
      const rank =
        lo?.kind === "system"
          ? ((links.get(lo.code) ?? []).find((l) => l.actionCode === row.actionCode)?.rank ?? null)
          : null;
      return { kind: "system" as const, actionCode: a.code, textAr: a.textAr, textEn: a.textEn, ...state, rank };
    })
    .sort((x, y) => {
      const px = x.linkedObstacle ? (position.get(keyOfTarget(x.linkedObstacle)) ?? 1e6) : 1e6;
      const py = y.linkedObstacle ? (position.get(keyOfTarget(y.linkedObstacle)) ?? 1e6) : 1e6;
      const rx = x.kind === "system" ? (x.rank ?? 1e6) : 1e6;
      const ry = y.kind === "system" ? (y.rank ?? 1e6) : 1e6;
      return px - py || rx - ry || (x.kind === "system" && y.kind === "system" ? (x.actionCode < y.actionCode ? -1 : 1) : 0);
    });
  const chosenCustom: ChosenAction[] = customs
    .filter((c) => c.chosen)
    .map((c) => ({
      kind: "custom" as const,
      customActionId: c.id,
      name: c.name,
      chosen: true as const,
      needsStudy: c.needsStudy,
      implementedOn: c.implementedOn,
      linkedObstacle: targetOf(c.linkedObstacleCode, c.linkedCustomObstacleId),
    }));

  const snapshot = limitsSnapshotSchema.safeParse(r.limitsSnapshot ?? {});
  const indicator = indicatorOf(r);
  const limits: Limits | null = snapshot.success ? (snapshot.data[indicator.ref] ?? null) : null;
  const header: ProblemHeader = {
    id: r.p.id,
    plantId: r.plantId,
    plantName: r.plantName,
    indicator,
    assessmentId: r.p.assessmentId,
    periodStart: r.periodStart.slice(0, 7),
    months: r.months as PeriodMonths,
    detectedOn: r.p.detectedOn,
    value: r.p.value,
    readingStatus: r.readingStatus,
    limits,
    limitCrossed: limitCrossed(limits, r.readingStatus, r.p.value),
    origin: r.p.origin,
    description: r.p.description,
    createdAt: r.p.createdAt.toISOString(),
  };
  const stage = stageFrom({
    obstacleCount: selected.length,
    chosenCount: chosenSystem.length + chosenCustom.length,
    obstacleOnly: r.p.obstacleOnly,
  });
  return ok({
    header,
    stage,
    open: isOpenStage(stage),
    obstacleOnly: r.p.obstacleOnly,
    obstacles: selected,
    suggestions,
    chosenActions: [...chosenSystem, ...chosenCustom],
    customActions: customs.map(customDto),
    audit: trail.map(
      (e): ProblemAuditEntry => ({
        id: e.id,
        action: e.action,
        actor: e.actor,
        payload: (e.payload ?? {}) as Record<string, unknown>,
        at: e.at.toISOString(),
      }),
    ),
  });
}

/**
 * "Show all corrective actions": the 65 actions grouped by the 7 action axes in source
 * order with each action's current state for this problem. Actions linked to a selected
 * system obstacle carry `linkedTo` with their rank for it; the others carry text only.
 */
export async function getAllActions(
  tx: UserTx,
  userId: string,
  problemId: string,
): Promise<ProblemResult<AllActionsDto>> {
  const problem = await loadProblem(tx, userId, problemId);
  if (!problem) return NOT_FOUND;
  const selected = await loadSelected(tx, userId, problemId);
  const actionRows = await loadActionRows(tx, userId, problemId);
  const refs = await loadActionRefs(tx);
  const axes = await tx.select().from(actionAxes).orderBy(asc(actionAxes.idx));
  const links = await loadLinks(
    tx,
    selected.flatMap((o) => (o.kind === "system" ? [o.code] : [])),
  );
  const linkedTo = new Map<string, { obstacleCode: string; rank: number }[]>();
  for (const o of selected) {
    if (o.kind !== "system") continue;
    for (const l of links.get(o.code) ?? []) {
      const list = linkedTo.get(l.actionCode) ?? [];
      list.push({ obstacleCode: o.code, rank: l.rank });
      linkedTo.set(l.actionCode, list);
    }
  }
  return ok({
    problemId,
    axes: axes.map((ax) => ({
      idx: ax.idx,
      nameAr: ax.nameAr,
      nameEn: ax.nameEn,
      actions: refs
        .filter((a) => a.axisIdx === ax.idx)
        .map(
          (a): AllActionEntry => ({
            actionCode: a.code,
            seqInAxis: a.seqInAxis,
            textAr: a.textAr,
            textEn: a.textEn,
            ...stateOfSystem(actionRows.get(a.code)),
            linkedTo: linkedTo.get(a.code) ?? [],
          }),
        ),
    })),
  });
}

// --- writes: plumbing ------------------------------------------------------------------------

type Ev = { [A in ProblemAuditAction]: { action: A; payload: ProblemAuditPayloads[A] } }[ProblemAuditAction];
type Outcome<X> = { fail: ProblemFailure } | { events: Ev[]; extra?: X };

const stop = (f: ProblemFailure): { fail: ProblemFailure } => ({ fail: f });

/**
 * Locks the problem row, runs `fn` (which must check everything BEFORE it writes), then
 * derives the new stage and appends the audit events (plus `stage_changed` when it moved).
 * Events get strictly increasing timestamps so the trail keeps the order of the steps.
 */
async function mutate<X extends object = Record<never, never>>(
  tx: UserTx,
  userId: string,
  problemId: string,
  ctx: Ctx,
  fn: (p: ProblemRow) => Promise<Outcome<X>>,
): Promise<ProblemResult<MutationData & X>> {
  const p = await loadProblem(tx, userId, problemId, true);
  if (!p) return NOT_FOUND;
  const before = await stageOf(tx, userId, p.id);
  const out = await fn(p);
  if ("fail" in out) return out.fail;
  const events: Ev[] = [...out.events];
  let after = before;
  if (events.length) {
    after = await stageOf(tx, userId, p.id);
    if (after !== before) events.push({ action: "stage_changed", payload: { from: before, to: after } });
    await tx.insert(auditEvents).values(
      events.map((e, i) => ({
        ownerId: userId,
        entity: "problem",
        entityId: p.id,
        actor: ctx.actor,
        action: e.action,
        payload: e.payload as Record<string, unknown>,
        at: new Date(ctx.now.getTime() + i),
      })),
    );
  }
  return ok({
    stage: after,
    open: isOpenStage(after),
    previousStage: before,
    stageChanged: after !== before,
    ...(out.extra ?? ({} as X)),
  });
}

const nothing = (): { events: Ev[] } => ({ events: [] });

async function actionExists(tx: UserTx, code: string): Promise<boolean> {
  const [r] = await tx
    .select({ code: correctiveActions.code })
    .from(correctiveActions)
    .where(eq(correctiveActions.code, code));
  return Boolean(r);
}

/** The target must be an obstacle SELECTED in this problem (system) or an unlisted one of it. */
async function targetIsSelected(
  tx: UserTx,
  userId: string,
  problemId: string,
  t: ObstacleTarget,
): Promise<boolean> {
  const [r] = await tx
    .select({ id: problemObstacles.id })
    .from(problemObstacles)
    .where(
      and(
        eq(problemObstacles.problemId, problemId),
        eq(problemObstacles.ownerId, userId),
        t.kind === "system"
          ? eq(problemObstacles.obstacleCode, t.code)
          : eq(problemObstacles.customObstacleId, t.id),
      ),
    );
  return Boolean(r);
}

async function chosenLinkedTo(
  tx: UserTx,
  userId: string,
  problemId: string,
  t: ObstacleTarget,
): Promise<BlockingAction[]> {
  const out: BlockingAction[] = [];
  const sys = await tx
    .select({ code: problemActions.actionCode })
    .from(problemActions)
    .where(
      and(
        eq(problemActions.problemId, problemId),
        eq(problemActions.ownerId, userId),
        eq(problemActions.chosen, true),
        t.kind === "system"
          ? eq(problemActions.linkedObstacleCode, t.code)
          : eq(problemActions.linkedCustomObstacleId, t.id),
      ),
    );
  if (sys.length) {
    const refs = new Map((await loadActionRefs(tx)).map((a) => [a.code, a]));
    for (const s of sys) {
      const a = refs.get(s.code);
      out.push({ kind: "system", actionCode: s.code, textAr: a?.textAr ?? "", textEn: a?.textEn ?? "" });
    }
    out.sort((x, y) => (x.kind === "system" && y.kind === "system" ? (x.actionCode < y.actionCode ? -1 : 1) : 0));
  }
  const cus = await tx
    .select({ id: customActions.id, name: customActions.name })
    .from(customActions)
    .where(
      and(
        eq(customActions.problemId, problemId),
        eq(customActions.ownerId, userId),
        eq(customActions.chosen, true),
        t.kind === "system"
          ? eq(customActions.linkedObstacleCode, t.code)
          : eq(customActions.linkedCustomObstacleId, t.id),
      ),
    )
    .orderBy(asc(customActions.name), asc(customActions.id));
  for (const c of cus) out.push({ kind: "custom", customActionId: c.id, name: c.name });
  return out;
}

const dateFailure = (c: ReturnType<typeof checkImplementationDate>): ProblemFailure | null =>
  c === "ok" ? null : fail(c === "invalid" ? "invalidDate" : c === "future" ? "futureDate" : "beforeDetected");

/** After a removal: with no obstacle left the "obstacle only" flag cannot stand. */
async function clearFlagIfNoObstacles(
  tx: UserTx,
  userId: string,
  p: ProblemRow,
  events: Ev[],
): Promise<void> {
  if (!p.obstacleOnly) return;
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(problemObstacles)
    .where(and(eq(problemObstacles.problemId, p.id), eq(problemObstacles.ownerId, userId)));
  if (r.n > 0) return;
  await tx
    .update(problems)
    .set({ obstacleOnly: false })
    .where(and(eq(problems.id, p.id), eq(problems.ownerId, userId)));
  events.push({ action: "obstacle_only_cleared", payload: { reason: "lastObstacleRemoved" } });
}

// --- writes: description and obstacles -------------------------------------------------------

export async function updateDescription(
  tx: UserTx,
  userId: string,
  input: UpdateDescriptionInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    if (p.description === input.description) return nothing();
    await tx
      .update(problems)
      .set({ description: input.description })
      .where(and(eq(problems.id, p.id), eq(problems.ownerId, userId)));
    return { events: [{ action: "description_changed", payload: { from: p.description, to: input.description } }] };
  });
}

/** Selects a system obstacle, or changes the classification / note of a selected one (system or unlisted). */
export async function setObstacle(
  tx: UserTx,
  userId: string,
  input: SetObstacleInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    const t = input.target;
    if (t.kind === "system") {
      const [o] = await tx.select({ code: obstacles.code }).from(obstacles).where(eq(obstacles.code, t.code));
      if (!o) return stop(fail("obstacleNotFound"));
    }
    const [row] = await tx
      .select()
      .from(problemObstacles)
      .where(
        and(
          eq(problemObstacles.problemId, p.id),
          eq(problemObstacles.ownerId, userId),
          t.kind === "system"
            ? eq(problemObstacles.obstacleCode, t.code)
            : eq(problemObstacles.customObstacleId, t.id),
        ),
      );
    const who = obstacleAudit(t.kind === "system" ? t.code : null, t.kind === "custom" ? t.id : null);
    if (!row) {
      if (t.kind === "custom") return stop(fail("customObstacleNotFound"));
      const note = input.note ?? "";
      await tx.insert(problemObstacles).values({
        ownerId: userId,
        problemId: p.id,
        obstacleCode: t.code,
        classification: input.classification,
        note,
      });
      return { events: [{ action: "obstacle_selected", payload: { ...who, classification: input.classification, note } }] };
    }
    const events: Ev[] = [];
    const patch: Partial<typeof problemObstacles.$inferInsert> = {};
    if (row.classification !== input.classification) {
      patch.classification = input.classification;
      events.push({
        action: "obstacle_classification_changed",
        payload: { ...who, from: row.classification, to: input.classification },
      });
    }
    if (input.note !== undefined && input.note !== row.note) {
      patch.note = input.note;
      events.push({ action: "obstacle_note_changed", payload: { ...who, from: row.note, to: input.note } });
    }
    if (events.length) {
      await tx.update(problemObstacles).set(patch).where(eq(problemObstacles.id, row.id));
    }
    return { events };
  });
}

/**
 * Unselects a SYSTEM obstacle. Refused (`obstacleHasChosenActions`, naming the actions) while
 * an action chosen for it remains; the user must un-choose it first. Removing the last
 * obstacle clears the "obstacle only" flag.
 */
export async function unsetObstacle(
  tx: UserTx,
  userId: string,
  input: UnsetObstacleInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    const [row] = await tx
      .select()
      .from(problemObstacles)
      .where(
        and(
          eq(problemObstacles.problemId, p.id),
          eq(problemObstacles.ownerId, userId),
          eq(problemObstacles.obstacleCode, input.obstacleCode),
        ),
      );
    if (!row) return stop(fail("obstacleNotSelected"));
    const target: ObstacleTarget = { kind: "system", code: input.obstacleCode };
    const blocking = await chosenLinkedTo(tx, userId, p.id, target);
    if (blocking.length) return stop({ ok: false, error: "obstacleHasChosenActions", blocking });
    // nothing chosen depends on it: drop links held by not-chosen rows
    await tx
      .update(customActions)
      .set({ linkedObstacleCode: null })
      .where(
        and(
          eq(customActions.problemId, p.id),
          eq(customActions.ownerId, userId),
          eq(customActions.linkedObstacleCode, input.obstacleCode),
        ),
      );
    await tx
      .update(problemActions)
      .set({ linkedObstacleCode: null })
      .where(
        and(
          eq(problemActions.problemId, p.id),
          eq(problemActions.ownerId, userId),
          eq(problemActions.linkedObstacleCode, input.obstacleCode),
        ),
      );
    await tx.delete(problemObstacles).where(eq(problemObstacles.id, row.id));
    const events: Ev[] = [
      {
        action: "obstacle_removed",
        payload: { ...obstacleAudit(input.obstacleCode, null), classification: row.classification, note: row.note },
      },
    ];
    await clearFlagIfNoObstacles(tx, userId, p, events);
    return { events };
  });
}

/** Adds an unlisted obstacle of this problem and selects it with the given classification. */
export async function addCustomObstacle(
  tx: UserTx,
  userId: string,
  input: AddCustomObstacleInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData & { customObstacleId: string }>> {
  return mutate<{ customObstacleId: string }>(tx, userId, input.problemId, ctx, async (p) => {
    const [c] = await tx
      .insert(customObstacles)
      .values({
        ownerId: userId,
        problemId: p.id,
        name: input.name,
        description: input.description ?? "",
        rationale: input.rationale ?? "",
      })
      .returning({ id: customObstacles.id });
    await tx.insert(problemObstacles).values({
      ownerId: userId,
      problemId: p.id,
      customObstacleId: c.id,
      classification: input.classification,
      note: "",
    });
    return {
      events: [
        {
          action: "custom_obstacle_added",
          payload: { customObstacleId: c.id, name: input.name, classification: input.classification },
        },
      ],
      extra: { customObstacleId: c.id },
    };
  });
}

export async function updateCustomObstacle(
  tx: UserTx,
  userId: string,
  input: UpdateCustomObstacleInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    if (!isUuid(input.customObstacleId)) return stop(fail("customObstacleNotFound"));
    const [c] = await tx
      .select()
      .from(customObstacles)
      .where(
        and(
          eq(customObstacles.id, input.customObstacleId),
          eq(customObstacles.problemId, p.id),
          eq(customObstacles.ownerId, userId),
        ),
      );
    if (!c) return stop(fail("customObstacleNotFound"));
    const next = {
      name: input.name,
      description: input.description ?? "",
      rationale: input.rationale ?? "",
    };
    const changes: ProblemAuditPayloads["custom_obstacle_edited"]["changes"] = {};
    for (const k of ["name", "description", "rationale"] as const) {
      if (c[k] !== next[k]) changes[k] = { from: c[k], to: next[k] };
    }
    const events: Ev[] = [];
    if (Object.keys(changes).length) {
      await tx.update(customObstacles).set(next).where(eq(customObstacles.id, c.id));
      events.push({ action: "custom_obstacle_edited", payload: { customObstacleId: c.id, changes } });
    }
    const [sel] = await tx
      .select()
      .from(problemObstacles)
      .where(
        and(
          eq(problemObstacles.problemId, p.id),
          eq(problemObstacles.ownerId, userId),
          eq(problemObstacles.customObstacleId, c.id),
        ),
      );
    if (sel && sel.classification !== input.classification) {
      await tx
        .update(problemObstacles)
        .set({ classification: input.classification })
        .where(eq(problemObstacles.id, sel.id));
      events.push({
        action: "obstacle_classification_changed",
        payload: { ...obstacleAudit(null, c.id), from: sel.classification, to: input.classification },
      });
    }
    return { events };
  });
}

/**
 * Deletes an unlisted obstacle with its selection. Refused (`customObstacleHasChosenActions`)
 * while an action chosen for it remains. Not-chosen actions tied to it are unlinked (case-
 * specific actions) or dropped (system rows that only held the link).
 */
export async function deleteCustomObstacle(
  tx: UserTx,
  userId: string,
  input: DeleteCustomObstacleInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    if (!isUuid(input.customObstacleId)) return stop(fail("customObstacleNotFound"));
    const [c] = await tx
      .select()
      .from(customObstacles)
      .where(
        and(
          eq(customObstacles.id, input.customObstacleId),
          eq(customObstacles.problemId, p.id),
          eq(customObstacles.ownerId, userId),
        ),
      );
    if (!c) return stop(fail("customObstacleNotFound"));
    const target: ObstacleTarget = { kind: "custom", id: c.id };
    const blocking = await chosenLinkedTo(tx, userId, p.id, target);
    if (blocking.length) return stop({ ok: false, error: "customObstacleHasChosenActions", blocking });

    const [sel] = await tx
      .select({ classification: problemObstacles.classification })
      .from(problemObstacles)
      .where(
        and(
          eq(problemObstacles.problemId, p.id),
          eq(problemObstacles.ownerId, userId),
          eq(problemObstacles.customObstacleId, c.id),
        ),
      );
    // system rows that only held the link: keep those with a needs-study flag, drop the rest
    await tx
      .delete(problemActions)
      .where(
        and(
          eq(problemActions.problemId, p.id),
          eq(problemActions.ownerId, userId),
          eq(problemActions.linkedCustomObstacleId, c.id),
          eq(problemActions.chosen, false),
          eq(problemActions.needsStudy, false),
        ),
      );
    await tx
      .update(problemActions)
      .set({ linkedCustomObstacleId: null })
      .where(
        and(
          eq(problemActions.problemId, p.id),
          eq(problemActions.ownerId, userId),
          eq(problemActions.linkedCustomObstacleId, c.id),
        ),
      );
    const unlinked = await tx
      .update(customActions)
      .set({ linkedCustomObstacleId: null })
      .where(
        and(
          eq(customActions.problemId, p.id),
          eq(customActions.ownerId, userId),
          eq(customActions.linkedCustomObstacleId, c.id),
        ),
      )
      .returning({ id: customActions.id });
    await tx
      .delete(problemObstacles)
      .where(
        and(
          eq(problemObstacles.problemId, p.id),
          eq(problemObstacles.ownerId, userId),
          eq(problemObstacles.customObstacleId, c.id),
        ),
      );
    await tx.delete(customObstacles).where(eq(customObstacles.id, c.id));
    const events: Ev[] = [
      {
        action: "custom_obstacle_deleted",
        payload: {
          customObstacleId: c.id,
          name: c.name,
          classification: sel?.classification ?? "possible",
          unlinkedCustomActionIds: unlinked.map((u) => u.id).sort(),
        },
      },
    ];
    await clearFlagIfNoObstacles(tx, userId, p, events);
    return { events };
  });
}

/**
 * "Keep the obstacle only and prepare the report". Needs at least one selected obstacle.
 * The flag decides the stage only while no action is chosen.
 */
export async function setObstacleOnly(
  tx: UserTx,
  userId: string,
  input: SetObstacleOnlyInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    if (input.value === p.obstacleOnly) return nothing();
    if (input.value) {
      const [r] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(problemObstacles)
        .where(and(eq(problemObstacles.problemId, p.id), eq(problemObstacles.ownerId, userId)));
      if (r.n === 0) return stop(fail("noObstacleSelected"));
    }
    await tx
      .update(problems)
      .set({ obstacleOnly: input.value })
      .where(and(eq(problems.id, p.id), eq(problems.ownerId, userId)));
    return {
      events: [
        input.value
          ? { action: "obstacle_only_set", payload: {} }
          : { action: "obstacle_only_cleared", payload: { reason: "manual" } },
      ],
    };
  });
}

// --- writes: system actions --------------------------------------------------------------------

const actionWho = (code: string) => ({ actionCode: code, customActionId: null });
const customWho = (id: string) => ({ actionCode: null, customActionId: id });

/**
 * Chooses or un-chooses a system action for the problem. `linkedObstacle` (a SELECTED
 * obstacle of this problem, or none) records the obstacle it was chosen under. Choosing an
 * already chosen action is a no-op. Un-choosing clears the implementation date and the link;
 * the row stays only while the needs-study flag is set.
 */
export async function setActionChosen(
  tx: UserTx,
  userId: string,
  input: SetActionChosenInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    if (!(await actionExists(tx, input.actionCode))) return stop(fail("actionNotFound"));
    const [row] = await tx
      .select()
      .from(problemActions)
      .where(
        and(
          eq(problemActions.problemId, p.id),
          eq(problemActions.ownerId, userId),
          eq(problemActions.actionCode, input.actionCode),
        ),
      );
    if (input.chosen) {
      if (row?.chosen) return nothing();
      const link = input.linkedObstacle ?? null;
      if (link && !(await targetIsSelected(tx, userId, p.id, link))) {
        return stop(fail("invalidLinkedObstacle"));
      }
      if (row) {
        await tx.update(problemActions).set({ chosen: true, ...linkCols(link) }).where(eq(problemActions.id, row.id));
      } else {
        await tx.insert(problemActions).values({
          ownerId: userId,
          problemId: p.id,
          actionCode: input.actionCode,
          chosen: true,
          ...linkCols(link),
        });
      }
      return {
        events: [
          {
            action: "action_chosen",
            payload: { ...actionWho(input.actionCode), ...linkCols(link) },
          },
        ],
      };
    }
    if (!row?.chosen) return nothing();
    if (row.needsStudy) {
      await tx
        .update(problemActions)
        .set({ chosen: false, implementedOn: null, linkedObstacleCode: null, linkedCustomObstacleId: null })
        .where(eq(problemActions.id, row.id));
    } else {
      await tx.delete(problemActions).where(eq(problemActions.id, row.id));
    }
    return {
      events: [
        { action: "action_unchosen", payload: { ...actionWho(input.actionCode), implementedOn: row.implementedOn } },
      ],
    };
  });
}

/** The "needs further study" flag, independent of chosen (a suggested action can carry it). */
export async function setActionNeedsStudy(
  tx: UserTx,
  userId: string,
  input: SetActionNeedsStudyInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    if (!(await actionExists(tx, input.actionCode))) return stop(fail("actionNotFound"));
    const [row] = await tx
      .select()
      .from(problemActions)
      .where(
        and(
          eq(problemActions.problemId, p.id),
          eq(problemActions.ownerId, userId),
          eq(problemActions.actionCode, input.actionCode),
        ),
      );
    if ((row?.needsStudy ?? false) === input.needsStudy) return nothing();
    if (input.needsStudy) {
      if (row) {
        await tx.update(problemActions).set({ needsStudy: true }).where(eq(problemActions.id, row.id));
      } else {
        await tx
          .insert(problemActions)
          .values({ ownerId: userId, problemId: p.id, actionCode: input.actionCode, needsStudy: true });
      }
    } else if (row!.chosen) {
      await tx.update(problemActions).set({ needsStudy: false }).where(eq(problemActions.id, row!.id));
    } else {
      await tx.delete(problemActions).where(eq(problemActions.id, row!.id));
    }
    return {
      events: [
        {
          action: input.needsStudy ? "action_needs_study_set" : "action_needs_study_cleared",
          payload: actionWho(input.actionCode),
        },
      ],
    };
  });
}

/**
 * Records (or clears, with null) the actual implementation date. Requires the action to be
 * chosen (`notChosen`); the date is a real day, not after today in Baghdad (`futureDate`)
 * and not before the problem's detection date (`beforeDetected`).
 */
export async function setActionImplemented(
  tx: UserTx,
  userId: string,
  input: SetActionImplementedInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    if (!(await actionExists(tx, input.actionCode))) return stop(fail("actionNotFound"));
    const [row] = await tx
      .select()
      .from(problemActions)
      .where(
        and(
          eq(problemActions.problemId, p.id),
          eq(problemActions.ownerId, userId),
          eq(problemActions.actionCode, input.actionCode),
        ),
      );
    if (input.implementedOn === null) {
      if (!row?.implementedOn) return nothing();
      await tx.update(problemActions).set({ implementedOn: null }).where(eq(problemActions.id, row.id));
      return {
        events: [
          {
            action: "action_implementation_cleared",
            payload: { ...actionWho(input.actionCode), previous: row.implementedOn },
          },
        ],
      };
    }
    if (!row?.chosen) return stop(fail("notChosen"));
    const bad = dateFailure(checkImplementationDate(input.implementedOn, p.detectedOn, ctx.now));
    if (bad) return stop(bad);
    if (row.implementedOn === input.implementedOn) return nothing();
    await tx.update(problemActions).set({ implementedOn: input.implementedOn }).where(eq(problemActions.id, row.id));
    return {
      events: [
        {
          action: "action_implemented",
          payload: { ...actionWho(input.actionCode), implementedOn: input.implementedOn, previous: row.implementedOn },
        },
      ],
    };
  });
}

// --- writes: case-specific actions -------------------------------------------------------------

type CustomActionRow = typeof customActions.$inferSelect;

async function loadCustomAction(
  tx: UserTx,
  userId: string,
  problemId: string,
  id: string,
): Promise<CustomActionRow | null> {
  if (!isUuid(id)) return null;
  const [c] = await tx
    .select()
    .from(customActions)
    .where(
      and(eq(customActions.id, id), eq(customActions.problemId, problemId), eq(customActions.ownerId, userId)),
    );
  return c ?? null;
}

const linkKey = (code: string | null, customId: string | null): string | null =>
  code ?? (customId ? `custom:${customId}` : null);

export async function addCustomAction(
  tx: UserTx,
  userId: string,
  input: AddCustomActionInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData & { customActionId: string }>> {
  return mutate<{ customActionId: string }>(tx, userId, input.problemId, ctx, async (p) => {
    const link = input.linkedObstacle ?? null;
    if (link && !(await targetIsSelected(tx, userId, p.id, link))) {
      return stop(fail("invalidLinkedObstacle"));
    }
    const [c] = await tx
      .insert(customActions)
      .values({
        ownerId: userId,
        problemId: p.id,
        name: input.name,
        description: input.description ?? "",
        rationale: input.rationale ?? "",
        chosen: Boolean(input.chooseNow),
        ...linkCols(link),
      })
      .returning({ id: customActions.id });
    const events: Ev[] = [
      {
        action: "custom_action_added",
        payload: { customActionId: c.id, name: input.name, ...linkCols(link) },
      },
    ];
    if (input.chooseNow) {
      events.push({ action: "action_chosen", payload: { ...customWho(c.id), ...linkCols(link) } });
    }
    return { events, extra: { customActionId: c.id } };
  });
}

export async function updateCustomAction(
  tx: UserTx,
  userId: string,
  input: UpdateCustomActionInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    const c = await loadCustomAction(tx, userId, p.id, input.customActionId);
    if (!c) return stop(fail("customActionNotFound"));
    const link = input.linkedObstacle ?? null;
    const oldKey = linkKey(c.linkedObstacleCode, c.linkedCustomObstacleId);
    const newKey = link ? keyOfTarget(link) : null;
    if (newKey !== oldKey && link && !(await targetIsSelected(tx, userId, p.id, link))) {
      return stop(fail("invalidLinkedObstacle"));
    }
    const next = { name: input.name, description: input.description ?? "", rationale: input.rationale ?? "" };
    const changes: ProblemAuditPayloads["custom_action_edited"]["changes"] = {};
    for (const k of ["name", "description", "rationale"] as const) {
      if (c[k] !== next[k]) changes[k] = { from: c[k], to: next[k] };
    }
    if (newKey !== oldKey) changes.linkedObstacle = { from: oldKey, to: newKey };
    if (!Object.keys(changes).length) return nothing();
    await tx
      .update(customActions)
      .set({ ...next, ...linkCols(link) })
      .where(eq(customActions.id, c.id));
    return { events: [{ action: "custom_action_edited", payload: { customActionId: c.id, changes } }] };
  });
}

/** Deletable unless it is chosen or implemented (`customActionLocked`). */
export async function deleteCustomAction(
  tx: UserTx,
  userId: string,
  input: DeleteCustomActionInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    const c = await loadCustomAction(tx, userId, p.id, input.customActionId);
    if (!c) return stop(fail("customActionNotFound"));
    if (c.chosen || c.implementedOn) return stop(fail("customActionLocked"));
    await tx.delete(customActions).where(eq(customActions.id, c.id));
    return { events: [{ action: "custom_action_deleted", payload: { customActionId: c.id, name: c.name } }] };
  });
}

export async function setCustomActionChosen(
  tx: UserTx,
  userId: string,
  input: SetCustomActionChosenInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    const c = await loadCustomAction(tx, userId, p.id, input.customActionId);
    if (!c) return stop(fail("customActionNotFound"));
    if (c.chosen === input.chosen) return nothing();
    if (input.chosen) {
      await tx.update(customActions).set({ chosen: true }).where(eq(customActions.id, c.id));
      return {
        events: [
          {
            action: "action_chosen",
            payload: {
              ...customWho(c.id),
              linkedObstacleCode: c.linkedObstacleCode,
              linkedCustomObstacleId: c.linkedCustomObstacleId,
            },
          },
        ],
      };
    }
    await tx.update(customActions).set({ chosen: false, implementedOn: null }).where(eq(customActions.id, c.id));
    return { events: [{ action: "action_unchosen", payload: { ...customWho(c.id), implementedOn: c.implementedOn } }] };
  });
}

export async function setCustomActionNeedsStudy(
  tx: UserTx,
  userId: string,
  input: SetCustomActionNeedsStudyInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    const c = await loadCustomAction(tx, userId, p.id, input.customActionId);
    if (!c) return stop(fail("customActionNotFound"));
    if (c.needsStudy === input.needsStudy) return nothing();
    await tx.update(customActions).set({ needsStudy: input.needsStudy }).where(eq(customActions.id, c.id));
    return {
      events: [
        {
          action: input.needsStudy ? "action_needs_study_set" : "action_needs_study_cleared",
          payload: customWho(c.id),
        },
      ],
    };
  });
}

export async function setCustomActionImplemented(
  tx: UserTx,
  userId: string,
  input: SetCustomActionImplementedInput,
  ctx: Ctx,
): Promise<ProblemResult<MutationData>> {
  return mutate(tx, userId, input.problemId, ctx, async (p) => {
    const c = await loadCustomAction(tx, userId, p.id, input.customActionId);
    if (!c) return stop(fail("customActionNotFound"));
    if (input.implementedOn === null) {
      if (!c.implementedOn) return nothing();
      await tx.update(customActions).set({ implementedOn: null }).where(eq(customActions.id, c.id));
      return {
        events: [
          { action: "action_implementation_cleared", payload: { ...customWho(c.id), previous: c.implementedOn } },
        ],
      };
    }
    if (!c.chosen) return stop(fail("notChosen"));
    const bad = dateFailure(checkImplementationDate(input.implementedOn, p.detectedOn, ctx.now));
    if (bad) return stop(bad);
    if (c.implementedOn === input.implementedOn) return nothing();
    await tx.update(customActions).set({ implementedOn: input.implementedOn }).where(eq(customActions.id, c.id));
    return {
      events: [
        {
          action: "action_implemented",
          payload: { ...customWho(c.id), implementedOn: input.implementedOn, previous: c.implementedOn },
        },
      ],
    };
  });
}

// --- lists, badge, log -----------------------------------------------------------------------

type ListOpts = { plantId?: string | null; range?: "all" | number | null; now: Date };

function listWhere(opts: ListOpts): SQL | undefined | "none" {
  const conds: SQL[] = [];
  if (opts.plantId) {
    if (!isUuid(opts.plantId)) return "none";
    conds.push(eq(assessments.plantId, opts.plantId));
  }
  if (typeof opts.range === "number") {
    const minEnd = monthIndex(monthKeyOf(opts.now)) - opts.range + 1;
    conds.push(sql`${endIndexSql} >= ${minEnd}`);
  }
  return conds.length ? and(...conds) : undefined;
}

function toListItem(r: BaseRow): ProblemListItem {
  const stage = stageOfRow(r);
  return {
    id: r.p.id,
    plantId: r.plantId,
    plantName: r.plantName,
    indicator: indicatorOf(r),
    assessmentId: r.p.assessmentId,
    periodStart: r.periodStart.slice(0, 7),
    months: r.months as PeriodMonths,
    detectedOn: r.p.detectedOn,
    value: r.p.value,
    readingStatus: r.readingStatus as Status | null,
    origin: r.p.origin,
    stage,
    open: isOpenStage(stage),
    obstacleCount: r.obstacleCount,
    chosenActionCount: r.chosenCount,
    implementedActionCount: r.implementedCount,
    createdAt: r.p.createdAt.toISOString(),
  };
}

/**
 * All the user's problems (optionally of one plant, and only those whose assessment period
 * ends within the last `range` months, as in listAssessments), open ones first, then newest
 * detection first. Split by `open` / `stage` on the client.
 */
export async function listProblems(
  tx: UserTx,
  userId: string,
  opts: ListOpts,
): Promise<ProblemListItem[]> {
  const where = listWhere(opts);
  if (where === "none") return [];
  const rows = await baseRows(tx, userId, where);
  return rows
    .map(toListItem)
    .sort(
      (a, b) =>
        Number(b.open) - Number(a.open) ||
        (a.detectedOn < b.detectedOn ? 1 : a.detectedOn > b.detectedOn ? -1 : 0) ||
        (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0) ||
        (a.id < b.id ? -1 : 1),
    );
}

/** Problems awaiting obstacles or an action: the nav badge and the "awaiting review" tile. */
export async function countOpenProblems(
  tx: UserTx,
  userId: string,
  opts: { plantId?: string | null } = {},
): Promise<number> {
  if (opts.plantId && !isUuid(opts.plantId)) return 0;
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(problems)
    .innerJoin(
      assessments,
      and(eq(assessments.id, problems.assessmentId), eq(assessments.ownerId, problems.ownerId)),
    )
    .where(
      and(
        eq(problems.ownerId, userId),
        opts.plantId ? eq(assessments.plantId, opts.plantId) : undefined,
        openProblemSql,
      ),
    );
  return r.n;
}

/** indicator ref -> the problem of one assessment and its derived stage. */
export async function problemStagesForAssessment(
  tx: UserTx,
  userId: string,
  assessmentId: string,
): Promise<ProblemStageMap> {
  if (!isUuid(assessmentId)) return {};
  const rows = await baseRows(tx, userId, eq(problems.assessmentId, assessmentId));
  const out: ProblemStageMap = {};
  for (const r of rows) out[indicatorOf(r).ref] = { problemId: r.p.id, stage: stageOfRow(r) };
  return out;
}

const ACTION_EVENTS: ProblemAuditAction[] = [
  "action_chosen",
  "action_unchosen",
  "action_needs_study_set",
  "action_needs_study_cleared",
  "action_implemented",
  "action_implementation_cleared",
  "custom_action_added",
  "custom_action_edited",
];

/**
 * Every chosen, implemented or needs-study action (system and case-specific) across the
 * user's problems, with problem, plant and indicator context, newest activity first
 * (the time of the action's last audited change; the problem's creation when it has none).
 */
export async function listActionLog(
  tx: UserTx,
  userId: string,
  opts: ListOpts,
): Promise<ActionLogEntry[]> {
  const where = listWhere(opts);
  if (where === "none") return [];
  const base = await baseRows(tx, userId, where);
  if (!base.length) return [];
  const ids = base.map((r) => r.p.id);
  const ctxBy = new Map(base.map((r) => [r.p.id, r]));

  const sysRows = await tx
    .select()
    .from(problemActions)
    .where(
      and(
        eq(problemActions.ownerId, userId),
        inArray(problemActions.problemId, ids),
        or(eq(problemActions.chosen, true), eq(problemActions.needsStudy, true), isNotNull(problemActions.implementedOn)),
      ),
    );
  const cusRows = await tx
    .select()
    .from(customActions)
    .where(
      and(
        eq(customActions.ownerId, userId),
        inArray(customActions.problemId, ids),
        or(eq(customActions.chosen, true), eq(customActions.needsStudy, true), isNotNull(customActions.implementedOn)),
      ),
    );
  if (!sysRows.length && !cusRows.length) return [];

  const activity = await tx
    .select({
      entityId: auditEvents.entityId,
      actionCode: sql<string | null>`${auditEvents.payload}->>'actionCode'`,
      customActionId: sql<string | null>`${auditEvents.payload}->>'customActionId'`,
      at: sql`max(${auditEvents.at})`.mapWith(auditEvents.at),
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.ownerId, userId),
        eq(auditEvents.entity, "problem"),
        inArray(auditEvents.entityId, ids),
        inArray(auditEvents.action, ACTION_EVENTS),
      ),
    )
    .groupBy(
      auditEvents.entityId,
      sql`${auditEvents.payload}->>'actionCode'`,
      sql`${auditEvents.payload}->>'customActionId'`,
    );
  const lastAt = new Map<string, Date>();
  for (const a of activity) {
    const k = `${a.entityId}:${a.actionCode ?? `custom:${a.customActionId}`}`;
    const prev = lastAt.get(k);
    if (!prev || a.at > prev) lastAt.set(k, a.at);
  }

  // texts for linked obstacles, ranks, action texts
  const linkedCodes = new Set<string>();
  const linkedCustom = new Set<string>();
  for (const r of [...sysRows, ...cusRows]) {
    if (r.linkedObstacleCode) linkedCodes.add(r.linkedObstacleCode);
    if (r.linkedCustomObstacleId) linkedCustom.add(r.linkedCustomObstacleId);
  }
  const obsText = new Map<string, { textAr: string; textEn: string }>();
  if (linkedCodes.size) {
    const rows = await tx
      .select({ code: obstacles.code, textAr: obstacles.textAr, textEn: obstacles.textEn })
      .from(obstacles)
      .where(inArray(obstacles.code, [...linkedCodes]));
    for (const o of rows) obsText.set(o.code, o);
  }
  const customName = new Map<string, string>();
  if (linkedCustom.size) {
    const rows = await tx
      .select({ id: customObstacles.id, name: customObstacles.name })
      .from(customObstacles)
      .where(and(eq(customObstacles.ownerId, userId), inArray(customObstacles.id, [...linkedCustom])));
    for (const o of rows) customName.set(o.id, o.name);
  }
  const links = await loadLinks(tx, [...linkedCodes]);
  const refs = new Map((await loadActionRefs(tx)).map((a) => [a.code, a]));

  const linkedOf = (code: string | null, customId: string | null): ActionLogObstacle | null => {
    if (code) {
      const t = obsText.get(code);
      return { kind: "system", code, textAr: t?.textAr ?? "", textEn: t?.textEn ?? "" };
    }
    if (customId) return { kind: "custom", id: customId, name: customName.get(customId) ?? "" };
    return null;
  };

  const out: ActionLogEntry[] = [];
  const baseOf = (problemId: string, key: string, row: {
    chosen: boolean; needsStudy: boolean; implementedOn: string | null;
    linkedObstacleCode: string | null; linkedCustomObstacleId: string | null;
  }) => {
    const r = ctxBy.get(problemId) as BaseRow;
    const at = lastAt.get(`${problemId}:${key}`) ?? r.p.createdAt;
    return {
      key: `${problemId}:${key}`,
      problemId,
      problemStage: stageOfRow(r),
      plantId: r.plantId,
      plantName: r.plantName,
      indicator: indicatorOf(r),
      periodStart: r.periodStart.slice(0, 7),
      months: r.months as PeriodMonths,
      detectedOn: r.p.detectedOn,
      chosen: row.chosen,
      needsStudy: row.needsStudy,
      implementedOn: row.implementedOn,
      linkedObstacle: linkedOf(row.linkedObstacleCode, row.linkedCustomObstacleId),
      lastActivityAt: at.toISOString(),
    };
  };
  for (const s of sysRows) {
    const a = refs.get(s.actionCode);
    const rank = s.linkedObstacleCode
      ? ((links.get(s.linkedObstacleCode) ?? []).find((l) => l.actionCode === s.actionCode)?.rank ?? null)
      : null;
    out.push({
      ...baseOf(s.problemId, s.actionCode, s),
      kind: "system",
      actionCode: s.actionCode,
      textAr: a?.textAr ?? "",
      textEn: a?.textEn ?? "",
      rank,
    });
  }
  for (const c of cusRows) {
    out.push({
      ...baseOf(c.problemId, `custom:${c.id}`, c),
      kind: "custom",
      customActionId: c.id,
      name: c.name,
      description: c.description,
    });
  }
  return out.sort(
    (a, b) =>
      (a.lastActivityAt < b.lastActivityAt ? 1 : a.lastActivityAt > b.lastActivityAt ? -1 : 0) ||
      (a.key < b.key ? -1 : 1),
  );
}

