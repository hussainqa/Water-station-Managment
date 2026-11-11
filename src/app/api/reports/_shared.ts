import { auth } from "@/lib/auth";
import { parseReportQuery } from "@/lib/reports/params";
import { generateReport } from "@/lib/reports/generate";

export const NO_STORE = "private, no-store";

export const json = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "Cache-Control": NO_STORE } });

/** Session + query validation + loading + rendering, shared by the PDF and the HTML route. */
export async function load(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { error: json(401, "unauthorized") } as const;
  const parsed = parseReportQuery(new URL(request.url).searchParams);
  if (!parsed.success) return { error: json(400, "badRequest") } as const;
  const user = session.user as { id: string; name: string; jobTitle?: string | null };
  const report = await generateReport(user, parsed.data);
  if (!report.ok) return { error: json(report.error === "noData" ? 404 : 404, report.error) } as const;
  return { report, query: parsed.data } as const;
}
