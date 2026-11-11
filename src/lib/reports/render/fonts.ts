import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The report must be completely self-contained (Gotenberg blocks every request), so the
 * fonts are read from the installed @fontsource package and inlined as base64 @font-face.
 * Only the Arabic and Latin subsets of the weights the document uses are included.
 */

const ARABIC_RANGE =
  "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC";
const LATIN_RANGE =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const WEIGHTS = [400, 600, 700] as const;

let cached: string | null = null;

export function fontFaceCss(): string {
  if (cached) return cached;
  const dir = path.join(process.cwd(), "node_modules", "@fontsource", "ibm-plex-sans-arabic", "files");
  const faces: string[] = [];
  for (const weight of WEIGHTS) {
    for (const [subset, range] of [
      ["arabic", ARABIC_RANGE],
      ["latin", LATIN_RANGE],
    ] as const) {
      const file = path.join(dir, `ibm-plex-sans-arabic-${subset}-${weight}-normal.woff2`);
      const b64 = readFileSync(file).toString("base64");
      faces.push(
        `@font-face{font-family:"IBM Plex Sans Arabic";font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${range};}`,
      );
    }
  }
  cached = faces.join("\n");
  return cached;
}
