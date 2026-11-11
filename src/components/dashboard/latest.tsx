import { ClipboardList, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { AssessmentRow } from "@/components/assessments/list/assessment-row";
import { EmptyState } from "@/components/shell/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AssessmentListItem } from "@/lib/assessments/types";
import { cn } from "cn";

export function LatestAssessments({ items }: { items: AssessmentListItem[] }) {
  const t = useTranslations("dashboard.latest");
  return (
    <section
      data-testid="latest-assessments"
      aria-labelledby="dash-latest-title"
      className="rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) sm:p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="dash-latest-title" className="text-[17px] font-bold">{t("title")}</h2>
          <p className="m-0 mt-0.5 text-[13px] text-fg-3">{t("text")}</p>
        </div>
        {items.length ? (
          <Link href="/assessments" className="text-[13.5px] font-semibold text-primary underline-offset-4 hover:underline">
            {t("all")}
          </Link>
        ) : null}
      </div>
      {items.length ? (
        <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
          {items.map((i) => (
            <AssessmentRow key={i.id} item={i} compact />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title={t("empty.title")}
          text={t("empty.text")}
          className="py-6"
          action={
            <Link
              href="/assessments/new"
              className={cn(buttonVariants({ variant: "secondary" }), "h-10 gap-2 rounded-[11px] px-4 text-[14px]")}
            >
              <Plus aria-hidden="true" className="size-4" />
              {t("empty.cta")}
            </Link>
          }
        />
      )}
    </section>
  );
}
