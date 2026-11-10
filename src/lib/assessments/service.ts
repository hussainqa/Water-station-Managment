import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { UserTx } from "@/db/with-user";
import {
  assessmentReadings,
  assessments,
  auditEvents,
  indicatorLimits,
  plantIndicators,
  plants,
  problems,
  userIndicatorGroups,
  userIndicators,
} from "@/db/schema/app";
import { indicatorGroups, indicators } from "@/db/schema/reference";
import {
  canOpenManualProblem,
  changeDirection,
  evaluateInputs,
  findPreviousAssessment,
  limitsSchema,
  limitsSnapshotSchema,
  shouldAutoOpenProblem,
  statusOf,
  type Better,
  type EvaluationResult,
  type Limits,
  type LimitsSnapshot,
  type Method,
  type PeriodMonths,
  type RawInputs,
  type Status,
} from "@/lib/evaluation";
import { formatRef, parseRef, refColumns, type IndicatorRef } from "@/lib/indicators/ref";
import { ensureDefaultLimits } from "@/lib/indicators/service";
import { openProblemSql } from "@/lib/problems/stage-sql";
import type { InputLabels } from "@/db/schema/reference";
import { asRawInputs, inputDefs, integerInputKeys, sanitizeInputs } from "./inputs";
import {
  NOTE_MAX,
  dateKeyOf,
  idSchema,
  monthIndex,
  monthKeyOf,
  validateDetails,
  validatePeriod,
  type AssessmentResult,
  type ConflictingAssessment,
  type ReadingPayload,
} from "./schemas";
import type {
  ApprovalSummary,
  AssessmentHeader,
  AssessmentListItem,
  AssessmentResults,
  AuditAction,
  AuditEntry,
  AuditPayloads,
  DraftCompleteness,
  DraftDto,
  DraftReading,
  HistoryPoint,
  ListRange,
  PlantPerformance,
  ReadingEvaluation,
  ResultGroup,
  ResultRow,
  StatusCounts,
  WizardContext,
  WizardGroup,
} from "./types";

/**
 * Data functions for assessments. Every function takes the transaction from
 * `withUser()` (row-level security limits each query to the signed-in user) and the
 * verified `userId`. Time is never read here: `now` is a parameter, the action layer
 * supplies `new Date()`. NEVER trust a value or status from the client: they are
 * recomputed from the stored raw inputs at approval (src/lib/evaluation).
 *
 * This file must stay free of `server-only` imports: scripts/seed-demo.ts runs it under
 * tsx with an owner-role connection.
 */

export type Ctx = { now: Date; actor: string };

const ok = <T>(data: T): AssessmentResult<T> => ({ ok: true, data });

const UNIQUE_VIOLATION = "23505";
const EXCLUSION_VIOLATION = "23P01";

function pgCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

const isUuid = (s: unknown): s is string => idSchema.safeParse(s).success;

const emptyCounts = (): StatusCounts => ({
  ok: 0,
  warning: 0,
  critical: 0,
  insufficient_data: 0,
  no_limits: 0,
});

const refOf = (r: { indicatorCode: string | null; userIndicatorId: string | null }): string =>
  r.indicatorCode ? `sys:${r.indicatorCode}` : `usr:${r.userIndicatorId}`;

const refMatch = (ref: IndicatorRef, codeCol: PgColumn, userCol: PgColumn): SQL =>
  ref.kind === "sys" ? eq(codeCol, ref.code) : eq(userCol, ref.id);

const colsOf = (ref: string) => {
  const parsed = parseRef(ref) as IndicatorRef;
  return refColumns(parsed);
};

// --- catalog -------------------------------------------------------------------------------

type CatalogEntry = {
  ref: string;
  code: string | null;
  isSystem: boolean;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  method: Method;
  better: Better;
  inputLabels: InputLabels;
  groupKey: string;
  /** position in seed order (system by sort, then the user's by creation) */
  order: number;
  integerInputs: string[];
};

type Catalog = {
  groups: { key: string; nameAr: string; nameEn: string | null; isSystem: boolean }[];
  byRef: Map<string, CatalogEntry>;
};

/** System + the user's own indicators and groups in seed order: four queries. */
async function loadCatalog(tx: UserTx, userId: string): Promise<Catalog> {
  const sysGroups = await tx.select().from(indicatorGroups).orderBy(asc(indicatorGroups.sort));
  const usrGroups = await tx
    .select()
    .from(userIndicatorGroups)
    .where(eq(userIndicatorGroups.ownerId, userId))
    .orderBy(asc(userIndicatorGroups.createdAt));
  const sys = await tx.select().from(indicators).orderBy(asc(indicators.sort));
  const usr = await tx
    .select()
    .from(userIndicators)
    .where(eq(userIndicators.ownerId, userId))
    .orderBy(asc(userIndicators.createdAt));

  const byRef = new Map<string, CatalogEntry>();
  let order = 0;
  for (const i of sys) {
    byRef.set(`sys:${i.code}`, {
      ref: `sys:${i.code}`,
      code: i.code,
      isSystem: true,
      nameAr: i.nameAr,
      nameEn: i.nameEn,
      unit: i.unit,
      method: i.method,
      better: i.better,
      inputLabels: i.inputLabels,
      groupKey: `sys:${i.groupCode}`,
      order: order++,
      integerInputs: integerInputKeys(i.code, i.method),
    });
  }
  for (const i of usr) {
    byRef.set(`usr:${i.id}`, {
      ref: `usr:${i.id}`,
      code: null,
      isSystem: false,
      nameAr: i.nameAr,
      nameEn: i.nameEn,
      unit: i.unit,
      method: i.method,
      better: i.better,
      inputLabels: i.inputLabels,
      groupKey: i.groupCode ? `sys:${i.groupCode}` : `usr:${i.userGroupId}`,
      order: order++,
      integerInputs: integerInputKeys(null, i.method),
    });
  }
  return {
    groups: [
      ...sysGroups.map((g) => ({ key: `sys:${g.code}`, nameAr: g.nameAr, nameEn: g.nameEn, isSystem: true })),
      ...usrGroups.map((g) => ({ key: `usr:${g.id}`, nameAr: g.nameAr, nameEn: g.nameEn, isSystem: false })),
    ],
    byRef,
  };
}

