"use server";

import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import {
  PLANT_COOKIE,
  RANGE_COOKIE,
  setFiltersInputSchema,
} from "./filters-schema";
import { getPlantOptions } from "./plants";

const COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
};

/**
 * Saves the plant and/or period selection in cookies. Setting cookies in a
 * server action makes Next re-render the current page with the new values.
 * `plantId: null` selects "all plants".
 */
export async function setFilters(input: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = setFiltersInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { plantId, range } = parsed.data;
  const jar = await cookies();

  if (plantId !== undefined) {
    if (plantId === null) {
      jar.delete(PLANT_COOKIE);
    } else {
      const options = await getPlantOptions(user.id);
      if (!options.some((p) => p.id === plantId)) return { ok: false };
      jar.set(PLANT_COOKIE, plantId, COOKIE_OPTIONS);
    }
  }
  if (range !== undefined) {
    jar.set(RANGE_COOKIE, String(range), COOKIE_OPTIONS);
  }
  return { ok: true };
}
