import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default function config(phase: string): NextConfig {
  return withNextIntl({
    // The dev server and the production build get separate output directories.
    // Sharing `.next` made the first `next dev` after a `next build` reload every
    // page in a loop ("HMR hash mismatch") until the server was restarted.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    devIndicators: false,
    // Cache Components is off: every screen is per-user and rendered on demand.
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  });
}
