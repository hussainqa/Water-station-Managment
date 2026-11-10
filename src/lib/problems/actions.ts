"use server";

import { revalidatePath } from "next/cache";
import type * as z from "zod";
import { withUser, type UserTx } from "@/db/with-user";
import { requireUser } from "@/lib/auth/session";
import {
  addCustomActionSchema,
  addCustomObstacleSchema,
  countQuerySchema,
  deleteCustomActionSchema,
  deleteCustomObstacleSchema,
  fieldErrorsFromZod,
  idSchema,
  listQuerySchema,
  setActionChosenSchema,
  setActionImplementedSchema,
  setActionNeedsStudySchema,
  setCustomActionChosenSchema,
  setCustomActionImplementedSchema,
  setCustomActionNeedsStudySchema,
  setObstacleOnlySchema,
  setObstacleSchema,
  unsetObstacleSchema,
  updateCustomActionSchema,
  updateCustomObstacleSchema,
  updateDescriptionSchema,
  type ProblemResult,
} from "./schemas";
import * as service from "./service";
import type {
  ActionLogEntry,
  AllActionsDto,
  MutationData,
  ProblemDto,
  ProblemListItem,
  ProblemStageMap,
  ReferenceCatalog,
} from "./types";

/**
 * Server actions of the problems feature: authorise (requireUser), validate with the
 * shared Zod schemas, run inside withUser(), revalidate. Inputs are plain objects (unknown
 * to the type system, checked here). `now` is read here and only here. The actor of audit
 * events is the user's display name. Every action resolves to
 * `{ ok: true, data } | { ok: false, error, ... }` (ProblemResult). Writes return the new
 * derived stage in `data` so the UI can update the badge without a reload.
 */

type Mutation = ProblemResult<MutationData>;

const refresh = () => revalidatePath("/", "layout");

type Run<T> = (tx: UserTx, c: { userId: string; now: Date; actor: string }) => Promise<ProblemResult<T>>;

async function run<T>(mutates: boolean, fn: Run<T>): Promise<ProblemResult<T>> {
  const user = await requireUser();
  try {
    const result = await withUser(user.id, (tx) =>
      fn(tx, { userId: user.id, now: new Date(), actor: user.name }),
    );
    if (result.ok && mutates) refresh();
    return result;
  } catch {
    return { ok: false, error: "generic" };
  }
}

/** Parses `input` with `schema`, then runs the service call; validation failures never reach the database. */
async function write<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  call: (tx: UserTx, userId: string, data: z.output<S>, ctx: { now: Date; actor: string }) => Promise<ProblemResult<T>>,
): Promise<ProblemResult<T>> {
  const p = schema.safeParse(input);
  if (!p.success) {
    await requireUser();
    return { ok: false, error: "validation", fieldErrors: fieldErrorsFromZod(p.error) };
  }
  return run(true, (tx, c) => call(tx, c.userId, p.data, { now: c.now, actor: c.actor }));
}

// --- reads ----------------------------------------------------------------------------------

export async function getReferenceCatalogAction(): Promise<ProblemResult<ReferenceCatalog>> {
  return run(false, async (tx) => ({ ok: true, data: await service.getReferenceCatalog(tx) }));
}

export async function getProblemAction(problemId: unknown): Promise<ProblemResult<ProblemDto>> {
  const id = idSchema.safeParse(problemId);
  if (!id.success) return { ok: false, error: "notFound" };
  return run(false, (tx, c) => service.getProblem(tx, c.userId, id.data));
}

export async function getAllActionsAction(problemId: unknown): Promise<ProblemResult<AllActionsDto>> {
  const id = idSchema.safeParse(problemId);
  if (!id.success) return { ok: false, error: "notFound" };
  return run(false, (tx, c) => service.getAllActions(tx, c.userId, id.data));
}

export async function listProblemsAction(input: unknown = {}): Promise<ProblemResult<ProblemListItem[]>> {
  const p = listQuerySchema.safeParse(input ?? {});
  if (!p.success) return { ok: false, error: "validation", fieldErrors: fieldErrorsFromZod(p.error) };
  return run(false, async (tx, c) => ({
    ok: true,
    data: await service.listProblems(tx, c.userId, { ...p.data, now: c.now }),
  }));
}

