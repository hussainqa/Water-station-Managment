/**
 * HTML escaping for the report renderer. EVERY interpolated value goes through `esc`
 * (or `cssString` inside a <style> block). The document has no scripts, so escaping is
 * defence in depth, but a user-entered note must never be able to close a tag, a
 * <style> block or flip the text direction of the page.
 */

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
  "=": "&#61;",
};

/** Bidi embedding / override / isolate controls (202A-202E, 2066-2069), line/paragraph separators and C0 controls except tab and newline. */
const code = (n: number) => String.fromCharCode(n);
const range = (a: number, b: number) => `${code(a)}-${code(b)}`;
const STRIP = new RegExp(
  `[${[range(0x202a, 0x202e), range(0x2066, 0x2069), range(0, 8), range(0xb, 0xc), range(0xe, 0x1f), code(0x7f), code(0x2028), code(0x2029)].join("")}]`,
  "g",
);

export function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(STRIP, "")
    .replace(/[&<>"'`=]/g, (c) => ENTITIES[c]);
}

/** A quoted CSS string literal (for `content:`). */
export function cssString(value: string): string {
  const body = value
    .replace(STRIP, "")
    .replace(/[\\"]/g, (c) => `\\${c}`)
    .replace(/[<>&]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)
    .replace(/\n/g, "\\a ");
  return `"${body}"`;
}

/** User-entered text: escaped, and isolated so mixed-direction text renders correctly. */
export function userText(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  if (!s) return "";
  return `<bdi dir="auto">${esc(s)}</bdi>`;
}

/** A block of user-entered text (notes): keeps line breaks, direction decided by its own first strong character. */
export function userBlock(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  if (!s) return "";
  return `<span class="user" dir="auto">${esc(s).replace(/\r?\n/g, "<br>")}</span>`;
}

/** A number, date or code: always left-to-right inside any text. */
export function num(value: string | number): string {
  return `<bdi class="num" dir="ltr">${esc(value)}</bdi>`;
}
