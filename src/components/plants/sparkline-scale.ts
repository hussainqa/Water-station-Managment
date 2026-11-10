/** Smallest vertical span (in percentage points) a sparkline is stretched over, so a flat series is not magnified. */
export const MIN_SPAN = 10;
/** Free space above and below the data, as a share of its range. */
export const MARGIN = 0.1;

/**
 * Vertical positions (0 = top, `height` = bottom) for a series of percentages, scaled to the
 * data itself: min to max plus a margin of 10 % of the range on each side, over at least
 * MIN_SPAN points. A flat series (or a single point) is drawn as a centred line. Values are
 * clamped to 0-100 first; non-finite values are treated as 0.
 */
export function scaleSeries(values: readonly number[], height: number): number[] {
  if (values.length === 0) return [];
  const v = values.map((x) => (Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 0));
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = Math.max((max - min) * (1 + 2 * MARGIN), MIN_SPAN);
  const low = (min + max) / 2 - span / 2;
  return v.map((x) => height * (1 - (x - low) / span));
}
