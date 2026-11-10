"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/auth/session";
import {
  approveSchema,
  fieldErrorsFromZod,
  historyQuerySchema,
  idSchema,
  noteSchema,
  openProblemSchema,
  readingsSchema,
  selectionSchema,
  type AssessmentResult,
} from "./schemas";
import * as service from "./service";
import type {
  ApprovalSummary,
  DraftDto,
  HistoryPoint,
  WizardContext,
} from "./types";

/**
 * Server actions of the assessments feature: authorise (requireUser), validate with the
 * shared Zod schemas, run inside withUser(), revalidate. Inputs are plain objects.
 * `now` is read here and only here. The actor of audit events is the user's display name.
 * Every action resolves to `{ ok: true, data } | { ok: false, error, ... }` (AssessmentResult).
 */

const invalid = (e: import("zod").ZodError): AssessmentResult<never> => ({
  ok: false,
  error: "validation",
  fieldErrors: fieldErrorsFromZod(e),
});

const refresh = () => revalidatePath("/", "layout");

async function run<T>(
  mutates: boolean,
  fn: (tx: Parameters<Parameters<typeof withUser>[1]>[0], ctx: { userId: string; now: Date; actor: string }) => Promise<AssessmentResult<T>>,
): Promise<AssessmentResult<T>> {
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

// --- reads for the client -------------------------------------------------------------------

export async function getWizardContextAction(plantId: unknown): Promise<AssessmentResult<WizardContext>> {
  const id = idSchema.safeParse(plantId);
  if (!id.success) return { ok: false, error: "plantNotFound" };
  return run(false, (tx, c) => service.getWizardContext(tx, c.userId, id.data));
}

export async function getDraftAction(draftId: unknown): Promise<AssessmentResult<DraftDto>> {
  const id = idSchema.safeParse(draftId);
  if (!id.success) return { ok: false, error: "notFound" };
  return run(false, (tx, c) => service.getDraft(tx, c.userId, id.data));
}

export async function getIndicatorHistoryAction(
  input: unknown,
): Promise<AssessmentResult<HistoryPoint[]>> {
  const p = historyQuerySchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(false, async (tx, c) => ({
    ok: true,
    data: await service.getIndicatorHistory(tx, c.userId, p.data),
  }));
}

// --- drafts ------------------------------------------------------------------------------------

/** input: { plantId, periodStart: 'YYYY-MM', months, startDate?, endDate?, enteredBy } */
export async function createDraftAction(input: unknown): Promise<AssessmentResult<{ id: string }>> {
  return run(true, (tx, c) => service.createDraft(tx, c.userId, input, c));
}

/** input: { id, details: same shape as createDraftAction } */
export async function updateDraftDetailsAction(
  draftId: unknown,
  input: unknown,
): Promise<AssessmentResult<DraftDto>> {
  const id = idSchema.safeParse(draftId);
  if (!id.success) return { ok: false, error: "notFound" };
  return run(true, (tx, c) => service.updateDraftDetails(tx, c.userId, id.data, input, c));
}

/** input: { id, refs: string[] } */
export async function setDraftSelectionAction(input: unknown): Promise<AssessmentResult<DraftDto>> {
  const p = selectionSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(true, (tx, c) => service.setDraftSelection(tx, c.userId, p.data.id, p.data.refs));
}

/** input: { id, readings: { [ref]: { inputs: {...raw}, note?: string } } } */
export async function saveDraftReadingsAction(input: unknown): Promise<AssessmentResult<DraftDto>> {
  const p = readingsSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(true, (tx, c) => service.saveDraftReadings(tx, c.userId, p.data.id, p.data.readings));
}

export async function deleteDraftAction(draftId: unknown): Promise<AssessmentResult<{ id: string }>> {
  const id = idSchema.safeParse(draftId);
  if (!id.success) return { ok: false, error: "notFound" };
  return run(true, (tx, c) => service.deleteDraft(tx, c.userId, id.data, c));
}

// --- approval and afterwards ------------------------------------------------------------------

/** input: { id, acknowledgeMissing?: boolean } */
export async function approveAssessmentAction(
  input: unknown,
): Promise<AssessmentResult<ApprovalSummary>> {
  const p = approveSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(true, (tx, c) =>
    service.approveAssessment(tx, c.userId, p.data.id, {
      acknowledgeMissing: p.data.acknowledgeMissing,
      now: c.now,
      actor: c.actor,
    }),
  );
}

/** input: { id, ref, note } */
export async function updateReadingNoteAction(
  input: unknown,
): Promise<AssessmentResult<{ note: string; changed: boolean }>> {
  const p = noteSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(true, (tx, c) => service.updateReadingNote(tx, c.userId, p.data.id, p.data.ref, p.data.note, c));
}

/** input: { id, ref } */
export async function openManualProblemAction(
  input: unknown,
): Promise<AssessmentResult<{ problemId: string }>> {
  const p = openProblemSchema.safeParse(input);
  if (!p.success) return invalid(p.error);
  return run(true, (tx, c) => service.openManualProblem(tx, c.userId, p.data.id, p.data.ref, c));
}
