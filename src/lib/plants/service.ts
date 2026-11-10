import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import type { UserTx } from "@/db/with-user";
import { assessments, plantIndicators, plants, userIndicators } from "@/db/schema/app";
import { indicators } from "@/db/schema/reference";
import type { PlantInput } from "./schemas";

/**
 * Pure data functions for plants. Each takes the `tx` handed out by withUser()
 * (so row-level security applies) and the verified owner id. The owner id comes
 * from the session in the server actions, never from the client.
 */

export type PlantRow = typeof plants.$inferSelect;

export type PlantListItem = PlantRow & {
  /** every assessment of the plant, drafts included */
  assessmentCount: number;
};

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: "notFound" | "hasAssessments" };

const FK_VIOLATION = "23503";

function pgCode(e: unknown): string | undefined {
  // Drizzle wraps driver errors; the Postgres code is on the error or its cause.
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code ?? err?.cause?.code;
}

export async function listPlants(tx: UserTx): Promise<PlantListItem[]> {
  const rows = await tx
    .select({ plant: plants, assessmentCount: count(assessments.id) })
    .from(plants)
    .leftJoin(assessments, eq(assessments.plantId, plants.id))
    .groupBy(plants.id)
    .orderBy(asc(plants.createdAt));
  return rows.map((r) => ({ ...r.plant, assessmentCount: r.assessmentCount }));
}

export async function getPlant(tx: UserTx, id: string): Promise<PlantListItem | null> {
  const rows = await listPlants(tx);
  return rows.find((p) => p.id === id) ?? null;
}

/**
 * Creates the plant and, in the same transaction, adopts every system indicator
 * plus every user-defined indicator of this owner with adopt_all_plants = true.
 */
export async function createPlant(
  tx: UserTx,
  ownerId: string,
  input: PlantInput,
): Promise<PlantRow> {
  const [plant] = await tx
    .insert(plants)
    .values({
      ownerId,
      name: input.name,
      governorate: input.governorate,
      location: input.location,
      waterSource: input.waterSource,
      designCapacity: input.designCapacity,
      actualCapacity: input.actualCapacity,
      engineer: input.engineer,
      notes: input.notes,
    })
    .returning();

  const system = await tx.select({ code: indicators.code }).from(indicators);
  const own = await tx
    .select({ id: userIndicators.id })
    .from(userIndicators)
    .where(and(eq(userIndicators.ownerId, ownerId), eq(userIndicators.adoptAllPlants, true)));

  const rows = [
    ...system.map((i) => ({
      ownerId,
      plantId: plant.id,
      indicatorCode: i.code,
      adopted: true,
    })),
    ...own.map((i) => ({
      ownerId,
      plantId: plant.id,
      userIndicatorId: i.id,
      adopted: true,
    })),
  ];
  if (rows.length > 0) await tx.insert(plantIndicators).values(rows);
  return plant;
}

/** Editing is always allowed. Returns null when the plant is not the owner's. */
export async function updatePlant(
  tx: UserTx,
  ownerId: string,
  id: string,
  input: PlantInput,
): Promise<PlantRow | null> {
  const [row] = await tx
    .update(plants)
    .set({
      name: input.name,
      governorate: input.governorate,
      location: input.location,
      waterSource: input.waterSource,
      designCapacity: input.designCapacity,
      actualCapacity: input.actualCapacity,
      engineer: input.engineer,
      notes: input.notes,
    })
    .where(and(eq(plants.id, id), eq(plants.ownerId, ownerId)))
    .returning();
  return row ?? null;
}

/**
 * Deletes a plant that has no assessments (drafts count). The database refuses
 * as well (assessments -> plants does not cascade); that error maps to the same result.
 */
export async function deletePlant(
  tx: UserTx,
  ownerId: string,
  id: string,
): Promise<DeleteResult> {
  const [owned] = await tx
    .select({ id: plants.id })
    .from(plants)
    .where(and(eq(plants.id, id), eq(plants.ownerId, ownerId)));
  if (!owned) return { ok: false, error: "notFound" };

  const [{ n }] = await tx
    .select({ n: count() })
    .from(assessments)
    .where(and(eq(assessments.plantId, id), eq(assessments.ownerId, ownerId)));
  if (n > 0) return { ok: false, error: "hasAssessments" };

  try {
    // savepoint: a refused delete must not abort the surrounding transaction
    await tx.transaction(async (sp) => {
      await sp.delete(plants).where(and(eq(plants.id, id), eq(plants.ownerId, ownerId)));
    });
  } catch (e) {
    if (pgCode(e) === FK_VIOLATION) return { ok: false, error: "hasAssessments" };
    throw e;
  }
  return { ok: true };
}
