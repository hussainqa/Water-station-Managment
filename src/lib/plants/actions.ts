"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import * as z from "zod";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/auth/session";
import { PLANT_COOKIE } from "@/lib/context/filters-schema";
import { createPlant, deletePlant, updatePlant } from "./service";
import { validatePlant, type PlantFieldErrors } from "./schemas";

export type PlantActionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: "validation" | "notFound" | "hasAssessments" | "generic";
      fieldErrors?: PlantFieldErrors;
    };

const idSchema = z.uuid();

/** Raw form fields only; the owner is never read from the request. */
function raw(fd: FormData) {
  const s = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    name: s("name"),
    governorate: s("governorate"),
    location: s("location"),
    waterSource: s("waterSource"),
    designCapacity: s("designCapacity"),
    actualCapacity: s("actualCapacity"),
    engineer: s("engineer"),
    notes: s("notes"),
  };
}

function refresh() {
  // The plants list, the dashboard and the top-bar selector all live in the (app) layout.
  revalidatePath("/", "layout");
}

export async function createPlantAction(fd: FormData): Promise<PlantActionResult> {
  const user = await requireUser();
  const v = validatePlant(raw(fd));
  if (!v.ok) return { ok: false, error: "validation", fieldErrors: v.fieldErrors };
  try {
    const plant = await withUser(user.id, (tx) => createPlant(tx, user.id, v.data));
    refresh();
    return { ok: true, id: plant.id };
  } catch {
    return { ok: false, error: "generic" };
  }
}

export async function updatePlantAction(id: string, fd: FormData): Promise<PlantActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "notFound" };
  const v = validatePlant(raw(fd));
  if (!v.ok) return { ok: false, error: "validation", fieldErrors: v.fieldErrors };
  try {
    const row = await withUser(user.id, (tx) => updatePlant(tx, user.id, id, v.data));
    if (!row) return { ok: false, error: "notFound" };
    refresh();
    return { ok: true, id: row.id };
  } catch {
    return { ok: false, error: "generic" };
  }
}

export async function deletePlantAction(id: string): Promise<PlantActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "notFound" };
  try {
    const r = await withUser(user.id, (tx) => deletePlant(tx, user.id, id));
    if (!r.ok) return r;
    // A deleted plant cannot stay selected: fall back to "all plants".
    const jar = await cookies();
    if (jar.get(PLANT_COOKIE)?.value === id) jar.delete(PLANT_COOKIE);
    refresh();
    return { ok: true, id };
  } catch {
    return { ok: false, error: "generic" };
  }
}