function limitsFromRow(r: typeof indicatorLimits.$inferSelect): Limits | null {
  if (r.none) return null;
  const candidate =
    r.kind === "range"
      ? { kind: r.kind, critMin: r.critMin, minOk: r.minOk, maxOk: r.maxOk, critMax: r.critMax }
      : { kind: r.kind, target: r.target, warning: r.warning, critical: r.critical };
  const parsed = limitsSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** The user's CURRENT limits by ref (null = none approved). Copies the defaults first. */
async function loadCurrentLimits(tx: UserTx, userId: string): Promise<Map<string, Limits | null>> {
  await ensureDefaultLimits(tx, userId);
  const rows = await tx.select().from(indicatorLimits).where(eq(indicatorLimits.ownerId, userId));
  return new Map(rows.map((r) => [refOf(r), limitsFromRow(r)]));
}

/**
 * Floating-point noise from the division (29 / 100 * 100 = 28.999999999999996) must not
 * decide a status on a limit boundary, so values are rounded to 12 significant digits.
 */
const tidy = (v: number | null): number | null => (v === null ? null : Number(v.toPrecision(12)));

function evaluateEntry(entry: CatalogEntry, inputs: unknown): EvaluationResult {
  const ev = evaluateInputs(
    { method: entry.method, integerInputs: entry.integerInputs },
    asRawInputs(inputs),
  );
  return { ...ev, value: tidy(ev.value) };
}

/** insufficient_data unless the inputs are complete; then statusOf (strict comparisons). */
function statusFor(ev: EvaluationResult, limits: Limits | null): Status {
  return ev.state === "complete" ? statusOf(ev.value, limits) : "insufficient_data";
}

// --- loaders ---------------------------------------------------------------------------------

type AssessmentRow = typeof assessments.$inferSelect;

async function loadAssessment(
  tx: UserTx,
  userId: string,
  id: string,
  lock = false,
): Promise<{ row: AssessmentRow; plantName: string } | null> {
  if (!isUuid(id)) return null;
  const q = tx
    .select({ a: assessments, plantName: plants.name })
    .from(assessments)
    .innerJoin(plants, and(eq(plants.id, assessments.plantId), eq(plants.ownerId, assessments.ownerId)))
    .where(and(eq(assessments.id, id), eq(assessments.ownerId, userId)));
  const [r] = lock ? await q.for("update", { of: assessments }) : await q;
  return r ? { row: r.a, plantName: r.plantName } : null;
}

function toHeader(a: AssessmentRow, plantName: string): AssessmentHeader {
  return {
    id: a.id,
    status: a.status,
    plantId: a.plantId,
    plantName,
    periodStart: a.periodStart.slice(0, 7),
    months: a.months as PeriodMonths,
    startDate: a.startDate,
    endDate: a.endDate,
    enteredBy: a.enteredBy,
    approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  };
}

async function findConflict(
  tx: UserTx,
  userId: string,
  plantId: string,
  periodStart: string,
  months: number,
  excludeId?: string,
): Promise<{ kind: "duplicate" | "overlap"; conflict: ConflictingAssessment } | null> {
  const rows = await tx
    .select({
      id: assessments.id,
      status: assessments.status,
      periodStart: assessments.periodStart,
      months: assessments.months,
    })
    .from(assessments)
    .where(
      and(
        eq(assessments.ownerId, userId),
        eq(assessments.plantId, plantId),
        eq(assessments.months, months),
        excludeId ? ne(assessments.id, excludeId) : undefined,
      ),
    );
  const s = monthIndex(periodStart);
  for (const r of rows) {
    const rs = monthIndex(r.periodStart.slice(0, 7));
    if (rs < s + months && s < rs + months) {
      return {
        kind: rs === s ? "duplicate" : "overlap",
        conflict: {
          id: r.id,
          status: r.status,
          periodStart: r.periodStart.slice(0, 7),
          months: r.months,
        },
      };
    }
  }
  return null;
}

type AuditInput = {
  entity: string;
  entityId: string;
  action: string;
  actor: string;
  payload: Record<string, unknown>;
  at: Date;
};

function assessmentEvent<A extends AuditAction>(
  assessmentId: string,
  action: A,
  actor: string,
  payload: AuditPayloads[A],
  at: Date,
): AuditInput {
  return { entity: "assessment", entityId: assessmentId, action, actor, payload, at };
}

async function writeAudit(tx: UserTx, userId: string, events: AuditInput[]): Promise<void> {
  if (!events.length) return;
  await tx.insert(auditEvents).values(events.map((e) => ({ ownerId: userId, ...e })));
}

async function adoptedRefs(tx: UserTx, userId: string, plantId: string): Promise<Set<string>> {
  const rows = await tx
    .select({
      indicatorCode: plantIndicators.indicatorCode,
      userIndicatorId: plantIndicators.userIndicatorId,
    })
    .from(plantIndicators)
    .where(
      and(
        eq(plantIndicators.ownerId, userId),
        eq(plantIndicators.plantId, plantId),
        eq(plantIndicators.adopted, true),
      ),
    );
  return new Set(rows.map(refOf));
}

type ReadingRow = typeof assessmentReadings.$inferSelect;

async function loadReadings(tx: UserTx, userId: string, assessmentId: string): Promise<ReadingRow[]> {
  return tx
    .select()
    .from(assessmentReadings)
    .where(and(eq(assessmentReadings.ownerId, userId), eq(assessmentReadings.assessmentId, assessmentId)));
}

// --- wizard context ----------------------------------------------------------------------------

/** Everything steps 2 and 3 need: the plant's adopted indicators, grouped, with inputs and limits. */
export async function getWizardContext(
  tx: UserTx,
  userId: string,
  plantId: string,
): Promise<AssessmentResult<WizardContext>> {
  if (!isUuid(plantId)) return { ok: false, error: "plantNotFound" };
  const [plant] = await tx
    .select({ id: plants.id, name: plants.name })
    .from(plants)
    .where(and(eq(plants.id, plantId), eq(plants.ownerId, userId)));
  if (!plant) return { ok: false, error: "plantNotFound" };

  const adopted = await adoptedRefs(tx, userId, plantId);
  const catalog = await loadCatalog(tx, userId);
  const limits = await loadCurrentLimits(tx, userId);

  const groups: WizardGroup[] = [];
  for (const g of catalog.groups) {
    const list = [...catalog.byRef.values()]
      .filter((e) => e.groupKey === g.key && adopted.has(e.ref))
      .sort((a, b) => a.order - b.order)
      .map((e) => ({
        ref: e.ref,
        code: e.code,
        nameAr: e.nameAr,
        nameEn: e.nameEn,
        isSystem: e.isSystem,
        method: e.method,
        unit: e.unit,
        better: e.better,
        inputs: inputDefs(e.method, e.code, e.inputLabels),
        limits: limits.get(e.ref) ?? null,
      }));
    if (list.length) groups.push({ ...g, indicators: list });
  }
  return ok({ plant, groups });
}

// --- drafts ------------------------------------------------------------------------------------

function completenessOf(readings: { evaluation: ReadingEvaluation }[]): DraftCompleteness {
  const c: DraftCompleteness = { selected: readings.length, complete: 0, partial: 0, missing: 0, error: 0, percent: 0 };
  for (const r of readings) c[r.evaluation.state]++;
  c.percent = c.selected ? (c.complete / c.selected) * 100 : 0;
  return c;
}

async function buildDraft(
  tx: UserTx,
  userId: string,
  row: AssessmentRow,
  plantName: string,
): Promise<DraftDto> {
  const readingRows = await loadReadings(tx, userId, row.id);
  const catalog = await loadCatalog(tx, userId);
  const limits = await loadCurrentLimits(tx, userId);
  const readings: (DraftReading & { order: number })[] = [];
  for (const r of readingRows) {
    const ref = refOf(r);
    const entry = catalog.byRef.get(ref);
    if (!entry) continue;
    const ev = evaluateEntry(entry, r.inputs);
    readings.push({
      ref,
      inputs: r.inputs,
      note: r.note,
      order: entry.order,
      evaluation: {
        state: ev.state,
        errors: ev.errors,
        value: ev.value,
        status: ev.state === "error" ? null : statusFor(ev, limits.get(ref) ?? null),
      },
    });
  }
  readings.sort((a, b) => a.order - b.order);
  const clean: DraftReading[] = readings.map((r) => ({
    ref: r.ref,
    inputs: r.inputs,
    note: r.note,
    evaluation: r.evaluation,
  }));
  return {
    header: toHeader(row, plantName),
    selection: clean.map((r) => r.ref),
    readings: clean,
    completeness: completenessOf(clean),
  };
}

type DraftLoad =
  | { ok: true; row: AssessmentRow; plantName: string }
  | Extract<AssessmentResult<never>, { ok: false }>;

async function loadDraftRow(tx: UserTx, userId: string, id: string, lock = true): Promise<DraftLoad> {
  const found = await loadAssessment(tx, userId, id, lock);
  if (!found) return { ok: false, error: "notFound" };
  if (found.row.status === "approved") return { ok: false, error: "alreadyApproved" };
  return { ok: true, ...found };
}

/** Creates a draft with every indicator adopted at the plant selected. One assessment per plant + start + length; same-length overlap is refused. */
export async function createDraft(
  tx: UserTx,
  userId: string,
  input: unknown,
  ctx: Ctx,
): Promise<AssessmentResult<{ id: string }>> {
  const v = validateDetails(input, ctx.now);
  if (!v.ok) return v;
  const d = v.data;

  const [plant] = await tx
    .select({ id: plants.id })
    .from(plants)
    .where(and(eq(plants.id, d.plantId), eq(plants.ownerId, userId)));
  if (!plant) return { ok: false, error: "plantNotFound" };

  const clash = await findConflict(tx, userId, d.plantId, d.periodStart, d.months);
  if (clash) return { ok: false, error: clash.kind, conflict: clash.conflict };

  try {
    // savepoint: a refused insert must not abort the surrounding transaction
    const id = await tx.transaction(async (sp) => {
      const [row] = await sp
        .insert(assessments)
        .values({
          ownerId: userId,
          plantId: d.plantId,
          periodStart: `${d.periodStart}-01`,
          months: d.months,
          startDate: d.startDate,
          endDate: d.endDate,
          enteredBy: d.enteredBy,
          status: "draft",
        })
        .returning({ id: assessments.id });
      return row.id;
    });
    await writeAudit(tx, userId, [
      assessmentEvent(id, "draft_created", ctx.actor, {
        plantId: d.plantId,
        periodStart: d.periodStart,
        months: d.months,
      }, ctx.now),
    ]);
    // New drafts start with every indicator adopted at the plant selected (empty inputs).
    const sel = await setDraftSelection(tx, userId, id, [...(await adoptedRefs(tx, userId, d.plantId))]);
    if (!sel.ok) throw new Error(`createDraft: default selection failed (${sel.error})`);
    return ok({ id });
  } catch (e) {
    const code = pgCode(e);
    if (code === EXCLUSION_VIOLATION || code === UNIQUE_VIOLATION) {
      return { ok: false, error: code === UNIQUE_VIOLATION ? "duplicate" : "overlap" };
    }
    throw e;
  }
}

/** Changes plant / period / dates / entered-by of a draft. Readings of indicators the new plant does not adopt are dropped. */
export async function updateDraftDetails(
  tx: UserTx,
  userId: string,
  id: string,
  input: unknown,
  ctx: Ctx,
): Promise<AssessmentResult<DraftDto>> {
  const draft = await loadDraftRow(tx, userId, id);
  if (!draft.ok) return draft;
  const v = validateDetails(input, ctx.now);
  if (!v.ok) return v;
  const d = v.data;

  let plantName = draft.plantName;
  if (d.plantId !== draft.row.plantId) {
    const [plant] = await tx
      .select({ id: plants.id, name: plants.name })
      .from(plants)
      .where(and(eq(plants.id, d.plantId), eq(plants.ownerId, userId)));
    if (!plant) return { ok: false, error: "plantNotFound" };
    plantName = plant.name;
  }
  const clash = await findConflict(tx, userId, d.plantId, d.periodStart, d.months, id);
  if (clash) return { ok: false, error: clash.kind, conflict: clash.conflict };

  try {
    await tx.transaction(async (sp) => {
      await sp
        .update(assessments)
        .set({
          plantId: d.plantId,
          periodStart: `${d.periodStart}-01`,
          months: d.months,
          startDate: d.startDate,
          endDate: d.endDate,
          enteredBy: d.enteredBy,
        })
        .where(and(eq(assessments.id, id), eq(assessments.ownerId, userId)));
    });
  } catch (e) {
    const code = pgCode(e);
    if (code === EXCLUSION_VIOLATION || code === UNIQUE_VIOLATION) {
      return { ok: false, error: code === UNIQUE_VIOLATION ? "duplicate" : "overlap" };
    }
    throw e;
  }

  if (d.plantId !== draft.row.plantId) {
    const adopted = await adoptedRefs(tx, userId, d.plantId);
    const rows = await loadReadings(tx, userId, id);
    const drop = rows.filter((r) => !adopted.has(refOf(r))).map((r) => r.id);
    if (drop.length) await tx.delete(assessmentReadings).where(inArray(assessmentReadings.id, drop));
  }
  const fresh = await loadAssessment(tx, userId, id);
  if (!fresh) return { ok: false, error: "notFound" };
  return ok(await buildDraft(tx, userId, fresh.row, plantName));
}

/**
 * Replaces the selection. Only indicators adopted at the plant are accepted. Readings
 * already entered for kept indicators stay; deselected ones are removed.
 */
export async function setDraftSelection(
  tx: UserTx,
  userId: string,
  id: string,
  refs: readonly string[],
): Promise<AssessmentResult<DraftDto>> {
  const draft = await loadDraftRow(tx, userId, id);
  if (!draft.ok) return draft;

  const wanted = [...new Set(refs.map((r) => parseRef(r)).filter((r): r is IndicatorRef => r !== null).map(formatRef))];
  if (wanted.length !== new Set(refs).size) {
    return { ok: false, error: "indicatorNotAdopted", refs: refs.filter((r) => !parseRef(r)) };
  }
  const adopted = await adoptedRefs(tx, userId, draft.row.plantId);
  const bad = wanted.filter((r) => !adopted.has(r));
  if (bad.length) return { ok: false, error: "indicatorNotAdopted", refs: bad };

  const catalog = await loadCatalog(tx, userId);
  const existing = await loadReadings(tx, userId, id);
  const have = new Map(existing.map((r) => [refOf(r), r.id]));
  const want = new Set(wanted);

  const drop = [...have.entries()].filter(([ref]) => !want.has(ref)).map(([, rid]) => rid);
  if (drop.length) await tx.delete(assessmentReadings).where(inArray(assessmentReadings.id, drop));

  const add = wanted.filter((r) => !have.has(r) && catalog.byRef.has(r));
  if (add.length) {
    await tx.insert(assessmentReadings).values(
      add.map((ref) => ({
        ownerId: userId,
        assessmentId: id,
        ...colsOf(ref),
        inputs: sanitizeInputs((catalog.byRef.get(ref) as CatalogEntry).method, {}),
      })),
    );
  }
  return ok(await buildDraft(tx, userId, draft.row, draft.plantName));
}

/**
 * Stores the RAW inputs (and the note) of the given readings. Anything else in the
 * payload (a client-computed value or status) is ignored. Partial and invalid inputs
 * are fine in a draft. Returns the whole draft with the live evaluation of every
 * reading; that evaluation is for display only and is recomputed at approval.
 */
export async function saveDraftReadings(
  tx: UserTx,
  userId: string,
  id: string,
  readings: Record<string, ReadingPayload>,
): Promise<AssessmentResult<DraftDto>> {
  const draft = await loadDraftRow(tx, userId, id);
  if (!draft.ok) return draft;

  const catalog = await loadCatalog(tx, userId);
  const rows = await loadReadings(tx, userId, id);
  const byRef = new Map(rows.map((r) => [refOf(r), r]));

  const unknown = Object.keys(readings).filter((ref) => !byRef.has(ref));
  if (unknown.length) return { ok: false, error: "readingNotSelected", refs: unknown };

  const items = Object.entries(readings).map(([ref, p]) => {
    const entry = catalog.byRef.get(ref) as CatalogEntry;
    const row = byRef.get(ref) as ReadingRow;
    return {
      id: row.id,
      inputs: sanitizeInputs(entry.method, p.inputs),
      note: typeof p.note === "string" ? p.note : null,
    };
  });
  if (items.length) {
    const values = sql.join(
      items.map((i) => sql`(${i.id}::uuid, ${JSON.stringify(i.inputs)}::jsonb, ${i.note}::text)`),
      sql`, `,
    );
    await tx.execute(sql`
      update assessment_readings r
      set inputs = v.inputs, note = coalesce(v.note, r.note)
      from (values ${values}) as v(id, inputs, note)
      where r.id = v.id and r.owner_id = ${userId}::uuid
    `);
  }
  return ok(await buildDraft(tx, userId, draft.row, draft.plantName));
}

/** Full resume payload of a draft: details, selection, raw inputs, live evaluation, completeness. */
export async function getDraft(
  tx: UserTx,
  userId: string,
  id: string,
): Promise<AssessmentResult<DraftDto>> {
  const draft = await loadDraftRow(tx, userId, id, false);
  if (!draft.ok) return draft;
  return ok(await buildDraft(tx, userId, draft.row, draft.plantName));
}

/** Deletes a draft and its readings. Approved assessments cannot be deleted (the database refuses too). */
export async function deleteDraft(
  tx: UserTx,
  userId: string,
  id: string,
  ctx: Ctx,
): Promise<AssessmentResult<{ id: string }>> {
  const draft = await loadDraftRow(tx, userId, id);
  if (!draft.ok) return draft;
  await tx.delete(assessments).where(and(eq(assessments.id, id), eq(assessments.ownerId, userId)));
  await writeAudit(tx, userId, [
    assessmentEvent(id, "draft_deleted", ctx.actor, {
      plantId: draft.row.plantId,
      periodStart: draft.row.periodStart.slice(0, 7),
      months: draft.row.months,
    }, ctx.now),
  ]);
  return ok({ id });
}

// --- approval ----------------------------------------------------------------------------------

/**
 * Approves a draft. Everything is recomputed here from the stored raw inputs: values with
 * evaluateInputs, statuses with statusOf against the user's CURRENT limits, which are then
 * stored as the limits snapshot. Writes the audit trail and opens one auto problem for every
 * critical indicator. The same row becomes approved (it replaces the draft).
 */
export async function approveAssessment(
  tx: UserTx,
  userId: string,
  id: string,
  opts: { acknowledgeMissing: boolean; now: Date; actor: string },
): Promise<AssessmentResult<ApprovalSummary>> {
  const { now, actor } = opts;
  const draft = await loadDraftRow(tx, userId, id);
  if (!draft.ok) return draft;
  const row = draft.row;
  const periodStart = row.periodStart.slice(0, 7);

  const period = validatePeriod(
    { periodStart, months: row.months, startDate: row.startDate, endDate: row.endDate },
    now,
  );
  if (!period.ok && period.error === "futurePeriod") return period;

  const clash = await findConflict(tx, userId, row.plantId, periodStart, row.months, id);
  if (clash) return { ok: false, error: clash.kind, conflict: clash.conflict };

  const readingRows = await loadReadings(tx, userId, id);
  if (!readingRows.length) return { ok: false, error: "noIndicatorsSelected" };

  const adopted = await adoptedRefs(tx, userId, row.plantId);
  const notAdopted = readingRows.map(refOf).filter((r) => !adopted.has(r));
  if (notAdopted.length) return { ok: false, error: "indicatorNotAdopted", refs: notAdopted };

  const catalog = await loadCatalog(tx, userId);
  const currentLimits = await loadCurrentLimits(tx, userId);

  const evaluated = readingRows
    .map((r) => {
      const ref = refOf(r);
      const entry = catalog.byRef.get(ref) as CatalogEntry;
      const ev = evaluateEntry(entry, r.inputs);
      return { r, ref, entry, ev };
    })
    .sort((a, b) => a.entry.order - b.entry.order);

  const errored = evaluated.filter((e) => e.ev.state === "error").map((e) => e.ref);
  if (errored.length) return { ok: false, error: "inputErrors", refs: errored };

  const incomplete = evaluated.filter((e) => e.ev.state !== "complete").map((e) => e.ref);
  if (incomplete.length && !opts.acknowledgeMissing) {
    return { ok: false, error: "missingData", refs: incomplete };
  }

  const snapshot: LimitsSnapshot = {};
  const counts = emptyCounts();
  const decided = evaluated.map((e) => {
    const limits = currentLimits.get(e.ref) ?? null;
    snapshot[e.ref] = limits;
    const status = statusFor(e.ev, limits);
    counts[status]++;
    return { ...e, limits, status, value: e.ev.state === "complete" ? e.ev.value : null };
  });
  limitsSnapshotSchema.parse(snapshot);

  const values = sql.join(
    decided.map((d) => sql`(${d.r.id}::uuid, ${d.value}::float8, ${d.status}::reading_status)`),
    sql`, `,
  );
  await tx.execute(sql`
    update assessment_readings r
    set value = v.value, status = v.status
    from (values ${values}) as v(id, value, status)
    where r.id = v.id and r.owner_id = ${userId}::uuid
  `);

  await tx
    .update(assessments)
    .set({ status: "approved", approvedAt: now, limitsSnapshot: snapshot })
    .where(and(eq(assessments.id, id), eq(assessments.ownerId, userId)));

  const criticals = decided.filter((d) => shouldAutoOpenProblem(d.status));
  const opened = criticals.length
    ? await tx
        .insert(problems)
        .values(
          criticals.map((d) => ({
            ownerId: userId,
            assessmentId: id,
            ...colsOf(d.ref),
            detectedOn: dateKeyOf(now),
            value: d.value,
            origin: "auto" as const,
            description: "",
          })),
        )
        .returning({
          id: problems.id,
          indicatorCode: problems.indicatorCode,
          userIndicatorId: problems.userIndicatorId,
        })
    : [];
  const problemByRef = new Map(opened.map((p) => [refOf(p), p.id]));

  // Strictly increasing timestamps keep the trail in the order the steps happened.
  let tick = 0;
  const at = () => new Date(now.getTime() + tick++);
  const events: AuditInput[] = [
    assessmentEvent(id, "readings_entered", row.enteredBy || actor, {
      count: decided.length,
      enteredBy: row.enteredBy,
    }, at()),
  ];
  if (incomplete.length) {
    events.push(assessmentEvent(id, "missing_data_acknowledged", actor, { count: incomplete.length }, at()));
  }
  events.push(
    assessmentEvent(id, "approved", actor, {
      indicators: decided.length,
      ok: counts.ok,
      warning: counts.warning,
      critical: counts.critical,
      insufficient_data: counts.insufficient_data,
      no_limits: counts.no_limits,
      problems: opened.length,
    }, at()),
  );
  for (const d of criticals) {
    const problemId = problemByRef.get(d.ref) as string;
    const when = at();
    events.push(
      assessmentEvent(id, "problem_opened_auto", "system", { ref: d.ref, problemId, value: d.value }, when),
      {
        entity: "problem",
        entityId: problemId,
        action: "opened",
        actor: "system",
        payload: { origin: "auto", assessmentId: id, ref: d.ref },
        at: when,
      },
    );
  }
  await writeAudit(tx, userId, events);

  return ok({ id, counts, missingCount: incomplete.length, problemIds: opened.map((p) => p.id) });
}

// --- lists -------------------------------------------------------------------------------------

async function buildListItems(
  tx: UserTx,
  userId: string,
  rows: { a: AssessmentRow; plantName: string }[],
): Promise<AssessmentListItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.a.id);
  const readingRows = await tx
    .select()
    .from(assessmentReadings)
    .where(and(eq(assessmentReadings.ownerId, userId), inArray(assessmentReadings.assessmentId, ids)));
  const problemRows = await tx
    .select({
      assessmentId: problems.assessmentId,
      n: sql<number>`(count(*) filter (where ${openProblemSql}))::int`,
    })
    .from(problems)
    .where(and(eq(problems.ownerId, userId), inArray(problems.assessmentId, ids)))
    .groupBy(problems.assessmentId);
  const problemsBy = new Map(problemRows.map((p) => [p.assessmentId, p.n]));
  const catalog = rows.some((r) => r.a.status === "draft") ? await loadCatalog(tx, userId) : null;

  const byAssessment = new Map<string, ReadingRow[]>();
  for (const r of readingRows) {
    const list = byAssessment.get(r.assessmentId) ?? [];
    list.push(r);
    byAssessment.set(r.assessmentId, list);
  }

  return rows.map(({ a, plantName }) => {
    const list = byAssessment.get(a.id) ?? [];
    let withValue = 0;
    let counts: StatusCounts | null = null;
    if (a.status === "approved") {
      counts = emptyCounts();
      for (const r of list) {
        counts[r.status ?? "insufficient_data"]++;
        if (r.value !== null) withValue++;
      }
    } else if (catalog) {
      for (const r of list) {
        const entry = catalog.byRef.get(refOf(r));
        if (entry && evaluateEntry(entry, r.inputs).state === "complete") withValue++;
      }
    }
    const h = toHeader(a, plantName);
    return {
      id: h.id,
      status: h.status,
      plantId: h.plantId,
      plantName,
      periodStart: h.periodStart,
      months: h.months,
      startDate: h.startDate,
      endDate: h.endDate,
      enteredBy: h.enteredBy,
      approvedAt: h.approvedAt,
      createdAt: h.createdAt,
      selectedCount: list.length,
      completeness: list.length ? (withValue / list.length) * 100 : 0,
      counts,
      openProblems: problemsBy.get(a.id) ?? 0,
    };
  });
}

