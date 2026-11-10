import "server-only";
import { cache } from "react";
import { asc } from "drizzle-orm";
import { withUser } from "@/db/with-user";
import { plants } from "@/db/schema/app";

export type PlantOption = { id: string; name: string };

/** The user's plants for selectors. Cached for the duration of one request. */
export const getPlantOptions = cache(
  async (userId: string): Promise<PlantOption[]> =>
    withUser(userId, (tx) =>
      tx
        .select({ id: plants.id, name: plants.name })
        .from(plants)
        .orderBy(asc(plants.createdAt)),
    ),
);
