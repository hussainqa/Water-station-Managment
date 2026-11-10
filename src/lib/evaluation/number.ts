const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * Parse a form value into a number.
 * null for null/undefined/blank, NaN for unparseable, otherwise a finite number.
 */
export function parseNumber(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const s = String(x)
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/[,،٬\s]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}
