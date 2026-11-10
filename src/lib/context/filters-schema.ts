import { z } from "zod";

/** Cookie names read by server components (see getFilters). */
export const PLANT_COOKIE = "wtp_plant";
export const RANGE_COOKIE = "wtp_range";

export const RANGE_VALUES = [1, 3, 6, 9, 12, "all"] as const;
export type Range = (typeof RANGE_VALUES)[number];
export const DEFAULT_RANGE: Range = 6;

export type Filters = { plantId: string | null; range: Range };

export const rangeSchema = z.union([
  z.literal(1),
  z.literal(3),
  z.literal(6),
  z.literal(9),
  z.literal(12),
  z.literal("all"),
]);

/** Accepts the cookie string ("6", "all") or a number; anything else gives the default. */
export function parseRange(raw: unknown): Range {
  const value =
    typeof raw === "string" && /^\d{1,2}$/.test(raw) ? Number(raw) : raw;
  const parsed = rangeSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_RANGE;
}

/** A plant id is valid only if it is a UUID and one of the user's own plants. */
export function parsePlantId(
  raw: unknown,
  knownIds: readonly string[],
): string | null {
  const parsed = z.uuid().safeParse(raw);
  return parsed.success && knownIds.includes(parsed.data) ? parsed.data : null;
}

/** Input of the setFilters server action. `plantId: null` means "all plants". */
export const setFiltersInputSchema = z.object({
  plantId: z.uuid().nullable().optional(),
  range: rangeSchema.optional(),
});
export type SetFiltersInput = z.infer<typeof setFiltersInputSchema>;
