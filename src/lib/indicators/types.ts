import type { Better, Limits, Method } from "@/lib/evaluation";

/** Plain, serialisable shapes sent from the server to the indicators screen. */

export type IndicatorGroupDto = {
  /** "sys:<code>" or "usr:<uuid>" */
  key: string;
  nameAr: string;
  nameEn: string | null;
  isSystem: boolean;
  /** Number of indicators (system + user-defined) in the group. */
  count: number;
};

export type IndicatorDto = {
  /** "sys:SC-01" or "usr:<uuid>" */
  ref: string;
  /** System code (SC-01 ...); null for a user-defined indicator. */
  code: string | null;
  nameAr: string;
  nameEn: string | null;
  description: string | null;
  groupKey: string;
  isSystem: boolean;
  method: Method;
  unit: string;
  better: Better;
  inputLabels: Record<string, { ar: string; en: string }>;
  /** Current approved limits; null when there are none. */
  limits: Limits | null;
  /** The limits row to edit from (kept even when the user chose "no approved limits"). */
  limitsDraft: Limits | null;
  /** true when the user explicitly set "no approved limits". */
  limitsNone: boolean;
  /** Adopted at the plant that was asked for (false without a plant or without a row). */
  adopted: boolean;
  /** A reading or a problem refers to it: it cannot be deleted or change method. */
  used: boolean;
};

export type IndicatorsData = {
  groups: IndicatorGroupDto[];
  indicators: IndicatorDto[];
};
