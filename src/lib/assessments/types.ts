import type {
  Better,
  ChangeDirection,
  InputErrors,
  InputState,
  Limits,
  Method,
  PeriodMonths,
  Status,
} from "@/lib/evaluation";
import type { LatestAssessmentSummary } from "@/lib/plants/state";
import type { InputDef } from "./inputs";

/** Plain, serialisable shapes the assessment screens consume (no Date objects). */

export type { InputDef } from "./inputs";

export type StatusCounts = Record<Status, number>;

// --- wizard -----------------------------------------------------------------------------

export type WizardIndicator = {
  /** "sys:SC-01" or "usr:<uuid>" */
  ref: string;
  code: string | null;
  nameAr: string;
  nameEn: string | null;
  isSystem: boolean;
  method: Method;
  /** display unit of the value ('%', 'h', 'events', ...) */
  unit: string;
  better: Better;
  /** the input fields of the readings card, in order */
  inputs: InputDef[];
  /** the user's CURRENT limits (display only; approval snapshots them again) */
  limits: Limits | null;
};

export type WizardGroup = {
  /** "sys:continuity" or "usr:<uuid>" */
  key: string;
  nameAr: string;
  nameEn: string | null;
  isSystem: boolean;
  indicators: WizardIndicator[];
};

export type WizardContext = {
  plant: { id: string; name: string };
  /** Only indicators adopted at the plant, grouped, in seed order. Empty groups are left out. */
  groups: WizardGroup[];
};

// --- drafts -----------------------------------------------------------------------------

/**
 * Live evaluation of one reading from its raw inputs, for the wizard only: the server
 * recomputes everything again at approval.
 */
export type ReadingEvaluation = {
  state: InputState;
  errors: InputErrors;
  value: number | null;
  /** against the user's current limits; null while the inputs have errors */
  status: Status | null;
};

export type DraftReading = {
  ref: string;
  inputs: Record<string, string | number | null>;
  note: string;
  evaluation: ReadingEvaluation;
};

export type DraftCompleteness = {
  selected: number;
  complete: number;
  partial: number;
  missing: number;
  error: number;
  /** complete / selected, 0-100 (0 when nothing is selected) */
  percent: number;
};

export type AssessmentHeader = {
  id: string;
  status: "draft" | "approved";
  plantId: string;
  plantName: string;
  /** 'YYYY-MM' */
  periodStart: string;
  months: PeriodMonths;
  /** 'YYYY-MM-DD' */
  startDate: string;
  endDate: string;
  enteredBy: string;
  /** ISO timestamp; null for a draft */
  approvedAt: string | null;
  createdAt: string;
};

export type DraftDto = {
  header: AssessmentHeader;
  selection: string[];
  /** one entry per selected indicator, in seed order */
  readings: DraftReading[];
  completeness: DraftCompleteness;
};

// --- approval ---------------------------------------------------------------------------

export type ApprovalSummary = {
  id: string;
  counts: StatusCounts;
  /** how many indicators had no complete data (acknowledged) */
  missingCount: number;
  /** ids of the problems opened automatically (one per critical indicator) */
  problemIds: string[];
};

// --- lists ------------------------------------------------------------------------------

export type AssessmentListItem = {
  id: string;
  status: "draft" | "approved";
  plantId: string;
  plantName: string;
  periodStart: string;
  months: PeriodMonths;
  startDate: string;
  endDate: string;
  enteredBy: string;
  approvedAt: string | null;
  createdAt: string;
  selectedCount: number;
  /** indicators with a value / selected, 0-100 */
  completeness: number;
  /** null for a draft (status is only decided at approval) */
  counts: StatusCounts | null;
  /** problems of this assessment (a problem has no closed state yet, so all count as open) */
  openProblems: number;
};

export type ListRange = "all" | number;

// --- results ----------------------------------------------------------------------------

export type ResultRow = {
  ref: string;
  code: string | null;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  method: Method;
  better: Better;
  /** labels of the inputs, to show them under the value */
  inputDefs: InputDef[];
  inputs: Record<string, string | number | null>;
  /** stored value (hours for durations); null = insufficient data */
  value: number | null;
  status: Status;
  /** the limits SNAPSHOT of this assessment, never the current ones */
  limits: Limits | null;
  note: string;
  previousValue: number | null;
  previousStatus: Status | null;
  /** null when there is no previous value or no direction to compare */
  change: ChangeDirection | null;
  problemId: string | null;
  /** warning or critical, and no problem yet */
  canOpenManualProblem: boolean;
};

export type ResultGroup = {
  key: string;
  nameAr: string;
  nameEn: string | null;
  isSystem: boolean;
  rows: ResultRow[];
};

export type AuditEntry = {
  id: string;
  entity: string;
  /** one of AUDIT_ACTIONS; the UI translates the code */
  action: string;
  actor: string;
  payload: Record<string, unknown>;
  /** ISO timestamp */
  at: string;
};

export type AssessmentResults = {
  header: AssessmentHeader;
  completeness: { percent: number; withValue: number; total: number };
  counts: StatusCounts;
  previous: { id: string; periodStart: string; months: PeriodMonths } | null;
  groups: ResultGroup[];
  /** newest first */
  audit: AuditEntry[];
};

export type HistoryPoint = {
  assessmentId: string;
  periodStart: string;
  months: PeriodMonths;
  endDate: string;
  value: number | null;
  status: Status | null;
  /** snapshot limits of THAT assessment */
  limits: Limits | null;
};

// --- plants / dashboard -----------------------------------------------------------------

export type PlantPerformance = {
  plantId: string;
  /** feed for plantState(); null = no approved assessment */
  summary: LatestAssessmentSummary;
  latest: {
    assessmentId: string;
    periodStart: string;
    months: PeriodMonths;
    counts: StatusCounts;
  } | null;
  approvedCount: number;
  draftCount: number;
  /** share (0-100) of evaluated indicators within limits, last <= 6 approved, oldest to newest */
  series: number[];
};

// --- audit vocabulary -------------------------------------------------------------------

/** Codes (entity 'assessment') and the shape of their payload. The UI maps code -> sentence. */
export type AuditPayloads = {
  draft_created: { plantId: string; periodStart: string; months: number };
  draft_deleted: { plantId: string; periodStart: string; months: number };
  readings_entered: { count: number; enteredBy: string };
  missing_data_acknowledged: { count: number };
  approved: {
    indicators: number;
    ok: number;
    warning: number;
    critical: number;
    insufficient_data: number;
    no_limits: number;
    problems: number;
  };
  note_changed: { ref: string; from: string; to: string };
  problem_opened_auto: { ref: string; problemId: string; value: number | null };
  problem_opened_manual: {
    ref: string;
    problemId: string;
    value: number | null;
    status: Status;
  };
};
export type AuditAction = keyof AuditPayloads;

export const AUDIT_ACTIONS: readonly AuditAction[] = [
  "draft_created",
  "draft_deleted",
  "readings_entered",
  "missing_data_acknowledged",
  "approved",
  "note_changed",
  "problem_opened_auto",
  "problem_opened_manual",
];
