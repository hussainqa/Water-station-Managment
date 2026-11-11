import { setRequestLocale } from "next-intl/server";
import { ReportsView } from "@/components/reports/reports-view";
import { resolveSelection } from "@/components/reports/selection";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/auth/session";
import { getFilters } from "@/lib/context/filters";
import { listProblems } from "@/lib/problems/service";
import { getReportOptions } from "@/lib/reports/service";

export default async function Page({ params, searchParams }: PageProps<"/[locale]/reports">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const [filters, loaded] = await Promise.all([
    getFilters(),
    withUser(user.id, async (tx) => {
      const options = await getReportOptions(tx, user.id);
      // /reports?problem=<id> opens the period report of that problem's assessment
      const problemId = one(sp.problem);
      let assessmentOfProblem: string | undefined;
      if (problemId) {
        const all = await listProblems(tx, user.id, { range: "all", now: new Date() });
        assessmentOfProblem = all.find((p) => p.id === problemId)?.assessmentId;
      }
      return { options, assessmentOfProblem };
    }),
  ]);
  const { options, assessmentOfProblem } = loaded;
  const selection = resolveSelection(
    options,
    { assessment: assessmentOfProblem ?? one(sp.assessment), plant: one(sp.plant), type: one(sp.type), months: one(sp.months) },
    filters.plantId,
  );
  return <ReportsView options={options} initial={selection} />;
}
