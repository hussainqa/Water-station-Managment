import type { Limits, Status } from "@/lib/evaluation";

/**
 * Pure geometry of the threshold scale (the app's signature element).
 *
 * Positions are percentages (0..100) along the scale in the direction values grow.
 * The component places them with `inset-inline-start`, so the scale follows the reading
 * direction: low values start at the reading start (right in Arabic, left in English).
 */

export type BandStatus = "ok" | "warning" | "critical";

export type ScaleSegment = {
  status: BandStatus;
  from: number;
  to: number;
  /** Start and width in percent of the scale. */
  start: number;
  size: number;
};

export type ScaleTick = { value: number; pos: number };

export type ScaleGeometry = {
  min: number;
  max: number;
  segments: ScaleSegment[];
  ticks: ScaleTick[];
  /** Marker position in percent (clamped to the scale), or null without a value. */
  marker: number | null;
};

export type ScaleOptions = {
  /** Hard bounds of the quantity, e.g. { min: 0, max: 100 } for a percentage. */
  bounds?: { min?: number; max?: number };
  /** Drop a tick whose position is closer than this (in %) to the previous kept one. */
  minTickGap?: number;
};

type Band = [BandStatus, number, number];

function limitNumbers(l: Limits): number[] {
  return l.kind === "range"
    ? [l.critMin, l.minOk, l.maxOk, l.critMax]
    : [l.target, l.warning, l.critical];
}

export function scaleGeometry(
  limits: Limits,
  value?: number | null,
  options: ScaleOptions = {},
): ScaleGeometry {
  const nums = limitNumbers(limits);
  // Do not run below zero when every limit is non-negative (counts, hours, percentages).
  const floor = options.bounds?.min ?? (nums.every((n) => n >= 0) ? 0 : -Infinity);
  const ceil = options.bounds?.max ?? Infinity;

  let lo: number;
  let hi: number;
  let bands: Band[];
  let tickValues: number[];

  if (limits.kind === "higher") {
    const span = limits.target - limits.critical || 1;
    lo = Math.max(floor, limits.critical - span * 0.6);
    hi = Math.min(ceil, limits.target + span * 0.6);
    bands = [
      ["critical", lo, limits.critical],
      ["warning", limits.critical, limits.warning],
      ["ok", limits.warning, hi],
    ];
    tickValues = [limits.critical, limits.warning];
    if (limits.target !== limits.warning) tickValues.push(limits.target);
  } else if (limits.kind === "lower") {
    const span = limits.critical - limits.target || 1;
    lo = Math.max(floor, limits.target - span * 0.8);
    hi = Math.min(ceil, limits.critical + span * 0.6);
    bands = [
      ["ok", lo, limits.warning],
      ["warning", limits.warning, limits.critical],
      ["critical", limits.critical, hi],
    ];
    tickValues = [limits.target, limits.warning, limits.critical];
    if (limits.target === limits.warning) tickValues.shift();
  } else {
    const span = limits.critMax - limits.critMin || 1;
    lo = Math.max(floor, limits.critMin - span * 0.25);
    hi = Math.min(ceil, limits.critMax + span * 0.25);
    bands = [
      ["critical", lo, limits.critMin],
      ["warning", limits.critMin, limits.minOk],
      ["ok", limits.minOk, limits.maxOk],
      ["warning", limits.maxOk, limits.critMax],
      ["critical", limits.critMax, hi],
    ];
    tickValues = [limits.critMin, limits.minOk, limits.maxOk, limits.critMax];
  }

  if (hi <= lo) hi = lo + 1;

  // A value outside the drawn range stretches the scale a little so it stays visible.
  if (value != null && Number.isFinite(value)) {
    const pad = (hi - lo) * 0.04;
    if (value < lo) {
      lo = value - pad;
      bands[0][1] = lo;
    }
    if (value > hi) {
      hi = value + pad;
      bands[bands.length - 1][2] = hi;
    }
  }

  const width = hi - lo;
  const pct = (x: number) => Math.max(0, Math.min(100, ((x - lo) / width) * 100));

  const segments: ScaleSegment[] = bands
    .map(([status, from, to]) => ({
      status,
      from,
      to,
      start: pct(from),
      size: pct(to) - pct(from),
    }))
    .filter((s) => s.size > 0.0001);

  const gap = options.minTickGap ?? 0;
  const ticks: ScaleTick[] = [];
  for (const v of [...new Set(tickValues)].sort((a, b) => a - b)) {
    const pos = pct(v);
    if (ticks.length && pos - ticks[ticks.length - 1].pos < gap) continue;
    ticks.push({ value: v, pos });
  }

  const marker = value != null && Number.isFinite(value) ? pct(value) : null;
  return { min: lo, max: hi, segments, ticks, marker };
}

/** Which of the three bands a status draws its marker in (insufficient data has none). */
export function markerTone(status: Status): "ok" | "warning" | "critical" | "neutral" {
  if (status === "ok" || status === "warning" || status === "critical") return status;
  return "neutral";
}
