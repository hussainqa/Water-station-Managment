import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { UserTx } from "@/db/with-user";
import {
  assessmentReadings,
  indicatorLimits,
  plantIndicators,
  plants,
  problems,
  userIndicatorGroups,
  userIndicators,
} from "@/db/schema/app";
import { indicatorGroups, indicators } from "@/db/schema/reference";
import { limitsSchema, type Better, type LimitKind, type Limits, type Method } from "@/lib/evaluation";
import { formatGroupKey, formatRef, refColumns, type GroupKey, type IndicatorRef } from "./ref";
import {
  checkLimits,
  type ActionResult,
  type FieldErrors,
  type IndicatorFormData,
  type LimitsErrorCode,
} from "./schemas";
import type { IndicatorDto, IndicatorGroupDto, IndicatorsData } from "./types";

/**
 * Data functions for the indicators screen. Every function takes the transaction
 * from `withUser()`: row-level security limits each query to the signed-in user, and
 * `ownerId` is still set explicitly on inserts. Reference tables are read-only.
 * Nothing here selects rii / correlation_r / priority_pct.
 */

const fail = (error: Extract<ActionResult, { ok: false }>["error"], fieldErrors?: FieldErrors) =>
  ({ ok: false, error, fieldErrors }) as const;

function pgCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

// --- default limits ---------------------------------------------------------------------

/**
 * Copies the seeded default limits into the user's own `indicator_limits` for every
 * system indicator the user has no row for. Idempotent, and it never overwrites an
 * existing row (including one set to "no approved limits").
 */
export async function ensureDefaultLimits(tx: UserTx, userId: string): Promise<void> {
  await tx.execute(sql`
    insert into indicator_limits
      (owner_id, indicator_code, kind, target, warning, critical, min_ok, max_ok, crit_min, crit_max, none)
    select ${userId}::uuid, d.indicator_code, d.kind, d.target, d.warning, d.critical,
           d.min_ok, d.max_ok, d.crit_min, d.crit_max, false
    from indicator_default_limits d
    on conflict do nothing
  `);
}

type LimitsRow = typeof indicatorLimits.$inferSelect;

function rowToLimits(r: Pick<LimitsRow, "kind" | "target" | "warning" | "critical" | "minOk" | "maxOk" | "critMin" | "critMax">): Limits | null {
  const candidate =
    r.kind === "range"
      ? { kind: r.kind, critMin: r.critMin, minOk: r.minOk, maxOk: r.maxOk, critMax: r.critMax }
      : { kind: r.kind, target: r.target, warning: r.warning, critical: r.critical };
  const parsed = limitsSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// --- listing ------------------------------------------------------------------------------

/**
 * System + user-defined indicators with their group, the user's current limits,
 * adoption at `plantId` (null = no plant chosen) and a usage flag. Also makes sure the
 * default limits have been copied for this user.
 */
export async function listIndicatorsForUser(
  tx: UserTx,
  userId: string,
  plantId: string | null,
): Promise<IndicatorsData> {
  await ensureDefaultLimits(tx, userId);

  // Sequential on purpose: one transaction is one connection (no concurrent queries).
  const sysGroups = await tx.select().from(indicatorGroups).orderBy(asc(indicatorGroups.sort));
  const usrGroups = await tx
    .select()
    .from(userIndicatorGroups)
    .where(eq(userIndicatorGroups.ownerId, userId))
    .orderBy(asc(userIndicatorGroups.createdAt));
  const sysIndicators = await tx.select().from(indicators).orderBy(asc(indicators.sort));
  const usrIndicators = await tx
    .select()
    .from(userIndicators)
    .where(eq(userIndicators.ownerId, userId))
    .orderBy(asc(userIndicators.createdAt));
  const limitRows = await tx
    .select()
    .from(indicatorLimits)
    .where(eq(indicatorLimits.ownerId, userId));

  const adoptedRows = plantId
    ? await tx
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
        )
    : [];
  const adopted = new Set(
    adoptedRows.map((r) =>
      r.indicatorCode ? `sys:${r.indicatorCode}` : `usr:${r.userIndicatorId}`,
    ),
  );

  const readingRefs = await tx
    .selectDistinct({ id: assessmentReadings.userIndicatorId })
    .from(assessmentReadings)
    .where(and(eq(assessmentReadings.ownerId, userId), isNotNull(assessmentReadings.userIndicatorId)));
  const problemRefs = await tx
    .selectDistinct({ id: problems.userIndicatorId })
    .from(problems)
    .where(and(eq(problems.ownerId, userId), isNotNull(problems.userIndicatorId)));
  const usedUserIds = new Set([...readingRefs, ...problemRefs].map((r) => r.id));

  const limitsBy = new Map<string, LimitsRow>();
  for (const r of limitRows) {
    limitsBy.set(r.indicatorCode ? `sys:${r.indicatorCode}` : `usr:${r.userIndicatorId}`, r);
  }

  const toDto = (
    ref: string,
    base: Omit<IndicatorDto, "ref" | "limits" | "limitsDraft" | "limitsNone" | "adopted">,
  ): IndicatorDto => {
    const row = limitsBy.get(ref);
    const draft = row ? rowToLimits(row) : null;
    return {
      ref,
      ...base,
      limits: row && !row.none ? draft : null,
      limitsDraft: draft,
      limitsNone: row?.none ?? false,
      adopted: adopted.has(ref),
    };
  };

  const list: IndicatorDto[] = [
    ...sysIndicators.map((i) =>
      toDto(`sys:${i.code}`, {
        code: i.code,
        nameAr: i.nameAr,
        nameEn: i.nameEn,
        description: null,
        groupKey: `sys:${i.groupCode}`,
        isSystem: true,
        method: i.method,
        unit: i.unit,
        better: i.better,
        inputLabels: i.inputLabels,
        used: false,
      }),
    ),
    ...usrIndicators.map((i) =>
      toDto(`usr:${i.id}`, {
        code: null,
        nameAr: i.nameAr,
        nameEn: i.nameEn,
        description: i.description,
        groupKey: i.groupCode ? `sys:${i.groupCode}` : `usr:${i.userGroupId}`,
        isSystem: false,
        method: i.method,
        unit: i.unit,
        better: i.better,
        inputLabels: i.inputLabels,
        used: usedUserIds.has(i.id),
      }),
    ),
  ];

  const counts = new Map<string, number>();
  for (const i of list) counts.set(i.groupKey, (counts.get(i.groupKey) ?? 0) + 1);
  const groups: IndicatorGroupDto[] = [
    ...sysGroups.map((g) => ({
      key: `sys:${g.code}`,
      nameAr: g.nameAr,
      nameEn: g.nameEn,
      isSystem: true,
      count: counts.get(`sys:${g.code}`) ?? 0,
    })),
    ...usrGroups.map((g) => ({
      key: `usr:${g.id}`,
      nameAr: g.nameAr,
      nameEn: g.nameEn,
      isSystem: false,
      count: counts.get(`usr:${g.id}`) ?? 0,
    })),
  ];
  return { groups, indicators: list };
}

