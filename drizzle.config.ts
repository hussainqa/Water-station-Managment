import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit always runs as the OWNER role (migrations only).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_OWNER_URL! },
});
