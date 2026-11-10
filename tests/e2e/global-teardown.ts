import { connectAsOwner } from "../../scripts/lib/owner-db";

// Removes the accounts the e2e tests created (their data cascades).
export default async function globalTeardown() {
  const owner = await connectAsOwner();
  try {
    await owner.query("delete from users where email like 'e2e-%@test.local'");
  } finally {
    await owner.end();
  }
}
