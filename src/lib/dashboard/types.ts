import type { AssessmentListItem, StatusCounts } from "@/lib/assessments/types";
import type { LimitCrossed, ProblemStage } from "@/lib/problems/stage";
import type { Limits, PeriodMonths } from "@/lib/evaluation";

/** Plain, serialisable shapes of the dashboard (no Date objects). */

export type DashboardRange = "all" | 1 | 3 | 6 | 9 | 12;

export type DashboardOptions = {
  /** null = all of the user's plants */
  plantId: string | null;
  range: DashboardRange;
  now: Date;
};

export type DashboardTiles = {
  /** all the user's plants, or 1 when a plant is selected */
  plants: number;
  /** of those, plants with a latest assessment inside the period */
  plantsAssessed: number;
  /** approved assessments whose period ends inside the selected period */
  assessments: number;
  /** drafts of the selected plants (any period) */
  drafts: number;
  /** status ok, from each plant's latest assessment */
  withinLimits: number;
  /** ok + warning + critical of those same assessments */
  evaluated: number;
  /** alerts: warning + critical readings not yet treated or documented */
  followUp: number;
  followUpCritical: number;
  /** warning + critical readings whose problem is treated or documented */
  handled: number;
  /** open problems (awaiting obstacles / choosing an action); ignores the period */
  openProblems: number;
};

export type PlantBreakdown = {
  plantId: string;
  plantName: string;
  /** null = no approved assessment inside the period */
  latest: {
    assessmentId: string;
    periodStart: string;
    months: PeriodMonths;
    counts: StatusCounts;
    total: number;
  } | null;
};

export type DashboardAlert = {
  plantId: string;
  plantName: string;
  assessmentId: string;
  periodStart: string;
  months: PeriodMonths;
  /** 'YYYY-MM-DD' (Baghdad) the assessment was approved */
  assessedOn: string;
  ref: string;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  value: number | null;
  status: "warning" | "critical";
  /** from the assessment's limits snapshot */
  limits: Limits | null;
  crossed: LimitCrossed | null;
  problem: { id: string; stage: ProblemStage } | null;
};

export type Dashboard = {
  tiles: DashboardTiles;
  /** one entry per selected plant, in plant order */
  breakdown: PlantBreakdown[];
  /** critical first, then warning; then plant, then indicator order */
  alerts: DashboardAlert[];
  /** most recent approved assessments and drafts of the selected plants, at most 6 */
  latest: AssessmentListItem[];
  /** Does the user have any plant at all */
  hasPlants: boolean;
};
