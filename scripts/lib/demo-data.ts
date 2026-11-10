/**
 * Demo-account data, taken from the prototype (docs/handoff/reference/prototype-v4.html):
 *   DEMO_ACCOUNT  line 868   plants + tracked indicators   seedDemo(), lines 876-882
 *   SERIES / HIST lines 883-897                            LV10 limits, lines 862-867
 *   September readings of Al-Karkh: sampleInputs(), lines 1400-1404 (the wizard prefill)
 * Used by scripts/seed-demo.ts and by the tests. Pure data and pure helpers: no I/O.
 */

export const DEMO_EMAIL = "engineer@wtp.iq";
export const DEMO_PASSWORD = "demo1234";
export const DEMO_NAME = "م. سارة الجبوري";
export const DEMO_JOB_TITLE = "مهندسة تقييم الأداء";
export const DEMO_LOCALE = "ar";

export type DemoPlantKey = "rafidain" | "dijla" | "karkh";

export const DEMO_PLANTS: {
  key: DemoPlantKey;
  name: string;
  governorate: string;
  location: string;
  waterSource: string;
  designCapacity: number;
  actualCapacity: number;
  engineer: string;
  /** system indicator codes NOT adopted at this plant */
  notAdopted: string[];
}[] = [
  {
    key: "rafidain",
    name: "محطة الرافدين لمعالجة المياه",
    governorate: "baghdad",
    location: "الرصافة",
    waterSource: "tigris",
    designCapacity: 120000,
    actualCapacity: 104500,
    engineer: "م. أحمد كاظم",
    notAdopted: ["CS-02"],
  },
  {
    key: "dijla",
    name: "محطة دجلة لمعالجة المياه",
    governorate: "baghdad",
    location: "الأعظمية",
    waterSource: "tigris",
    designCapacity: 90000,
    actualCapacity: 71200,
    engineer: "م. زينب عبد الله",
    notAdopted: [],
  },
  {
    key: "karkh",
    name: "محطة الكرخ لمعالجة المياه",
    governorate: "baghdad",
    location: "جانب الكرخ",
    waterSource: "tigris",
    designCapacity: 150000,
    actualCapacity: 108000,
    engineer: "م. مصطفى جاسم",
    notAdopted: [],
  },
];

/** Mar-Aug 2026 ('YYYY-MM'). Batches: Mar-Jun use limits v1.0, Jul-Aug v1.1. */
export const HIST = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"] as const;
export const FIRST_V11_MONTH = "2026-07";

/** WQ-02 warning limit: 96 in version 1.0, 95 from July 2026 (version 1.1). */
export const WQ02_V10 = { kind: "higher", target: 98, warning: 96, critical: 90 } as const;
export const WQ02_V11 = { kind: "higher", target: 98, warning: 95, critical: 90 } as const;

/**
 * Prototype SERIES, except SC-02: the prototype counted customers (600-4100); the handoff
 * (client note 10) makes it a percentage, so each count is divided by 1000 (0.45 - 4.1 %),
 * which keeps every plant's trend. null = no data for that month (Dijla WQ-03, March).
 */
type Series = Record<string, (number | null)[]>;
const sc02 = (counts: number[]) => counts.map((n) => n / 1000);