// --- helpers --------------------------------------------------------------------------------

/** The method of an indicator the user may see, or null if it does not exist for them. */
async function findIndicator(
  tx: UserTx,
  userId: string,
  ref: IndicatorRef,
): Promise<{ method: Method; better: Better; isSystem: boolean } | null> {
  if (ref.kind === "sys") {
    const [r] = await tx
      .select({ method: indicators.method, better: indicators.better })
      .from(indicators)
      .where(eq(indicators.code, ref.code));
    return r ? { ...r, isSystem: true } : null;
  }
  const [r] = await tx
    .select({ method: userIndicators.method, better: userIndicators.better })
    .from(userIndicators)
    .where(and(eq(userIndicators.id, ref.id), eq(userIndicators.ownerId, userId)));
  return r ? { ...r, isSystem: false } : null;
}

async function isUsed(tx: UserTx, userId: string, id: string): Promise<boolean> {
  const [reading] = await tx
    .select({ id: assessmentReadings.id })
    .from(assessmentReadings)
    .where(and(eq(assessmentReadings.ownerId, userId), eq(assessmentReadings.userIndicatorId, id)))
    .limit(1);
  if (reading) return true;
  const [problem] = await tx
    .select({ id: problems.id })
    .from(problems)
    .where(and(eq(problems.ownerId, userId), eq(problems.userIndicatorId, id)))
    .limit(1);
  return Boolean(problem);
}

// --- adoption -------------------------------------------------------------------------------

export async function setAdoption(
  tx: UserTx,
  userId: string,
  plantId: string,
  ref: IndicatorRef,
  adopted: boolean,
): Promise<ActionResult> {
  const [plant] = await tx
    .select({ id: plants.id })
    .from(plants)
    .where(and(eq(plants.id, plantId), eq(plants.ownerId, userId)));
  if (!plant) return fail("plantNotFound");
  if (!(await findIndicator(tx, userId, ref))) return fail("notFound");

  const cols = refColumns(ref);
  await tx
    .insert(plantIndicators)
    .values({ ownerId: userId, plantId, ...cols, adopted })
    .onConflictDoUpdate(
      ref.kind === "sys"
        ? {
            target: [plantIndicators.plantId, plantIndicators.indicatorCode],
            targetWhere: isNotNull(plantIndicators.indicatorCode),
            set: { adopted },
          }
        : {
            target: [plantIndicators.plantId, plantIndicators.userIndicatorId],
            targetWhere: isNotNull(plantIndicators.userIndicatorId),
            set: { adopted },
          },
    );
  return { ok: true };
}

