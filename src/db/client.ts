import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as app from "./schema/app";
import * as enums from "./schema/enums";
import * as reference from "./schema/reference";

// The auth tables are deliberately absent: this role has no access to them.
const schema = { ...enums, ...reference, ...app };

/**
 * The application's only database connection. It uses the restricted `wtp_app`
 * role (DATABASE_URL), so row-level security applies to everything it does.
 *
 * Do not import `db` to query user-owned tables. Use `withUser()` from
 * ./with-user.ts. `db` is exported for reference data only.
 */
const globalForDb = globalThis as unknown as { __wtpPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString, max: 10 });
}

export const pool = globalForDb.__wtpPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__wtpPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
