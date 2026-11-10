import "dotenv/config";
import { defineConfig } from "@playwright/test";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3100";

// End-to-end tests. Needs the database (npm run db:up && db:migrate && db:seed).
export default defineConfig({
  testDir: "tests/e2e",
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
