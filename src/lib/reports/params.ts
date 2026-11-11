import { z } from "zod";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const lang = z.enum(["ar", "en"]);

/** Query of /api/reports/pdf and /api/reports/html. */
export const reportQuerySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("period"),
    assessment: uuid,
    lang,
    format: z.enum(["pdf", "html"]).default("pdf"),
  }),
  z.object({
    type: z.literal("history"),
    plant: uuid,
    months: z.coerce.number().int().refine((n) => [1, 3, 6, 9, 12].includes(n)),
    lang,
    format: z.enum(["pdf", "html"]).default("pdf"),
  }),
]);
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export function parseReportQuery(search: URLSearchParams) {
  return reportQuerySchema.safeParse(Object.fromEntries(search.entries()));
}
