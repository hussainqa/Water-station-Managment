import type { Limits, PeriodMonths, Status } from "@/lib/evaluation";
import type { ChangeDirection } from "@/lib/evaluation";
import type { LimitCrossed, ProblemStage } from "@/lib/problems/stage";
import type { StatusCounts } from "@/lib/assessments/types";

/**
 * Plain, serialisable data of a report. Nothing here carries RII, correlation, priority %,
 * importance order, obstacle codes or action codes (client notes 12, 13, 15): obstacles are
 * identified by axis name + number + text, actions by rank (when linked) + text.
 */

export type ReportKind = "period" | "history";

export type ReportPlant = {
  id: string;
  name: string;
  governorate: string;
  location: string;
  waterSource: string;
  designCapacity: number;
  actualCapacity: number | null;
  engineer: string;
};

export type ReportPeriodInfo = {
  assessmentId: string;
  /** 'YYYY-MM' */
  periodStart: string;
  months: PeriodMonths;
  startDate: string;
  endDate: string;
  enteredBy: string;
  approvedAt: string | null;
  completeness: { percent: number; withValue: number; total: number };
  counts: StatusCounts;
};

export type ReportIndicator = {
  ref: string;
  code: string | null;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  value: number | null;
  status: Status;
  /** the SNAPSHOT limits of the assessment */
  limits: Limits | null;
  note: string;
  previousValue: number | null;
  change: ChangeDirection | null;
};

export type ReportGroup = {
  key: string;
  nameAr: string;
  nameEn: string | null;
  rows: ReportIndicator[];
};

export type TrendPeriod = {
  assessmentId: string;
  periodStart: string;
  months: PeriodMonths;
  counts: StatusCounts;
  /** 0-100: within limits / evaluated against limits; null when nothing was evaluated */
  withinShare: number | null;
  evaluated: number;
};

export type TrendCell = { value: number | null; status: Status | null; limits: Limits | null };

export type TrendRow = {
  ref: string;
  code: string | null;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  /** one cell per period, same order as `periods`; null when the indicator was not part of that assessment */
  cells: (TrendCell | null)[];
};

export type ReportObstacleLabel =
  | {
      kind: "system";
      axisNameAr: string;
      axisNameEn: string;
      seqInAxis: number;
      textAr: string;
      textEn: string;
    }
  | { kind: "custom"; name: string };

export type ReportObstacle = ReportObstacleLabel & {
  classification: "confirmed" | "possible";
  note: string;
};

export type ReportAction =
  | {
      kind: "system";
      /** rank under its linked system obstacle; null when there is none */
      rank: number | null;
      textAr: string;
      textEn: string;
      chosen: boolean;
      needsStudy: boolean;
      implementedOn: string | null;
      linkedObstacle: ReportObstacleLabel | null;
    }
  | {
      kind: "custom";
      name: string;
      chosen: boolean;
      needsStudy: boolean;
      implementedOn: string | null;
      linkedObstacle: ReportObstacleLabel | null;
    };

export type ReportProblem = {
  id: string;
  assessmentId: string;
  indicator: { ref: string; code: string | null; nameAr: string; nameEn: string | null; unit: string };
  periodStart: string;
  months: PeriodMonths;
  detectedOn: string;
  value: number | null;
  readingStatus: Status | null;
  limits: Limits | null;
  limitCrossed: LimitCrossed | null;
  origin: "auto" | "manual";
  description: string;
  stage: ProblemStage;
  obstacles: ReportObstacle[];
  actions: ReportAction[];
};

export type ReportData = {
  kind: ReportKind;
  plant: ReportPlant;
  /** the assessment the sections 2-4 and 9 describe (the latest one for a history report) */
  latest: ReportPeriodInfo;
  groups: ReportGroup[];
  /** periods of the trends section, oldest to newest (one entry for a period report without history) */
  periods: TrendPeriod[];
  trends: TrendRow[];
  /** period length of the trends section */
  months: PeriodMonths;
  problems: ReportProblem[];
};

export type ReportFailure = { ok: false; error: "notFound" | "notApproved" | "noData" };
export type ReportResult<T> = { ok: true; data: T } | ReportFailure;

export type ReportOptions = {
  plants: {
    id: string;
    name: string;
    /** approved assessments, newest first */
    assessments: { id: string; periodStart: string; months: PeriodMonths }[];
    /** distinct period lengths the plant has approved assessments of, ascending */
    lengths: PeriodMonths[];
  }[];
};
