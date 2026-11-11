import type { ProblemAuditEntry } from "@/lib/problems/types";

/**
 * Turns an audit action code and its payload into a message key (problems.audit.<key>) and
 * values. Obstacle and action codes are resolved to display text by the caller's resolvers.
 * Unknown codes give the generic "unknown" sentence, never the raw code.
 */

export type AuditPhrase = { key: string; values: Record<string, string> };

export type AuditResolvers = {
  /** system code or unlisted id -> display text */
  obstacle: (code: string | null, customId: string | null) => string;
  action: (code: string | null, customId: string | null) => string;
  customObstacle: (id: string | null, fallbackName?: string) => string;
  customAction: (id: string | null, fallbackName?: string) => string;
  classification: (c: string) => string;
  stage: (s: string) => string;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
/** keeps a date in reading order inside Arabic sentences */
const iso = (s: string) => `⁦${s}⁩`;

export function describeProblemAudit(
  entry: Pick<ProblemAuditEntry, "action" | "payload">,
  r: AuditResolvers,
): AuditPhrase {
  const p = (entry.payload ?? {}) as Record<string, unknown>;
  const obstacle = () => r.obstacle(strOrNull(p.obstacleCode), strOrNull(p.customObstacleId));
  const action = () => r.action(strOrNull(p.actionCode), strOrNull(p.customActionId));

  switch (entry.action) {
    case "opened":
      return { key: p.origin === "manual" ? "opened_manual" : "opened_auto", values: {} };
    case "description_changed":
      return { key: "description_changed", values: {} };
    case "obstacle_selected":
      return {
        key: "obstacle_selected",
        values: { obstacle: obstacle(), classification: r.classification(str(p.classification)) },
      };
    case "obstacle_classification_changed":
      return {
        key: "obstacle_classification_changed",
        values: { obstacle: obstacle(), from: r.classification(str(p.from)), to: r.classification(str(p.to)) },
      };
    case "obstacle_note_changed":
      return { key: "obstacle_note_changed", values: { obstacle: obstacle() } };
    case "obstacle_removed":
      return { key: "obstacle_removed", values: { obstacle: obstacle() } };
    case "custom_obstacle_added":
      return {
        key: "custom_obstacle_added",
        values: {
          name: str(p.name),
          classification: r.classification(str(p.classification)),
        },
      };
    case "custom_obstacle_edited":
      return { key: "custom_obstacle_edited", values: { name: r.customObstacle(strOrNull(p.customObstacleId)) } };
    case "custom_obstacle_deleted":
      return { key: "custom_obstacle_deleted", values: { name: str(p.name) } };
    case "action_chosen":
      return { key: "action_chosen", values: { action: action() } };
    case "action_unchosen":
      return { key: "action_unchosen", values: { action: action() } };
    case "action_needs_study_set":
      return { key: "action_needs_study_set", values: { action: action() } };
    case "action_needs_study_cleared":
      return { key: "action_needs_study_cleared", values: { action: action() } };
    case "action_implemented":
      return { key: "action_implemented", values: { action: action(), date: iso(str(p.implementedOn)) } };
    case "action_implementation_cleared":
      return { key: "action_implementation_cleared", values: { action: action() } };
    case "custom_action_added":
      return { key: "custom_action_added", values: { name: str(p.name) } };
    case "custom_action_edited":
      return { key: "custom_action_edited", values: { name: r.customAction(strOrNull(p.customActionId)) } };
    case "custom_action_deleted":
      return { key: "custom_action_deleted", values: { name: str(p.name) } };
    case "obstacle_only_set":
      return { key: "obstacle_only_set", values: {} };
    case "obstacle_only_cleared":
      return {
        key:
          p.reason === "lastObstacleRemoved"
            ? "obstacle_only_cleared_auto"
            : p.reason === "actionChosen"
              ? "obstacle_only_cleared_chosen"
              : "obstacle_only_cleared",
        values: {},
      };
    case "stage_changed":
      return { key: "stage_changed", values: { from: r.stage(str(p.from)), to: r.stage(str(p.to)) } };
    default:
      return { key: "unknown", values: {} };
  }
}
