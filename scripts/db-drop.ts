/**
 * Empties the local database (everything in `public` plus drizzle's migration log).
 * Used by `npm run db:reset`, which then migrates and seeds again.
 * Refuses to run against anything that is not a local database.
 */
import { connectAsOwner } from "./lib/owner-db";

async function main() {
  const url = new URL(process.env.DATABASE_OWNER_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error(`db:reset only runs against localhost, not ${url.hostname}`);
  }
  const client = await connectAsOwner();
  try {
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    console.log("Dropped all tables.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
