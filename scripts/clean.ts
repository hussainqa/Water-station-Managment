/**
 * Removes generated output: the Next.js build and dev caches (.next holds both, in
 * .next/ and .next/dev/), TypeScript's incremental file and Playwright results.
 * Stop the dev server first. Never touches source, the database or node_modules.
 */
import { rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const targets = [".next", "tsconfig.tsbuildinfo", "test-results", "playwright-report"];

for (const target of targets) {
  rmSync(path.join(root, target), { recursive: true, force: true });
  console.log(`removed ${target}`);
}
