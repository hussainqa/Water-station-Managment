"use client";

import { useState } from "react";
import { FileText, Printer, FileDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { periodLabel } from "@/components/assessments/results/helpers";
import type { ReportOptions } from "@/lib/reports/types";
import { ExportDialog } from "./export-dialog";
import { ReportPreview } from "./report-preview";
import { pageQuery, reportQuery, selectionForPlant, type ReportType, type Selection } from "./selection";

const field =
  "min-h-10 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

export function ReportsView({ options, initial }: { options: ReportOptions; initial: Selection | null }) {
  const t = useTranslations("reports");
  const locale = useLocale();
  const [sel, setSel] = useState<Selection | null>(initial);
  const [exportOpen, setExportOpen] = useState(false);
  const [printKey, setPrintKey] = useState(0);

  if (!options.plants.length || !sel) {
    return (
      <>
        <PageHeader title={t("title")} description={t("lead")} />
        <section className="mt-6 rounded-2xl border border-border bg-card shadow-(--shadow-card)">
          <EmptyState
            icon={FileText}
            title={t("empty.noPlants.title")}
            text={t("empty.noPlants.text")}
            action={
              <Link href="/plants" className={buttonVariants()}>
                {t("empty.noPlants.cta")}
              </Link>
            }
          />
        </section>
      </>
    );
  }

  const plant = options.plants.find((p) => p.id === sel.plantId) ?? options.plants[0];
  const update = (next: Selection) => {
    setSel(next);
    window.history.replaceState(null, "", `${window.location.pathname}${pageQuery(next)}`);
  };
  const query = reportQuery(sel, locale);
  const lengthLabel = (m: number) => t(`selectors.lengthOption.${m}` as "selectors.lengthOption.1");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("lead")}
        actions={
          <>
            <Button type="button" disabled={!query} onClick={() => setExportOpen(true)}>
              <FileDown aria-hidden="true" />
              {t("actions.export")}
            </Button>
            <Button type="button" variant="outline" disabled={!query} onClick={() => setPrintKey((k) => k + 1)}>
              <Printer aria-hidden="true" />
              {t("actions.print")}
            </Button>
          </>
        }
      />

      <section className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rep-plant" className="text-[13px] font-medium text-muted-foreground">
              {t("selectors.plant")}
            </label>
            <select
              id="rep-plant"
              className={field}
              value={plant.id}
              onChange={(e) => update(selectionForPlant(options, e.target.value, sel.type))}
            >
              {options.plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rep-type" className="text-[13px] font-medium text-muted-foreground">
              {t("selectors.type")}
            </label>
            <select
              id="rep-type"
              className={field}
              value={sel.type}
              onChange={(e) => update({ ...sel, type: e.target.value as ReportType })}
            >
              <option value="period">{t("selectors.typePeriod")}</option>
              <option value="history">{t("selectors.typeHistory")}</option>
            </select>
          </div>
          {sel.type === "period" ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="rep-assessment" className="text-[13px] font-medium text-muted-foreground">
                {t("selectors.assessment")}
              </label>
              <select
                id="rep-assessment"
                className={field}
                value={sel.assessmentId ?? ""}
                disabled={!plant.assessments.length}
                onChange={(e) => update({ ...sel, assessmentId: e.target.value })}
              >
                {plant.assessments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {periodLabel(a.periodStart, a.months, locale)}
                    {a.months > 1 ? ` (${lengthLabel(a.months)})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="rep-length" className="text-[13px] font-medium text-muted-foreground">
                {t("selectors.length")}
              </label>
              <select
                id="rep-length"
                className={field}
                value={sel.months ?? ""}
                disabled={!plant.lengths.length}
                onChange={(e) => update({ ...sel, months: Number(e.target.value) })}
              >
                {plant.lengths.map((m) => (
                  <option key={m} value={m}>
                    {lengthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="mt-3 text-[12.5px] text-muted-foreground">{t("actions.printHint")}</p>
      </section>

      {query ? (
        <ReportPreview query={query} printKey={printKey} className="mt-6" />
      ) : (
        <section className="mt-6 rounded-2xl border border-border bg-card shadow-(--shadow-card)">
          <EmptyState
            icon={FileText}
            title={t("empty.noAssessments.title")}
            text={t("empty.noAssessments.text")}
            action={
              <Link href="/assessments/new" className={buttonVariants()}>
                {t("empty.noAssessments.cta")}
              </Link>
            }
          />
        </section>
      )}

      {query ? (
        <ExportDialog open={exportOpen} onOpenChange={setExportOpen} queryFor={(lang) => reportQuery(sel, lang) ?? ""} />
      ) : null}
    </>
  );
}
