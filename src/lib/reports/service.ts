import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import type { UserTx } from "@/db/with-user";
import { assessmentReadings, assessments, plants } from "@/db/schema/app";
import { limitsSnapshotSchema, type PeriodMonths, type Status } from "@/lib/evaluation";
import { getAssessmentResults } from "@/lib/assessments/service";
import type { StatusCounts } from "@/lib/assessments/types";
import { getProblem, getReferenceCatalog, listProblems } from "@/lib/problems/service";
import type {
  ActionState,
  ProblemDto,
  ReferenceCatalog,
  SelectedObstacle,
} from "@/lib/problems/types";
import type { ObstacleTarget } from "@/lib/problems/schemas";
import type {
  ReportAction,
  ReportData,
  ReportGroup,
  ReportObstacle,
  ReportObstacleLabel,
  ReportOptions,
  ReportPlant,
  ReportProblem,
  ReportResult,
  TrendCell,
  TrendPeriod,
  TrendRow,
} from "./types";

/**
 * Data of the two reports (HANDOFF 3.8), assembled from the assessments and problems
 * services plus ONE query for the readings of all periods in the trend. Limits come from
 * the assessments' SNAPSHOTS, never from the user's current limits. Plain, serialisable
 * output. Time is never read here except to list problems with range "all".
 */

const MAX_PERIODS = 12;
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const refOf = (r: { indicatorCode: string | null; userIndicatorId: string | null }) =>
  r.indicatorCode ? `sys:${r.indicatorCode}` : `usr:${r.userIndicatorId}`;

const emptyCounts = (): StatusCounts => ({
  ok: 0,
  warning: 0,
  critical: 0,
  insufficient_data: 0,
  no_limits: 0,
});

/** The plants of the user with their approved assessments and the period lengths they have. */
export async function getReportOptions(tx: UserTx, userId: string): Promise<ReportOptions> {
  const plantRows = await tx
    .select({ id: plants.id, name: plants.name })
    .from(plants)
    .where(eq(plants.ownerId, userId))
    .orderBy(asc(plants.createdAt));
  const rows = await tx
    .select({
      id: assessments.id,
      plantId: assessments.plantId,
      periodStart: assessments.periodStart,
      months: assessments.months,
    })
    .from(assessments)
    .where(and(eq(assessments.ownerId, userId), eq(assessments.status, "approved")))
    .orderBy(desc(assessments.periodStart), asc(assessments.months));
  return {
    plants: plantRows.map((p) => {
      const list = rows
        .filter((r) => r.plantId === p.id)
        .map((r) => ({ id: r.id, periodStart: r.periodStart.slice(0, 7), months: r.months as PeriodMonths }));
      const lengths = [...new Set(list.map((a) => a.months))].sort((a, b) => a - b);
      return { id: p.id, name: p.name, assessments: list, lengths };
    }),
  };
}

/** The report of one approved assessment, with its same-length history for the trends. */
export async function buildPeriodReport(
  tx: UserTx,
  userId: string,
  assessmentId: string,
): Promise<ReportResult<ReportData>> {
  if (!isUuid(assessmentId)) return { ok: false, error: "notFound" };
  const [head] = await tx
    .select({
      id: assessments.id,
      plantId: assessments.plantId,
      periodStart: assessments.periodStart,
      months: assessments.months,
      status: assessments.status,
    })
    .from(assessments)
    .where(and(eq(assessments.ownerId, userId), eq(assessments.id, assessmentId)));
  if (!head) return { ok: false, error: "notFound" };
  if (head.status !== "approved") return { ok: false, error: "notApproved" };
  const trendRows = await tx
    .select({ id: assessments.id })
    .from(assessments)
    .where(
      and(
        eq(assessments.ownerId, userId),
        eq(assessments.plantId, head.plantId),
        eq(assessments.months, head.months),
        eq(assessments.status, "approved"),
        lte(assessments.periodStart, head.periodStart),
      ),
    )
    .orderBy(desc(assessments.periodStart))
    .limit(MAX_PERIODS);
  return assemble(tx, userId, "period", head.plantId, head.id, trendRows.map((r) => r.id).reverse(), [head.id]);
}

/** The history of one plant across its approved assessments of ONE period length (the last 12). */
export async function buildPlantHistoryReport(
  tx: UserTx,
  userId: string,
  opts: { plantId: string; months: number },
): Promise<ReportResult<ReportData>> {
  if (!isUuid(opts.plantId)) return { ok: false, error: "notFound" };
  const [plant] = await tx
    .select({ id: plants.id })
    .from(plants)
    .where(and(eq(plants.ownerId, userId), eq(plants.id, opts.plantId)));
  if (!plant) return { ok: false, error: "notFound" };
  const rows = await tx
    .select({ id: assessments.id })
    .from(assessments)
    .where(
      and(
        eq(assessments.ownerId, userId),
        eq(assessments.plantId, opts.plantId),
        eq(assessments.months, opts.months),
        eq(assessments.status, "approved"),
      ),
    )
    .orderBy(desc(assessments.periodStart))
    .limit(MAX_PERIODS);
  if (!rows.length) return { ok: false, error: "noData" };
  const ids = rows.map((r) => r.id).reverse();
  return assemble(tx, userId, "history", opts.plantId, ids[ids.length - 1], ids, ids);
}

