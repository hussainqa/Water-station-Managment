/** Keys stored in plants.governorate. Labels: messages plants.governorates.<key>. */
export const GOVERNORATES = [
  "baghdad",
  "basra",
  "nineveh",
  "anbar",
  "babil",
  "diyala",
  "karbala",
  "najaf",
  "wasit",
  "dhiqar",
  "maysan",
  "salahaddin",
  "kirkuk",
  "qadisiyah",
  "muthanna",
  "erbil",
  "sulaymaniyah",
  "duhok",
] as const;
export type Governorate = (typeof GOVERNORATES)[number];

/** Keys stored in plants.water_source. Labels: messages plants.sources.<key>. */
export const WATER_SOURCES = [
  "tigris",
  "euphrates",
  "shatt",
  "diyala",
  "lake",
  "wells",
  "other",
] as const;
export type WaterSource = (typeof WATER_SOURCES)[number];

/** Actual capacity may exceed design capacity by at most this factor. */
export const MAX_ACTUAL_TO_DESIGN = 1.2;
