import { z } from "zod";

/**
 * An indicator reference is a system code XOR a user-indicator id (HANDOFF 5.2).
 * In forms, URLs and the limits snapshot it travels as ONE string:
 *   "sys:SC-01"   system indicator
 *   "usr:<uuid>"  user-defined indicator
 * Groups use the same shape ("sys:continuity" / "usr:<uuid>") via the group helpers.
 */
export type IndicatorRef =
  | { kind: "sys"; code: string }
  | { kind: "usr"; id: string };

/** The two nullable DB columns for a reference (exactly one is set). */
export type IndicatorRefColumns =
  | { indicatorCode: string; userIndicatorId: null }
  | { indicatorCode: null; userIndicatorId: string };

const SYSTEM_CODE = /^[A-Za-z][A-Za-z0-9_]{0,31}(-[A-Za-z0-9_]{1,16})?$/;
const uuid = z.uuid();

export function formatRef(ref: IndicatorRef): string {
  return ref.kind === "sys" ? `sys:${ref.code}` : `usr:${ref.id}`;
}

export function parseRef(input: unknown): IndicatorRef | null {
  if (typeof input !== "string") return null;
  const i = input.indexOf(":");
  if (i < 0) return null;
  const prefix = input.slice(0, i);
  const rest = input.slice(i + 1);
  if (prefix === "sys" && SYSTEM_CODE.test(rest)) return { kind: "sys", code: rest };
  if (prefix === "usr" && uuid.safeParse(rest).success) return { kind: "usr", id: rest.toLowerCase() };
  return null;
}

/** Zod schema that parses a ref string into an IndicatorRef. */
export const refSchema = z
  .string()
  .transform((s, ctx) => {
    const r = parseRef(s);
    if (!r) ctx.addIssue({ code: "custom", message: "invalidRef" });
    return r as IndicatorRef;
  });

export function refColumns(ref: IndicatorRef): IndicatorRefColumns {
  return ref.kind === "sys"
    ? { indicatorCode: ref.code, userIndicatorId: null }
    : { indicatorCode: null, userIndicatorId: ref.id };
}

export function refFromColumns(row: {
  indicatorCode: string | null;
  userIndicatorId: string | null;
}): IndicatorRef | null {
  if (row.indicatorCode && !row.userIndicatorId) return { kind: "sys", code: row.indicatorCode };
  if (row.userIndicatorId && !row.indicatorCode) return { kind: "usr", id: row.userIndicatorId };
  return null;
}

// --- group keys -----------------------------------------------------------------

export type GroupKey = { kind: "sys"; code: string } | { kind: "usr"; id: string };

export function formatGroupKey(key: GroupKey): string {
  return formatRef(key);
}

export function parseGroupKey(input: unknown): GroupKey | null {
  return parseRef(input);
}
