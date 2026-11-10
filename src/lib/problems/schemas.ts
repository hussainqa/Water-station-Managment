import * as z from "zod";
import { fieldErrorsFromZod, type FieldErrors } from "@/lib/assessments/schemas";

export { fieldErrorsFromZod, type FieldErrors };

/**
 * Shared by the server actions, the service and the client forms. Error codes and Zod
 * messages are translation keys (problems.errors.<code>), never display text.
 * Nothing here reads the clock.
 */

export const DESCRIPTION_MAX = 4000;
export const NAME_MAX = 300;
export const TEXT_MAX = 2000;
export const NOTE_MAX = 2000;

// --- primitives --------------------------------------------------------------------------

export const idSchema = z.uuid({ message: "invalidId" });
export const obstacleCodeSchema = z.string().regex(/^O-\d{2}$/, { message: "invalidObstacle" });
export const actionCodeSchema = z.string().regex(/^A-\d{2}$/, { message: "invalidAction" });
export const classificationSchema = z.enum(["confirmed", "possible"], {
  message: "invalidClassification",
});
export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "invalidDate" });

/** A system obstacle ("O-36") or an unlisted one of the same problem. */
export const obstacleTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("system"), code: obstacleCodeSchema }),
  z.object({ kind: z.literal("custom"), id: idSchema }),
]);
export type ObstacleTarget = z.infer<typeof obstacleTargetSchema>;

const requiredText = (max: number) =>
  z.string().trim().min(1, { message: "required" }).max(max, { message: "tooLong" });
const optionalText = (max: number) =>
  z.string().trim().max(max, { message: "tooLong" }).default("");

// --- inputs of the write functions -------------------------------------------------------

export const updateDescriptionSchema = z.object({
  problemId: idSchema,
  description: z.string().trim().max(DESCRIPTION_MAX, { message: "tooLong" }),
});
export type UpdateDescriptionInput = z.input<typeof updateDescriptionSchema>;

export const setObstacleSchema = z.object({
  problemId: idSchema,
  target: obstacleTargetSchema,
  classification: classificationSchema,
  /** omitted = keep the current note ("" for a new selection) */
  note: z.string().trim().max(NOTE_MAX, { message: "tooLong" }).optional(),
});
export type SetObstacleInput = z.input<typeof setObstacleSchema>;

export const unsetObstacleSchema = z.object({
  problemId: idSchema,
  /** system obstacles only; an unlisted obstacle is removed with deleteCustomObstacle */
  obstacleCode: obstacleCodeSchema,
});
export type UnsetObstacleInput = z.input<typeof unsetObstacleSchema>;

export const addCustomObstacleSchema = z.object({
  problemId: idSchema,
  name: requiredText(NAME_MAX),
  description: optionalText(TEXT_MAX),
  rationale: optionalText(TEXT_MAX),
  classification: classificationSchema,
});
export type AddCustomObstacleInput = z.input<typeof addCustomObstacleSchema>;

export const updateCustomObstacleSchema = addCustomObstacleSchema.extend({
  customObstacleId: idSchema,
});
export type UpdateCustomObstacleInput = z.input<typeof updateCustomObstacleSchema>;

export const deleteCustomObstacleSchema = z.object({
  problemId: idSchema,
  customObstacleId: idSchema,
});
export type DeleteCustomObstacleInput = z.input<typeof deleteCustomObstacleSchema>;

export const setActionChosenSchema = z.object({
  problemId: idSchema,
  actionCode: actionCodeSchema,
  chosen: z.boolean(),
  /** the selected obstacle the action is chosen under; null/omitted = none (e.g. from "show all") */
  linkedObstacle: obstacleTargetSchema.nullish(),
});
export type SetActionChosenInput = z.input<typeof setActionChosenSchema>;

export const setActionNeedsStudySchema = z.object({
  problemId: idSchema,
  actionCode: actionCodeSchema,
  needsStudy: z.boolean(),
});
export type SetActionNeedsStudyInput = z.input<typeof setActionNeedsStudySchema>;

export const setActionImplementedSchema = z.object({
  problemId: idSchema,
  actionCode: actionCodeSchema,
  /** 'YYYY-MM-DD'; null clears the implementation */
  implementedOn: dateKeySchema.nullable(),
});
export type SetActionImplementedInput = z.input<typeof setActionImplementedSchema>;