const endIndexSql = sql`(extract(year from ${assessments.periodStart})::int * 12 + extract(month from ${assessments.periodStart})::int - 1 + ${assessments.months} - 1)`;

async function fetchListRows(
  tx: UserTx,
  userId: string,
  where: SQL | undefined,
  order: SQL[],
  limit?: number,
) {
  const q = tx
    .select({ a: assessments, plantName: plants.name })
    .from(assessments)
    .innerJoin(plants, and(eq(plants.id, assessments.plantId), eq(plants.ownerId, assessments.ownerId)))
    .where(and(eq(assessments.ownerId, userId), where))
    .orderBy(...order);
  return limit ? q.limit(limit) : q;
}

/**
 * Approved assessments and drafts with plant name, period, counts by status, completeness
 * and open-problem count. `range`: "all" (default) or a number N = only assessments whose
 * period ends within the last N months counted from `now` (the current month is month 1).
 */
export async function listAssessments(
  tx: UserTx,
  userId: string,
  opts: { plantId?: string | null; range?: ListRange; now: Date },
): Promise<AssessmentListItem[]> {
  const conds: SQL[] = [];
  if (opts.plantId) {
    if (!isUuid(opts.plantId)) return [];
    conds.push(eq(assessments.plantId, opts.plantId));
  }
  if (typeof opts.range === "number") {
    const minEnd = monthIndex(monthKeyOf(opts.now)) - opts.range + 1;
    conds.push(sql`${endIndexSql} >= ${minEnd}`);
  }
  const rows = await fetchListRows(tx, userId, and(...conds), [
    desc(endIndexSql),
    asc(assessments.months),
    desc(assessments.createdAt),
  ]);
  return buildListItems(tx, userId, rows);
}

