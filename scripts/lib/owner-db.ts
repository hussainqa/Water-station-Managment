import "dotenv/config";
import { Client } from "pg";

/**
 * Connection as the OWNER role. For scripts in scripts/ only (migrations, seed, reset).
 * Nothing under src/ may import this file.
 */
export async function connectAsOwner(): Promise<Client> {
  const connectionString = process.env.DATABASE_OWNER_URL;
  if (!connectionString) throw new Error("DATABASE_OWNER_URL is not set");
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}