export const SERIES: Record<DemoPlantKey, Series> = {
  rafidain: {
    "SC-01": [99.2, 99.5, 99.1, 99.4, 99.3, 99.6],
    "SC-02": sc02([600, 450, 700, 520, 610, 480]),
    "SC-03": [1, 1, 2, 1, 2, 1],
    "SC-04": [1.2, 0.8, 1.5, 1.0, 1.4, 1.1],
    "WQ-01": [132, 128, 135, 130, 134, 131],
    "WQ-02": [99.1, 98.8, 99.3, 98.9, 99.0, 99.2],
    "WQ-03": [98.8, 99.0, 98.6, 98.9, 99.1, 98.7],
    "WQ-04": [3, 2, 4, 3, 2, 3],
    "CS-01": [14, 12, 15, 13, 12, 11],
    "CS-03": [97, 96, 98, 97, 96, 98],
    "RT-01": [1.5, 1.8, 1.4, 1.6, 1.5, 1.3],
    "RT-02": [5, 4.5, 5.5, 4.8, 5.2, 4.6],
    "RT-03": [8, 9, 7.5, 8.5, 8, 7],
    "RT-04": [20, 22, 19, 21, 20, 18],
  },
  dijla: {
    "SC-01": [98.5, 98.2, 97.9, 97.6, 97.8, 97.5],
    "SC-02": sc02([1500, 1800, 2200, 2600, 3100, 2900]),
    "SC-03": [2, 3, 3, 2, 4, 3],
    "SC-04": [1.8, 2.2, 2.5, 2.1, 2.6, 2.4],
    "WQ-01": [118, 110, 104, 98, 96, 101],
    "WQ-02": [98.2, 97.5, 96.4, 95.8, 94.6, 95.3],
    "WQ-03": [null, 97.0, 96.2, 95.8, 94.8, 95.4],
    "WQ-04": [6, 8, 9, 11, 13, 12],
    "CS-01": [22, 25, 28, 31, 34, 30],
    "CS-02": [78, 75, 72, 69, 67, 68],
    "CS-03": [92, 89, 87, 85, 83, 84],
    "RT-01": [2.5, 3.0, 3.2, 3.6, 4.2, 4.4],
    "RT-02": [8, 9, 10, 11, 12.5, 12.8],
    "RT-03": [14, 16, 19, 22, 26, 25],
    "RT-04": [30, 34, 38, 42, 47, 46],
  },
  karkh: {
    "SC-01": [98.8, 98.4, 97.6, 96.9, 95.8, 95.2],
    "SC-02": sc02([900, 1200, 1900, 2600, 3400, 4100]),
    "SC-03": [2, 2, 3, 4, 5, 5],
    "SC-04": [1.5, 2.0, 2.8, 3.4, 4.1, 4.6],
    "WQ-01": [125, 122, 119, 121, 117, 120],
    "WQ-02": [98.5, 98.0, 97.6, 97.1, 96.8, 96.2],
    "WQ-03": [98.2, 97.9, 97.5, 97.0, 96.6, 96.1],
    "WQ-04": [4, 4, 5, 6, 7, 8],
    "CS-01": [18, 20, 24, 29, 35, 41],
    "CS-02": [82, 81, 79, 77, 75, 73],
    "CS-03": [95, 94, 93, 92, 90, 89],
    "RT-01": [1.8, 2.0, 2.4, 2.9, 3.4, 3.8],
    "RT-02": [6, 7, 8, 9.5, 11, 11.8],
    "RT-03": [10, 11, 12, 11, 13, 12],
    "RT-04": [24, 26, 28, 31, 35, 39],
  },
};

type Method = "direct" | "direct_percent" | "duration" | "ratio" | "average";
export type RawInputs = Record<string, string | number | null>;

/** Planned supply hours of a 30-day month (SC-01); other ratios use 1000 samples/cases. */
const RATIO_DENOMINATOR = { "SC-01": 720 } as const;
const AVERAGE_COUNT = 20;

const round = (n: number, d: number) => Number(n.toFixed(d));

/**
 * Raw inputs whose computed value equals the series value (to float precision):
 * ratio -> a sensible denominator and the derived numerator; average -> 20 cases and
 * total = value x 20; duration in hours; direct as is. null -> blank inputs (no data).
 */
export function rawInputsFor(code: string, method: Method, value: number | null): RawInputs {
  switch (method) {
    case "direct":
    case "direct_percent":
      return { value: value === null ? null : String(value) };
    case "duration":
      return { value: value === null ? null : String(value), unit: "h" };
    case "ratio": {
      const den = RATIO_DENOMINATOR[code as keyof typeof RATIO_DENOMINATOR] ?? 1000;
      if (value === null) return { numerator: null, denominator: null };
      return { numerator: String(round((value * den) / 100, 4)), denominator: String(den) };
    }
    case "average":
      if (value === null) return { total: null, count: null };
      return { total: String(round(value * AVERAGE_COUNT, 4)), count: String(AVERAGE_COUNT) };
  }
}