async function assemble(
  tx: UserTx,
  userId: string,
  kind: "period" | "history",
  plantId: string,
  latestId: string,
  trendIds: string[],
  problemAssessmentIds: string[],
): Promise<ReportResult<ReportData>> {
  const res = await getAssessmentResults(tx, userId, latestId);
  if (!res.ok) return { ok: false, error: res.error === "notApproved" ? "notApproved" : "notFound" };
  const results = res.data;

  const [p] = await tx
    .select()
    .from(plants)
    .where(and(eq(plants.ownerId, userId), eq(plants.id, plantId)));
  if (!p) return { ok: false, error: "notFound" };
  const plant: ReportPlant = {
    id: p.id,
    name: p.name,
    governorate: p.governorate,
    location: p.location,
    waterSource: p.waterSource,
    designCapacity: p.designCapacity,
    actualCapacity: p.actualCapacity,
    engineer: p.engineer,
  };

  // --- trends: one query for the assessments, one for all their readings
  const periodRows = await tx
    .select({
      id: assessments.id,
      periodStart: assessments.periodStart,
      months: assessments.months,
      snapshot: assessments.limitsSnapshot,
    })
    .from(assessments)
    .where(and(eq(assessments.ownerId, userId), inArray(assessments.id, trendIds)))
    .orderBy(asc(assessments.periodStart));
  const readings = await tx
    .select({
      assessmentId: assessmentReadings.assessmentId,
      indicatorCode: assessmentReadings.indicatorCode,
      userIndicatorId: assessmentReadings.userIndicatorId,
      value: assessmentReadings.value,
      status: assessmentReadings.status,
    })
    .from(assessmentReadings)
    .where(and(eq(assessmentReadings.ownerId, userId), inArray(assessmentReadings.assessmentId, trendIds)));

  const byAssessment = new Map<string, Map<string, { value: number | null; status: Status }>>();
  for (const r of readings) {
    const m = byAssessment.get(r.assessmentId) ?? new Map();
    m.set(refOf(r), { value: r.value, status: r.status ?? "insufficient_data" });
    byAssessment.set(r.assessmentId, m);
  }
  const periods: TrendPeriod[] = [];
  const snapshots = new Map<string, ReturnType<typeof limitsSnapshotSchema.parse>>();
  for (const a of periodRows) {
    const parsed = limitsSnapshotSchema.safeParse(a.snapshot ?? {});
    snapshots.set(a.id, parsed.success ? parsed.data : {});
    const counts = emptyCounts();
    for (const v of byAssessment.get(a.id)?.values() ?? []) counts[v.status]++;
    const evaluated = counts.ok + counts.warning + counts.critical;
    periods.push({
      assessmentId: a.id,
      periodStart: a.periodStart.slice(0, 7),
      months: a.months as PeriodMonths,
      counts,
      evaluated,
      withinShare: evaluated ? (counts.ok / evaluated) * 100 : null,
    });
  }

  const groups: ReportGroup[] = results.groups.map((g) => ({
    key: g.key,
    nameAr: g.nameAr,
    nameEn: g.nameEn,
    rows: g.rows.map((r) => ({
      ref: r.ref,
      code: r.code,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      unit: r.unit,
      value: r.value,
      status: r.status,
      limits: r.limits,
      note: r.note,
      previousValue: r.previousValue,
      change: r.change,
    })),
  }));
  const trends: TrendRow[] = groups.flatMap((g) =>
    g.rows.map((r): TrendRow => ({
      ref: r.ref,
      code: r.code,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      unit: r.unit,
      cells: periodRows.map((a): TrendCell | null => {
        const v = byAssessment.get(a.id)?.get(r.ref);
        if (!v) return null;
        return { value: v.value, status: v.status, limits: snapshots.get(a.id)?.[r.ref] ?? null };
      }),
    })),
  );

  // --- problems of the included periods
  const ids = new Set(problemAssessmentIds);
  const list = (await listProblems(tx, userId, { plantId, range: "all", now: new Date() })).filter((x) =>
    ids.has(x.assessmentId),
  );
  list.sort(
    (a, b) =>
      (a.periodStart < b.periodStart ? -1 : a.periodStart > b.periodStart ? 1 : 0) ||
      (a.detectedOn < b.detectedOn ? -1 : a.detectedOn > b.detectedOn ? 1 : 0) ||
      ((a.indicator.code ?? "") < (b.indicator.code ?? "") ? -1 : 1),
  );
  const catalog = list.length ? await getReferenceCatalog(tx) : null;
  const problems: ReportProblem[] = [];
  for (const item of list) {
    const r = await getProblem(tx, userId, item.id);
    if (r.ok && catalog) problems.push(toReportProblem(r.data, catalog));
  }

  return {
    ok: true,
    data: {
      kind,
      plant,
      latest: {
        assessmentId: results.header.id,
        periodStart: results.header.periodStart,
        months: results.header.months,
        startDate: results.header.startDate,
        endDate: results.header.endDate,
        enteredBy: results.header.enteredBy,
        approvedAt: results.header.approvedAt,
        completeness: results.completeness,
        counts: results.counts,
      },
      groups,
      periods,
      trends,
      months: results.header.months,
      problems,
    },
  };
}