export async function countOpenProblemsAction(input: unknown = {}): Promise<ProblemResult<number>> {
  const p = countQuerySchema.safeParse(input ?? {});
  if (!p.success) return { ok: false, error: "validation", fieldErrors: fieldErrorsFromZod(p.error) };
  return run(false, async (tx, c) => ({
    ok: true,
    data: await service.countOpenProblems(tx, c.userId, p.data),
  }));
}

export async function listActionLogAction(input: unknown = {}): Promise<ProblemResult<ActionLogEntry[]>> {
  const p = listQuerySchema.safeParse(input ?? {});
  if (!p.success) return { ok: false, error: "validation", fieldErrors: fieldErrorsFromZod(p.error) };
  return run(false, async (tx, c) => ({
    ok: true,
    data: await service.listActionLog(tx, c.userId, { ...p.data, now: c.now }),
  }));
}

export async function problemStagesForAssessmentAction(
  assessmentId: unknown,
): Promise<ProblemResult<ProblemStageMap>> {
  const id = idSchema.safeParse(assessmentId);
  if (!id.success) return { ok: false, error: "notFound" };
  return run(false, async (tx, c) => ({
    ok: true,
    data: await service.problemStagesForAssessment(tx, c.userId, id.data),
  }));
}

// --- writes (each returns the new derived stage) --------------------------------------------

export async function updateDescriptionAction(input: unknown): Promise<Mutation> {
  return write(updateDescriptionSchema, input, service.updateDescription);
}

export async function setObstacleAction(input: unknown): Promise<Mutation> {
  return write(setObstacleSchema, input, service.setObstacle);
}

export async function unsetObstacleAction(input: unknown): Promise<Mutation> {
  return write(unsetObstacleSchema, input, service.unsetObstacle);
}

export async function updateCustomObstacleAction(input: unknown): Promise<Mutation> {
  return write(updateCustomObstacleSchema, input, service.updateCustomObstacle);
}

export async function deleteCustomObstacleAction(input: unknown): Promise<Mutation> {
  return write(deleteCustomObstacleSchema, input, service.deleteCustomObstacle);
}

export async function setObstacleOnlyAction(input: unknown): Promise<Mutation> {
  return write(setObstacleOnlySchema, input, service.setObstacleOnly);
}

export async function setActionChosenAction(input: unknown): Promise<Mutation> {
  return write(setActionChosenSchema, input, service.setActionChosen);
}

export async function setActionNeedsStudyAction(input: unknown): Promise<Mutation> {
  return write(setActionNeedsStudySchema, input, service.setActionNeedsStudy);
}

export async function setActionImplementedAction(input: unknown): Promise<Mutation> {
  return write(setActionImplementedSchema, input, service.setActionImplemented);
}

export async function updateCustomActionAction(input: unknown): Promise<Mutation> {
  return write(updateCustomActionSchema, input, service.updateCustomAction);
}

export async function deleteCustomActionAction(input: unknown): Promise<Mutation> {
  return write(deleteCustomActionSchema, input, service.deleteCustomAction);
}

export async function setCustomActionChosenAction(input: unknown): Promise<Mutation> {
  return write(setCustomActionChosenSchema, input, service.setCustomActionChosen);
}

export async function setCustomActionNeedsStudyAction(input: unknown): Promise<Mutation> {
  return write(setCustomActionNeedsStudySchema, input, service.setCustomActionNeedsStudy);
}

export async function setCustomActionImplementedAction(input: unknown): Promise<Mutation> {
  return write(setCustomActionImplementedSchema, input, service.setCustomActionImplemented);
}

export async function addCustomObstacleAction(
  input: unknown,
): Promise<ProblemResult<MutationData & { customObstacleId: string }>> {
  return write(addCustomObstacleSchema, input, service.addCustomObstacle);
}

export async function addCustomActionAction(
  input: unknown,
): Promise<ProblemResult<MutationData & { customActionId: string }>> {
  return write(addCustomActionSchema, input, service.addCustomAction);
}
