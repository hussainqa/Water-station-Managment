/** Extracts the Postgres SQLSTATE from an error, unwrapping Drizzle's DrizzleQueryError.cause chain. */
export function pgErrorCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Runs fn, expects it to reject, and returns the Postgres SQLSTATE of the rejection. */
export async function sqlState(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
  } catch (err) {
    return pgErrorCode(err);
  }
  throw new Error("expected the query to be rejected, but it succeeded");
}