// --- problems ---------------------------------------------------------------------------------

function obstacleLabel(o: SelectedObstacle, catalog: ReferenceCatalog): ReportObstacleLabel {
  if (o.kind === "custom") return { kind: "custom", name: o.name };
  const axis = catalog.obstacleAxes.find((a) => a.idx === o.axisIdx);
  return {
    kind: "system",
    axisNameAr: axis?.nameAr ?? "",
    axisNameEn: axis?.nameEn ?? "",
    seqInAxis: o.seqInAxis,
    textAr: o.textAr,
    textEn: o.textEn,
  };
}

function toReportProblem(p: ProblemDto, catalog: ReferenceCatalog): ReportProblem {
  const labelOf = (t: ObstacleTarget | null): ReportObstacleLabel | null => {
    if (!t) return null;
    const hit = p.obstacles.find((o) => (t.kind === "system" ? o.kind === "system" && o.code === t.code : o.kind === "custom" && o.id === t.id));
    return hit ? obstacleLabel(hit, catalog) : null;
  };
  const obstacles: ReportObstacle[] = p.obstacles.map((o) => ({
    ...obstacleLabel(o, catalog),
    classification: o.classification,
    note: o.note,
  }));

  const actions: ReportAction[] = [];
  const seen = new Set<string>();
  for (const c of p.chosenActions) {
    if (c.kind === "system") {
      seen.add(c.actionCode);
      actions.push({
        kind: "system",
        rank: c.rank,
        textAr: c.textAr,
        textEn: c.textEn,
        chosen: true,
        needsStudy: c.needsStudy,
        implementedOn: c.implementedOn,
        linkedObstacle: labelOf(c.linkedObstacle),
      });
    } else {
      seen.add(`custom:${c.customActionId}`);
      actions.push({
        kind: "custom",
        name: c.name,
        chosen: true,
        needsStudy: c.needsStudy,
        implementedOn: c.implementedOn,
        linkedObstacle: labelOf(c.linkedObstacle),
      });
    }
  }
  // actions flagged "needs further study" without being chosen
  const study = (a: { actionCode: string; textAr: string; textEn: string } & ActionState, rank: number | null) => {
    if (!a.needsStudy || a.chosen || seen.has(a.actionCode)) return;
    seen.add(a.actionCode);
    actions.push({
      kind: "system",
      rank,
      textAr: a.textAr,
      textEn: a.textEn,
      chosen: false,
      needsStudy: true,
      implementedOn: null,
      linkedObstacle: labelOf(a.linkedObstacle),
    });
  };
  for (const g of p.suggestions) for (const a of g.linked) study(a, a.rank);
  for (const g of p.suggestions) for (const a of [...g.axisActions, ...g.allActions]) study(a, null);
  for (const c of p.customActions) {
    if (c.chosen || !c.needsStudy) continue;
    actions.push({
      kind: "custom",
      name: c.name,
      chosen: false,
      needsStudy: true,
      implementedOn: null,
      linkedObstacle: labelOf(c.linkedObstacle),
    });
  }

  const h = p.header;
  return {
    id: h.id,
    assessmentId: h.assessmentId,
    indicator: {
      ref: h.indicator.ref,
      code: h.indicator.code,
      nameAr: h.indicator.nameAr,
      nameEn: h.indicator.nameEn,
      unit: h.indicator.unit,
    },
    periodStart: h.periodStart,
    months: h.months,
    detectedOn: h.detectedOn,
    value: h.value,
    readingStatus: h.readingStatus,
    limits: h.limits,
    limitCrossed: h.limitCrossed,
    origin: h.origin,
    description: h.description,
    stage: p.stage,
    obstacles,
    actions,
  };
}
