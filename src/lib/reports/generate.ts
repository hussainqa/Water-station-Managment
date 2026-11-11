import { withUser } from "@/db/with-user";
import { dateKeyOf } from "@/lib/assessments/schemas";
import { buildPeriodReport, buildPlantHistoryReport } from "./service";
import { loadDocMessages } from "./messages";
import type { ReportQuery } from "./params";
import { renderReportHtml } from "./render";
import { periodLabel } from "@/components/assessments/results/helpers";
import type { ReportFailure } from "./types";

export type GeneratedReport =
  | { ok: true; html: string; filename: string; asciiFilename: string }
  | ReportFailure;

const unsafe = /[\\/:*?"<>|\r\n\u0000-\u001f‪-‮⁦-⁩]/g;
const clean = (s: string) => s.replace(unsafe, "_").replace(/\s+/g, "_").slice(0, 80);

/** Loads the report through withUser (RLS), renders it in the chosen language. */
export async function generateReport(
  user: { id: string; name: string; jobTitle?: string | null },
  query: ReportQuery,
  now: Date = new Date(),
): Promise<GeneratedReport> {
  const result = await withUser(user.id, (tx) =>
    query.type === "period"
      ? buildPeriodReport(tx, user.id, query.assessment)
      : buildPlantHistoryReport(tx, user.id, { plantId: query.plant, months: query.months }),
  );
  if (!result.ok) return result;
  const data = result.data;
  const html = renderReportHtml(data, {
    locale: query.lang,
    messages: loadDocMessages(query.lang),
    preparedBy: { name: user.name, jobTitle: user.jobTitle ?? "" },
    issuedOn: dateKeyOf(now),
  });
  const L = data.latest;
  const when =
    data.kind === "history"
      ? `${periodLabel(data.periods[0].periodStart, data.periods[0].months, query.lang)}-${periodLabel(L.periodStart, L.months, query.lang)}`
      : periodLabel(L.periodStart, L.months, query.lang);
  const word = query.lang === "ar" ? "تقرير" : "report";
  const filename = `${clean(`${word}_${data.plant.name}_${when}`)}.pdf`;
  const asciiFilename =
    data.kind === "history"
      ? `report-history-${data.months}m-${L.periodStart}.pdf`
      : `report-${L.periodStart}-${L.months}m.pdf`;
  return { ok: true, html, filename, asciiFilename };
}
