"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/lib/auth/session";
import { parseRef } from "./ref";
import {
  adoptionInputSchema,
  fieldErrorsFromZod,
  groupNameSchema,
  indicatorFormSchema,
  saveLimitsInputSchema,
  type ActionResult,
} from "./schemas";
import * as service from "./service";

/**
 * Server actions of the indicators screen. Each one: authorise (requireUser), validate
 * with the shared Zod schema, then run inside withUser(). Inputs are plain objects.
 */

const invalid = (e: z.ZodError): ActionResult => ({
  ok: false,
  error: "validation",
  fieldErrors: fieldErrorsFromZod(e),
});

const revalidate = () => revalidatePath("/[locale]/indicators", "page");

async function run<T>(fn: (tx: Parameters<Parameters<typeof withUser>[1]>[0], userId: string) => Promise<ActionResult<T>>) {
  const user = await requireUser();
  try {
    const result = await withUser(user.id, (tx) => fn(tx, user.id));
    if (result.ok) revalidate();
    return result;
  } catch {
    return { ok: false, error: "generic" } as const;
  }
}

export async function setAdoptionAction(input: unknown): Promise<ActionResult> {
  const parsed = adoptionInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { plantId, ref, adopted } = parsed.data;
  return run((tx, uid) => service.setAdoption(tx, uid, plantId, ref, adopted));
}

export async function saveLimitsAction(input: unknown): Promise<ActionResult> {
  const parsed = saveLimitsInputSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { ref, none, limits } = parsed.data;
  if (!ref) return { ok: false, error: "validation" };
  if (!none && !limits) return { ok: false, error: "validation", fieldErrors: { limits: "incomplete" } };
  return run((tx, uid) =>
    service.saveLimits(tx, uid, ref, none || !limits ? { none: true } : { none: false, limits }),
  );
}

export async function createIndicatorAction(
  input: unknown,
): Promise<ActionResult<{ ref: string; id: string; groupKey: string }>> {
  const parsed = indicatorFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run((tx, uid) => service.createUserIndicator(tx, uid, parsed.data));
}

export async function updateIndicatorAction(id: unknown, input: unknown): Promise<ActionResult> {
  const ref = parseRef(`usr:${String(id)}`);
  if (!ref || ref.kind !== "usr") return { ok: false, error: "notFound" };
  const parsed = indicatorFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run((tx, uid) => service.updateUserIndicator(tx, uid, ref.id, parsed.data));
}

export async function deleteIndicatorAction(id: unknown): Promise<ActionResult> {
  const ref = parseRef(`usr:${String(id)}`);
  if (!ref || ref.kind !== "usr") return { ok: false, error: "notFound" };
  return run((tx, uid) => service.deleteUserIndicator(tx, uid, ref.id));
}

export async function createGroupAction(input: unknown): Promise<ActionResult<{ key: string }>> {
  const parsed = groupNameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run((tx, uid) => service.createGroup(tx, uid, parsed.data));
}

export async function renameGroupAction(id: unknown, input: unknown): Promise<ActionResult> {
  const ref = parseRef(`usr:${String(id)}`);
  if (!ref || ref.kind !== "usr") return { ok: false, error: "notFound" };
  const parsed = groupNameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run((tx, uid) => service.renameGroup(tx, uid, ref.id, parsed.data));
}

export async function deleteGroupAction(id: unknown): Promise<ActionResult> {
  const ref = parseRef(`usr:${String(id)}`);
  if (!ref || ref.kind !== "usr") return { ok: false, error: "notFound" };
  return run((tx, uid) => service.deleteGroup(tx, uid, ref.id));
}
