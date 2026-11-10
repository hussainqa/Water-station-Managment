import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ResultsView } from "@/components/assessments/results/results-view";
import { withUser } from "@/db/with-user";
import { redirect } from "@/i18n/navigation";
import { idSchema } from "@/lib/assessments/schemas";
import { getAssessmentResults } from "@/lib/assessments/service";
import { requireUser } from "@/lib/auth/session";

export default async function Page({ params }: PageProps<"/[locale]/assessments/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) notFound();

  const res = await withUser(user.id, (tx) => getAssessmentResults(tx, user.id, id));
  if (!res.ok) {
    // a draft has no results yet: continue it in the wizard
    if (res.error === "notApproved") redirect({ href: `/assessments/new?draft=${id}`, locale });
    notFound();
  }
  return <ResultsView results={res.data} />;
}