/** The most recent activity first (approval time, or creation time for a draft). Drafts included. */
export async function listLatestAssessments(
  tx: UserTx,
  userId: string,
  limit: number,
): Promise<AssessmentListItem[]> {
  const rows = await fetchListRows(
    tx,
    userId,
    undefined,
    [desc(sql`coalesce(${assessments.approvedAt}, ${assessments.createdAt})`), desc(assessments.createdAt)],
    Math.max(1, Math.floor(limit)),
  );
  return buildListItems(tx, userId, rows);
}

// --- results -----------------------------------------------------------------------------------

/**
 * Results of an APPROVED assessment: header, completeness, counts, rows grouped like the seed
 * (with the limits SNAPSHOT, previous value and change direction, problem link) and the audit trail.
 */
export async function getAssessmentResults(
  tx: UserTx,
  userId: string,
  id: string,
): Promise<AssessmentResult<AssessmentResults>> {
  const found = await loadAssessment(tx, userId, id);
  if (!found) return { ok: false, error: "notFound" };
  const { row, plantName } = found;
  if (row.status !== "approved") return { ok: false, error: "notApproved" };

  const readingRows = await loadReadings(tx, userId, id);
  const catalog = await loadCatalog(tx, userId);
  const problemRows = await tx
    .select({
      id: problems.id,
      indicatorCode: problems.indicatorCode,
      userIndicatorId: problems.userIndicatorId,
    })
    .from(problems)
    .where(and(eq(problems.ownerId, userId), eq(problems.assessmentId, id)));
  const problemBy = new Map(problemRows.map((p) => [refOf(p), p.id]));

  const periodStart = row.periodStart.slice(0, 7);
  const candidates = await tx
    .select({
      id: assessments.id,
      plantId: assessments.plantId,
      periodStart: assessments.periodStart,
      months: assessments.months,
      status: assessments.status,
    })
    .from(assessments)
    .where(
      and(
        eq(assessments.ownerId, userId),
        eq(assessments.plantId, row.plantId),
        eq(assessments.months, row.months),
        eq(assessments.status, "approved"),
      ),
    );
  const prev = findPreviousAssessment(
    { plantId: row.plantId, periodStart, months: row.months },
    candidates.map((c) => ({ ...c, periodStart: c.periodStart.slice(0, 7) })),
  );
  const prevReadings = prev ? await loadReadings(tx, userId, prev.id) : [];
  const prevBy = new Map(prevReadings.map((r) => [refOf(r), r]));

  const trail = await tx
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.ownerId, userId),
        eq(auditEvents.entity, "assessment"),
        eq(auditEvents.entityId, id),
      ),
    )
    .orderBy(desc(auditEvents.at), desc(auditEvents.id));

  const snapshotParsed = limitsSnapshotSchema.safeParse(row.limitsSnapshot ?? {});
  const snapshot: LimitsSnapshot = snapshotParsed.success ? snapshotParsed.data : {};

  const counts = emptyCounts();
  let withValue = 0;
  const rowsByGroup = new Map<string, (ResultRow & { order: number })[]>();
  for (const r of readingRows) {
    const ref = refOf(r);
    const entry = catalog.byRef.get(ref);
    if (!entry) continue;
    const status: Status = r.status ?? "insufficient_data";
    counts[status]++;
    if (r.value !== null) withValue++;
    const limits = snapshot[ref] ?? null;
    const p = prevBy.get(ref);
    const problemId = problemBy.get(ref) ?? null;
    const result: ResultRow & { order: number } = {
      ref,
      code: entry.code,
      nameAr: entry.nameAr,
      nameEn: entry.nameEn,
      unit: entry.unit,
      method: entry.method,
      better: entry.better,
      inputDefs: inputDefs(entry.method, entry.code, entry.inputLabels),
      inputs: r.inputs,
      value: r.value,
      status,
      limits,
      note: r.note,
      previousValue: p?.value ?? null,
      previousStatus: p ? (p.status ?? "insufficient_data") : null,
      change: changeDirection(r.value, p?.value ?? null, limits ?? entry.better),
      problemId,
      canOpenManualProblem: canOpenManualProblem(status) && !problemId,
      order: entry.order,
    };
    const list = rowsByGroup.get(entry.groupKey) ?? [];
    list.push(result);
    rowsByGroup.set(entry.groupKey, list);
  }

  const groups: ResultGroup[] = catalog.groups
    .filter((g) => rowsByGroup.has(g.key))
    .map((g) => ({
      ...g,
      rows: (rowsByGroup.get(g.key) as (ResultRow & { order: number })[])
        .sort((a, b) => a.order - b.order)
        .map((r): ResultRow => {
          const { order, ...rest } = r;
          void order;
          return rest;
        }),
    }));

  const total = readingRows.length;
  const audit: AuditEntry[] = trail.map((e) => ({
    id: e.id,
    entity: e.entity,
    action: e.action,
    actor: e.actor,
    payload: (e.payload ?? {}) as Record<string, unknown>,
    at: e.at.toISOString(),
  }));

  return ok({
    header: toHeader(row, plantName),
    completeness: { percent: total ? (withValue / total) * 100 : 0, withValue, total },
    counts,
    previous: prev
      ? { id: prev.id, periodStart: prev.periodStart, months: prev.months as PeriodMonths }
      : null,
    groups,
    audit,
  });
}

