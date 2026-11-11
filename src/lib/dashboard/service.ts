import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { UserTx } from "@/db/with-user";
import {
  assessmentReadings,
  assessments,
  plants,
  problems,
  userIndicators,
} from "@/db/schema/app";
import { indicators } from "@/db/schema/reference";
import { dateKeyOf, monthKeyOf } from "@/lib/assessments/schemas";
import { listAssessments } from "@/lib/assessments/service";
import type { StatusCounts } from "@/lib/assessments/types";
import {
  limitsSnapshotSchema,
  type LimitsSnapshot,
  type PeriodMonths,
  type Status,
} from "@/lib/evaluation";
import { countOpenProblems } from "@/lib/problems/service";
import { deriveStage, limitCrossed } from "@/lib/problems/stage";
import {
  activityKey,
  alertCompare,
  endsInRange,
  isHandled,
  pickLatestPerPlant,
} from "./rules";
import type {
  Dashboard,
  DashboardAlert,
  DashboardOptions,
  PlantBreakdown,
} from "./types";

/**
 * The dashboard of the signed-in user: tiles, per-plant status breakdown, alerts and the
 * latest assessments, for the selected plant(s) and monitoring period, in a fixed number of
 * queries (never one per plant or per reading). `now` is injected.
 *
 * "Latest assessment" of a plant = its approved assessment whose period ends inside the
 * selected period with the latest end month; ties go to the shortest length, then the latest
 * approval. Readings and limits come from the stored values and the limits SNAPSHOT.
 *
 * Duplication note: the end-month range test mirrors `listAssessments` and the latest-per-plant
 * choice extends `getPlantPerformance` (other features' service files are not edited here).
 * Free of `server-only` imports so tests can call it directly.
 */

const LATEST_LIMIT = 6;

const emptyCounts = (): StatusCounts => ({
  ok: 0,
  warning: 0,
  critical: 0,
  insufficient_data: 0,
  no_limits: 0,
});

const refOf = (r: { indicatorCode: string | null; userIndicatorId: string | null }) =>
  r.indicatorCode ? `sys:${r.indicatorCode}` : `usr:${r.userIndicatorId}`;

