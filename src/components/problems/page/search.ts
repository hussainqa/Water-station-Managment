/**
 * Pure search helpers of the problem page: Arabic-aware normalisation, token matching over
 * both languages, and filtering of the obstacle axes and the action lists. No I/O.
 */

const TASHKEEL = /[ً-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const ARABIC_INDIC = /[٠-٩]/g;
const EXT_INDIC = /[۰-۹]/g;

/**
 * Lower-cases and folds spelling variants so that "ادارة" finds "الإدارة":
 * أ إ آ ٱ -> ا, ة -> ه, ى -> ي, diacritics and tatweel removed, Arabic digits -> Latin.
 */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(TASHKEEL, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXT_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, " ")
    .trim();
}

/** Query tokens (normalised, split on spaces). Empty for an empty query. */
export function queryTokens(query: string): string[] {
  const n = normalizeText(query);
  return n ? n.split(" ") : [];
}

type Bilingual = { textAr: string; textEn: string };

/** Every token must occur in the Arabic or the English text. */
export function matchesTokens(tokens: readonly string[], item: Bilingual): boolean {
  if (!tokens.length) return true;
  const hay = `${normalizeText(item.textAr)} ${normalizeText(item.textEn)}`;
  return tokens.every((t) => hay.includes(t));
}

type ObstacleLike = Bilingual & { code: string };

/** The obstacle axes filtered by a query and/or by the selected codes. Empty axes are dropped. */
export function filterObstacleAxes<O extends ObstacleLike, A extends { obstacles: O[] }>(
  axes: readonly A[],
  opts: { query: string; selectedOnly: boolean; selected: ReadonlySet<string> },
): (A & { obstacles: O[] })[] {
  const tokens = queryTokens(opts.query);
  const out: (A & { obstacles: O[] })[] = [];
  for (const axis of axes) {
    const obstacles = axis.obstacles.filter(
      (o) => (!opts.selectedOnly || opts.selected.has(o.code)) && matchesTokens(tokens, o),
    );
    if (obstacles.length) out.push({ ...axis, obstacles });
  }
  return out;
}

/** Filters a flat list of actions. */
export function filterActions<T extends Bilingual>(list: readonly T[], query: string): T[] {
  const tokens = queryTokens(query);
  return tokens.length ? list.filter((a) => matchesTokens(tokens, a)) : [...list];
}

/** The same for the "show all" axes (axes without a match are dropped). */
export function filterActionAxes<T extends Bilingual, A extends { actions: T[] }>(
  axes: readonly A[],
  query: string,
): (A & { actions: T[] })[] {
  const tokens = queryTokens(query);
  if (!tokens.length) return axes.map((a) => ({ ...a }));
  return axes
    .map((a) => ({ ...a, actions: a.actions.filter((x) => matchesTokens(tokens, x)) }))
    .filter((a) => a.actions.length > 0);
}