/** Value / status / limits of one indicator per approved assessment of the plant with this period length, oldest to newest. */
export async function getIndicatorHistory(
  tx: UserTx,
  userId: string,
  opts: { plantId: string; ref: string; months: number },
): Promise<HistoryPoint[]> {
  const ref = parseRef(opts.ref);
  if (!ref || !isUuid(opts.plantId)) return [];
  const key = formatRef(ref);
  const rows = await tx
    .select({
      assessmentId: assessments.id,
      periodStart: assessments.periodStart,
      months: assessments.months,
      endDate: assessments.endDate,
      snapshot: assessments.limitsSnapshot,
      value: assessmentReadings.value,
      status: assessmentReadings.status,
    })
    .from(assessments)
    .innerJoin(
      assessmentReadings,
      and(
        eq(assessmentReadings.assessmentId, assessments.id),
        eq(assessmentReadings.ownerId, assessments.ownerId),
        refMatch(ref, assessmentReadings.indicatorCode, assessmentReadings.userIndicatorId),
      ),
    )
    .where(
      and(
        eq(assessments.ownerId, userId),
        eq(assessments.plantId, opts.plantId),
        eq(assessments.months, opts.months),
        eq(assessments.status, "approved"),
      ),
    )
    .orderBy(asc(assessments.periodStart));
  return rows.map((r) => {
    const parsed = limitsSnapshotSchema.safeParse(r.snapshot ?? {});
    return {
      assessmentId: r.assessmentId,
      periodStart: r.periodStart.slice(0, 7),
      months: r.months as PeriodMonths,
      endDate: r.endDate,
      value: r.value,
      status: r.status,
      limits: parsed.success ? (parsed.data[key] ?? null) : null,
    };
  });
}

