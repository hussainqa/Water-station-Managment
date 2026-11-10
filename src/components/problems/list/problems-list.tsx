import { CircleCheck, ListChecks, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import type { ProblemListItem } from "@/lib/problems/types";
import { sectionProblems } from "./helpers";
import { ProblemRow } from "./problem-row";

type Props = {
  items: ProblemListItem[];
  /** any problem at all, ignoring the top-bar filters */
  hasAny: boolean;
};

function Section({ id, title, items }: { id: string; title: string; items: ProblemListItem[] }) {
  const t = useTranslations("problemsList.list");
  return (
    <section aria-labelledby={id} data-testid={`${id}`}>
      <h2 id={id} className="mb-2.5 text-[14px] font-semibold text-fg-2">
        {title}
      </h2>
      <ul aria-label={t("listLabel")} className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 xl:grid-cols-2">
        {items.map((i) => (
          <ProblemRow key={i.id} item={i} />
        ))}
      </ul>
    </section>
  );
}

export function ProblemsList({ items, hasAny }: Props) {
  const t = useTranslations("problemsList.list");
  const { open, handled } = sectionProblems(items);
  return (
    <>
      <PageHeader title={t("title")} description={t("lead")} />
      <div className="mt-5 flex flex-col gap-6">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-(--shadow-card)">
            {hasAny ? (
              <EmptyState icon={SearchX} title={t("emptyFiltered.title")} text={t("emptyFiltered.text")} />
            ) : (
              <EmptyState icon={CircleCheck} title={t("empty.title")} text={t("empty.text")} />
            )}
          </div>
        ) : (
          <>
            {open.length ? (
              <Section id="problems-open" title={t("openSection", { count: open.length })} items={open} />
            ) : (
              <div
                data-testid="all-handled"
                className="flex items-center gap-3 rounded-xl bg-ok-soft px-4 py-3 text-[14px] text-ok"
              >
                <ListChecks aria-hidden="true" className="size-5 shrink-0" />
                <p className="m-0">{t("allHandled")}</p>
              </div>
            )}
            {handled.length ? (
              <Section id="problems-handled" title={t("handledSection", { count: handled.length })} items={handled} />
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