/** Timestamps like the prototype: entered on the 3rd+ of the next month, approved a day later. */
export function entryTimes(monthKey: string, plantIndex: number, monthIndex: number) {
  const [y, m] = monthKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, 1)); // first day of the next month
  const ym = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  const p = (n: number) => String(n).padStart(2, "0");
  // The prototype's times are local (Baghdad, UTC+3): subtract 3 h to store as UTC.
  const local = (day: number, hh: number, mm: number) =>
    new Date(Date.parse(`${ym}-${p(day)}T${p(hh)}:${p(mm)}:00Z`) - 3 * 3600_000);
  return {
    enteredAt: local(3 + plantIndex, 9 + plantIndex, 10 + monthIndex * 7),
    approvedAt: local(4 + plantIndex, 11, 5 + monthIndex * 6),
  };
}

// --- Dijla's manual problem (HANDOFF section 7; prototype problems[0], lines 906-912) -------------

export const DIJLA_PROBLEM = {
  ref: "sys:RT-03",
  month: "2026-08",
  /** 2026-09-06 10:20 local */
  openedAt: new Date("2026-09-06T07:20:00Z"),
  description:
    "تجاوز متوسط زمن الاستجابة للشكاوى حد التحذير لفترتين متتاليتين (تموز وآب). فُتحت المشكلة يدوياً لتحديد العوائق المرتبطة بها.",
  obstacleCode: "O-26",
  classification: "possible" as const,
  obstacleNote: "عدد موظفي خدمة المستفيدين أقل من الملاك المعتمد.",
};

// --- the acceptance case: Al-Karkh, September 2026 -------------------------------------------------

/**
 * The prototype's September default for Al-Karkh (`sampleInputs()` for st-3, lines 1401-1404),
 * which the wizard prefills. One change: SC-02 was "4800" customers; it is now a percentage,
 * so 4800 / 1000 = 4.8 %. CS-02 is blank in the prototype (insufficient data), which makes
 * approval need the acknowledgement flag (1 indicator).
 *
 * With the current limits (WQ-02 warning 95, SC-02 5/10/20) the result is: critical SC-03
 * (7 > 6) and SC-04 (6.5 h > 5); warning SC-01 (93.9), CS-01 (43), RT-01 (4.29), RT-02
 * (13.14); CS-02 insufficient data; the rest within limits. Exactly two auto problems.
 */
export const KARKH_SEPTEMBER: Record<string, RawInputs> = {
  "sys:SC-01": { numerator: "676", denominator: "720" },
  "sys:SC-02": { value: "4.8" },
  "sys:SC-03": { value: "7" },
  "sys:SC-04": { value: "6.5", unit: "h" },
  "sys:WQ-01": { value: "118" },
  "sys:WQ-02": { numerator: "229", denominator: "240" },
  "sys:WQ-03": { numerator: "172", denominator: "180" },
  "sys:WQ-04": { value: "9" },
  "sys:CS-01": { value: "43" },
  "sys:CS-02": { numerator: "", denominator: "" },
  "sys:CS-03": { numerator: "37", denominator: "43" },
  "sys:RT-01": { count: "7", total: "30" },
  "sys:RT-02": { count: "7", total: "92" },
  "sys:RT-03": { count: "43", total: "559" },
  "sys:RT-04": { count: "43", total: "1720" },
};

export const KARKH_SEPTEMBER_PERIOD = "2026-09";
export const KARKH_SEPTEMBER_CRITICAL = ["sys:SC-03", "sys:SC-04"] as const;
/** Entered on this date in the acceptance test (any date in September or later works). */
export const KARKH_SEPTEMBER_NOW = new Date("2026-10-04T08:00:00Z");