// --- notes and manual problems ---------------------------------------------------------------

/** The only thing an approved assessment still allows. Each change is audited (old and new). Drafts keep notes with their readings. */
export async function updateReadingNote(
  tx: UserTx,
  userId: string,
  assessmentId: string,
  ref: string,
  note: string,
  ctx: Ctx,
): Promise<AssessmentResult<{ note: string; changed: boolean }>> {
  const parsedRef = parseRef(ref);
  if (!parsedRef) return { ok: false, error: "readingNotFound" };
  if (note.length > NOTE_MAX) {
    return { ok: false, error: "validation", fieldErrors: { note: "tooLong" } };
  }
  const found = await loadAssessment(tx, userId, assessmentId, true);
  if (!found) return { ok: false, error: "notFound" };
  if (found.row.status !== "approved") return { ok: false, error: "notApproved" };

  const [reading] = await tx
    .select()
    .from(assessmentReadings)
    .where(
      and(
        eq(assessmentReadings.ownerId, userId),
        eq(assessmentReadings.assessmentId, assessmentId),
        refMatch(parsedRef, assessmentReadings.indicatorCode, assessmentReadings.userIndicatorId),
      ),
    );
  if (!reading) return { ok: false, error: "readingNotFound" };
  const next = note.trim();
  if (reading.note === next) return ok({ note: next, changed: false });

  await tx
    .update(assessmentReadings)
    .set({ note: next })
    .where(and(eq(assessmentReadings.id, reading.id), eq(assessmentReadings.ownerId, userId)));
  await writeAudit(tx, userId, [
    assessmentEvent(assessmentId, "note_changed", ctx.actor, {
      ref: formatRef(parsedRef),
      from: reading.note,
      to: next,
    }, ctx.now),
  ]);
  return ok({ note: next, changed: true });
}