// --- limits ---------------------------------------------------------------------------------

export async function saveLimits(
  tx: UserTx,
  userId: string,
  ref: IndicatorRef,
  input: { none: true } | { none: false; limits: Limits },
): Promise<ActionResult> {
  const ind = await findIndicator(tx, userId, ref);
  if (!ind) return fail("notFound");

  const cols = refColumns(ref);
  const target =
    ref.kind === "sys"
      ? {
          target: [indicatorLimits.ownerId, indicatorLimits.indicatorCode],
          targetWhere: isNotNull(indicatorLimits.indicatorCode),
        }
      : {
          target: [indicatorLimits.ownerId, indicatorLimits.userIndicatorId],
          targetWhere: isNotNull(indicatorLimits.userIndicatorId),
        };

  if (input.none) {
    const kind: LimitKind = ind.better;
    await tx
      .insert(indicatorLimits)
      .values({ ownerId: userId, ...cols, kind, none: true })
      .onConflictDoUpdate({ ...target, set: { none: true, updatedAt: new Date() } });
    return { ok: true };
  }

  // Never trust the client: re-check shape, ordering and the percent bound here.
  const parsed = limitsSchema.safeParse(input.limits);
  const code: LimitsErrorCode | null = parsed.success ? checkLimits(parsed.data, ind.method) : "notNumber";
  if (!parsed.success || code) return fail("validation", { limits: code ?? "notNumber" });

  const l = parsed.data;
  const values =
    l.kind === "range"
      ? {
          kind: l.kind,
          target: null,
          warning: null,
          critical: null,
          minOk: l.minOk,
          maxOk: l.maxOk,
          critMin: l.critMin,
          critMax: l.critMax,
        }
      : {
          kind: l.kind,
          target: l.target,
          warning: l.warning,
          critical: l.critical,
          minOk: null,
          maxOk: null,
          critMin: null,
          critMax: null,
        };
  await tx
    .insert(indicatorLimits)
    .values({ ownerId: userId, ...cols, ...values, none: false })
    .onConflictDoUpdate({ ...target, set: { ...values, none: false, updatedAt: new Date() } });
  return { ok: true };
}

// --- user indicators ------------------------------------------------------------------------

async function resolveGroup(
  tx: UserTx,
  userId: string,
  group: IndicatorFormData["group"],
): Promise<{ groupCode: string; userGroupId: null } | { groupCode: null; userGroupId: string } | null> {
  if (group.kind === "new") {
    const [g] = await tx
      .insert(userIndicatorGroups)
      .values({ ownerId: userId, nameAr: group.nameAr, nameEn: group.nameEn })
      .returning({ id: userIndicatorGroups.id });
    return { groupCode: null, userGroupId: g.id };
  }
  const key: GroupKey = group.key;
  if (key.kind === "sys") {
    const [g] = await tx
      .select({ code: indicatorGroups.code })
      .from(indicatorGroups)
      .where(eq(indicatorGroups.code, key.code));
    return g ? { groupCode: g.code, userGroupId: null } : null;
  }
  const [g] = await tx
    .select({ id: userIndicatorGroups.id })
    .from(userIndicatorGroups)
    .where(and(eq(userIndicatorGroups.id, key.id), eq(userIndicatorGroups.ownerId, userId)));
  return g ? { groupCode: null, userGroupId: g.id } : null;
}

export async function createUserIndicator(
  tx: UserTx,
  userId: string,
  data: IndicatorFormData,
): Promise<ActionResult<{ ref: string; id: string; groupKey: string }>> {
  const group = await resolveGroup(tx, userId, data.group);
  if (!group) return fail("validation", { group: "groupInvalid" });

  const [created] = await tx
    .insert(userIndicators)
    .values({
      ownerId: userId,
      ...group,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      description: data.description,
      method: data.method,
      unit: data.unit,
      better: data.better,
      inputLabels: data.inputLabels,
      adoptAllPlants: data.adoptAll,
    })
    .returning({ id: userIndicators.id });

  // A user-defined indicator starts with "no approved limits".
  await tx
    .insert(indicatorLimits)
    .values({ ownerId: userId, userIndicatorId: created.id, kind: data.better, none: true });

  if (data.adoptAll) {
    const myPlants = await tx
      .select({ id: plants.id })
      .from(plants)
      .where(eq(plants.ownerId, userId));
    if (myPlants.length) {
      await tx.insert(plantIndicators).values(
        myPlants.map((p) => ({
          ownerId: userId,
          plantId: p.id,
          userIndicatorId: created.id,
          adopted: true,
        })),
      );
    }
  }
  const groupKey = formatGroupKey(
    group.groupCode !== null
      ? { kind: "sys", code: group.groupCode }
      : { kind: "usr", id: group.userGroupId },
  );
  return {
    ok: true,
    data: { id: created.id, ref: formatRef({ kind: "usr", id: created.id }), groupKey },
  };
}

