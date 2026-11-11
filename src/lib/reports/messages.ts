import arReports from "../../../messages/ar/reports.json";
import enReports from "../../../messages/en/reports.json";
import arPlants from "../../../messages/ar/plants.json";
import enPlants from "../../../messages/en/plants.json";
import arProblemsList from "../../../messages/ar/problemsList.json";
import enProblemsList from "../../../messages/en/problemsList.json";

export type ReportLocale = "ar" | "en";
export const REPORT_LOCALES: readonly ReportLocale[] = ["ar", "en"];

/** The `doc` subtree of reports.json plus the plant labels the document needs. */
export type DocMessages = Record<string, unknown>;

/**
 * The messages of the report document in ONE language, independent of the UI locale.
 * Plant governorate and water-source labels come from the plants namespace.
 */
export function loadDocMessages(locale: ReportLocale): DocMessages {
  const reports = locale === "ar" ? arReports : enReports;
  const plants = locale === "ar" ? arPlants : enPlants;
  const list = locale === "ar" ? arProblemsList : enProblemsList;
  return {
    ...reports.doc,
    governorates: plants.governorates,
    sources: plants.sources,
    stage: list.stage,
  };
}