/** Opens a manual problem for a warning or critical reading of an approved assessment, once per indicator. */
export async function openManualProblem(
  tx: UserTx,
  userId: string,
  assessmentId: string,
  ref: string,
  ctx: Ctx,
): Promise<AssessmentResult<{ problemId: string }>> {
  const parsedRef = parseRef(ref);
  if (!parsedRef) return { ok: false, error: "readingNotFound" };
  const found = await loadAssessment(tx, userId, assessmentId, true);
  if (!found) return { ok: false, error: "notFound" };
  if (found.row.status !== "approved") return { ok: false, error: "notApproved" };

  const cols = refColumns(parsedRef);
  const matchReading = refMatch(parsedRef, assessmentReadings.indicatorCode, assessmentReadings.userIndicatorId);
  const [reading] = await tx
    .select()
    .from(assessmentReadings)
    .where(
      and(
        eq(assessmentReadings.ownerId, userId),
        eq(assessmentReadings.assessmentId, assessmentId),
        matchReading,
      ),
    );
  if (!reading) return { ok: false, error: "readingNotFound" };
  const status: Status = reading.status ?? "insufficient_data";
  if (!canOpenManualProblem(status)) return { ok: false, error: "notEligible" };

  const matchProblem = refMatch(parsedRef, problems.indicatorCode, problems.userIndicatorId);
  const [existing] = await tx
    .select({ id: problems.id })
    .from(problems)
    .where(and(eq(problems.ownerId, userId), eq(problems.assessmentId, assessmentId), matchProblem));
  if (existing) return { ok: false, error: "problemExists", problemId: existing.id };

  let problemId: string;
  try {
    problemId = await tx.transaction(async (sp) => {
      const [p] = await sp
        .insert(problems)
        .values({
          ownerId: userId,
          assessmentId,
          ...cols,
          detectedOn: dateKeyOf(ctx.now),
          value: reading.value,
          origin: "manual",
          description: "",
        })
        .returning({ id: problems.id });
      return p.id;
    });
  } catch (e) {
    if (pgCode(e) === UNIQUE_VIOLATION) return { ok: false, error: "problemExists" };
    throw e;
  }
  await writeAudit(tx, userId, [
    assessmentEvent(assessmentId, "problem_opened_manual", ctx.actor, {
      ref: formatRef(parsedRef),
      problemId,
      value: reading.value,
      status,
    }, ctx.now),
    {
      entity: "problem",
      entityId: problemId,
      action: "opened",
      actor: ctx.actor,
      payload: { origin: "manual", assessmentId, ref: formatRef(parsedRef) },
      at: new Date(ctx.now.getTime() + 1),
    },
  ]);
  return ok({ problemId });
}

