import type { Limits, PeriodMonths, Status } from "@/lib/evaluation";
import type { LimitCrossed, ProblemStage } from "./stage";
import type { ObstacleTarget } from "./schemas";

/**
 * Plain, serialisable shapes the problem screens consume (no Date objects).
 * NOTHING here carries RII, correlation, priority % or an importance order (client notes
 * 12, 13, 15). The only ordering figure shown is `rank`, and only for actions linked to a
 * system obstacle. Actions listed for an unlisted obstacle or for an obstacle without links
 * come already ordered and have NO rank.
 */

export type { ObstacleTarget, BlockingAction } from "./schemas";
export type { LimitCrossed, ProblemStage, Classification } from "./stage";

/** "O-36" for a system obstacle, "custom:<uuid>" for an unlisted one. Handy as a React key. */
export type ObstacleKey = string;

// --- reference catalog ----------------------------------------------------------------------

export type CatalogObstacle = {
  code: string;
  axisIdx: number;
  /** numbered from 1 inside each axis */
  seqInAxis: number;
  textAr: string;
  textEn: string;
};
export type CatalogObstacleAxis = {
  idx: number;
  nameAr: string;
  nameEn: string;
  obstacles: CatalogObstacle[];
};
export type CatalogAction = {
  code: string;
  axisIdx: number;
  seqInAxis: number;
  textAr: string;
  textEn: string;
};
export type CatalogActionAxis = {
  idx: number;
  nameAr: string;
  nameEn: string;
  actions: CatalogAction[];
};
/** Pure reference data, identical for every user: safe to cache. */
export type ReferenceCatalog = {
  obstacleAxes: CatalogObstacleAxis[];
  actionAxes: CatalogActionAxis[];
};

// --- shared pieces --------------------------------------------------------------------------

export type IndicatorInfo = {
  /** "sys:SC-01" or "usr:<uuid>" */
  ref: string;
  /** system code, null for a user-defined indicator */
  code: string | null;
  nameAr: string;
  nameEn: string | null;
  unit: string;
};

export type ProblemOrigin = "auto" | "manual";

/** Where an action stands for this problem. `suggested` = no flag set. */
export type ActionState = {
  chosen: boolean;
  needsStudy: boolean;
  /** 'YYYY-MM-DD'; only ever set while chosen */
  implementedOn: string | null;
  /** the selected obstacle it was chosen under; null when chosen with none */
  linkedObstacle: ObstacleTarget | null;
};

export type ActionTexts = { actionCode: string; textAr: string; textEn: string };

/** An action linked to a system obstacle: carries its rank for that obstacle. */
export type RankedAction = ActionTexts & ActionState & { rank: number };
/** An action without a rank (axis fallback, unlisted obstacle, "show all"). */
export type PlainAction = ActionTexts & ActionState;

// --- the problem page -----------------------------------------------------------------------

export type ProblemHeader = {
  id: string;
  plantId: string;
  plantName: string;
  indicator: IndicatorInfo;
  assessmentId: string;
  /** 'YYYY-MM' */
  periodStart: string;
  months: PeriodMonths;
  /** 'YYYY-MM-DD' */
  detectedOn: string;
  value: number | null;
  /** the reading's status at approval (warning or critical for a problem) */
  readingStatus: Status | null;
  /** the limits SNAPSHOT of the assessment (never the current limits) */
  limits: Limits | null;
  /** the limit the value crossed, from the snapshot */
  limitCrossed: LimitCrossed | null;
  origin: ProblemOrigin;
  description: string;
  createdAt: string;
};

export type SelectedObstacle =
  | {
      kind: "system";
      key: ObstacleKey;
      code: string;
      axisIdx: number;
      seqInAxis: number;
      textAr: string;
      textEn: string;
      classification: "confirmed" | "possible";
      note: string;
    }
  | {
      kind: "custom";
      key: ObstacleKey;
      id: string;
      name: string;
      description: string;
      rationale: string;
      classification: "confirmed" | "possible";
      note: string;
    };

/**
 * Suggestions for ONE selected obstacle.
 *  - system obstacle with links: `linked` (by rank), the rest empty
 *  - system obstacle without links (O-02, O-10, O-12, O-39): `linked: []`, `axisActions`
 *    = all actions of the action axis with the same index, source order
 *  - unlisted obstacle: `allActions` = all 65 actions in the research order, no rank
 */
export type SuggestionGroup = {
  obstacle: SelectedObstacle;
  linked: RankedAction[];
  axisActions: PlainAction[];
  allActions: PlainAction[];
};

export type ChosenAction =
  | (ActionTexts &
      ActionState & {
        kind: "system";
        /** rank under its linked system obstacle, when that link exists */
        rank: number | null;
      })
  | {
      kind: "custom";
      customActionId: string;
      name: string;
      chosen: true;
      needsStudy: boolean;
      implementedOn: string | null;
      linkedObstacle: ObstacleTarget | null;
    };

export type CustomActionDto = {
  id: string;
  name: string;
  description: string;
  rationale: string;
  linkedObstacle: ObstacleTarget | null;
  chosen: boolean;
  needsStudy: boolean;
  implementedOn: string | null;
};

export type ProblemAuditEntry = {
  id: string;
  /** one of PROBLEM_AUDIT_ACTIONS or 'opened'; the UI translates the code */
  action: string;
  actor: string;
  payload: Record<string, unknown>;
  /** ISO timestamp */
  at: string;
};

