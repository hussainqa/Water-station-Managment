import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const serverOnlyStub = fileURLToPath(
  new URL("./tests/db/server-only-stub.ts", import.meta.url),
);
const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        // `server-only` throws outside a React Server environment; stub it for Node tests.
        resolve: { alias: { ...alias, "server-only": serverOnlyStub } },
        test: {
          // Needs the local database: npm run db:up && npm run db:migrate && npm run db:seed
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          setupFiles: ["tests/db/setup.ts"],
          fileParallelism: false,
          testTimeout: 20000,
        },
      },
    ],
  },
});
