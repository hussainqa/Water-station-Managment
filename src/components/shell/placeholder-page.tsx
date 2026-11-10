import { Hourglass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

type PageKey =
  | "plants"
  | "indicators"
  | "newAssessment"
  | "assessments"
  | "problems"
  | "actions"
  | "reports";

/** Temporary screen for a section that a later phase builds. */
export async function PlaceholderPage({ page }: { page: PageKey }) {
  const t = await getTranslations("shell");
  return (
    <>
      <PageHeader title={t(`pages.${page}`)} />
      <section className="rounded-2xl border border-border bg-card shadow-(--shadow-card)">
        <EmptyState icon={Hourglass} title={t("unavailable.title")} text={t("unavailable.text")} />
      </section>
    </>
  );
}
