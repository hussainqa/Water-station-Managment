import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ResultsView } from "@/components/assessments/results/results-view";
import { withUser } from "@/db/with-user";
import { redirect } from "@/i18n/navigation";
import { idSchema } from "@/lib/assessments/schemas";
import { getAssessmentResults } from "@/lib/assessments/service";
import { requireUser } from "@/lib/auth/session";
import { problemStagesForAssessment } from "@/lib/problems/service";

export default async function Page({ params }: PageProps<"/[locale]/assessments/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) notFound();

  const [res, stages] = await withUser(user.id, async (tx) => {
    const r = await getAssessmentResults(tx, user.id, id);
    const st = r.ok ? await problemStagesForAssessment(tx, user.id, id) : {};
    return [r, st] as const;
  });
  if (!res.ok) {
    // a draft has no results yet: continue it in the wizard
    if (res.error === "notApproved") redirect({ href: `/assessments/new?draft=${id}`, locale });
    notFound();
  }
  return <ResultsView results={res.data} stages={stages} />;
}
