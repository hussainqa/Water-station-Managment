import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// One output folder per run, so two runs at the same time cannot wipe each other's traces.
// Set in the main process and inherited by the workers.
const runId = (process.env.WTP_PW_RUN ??= String(Date.now()));

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3100";

// End-to-end tests. Needs the database (npm run db:up && db:migrate && db:seed).
export default defineConfig({
  testDir: "tests/e2e",
  // Kept outside the repository so traces written during a run cannot disturb the dev server's file watcher.
  outputDir: path.join(os.tmpdir(), "wtp-sqms-playwright", runId),
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: { baseURL, colorScheme: "light", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    {
      name: "phone",
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/api/auth/ok`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
