import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { accounts, sessions, users, verifications } from "@/db/schema/auth";

/**
 * The auth layer's own connection (role `wtp_auth`, DATABASE_AUTH_URL). It can reach
 * the four auth tables and nothing else.
 *
 * Import this ONLY from src/lib/auth/index.ts. Application code never queries the
 * auth tables: it uses the session, or the `my_profile` view through withUser().
 */
const globalForAuthDb = globalThis as unknown as { __wtpAuthPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_AUTH_URL;
  if (!connectionString) throw new Error("DATABASE_AUTH_URL is not set");
  return new Pool({ connectionString, max: 5 });
}

export const authPool = globalForAuthDb.__wtpAuthPool ?? createPool();
if (process.env.NODE_ENV !== "production")
  globalForAuthDb.__wtpAuthPool = authPool;

export const authSchema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
};

export const authDb = drizzle(authPool, { schema: authSchema });
