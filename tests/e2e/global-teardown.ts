import { connectAsOwner } from "../../scripts/lib/owner-db";

// Removes the accounts the e2e tests created (their data cascades).
export default async function globalTeardown() {
  // Set E2E_KEEP_USERS=1 when several runs share one database, so one run does not
  // delete the accounts another run is still using.
  if (process.env.E2E_KEEP_USERS) return;
  const owner = await connectAsOwner();
  try {
    await owner.query("delete from users where email like 'e2e-%@test.local'");
  } finally {
    await owner.end();
  }
}