// --- plant cards / dashboard ---------------------------------------------------------------------

/**
 * Per plant: the latest approved assessment of any length (latest period end, then latest
 * approval) as the summary that feeds `plantState()`, assessment counts, and the share of
 * evaluated indicators within limits for the last <= 6 approved assessments (oldest first).
 * `summary.openProblems` counts the OPEN problems of the plant (awaiting obstacles or choosing an action).
 */
export async function getPlantPerformance(tx: UserTx, userId: string): Promise<PlantPerformance[]> {
  const plantRows = await tx
    .select({ id: plants.id })
    .from(plants)
    .where(eq(plants.ownerId, userId))
    .orderBy(asc(plants.createdAt));
  const asmRows = await tx
    .select({
      id: assessments.id,
      plantId: assessments.plantId,
      periodStart: assessments.periodStart,
      months: assessments.months,
      status: assessments.status,
      approvedAt: assessments.approvedAt,
    })
    .from(assessments)
    .where(eq(assessments.ownerId, userId));
  const statusRows = await tx
    .select({
      assessmentId: assessmentReadings.assessmentId,
      status: assessmentReadings.status,
      n: sql<number>`count(*)::int`,
    })
    .from(assessmentReadings)
    .innerJoin(
      assessments,
      and(eq(assessments.id, assessmentReadings.assessmentId), eq(assessments.ownerId, assessmentReadings.ownerId)),
    )
    .where(and(eq(assessmentReadings.ownerId, userId), eq(assessments.status, "approved")))
    .groupBy(assessmentReadings.assessmentId, assessmentReadings.status);
  const problemRows = await tx
    .select({ plantId: assessments.plantId, n: sql<number>`(count(*) filter (where ${openProblemSql}))::int` })
    .from(problems)
    .innerJoin(
      assessments,
      and(eq(assessments.id, problems.assessmentId), eq(assessments.ownerId, problems.ownerId)),
    )
    .where(eq(problems.ownerId, userId))
    .groupBy(assessments.plantId);

  const countsBy = new Map<string, StatusCounts>();
  for (const r of statusRows) {
    const c = countsBy.get(r.assessmentId) ?? emptyCounts();
    c[r.status ?? "insufficient_data"] += r.n;
    countsBy.set(r.assessmentId, c);
  }
  const problemsBy = new Map(problemRows.map((p) => [p.plantId, p.n]));

  return plantRows.map((p) => {
    const mine = asmRows.filter((a) => a.plantId === p.id);
    const approved = mine
      .filter((a) => a.status === "approved")
      .map((a) => ({
        ...a,
        end: monthIndex(a.periodStart.slice(0, 7)) + a.months - 1,
        at: a.approvedAt ? a.approvedAt.getTime() : 0,
      }))
      .sort((x, y) => x.end - y.end || x.at - y.at);
    const latest = approved[approved.length - 1];
    const counts = latest ? (countsBy.get(latest.id) ?? emptyCounts()) : null;
    const series = approved.slice(-6).flatMap((a) => {
      const c = countsBy.get(a.id) ?? emptyCounts();
      const evaluated = c.ok + c.warning + c.critical;
      return evaluated ? [(c.ok / evaluated) * 100] : [];
    });
    return {
      plantId: p.id,
      summary:
        latest && counts
          ? { critical: counts.critical, warning: counts.warning, openProblems: problemsBy.get(p.id) ?? 0 }
          : null,
      latest:
        latest && counts
          ? {
              assessmentId: latest.id,
              periodStart: latest.periodStart.slice(0, 7),
              months: latest.months as PeriodMonths,
              counts,
            }
          : null,
      approvedCount: approved.length,
      draftCount: mine.length - approved.length,
      series,
    };
  });
}

export type { RawInputs };