export async function getDashboard(
  tx: UserTx,
  userId: string,
  opts: DashboardOptions,
): Promise<Dashboard> {
  const allPlants = await tx
    .select({ id: plants.id, name: plants.name })
    .from(plants)
    .where(eq(plants.ownerId, userId))
    .orderBy(asc(plants.createdAt), asc(plants.id));
  const selected = opts.plantId ? allPlants.filter((p) => p.id === opts.plantId) : allPlants;
  const plantOrder = new Map(selected.map((p, i) => [p.id, i]));

  const zero = (): Dashboard => ({
    tiles: {
      plants: selected.length,
      plantsAssessed: 0,
      assessments: 0,
      drafts: 0,
      withinLimits: 0,
      evaluated: 0,
      followUp: 0,
      followUpCritical: 0,
      handled: 0,
      openProblems: 0,
    },
    breakdown: selected.map((p) => ({ plantId: p.id, plantName: p.name, latest: null })),
    alerts: [],
    latest: [],
    hasPlants: allPlants.length > 0,
  });
  if (!selected.length) return zero();
  const plantIds = selected.map((p) => p.id);
  const currentMonth = monthKeyOf(opts.now);

  // approved assessments of the selected plants (no snapshot yet), range applied by the shared rule
  const approvedAll = await tx
    .select({
      id: assessments.id,
      plantId: assessments.plantId,
      periodStart: assessments.periodStart,
      months: assessments.months,
      approvedAt: assessments.approvedAt,
    })
    .from(assessments)
    .where(
      and(
        eq(assessments.ownerId, userId),
        eq(assessments.status, "approved"),
        inArray(assessments.plantId, plantIds),
      ),
    );
  const approved = approvedAll
    .map((a) => ({
      ...a,
      periodStart: a.periodStart.slice(0, 7),
      approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
    }))
    .filter((a) => endsInRange(a, opts.range, currentMonth));
  const latestByPlant = pickLatestPerPlant(approved);
  const latestIds = [...latestByPlant.values()].map((a) => a.id);

  const openProblems = await countOpenProblems(tx, userId, { plantId: opts.plantId });

  // latest assessments block: drafts and approved, most recent activity first
  const everything = await listAssessments(tx, userId, { plantId: opts.plantId, range: "all", now: opts.now });
  const latest = [...everything]
    .sort((a, b) => activityKey(b) - activityKey(a) || (a.id < b.id ? -1 : 1))
    .slice(0, LATEST_LIMIT);
  const drafts = everything.filter((a) => a.status === "draft").length;

  if (!latestIds.length) {
    const base = zero();
    return {
      ...base,
      tiles: { ...base.tiles, assessments: approved.length, drafts, openProblems },
      latest,
    };
  }

  const [readingRows, snapshotRows, problemRows, sysInd, usrInd] = await Promise.all([
    tx
      .select({
        assessmentId: assessmentReadings.assessmentId,
        indicatorCode: assessmentReadings.indicatorCode,
        userIndicatorId: assessmentReadings.userIndicatorId,
        value: assessmentReadings.value,
        status: assessmentReadings.status,
      })
      .from(assessmentReadings)
      .where(and(eq(assessmentReadings.ownerId, userId), inArray(assessmentReadings.assessmentId, latestIds))),
    tx
      .select({ id: assessments.id, snapshot: assessments.limitsSnapshot, approvedAt: assessments.approvedAt })
      .from(assessments)
      .where(and(eq(assessments.ownerId, userId), inArray(assessments.id, latestIds))),
    tx
      .select({
        id: problems.id,
        assessmentId: problems.assessmentId,
        indicatorCode: problems.indicatorCode,
        userIndicatorId: problems.userIndicatorId,
        obstacleOnly: problems.obstacleOnly,
        obstacleCount: sql<number>`(select count(*)::int from problem_obstacles x where x.problem_id = problems.id)`,
        chosenCount: sql<number>`((select count(*) from problem_actions x where x.problem_id = problems.id and x.chosen) + (select count(*) from custom_actions x where x.problem_id = problems.id and x.chosen))::int`,
      })
      .from(problems)
      .where(and(eq(problems.ownerId, userId), inArray(problems.assessmentId, latestIds))),
    tx
      .select({
        code: indicators.code,
        nameAr: indicators.nameAr,
        nameEn: indicators.nameEn,
        unit: indicators.unit,
      })
      .from(indicators)
      .orderBy(asc(indicators.sort)),
    tx
      .select({
        id: userIndicators.id,
        nameAr: userIndicators.nameAr,
        nameEn: userIndicators.nameEn,
        unit: userIndicators.unit,
      })
      .from(userIndicators)
      .where(eq(userIndicators.ownerId, userId))
      .orderBy(asc(userIndicators.createdAt)),
  ]);

  const catalog = new Map<string, { nameAr: string; nameEn: string | null; unit: string; order: number }>();
  let order = 0;
  for (const i of sysInd) catalog.set(`sys:${i.code}`, { ...i, order: order++ });
  for (const i of usrInd) catalog.set(`usr:${i.id}`, { ...i, order: order++ });

  const snapshots = new Map<string, LimitsSnapshot>();
  const approvedOn = new Map<string, string>();
  for (const s of snapshotRows) {
    const parsed = limitsSnapshotSchema.safeParse(s.snapshot ?? {});
    snapshots.set(s.id, parsed.success ? parsed.data : {});
    approvedOn.set(s.id, s.approvedAt ? dateKeyOf(s.approvedAt) : "");
  }
  const problemBy = new Map(
    problemRows.map((p) => [
      `${p.assessmentId}|${refOf(p)}`,
      {
        id: p.id,
        stage: deriveStage({
          obstacleCount: p.obstacleCount,
          chosenActionCount: p.chosenCount,
          obstacleOnly: p.obstacleOnly,
        }),
      },
    ]),
  );

  const countsBy = new Map<string, StatusCounts>();
  const alerts: (DashboardAlert & { plantOrder: number; indicatorOrder: number })[] = [];
  let handled = 0;
  const plantOfAssessment = new Map([...latestByPlant.values()].map((a) => [a.id, a]));
  for (const r of readingRows) {
    const status: Status = r.status ?? "insufficient_data";
    const c = countsBy.get(r.assessmentId) ?? emptyCounts();
    c[status]++;
    countsBy.set(r.assessmentId, c);
    if (status !== "warning" && status !== "critical") continue;
    const a = plantOfAssessment.get(r.assessmentId);
    if (!a) continue;
    const ref = refOf(r);
    const problem = problemBy.get(`${a.id}|${ref}`) ?? null;
    if (problem && isHandled(problem.stage)) {
      handled++;
      continue;
    }
    const ind = catalog.get(ref);
    if (!ind) continue;
    const limits = snapshots.get(a.id)?.[ref] ?? null;
    alerts.push({
      plantId: a.plantId,
      plantName: selected.find((p) => p.id === a.plantId)?.name ?? "",
      assessmentId: a.id,
      periodStart: a.periodStart,
      months: a.months as PeriodMonths,
      assessedOn: approvedOn.get(a.id) ?? "",
      ref,
      nameAr: ind.nameAr,
      nameEn: ind.nameEn,
      unit: ind.unit,
      value: r.value,
      status,
      limits,
      crossed: limitCrossed(limits, status, r.value),
      problem,
      plantOrder: plantOrder.get(a.plantId) ?? 0,
      indicatorOrder: ind.order,
    });
  }
  alerts.sort(alertCompare);

  const breakdown: PlantBreakdown[] = selected.map((p) => {
    const a = latestByPlant.get(p.id);
    if (!a) return { plantId: p.id, plantName: p.name, latest: null };
    const counts = countsBy.get(a.id) ?? emptyCounts();
    const total = Object.values(counts).reduce((x, y) => x + y, 0);
    return {
      plantId: p.id,
      plantName: p.name,
      latest: { assessmentId: a.id, periodStart: a.periodStart, months: a.months as PeriodMonths, counts, total },
    };
  });

  let withinLimits = 0;
  let evaluated = 0;
  for (const b of breakdown) {
    if (!b.latest) continue;
    withinLimits += b.latest.counts.ok;
    evaluated += b.latest.counts.ok + b.latest.counts.warning + b.latest.counts.critical;
  }

  return {
    tiles: {
      plants: selected.length,
      plantsAssessed: latestByPlant.size,
      assessments: approved.length,
      drafts,
      withinLimits,
      evaluated,
      followUp: alerts.length,
      followUpCritical: alerts.filter((a) => a.status === "critical").length,
      handled,
      openProblems,
    },
    breakdown,
    alerts: alerts.map((a) => {
      const { plantOrder, indicatorOrder, ...rest } = a;
      void plantOrder;
      void indicatorOrder;
      return rest;
    }),
    latest,
    hasPlants: allPlants.length > 0,
  };
}
