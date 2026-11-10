import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./client";

const userIdSchema = z.uuid();

/** The transaction handle passed to `withUser` callbacks. */
export type UserTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * THE way to touch user-owned tables.
 *
 * Opens a transaction, sets `app.user_id` for that transaction only (the
 * parameterised equivalent of `SET LOCAL app.user_id = ...`), then runs `fn`.
 * Row-level security policies compare every row's owner_id with this setting,
 * so queries inside `fn` can only see and change the given user's rows.
 *
 * `userId` must come from a verified server-side session, never from the client.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: UserTx) => Promise<T>,
): Promise<T> {
  const id = userIdSchema.parse(userId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${id}, true)`);
    return fn(tx);
  });
}