export const addCustomActionSchema = z.object({
  problemId: idSchema,
  name: requiredText(NAME_MAX),
  description: optionalText(TEXT_MAX),
  rationale: optionalText(TEXT_MAX),
  linkedObstacle: obstacleTargetSchema.nullish(),
  chooseNow: z.boolean().optional(),
});
export type AddCustomActionInput = z.input<typeof addCustomActionSchema>;

export const updateCustomActionSchema = z.object({
  problemId: idSchema,
  customActionId: idSchema,
  name: requiredText(NAME_MAX),
  description: optionalText(TEXT_MAX),
  rationale: optionalText(TEXT_MAX),
  linkedObstacle: obstacleTargetSchema.nullish(),
});
export type UpdateCustomActionInput = z.input<typeof updateCustomActionSchema>;

export const deleteCustomActionSchema = z.object({
  problemId: idSchema,
  customActionId: idSchema,
});
export type DeleteCustomActionInput = z.input<typeof deleteCustomActionSchema>;

export const setCustomActionChosenSchema = z.object({
  problemId: idSchema,
  customActionId: idSchema,
  chosen: z.boolean(),
});
export type SetCustomActionChosenInput = z.input<typeof setCustomActionChosenSchema>;

export const setCustomActionNeedsStudySchema = z.object({
  problemId: idSchema,
  customActionId: idSchema,
  needsStudy: z.boolean(),
});
export type SetCustomActionNeedsStudyInput = z.input<typeof setCustomActionNeedsStudySchema>;

export const setCustomActionImplementedSchema = z.object({
  problemId: idSchema,
  customActionId: idSchema,
  implementedOn: dateKeySchema.nullable(),
});
export type SetCustomActionImplementedInput = z.input<typeof setCustomActionImplementedSchema>;

export const setObstacleOnlySchema = z.object({
  problemId: idSchema,
  value: z.boolean(),
});
export type SetObstacleOnlyInput = z.input<typeof setObstacleOnlySchema>;

// --- reads -------------------------------------------------------------------------------

export const listQuerySchema = z.object({
  plantId: idSchema.nullish(),
  /** "all" or the last N months (the assessment's period must end within them) */
  range: z.union([z.literal("all"), z.number().int().min(1).max(120)]).optional(),
});
export type ListQueryInput = z.input<typeof listQuerySchema>;

export const countQuerySchema = z.object({ plantId: idSchema.nullish() });

// --- errors ------------------------------------------------------------------------------

export type ProblemErrorCode =
  | "validation"
  /** the problem does not exist or belongs to someone else */
  | "notFound"
  | "obstacleNotFound"
  | "obstacleNotSelected"
  | "customObstacleNotFound"
  | "actionNotFound"
  | "customActionNotFound"
  /** the obstacle named as "linked" is not selected in this problem */
  | "invalidLinkedObstacle"
  /** unselect/delete refused: an action chosen for it remains; carries `blocking` */
  | "obstacleHasChosenActions"
  | "customObstacleHasChosenActions"
  /** "keep the obstacle only" needs at least one selected obstacle */
  | "noObstacleSelected"
  /** implementation requires the action to be chosen */
  | "notChosen"
  | "invalidDate"
  | "futureDate"
  | "beforeDetected"
  /** a case-specific action that is chosen or implemented cannot be deleted */
  | "customActionLocked"
  | "generic";

/** A chosen action that blocks removing an obstacle. */
export type BlockingAction =
  | { kind: "system"; actionCode: string; textAr: string; textEn: string }
  | { kind: "custom"; customActionId: string; name: string };

export type ProblemFailure =
  | { ok: false; error: "validation"; fieldErrors: FieldErrors }
  | {
      ok: false;
      error: "obstacleHasChosenActions" | "customObstacleHasChosenActions";
      blocking: BlockingAction[];
    }
  | {
      ok: false;
      error: Exclude<
        ProblemErrorCode,
        "validation" | "obstacleHasChosenActions" | "customObstacleHasChosenActions"
      >;
    };

export type ProblemResult<T> = { ok: true; data: T } | ProblemFailure;