export async function updateUserIndicator(
  tx: UserTx,
  userId: string,
  id: string,
  data: IndicatorFormData,
): Promise<ActionResult> {
  const [current] = await tx
    .select()
    .from(userIndicators)
    .where(and(eq(userIndicators.id, id), eq(userIndicators.ownerId, userId)));
  if (!current) return fail("notFound");

  const methodChanged = current.method !== data.method;
  if (methodChanged && (await isUsed(tx, userId, id))) return fail("methodLocked");

  const group = await resolveGroup(tx, userId, data.group);
  if (!group) return fail("validation", { group: "groupInvalid" });

  await tx
    .update(userIndicators)
    .set({
      ...group,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      description: data.description,
      method: data.method,
      unit: data.unit,
      better: data.better,
      inputLabels: data.inputLabels,
    })
    .where(and(eq(userIndicators.id, id), eq(userIndicators.ownerId, userId)));

  if (methodChanged) {
    // Limits that no longer fit the new method (e.g. > 100 for a percentage) are dropped.
    const [row] = await tx
      .select()
      .from(indicatorLimits)
      .where(and(eq(indicatorLimits.ownerId, userId), eq(indicatorLimits.userIndicatorId, id)));
    const l = row && !row.none ? rowToLimits(row) : null;
    if (row && !row.none && (!l || checkLimits(l, data.method))) {
      await tx
        .update(indicatorLimits)
        .set({ none: true, updatedAt: new Date() })
        .where(eq(indicatorLimits.id, row.id));
    }
  }
  return { ok: true };
}

export async function deleteUserIndicator(
  tx: UserTx,
  userId: string,
  id: string,
): Promise<ActionResult> {
  const [current] = await tx
    .select({ id: userIndicators.id })
    .from(userIndicators)
    .where(and(eq(userIndicators.id, id), eq(userIndicators.ownerId, userId)));
  if (!current) return fail("notFound");
  if (await isUsed(tx, userId, id)) return fail("inUse");
  try {
    // Savepoint: a refused delete must not poison the surrounding transaction.
    await tx.transaction(async (sp) => {
      await sp
        .delete(userIndicators)
        .where(and(eq(userIndicators.id, id), eq(userIndicators.ownerId, userId)));
    });
  } catch (e) {
    if (pgCode(e) === "23503") return fail("inUse");
    throw e;
  }
  return { ok: true };
}

// --- groups ----------------------------------------------------------------------------------

export async function createGroup(
  tx: UserTx,
  userId: string,
  input: { nameAr: string; nameEn: string | null },
): Promise<ActionResult<{ key: string }>> {
  const [g] = await tx
    .insert(userIndicatorGroups)
    .values({ ownerId: userId, nameAr: input.nameAr, nameEn: input.nameEn })
    .returning({ id: userIndicatorGroups.id });
  return { ok: true, data: { key: formatGroupKey({ kind: "usr", id: g.id }) } };
}

export async function renameGroup(
  tx: UserTx,
  userId: string,
  id: string,
  input: { nameAr: string; nameEn: string | null },
): Promise<ActionResult> {
  const rows = await tx
    .update(userIndicatorGroups)
    .set({ nameAr: input.nameAr, nameEn: input.nameEn })
    .where(and(eq(userIndicatorGroups.id, id), eq(userIndicatorGroups.ownerId, userId)))
    .returning({ id: userIndicatorGroups.id });
  return rows.length ? { ok: true } : fail("notFound");
}

export async function deleteGroup(tx: UserTx, userId: string, id: string): Promise<ActionResult> {
  const [g] = await tx
    .select({ id: userIndicatorGroups.id })
    .from(userIndicatorGroups)
    .where(and(eq(userIndicatorGroups.id, id), eq(userIndicatorGroups.ownerId, userId)));
  if (!g) return fail("notFound");
  const [member] = await tx
    .select({ id: userIndicators.id })
    .from(userIndicators)
    .where(and(eq(userIndicators.ownerId, userId), eq(userIndicators.userGroupId, id)))
    .limit(1);
  if (member) return fail("hasIndicators");
  try {
    await tx.transaction(async (sp) => {
      await sp
        .delete(userIndicatorGroups)
        .where(and(eq(userIndicatorGroups.id, id), eq(userIndicatorGroups.ownerId, userId)));
    });
  } catch (e) {
    if (pgCode(e) === "23503") return fail("hasIndicators");
    throw e;
  }
  return { ok: true };
}