export type ProblemDto = {
  header: ProblemHeader;
  stage: ProblemStage;
  open: boolean;
  /** the "keep the obstacle only" flag (status uses it only while no action is chosen) */
  obstacleOnly: boolean;
  /** in suggestion order: confirmed first, then possible; axis order; unlisted after system */
  obstacles: SelectedObstacle[];
  /** one group per selected obstacle, same order as `obstacles` */
  suggestions: SuggestionGroup[];
  chosenActions: ChosenAction[];
  customActions: CustomActionDto[];
  /** newest first */
  audit: ProblemAuditEntry[];
};

/** "Show all corrective actions": all 65 grouped by action axis in source order. */
export type AllActionEntry = PlainAction & {
  seqInAxis: number;
  /** selected system obstacles this action is linked to, with its rank for each (suggestion order) */
  linkedTo: { obstacleCode: string; rank: number }[];
};
export type AllActionsDto = {
  problemId: string;
  axes: { idx: number; nameAr: string; nameEn: string; actions: AllActionEntry[] }[];
};

/** Returned by every write: the new derived stage (to update the badge) and whether it moved. */
export type MutationData = {
  stage: ProblemStage;
  open: boolean;
  previousStage: ProblemStage;
  stageChanged: boolean;
};

// --- lists ----------------------------------------------------------------------------------

export type ProblemListItem = {
  id: string;
  plantId: string;
  plantName: string;
  indicator: IndicatorInfo;
  assessmentId: string;
  /** 'YYYY-MM' */
  periodStart: string;
  months: PeriodMonths;
  detectedOn: string;
  value: number | null;
  readingStatus: Status | null;
  origin: ProblemOrigin;
  stage: ProblemStage;
  open: boolean;
  obstacleCount: number;
  chosenActionCount: number;
  implementedActionCount: number;
  createdAt: string;
};

export type ActionLogObstacle =
  | { kind: "system"; code: string; textAr: string; textEn: string }
  | { kind: "custom"; id: string; name: string };

type ActionLogBase = {
  /** stable key: "<problemId>:<actionCode>" or "<problemId>:custom:<id>" */
  key: string;
  problemId: string;
  problemStage: ProblemStage;
  plantId: string;
  plantName: string;
  indicator: IndicatorInfo;
  /** 'YYYY-MM' */
  periodStart: string;
  months: PeriodMonths;
  detectedOn: string;
  chosen: boolean;
  needsStudy: boolean;
  implementedOn: string | null;
  linkedObstacle: ActionLogObstacle | null;
  /** ISO time of the last audited change of this action (problem creation when none) */
  lastActivityAt: string;
};

export type ActionLogEntry =
  | (ActionLogBase & ActionTexts & { kind: "system"; rank: number | null })
  | (ActionLogBase & { kind: "custom"; customActionId: string; name: string; description: string });

export type ProblemStageMap = Record<string, { problemId: string; stage: ProblemStage }>;

// --- audit vocabulary -----------------------------------------------------------------------

type ObstacleAudit = { obstacleCode: string | null; customObstacleId: string | null };
type ActionAudit = { actionCode: string | null; customActionId: string | null };
type Change = { from: string; to: string };

/**
 * Codes (entity 'problem', entityId = the problem id) and the shape of their payload. The
 * UI maps code -> sentence. 'opened' is written by the assessments service
 * ({ origin, assessmentId, ref }). Payloads carry codes, ids and before/after values only.
 */
export type ProblemAuditPayloads = {
  description_changed: Change;
  obstacle_selected: ObstacleAudit & { classification: string; note: string };
  obstacle_classification_changed: ObstacleAudit & Change;
  obstacle_note_changed: ObstacleAudit & Change;
  obstacle_removed: ObstacleAudit & { classification: string; note: string };
  custom_obstacle_added: { customObstacleId: string; name: string; classification: string };
  custom_obstacle_edited: {
    customObstacleId: string;
    changes: Partial<Record<"name" | "description" | "rationale", Change>>;
  };
  custom_obstacle_deleted: {
    customObstacleId: string;
    name: string;
    classification: string;
    /** case-specific actions that were linked to it and are now unlinked */
    unlinkedCustomActionIds: string[];
  };
  action_chosen: ActionAudit & {
    linkedObstacleCode: string | null;
    linkedCustomObstacleId: string | null;
  };
  action_unchosen: ActionAudit & { implementedOn: string | null };
  action_needs_study_set: ActionAudit;
  action_needs_study_cleared: ActionAudit;
  action_implemented: ActionAudit & { implementedOn: string; previous: string | null };
  action_implementation_cleared: ActionAudit & { previous: string };
  custom_action_added: {
    customActionId: string;
    name: string;
    linkedObstacleCode: string | null;
    linkedCustomObstacleId: string | null;
  };
  custom_action_edited: {
    customActionId: string;
    changes: Partial<
      Record<"name" | "description" | "rationale" | "linkedObstacle", { from: string | null; to: string | null }>
    >;
  };
  custom_action_deleted: { customActionId: string; name: string };
  obstacle_only_set: Record<string, never>;
  obstacle_only_cleared: { reason: "manual" | "lastObstacleRemoved" };
  stage_changed: { from: ProblemStage; to: ProblemStage };
};
export type ProblemAuditAction = keyof ProblemAuditPayloads;

export const PROBLEM_AUDIT_ACTIONS: readonly ProblemAuditAction[] = [
  "description_changed",
  "obstacle_selected",
  "obstacle_classification_changed",
  "obstacle_note_changed",
  "obstacle_removed",
  "custom_obstacle_added",
  "custom_obstacle_edited",
  "custom_obstacle_deleted",
  "action_chosen",
  "action_unchosen",
  "action_needs_study_set",
  "action_needs_study_cleared",
  "action_implemented",
  "action_implementation_cleared",
  "custom_action_added",
  "custom_action_edited",
  "custom_action_deleted",
  "obstacle_only_set",
  "obstacle_only_cleared",
  "stage_changed",
];
