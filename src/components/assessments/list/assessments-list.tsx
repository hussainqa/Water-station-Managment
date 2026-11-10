import { ClipboardList, Plus, SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AssessmentListItem } from "@/lib/assessments/types";
import { cn } from "cn";
import { AssessmentRow } from "./assessment-row";

type Props = {
  items: AssessmentListItem[];
  /** any assessment at all, ignoring the top-bar filters */
  hasAny: boolean;
  hasPlants: boolean;
};

const btn = "h-11 gap-2 rounded-[13px] px-5 text-[15px]";

export async function AssessmentsList({ items, hasAny, hasPlants }: Props) {
  const t = await getTranslations("assessments.list");
  const newButton = hasPlants ? (
    <Link href="/assessments/new" data-testid="new-assessment" className={cn(buttonVariants(), btn)}>
      <Plus aria-hidden="true" className="size-[18px]" />
      {t("new")}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader title={t("title")} description={t("lead")} actions={newButton} />
      <section className="mt-5">
        {items.length > 0 ? (
          <>
            <p className="m-0 mb-2.5 text-[13px] text-fg-3" data-testid="list-count">
              {t("eyebrow", { count: items.length })}
            </p>
            <ul aria-label={t("listLabel")} className="m-0 flex list-none flex-col gap-2.5 p-0">
              {items.map((i) => (
                <AssessmentRow key={i.id} item={i} />
              ))}
            </ul>
          </>
        ) : (
          <div className="rounded-2xl border border-border bg-card shadow-(--shadow-card)">
            {hasAny ? (
              <EmptyState icon={SearchX} title={t("emptyFiltered.title")} text={t("emptyFiltered.text")} />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title={t("empty.title")}
                text={hasPlants ? t("empty.text") : t("empty.noPlants")}
                action={
                  hasPlants ? (
                    <Link href="/assessments/new" className={cn(buttonVariants(), btn)}>
                      <Plus aria-hidden="true" className="size-[18px]" />
                      {t("empty.cta")}
                    </Link>
                  ) : (
                    <Link href="/plants?new=1" className={cn(buttonVariants(), btn)}>
                      <Plus aria-hidden="true" className="size-[18px]" />
                      {t("empty.addPlant")}
                    </Link>
                  )
                }
              />
            )}
          </div>
        )}
      </section>
    </>
  );
}
