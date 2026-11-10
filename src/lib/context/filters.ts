import "server-only";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import {
  PLANT_COOKIE,
  RANGE_COOKIE,
  parsePlantId,
  parseRange,
  type Filters,
} from "./filters-schema";
import { getPlantOptions } from "./plants";

export type { Filters, Range } from "./filters-schema";

/**
 * The plant and monitoring-period selection of the signed-in user, from the
 * `wtp_plant` / `wtp_range` cookies. Unknown or tampered values fall back to
 * "all plants" and the default period. The `setFilters` action is in ./actions.
 */
export async function getFilters(): Promise<Filters> {
  const user = await requireUser();
  const jar = await cookies();
  const options = await getPlantOptions(user.id);
  return {
    plantId: parsePlantId(
      jar.get(PLANT_COOKIE)?.value,
      options.map((p) => p.id),
    ),
    range: parseRange(jar.get(RANGE_COOKIE)?.value),
  };
}
