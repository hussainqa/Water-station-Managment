import type { ReportData, ReportIndicator, TrendPeriod } from "../types";

/** Hand-written report data for the renderer tests (no database). */
const counts = (ok: number, warning: number, critical: number, insufficient_data = 0, no_limits = 0) => ({
  ok,
  warning,
  critical,
  insufficient_data,
  no_limits,
});

const lowerLimits = { kind: "lower", target: 2, warning: 4, critical: 6 } as const;
const higherLimits = { kind: "higher", target: 98, warning: 95, critical: 90 } as const;

const row = (over: Partial<ReportIndicator> & Pick<ReportIndicator, "ref" | "nameAr">): ReportIndicator => ({
  code: null,
  nameEn: null,
  unit: "%",
  value: null,
  status: "ok",
  limits: null,
  note: "",
  previousValue: null,
  change: null,
  ...over,
});

const periods: TrendPeriod[] = [
  { assessmentId: "a1", periodStart: "2026-07", months: 1, counts: counts(3, 0, 0), evaluated: 3, withinShare: 100 },
  { assessmentId: "a2", periodStart: "2026-08", months: 1, counts: counts(2, 1, 0), evaluated: 3, withinShare: 66.6667 },
  { assessmentId: "a3", periodStart: "2026-09", months: 1, counts: counts(1, 0, 1, 1), evaluated: 2, withinShare: 50 },
];

export function fixtureReport(kind: "period" | "history" = "period"): ReportData {
  return {
    kind,
    plant: {
      id: "p1",
      name: "محطة الكرخ لمعالجة المياه",
      governorate: "baghdad",
      location: "جانب الكرخ",
      waterSource: "tigris",
      designCapacity: 160000,
      actualCapacity: 108000,
      engineer: "م. مصطفى جاسم",
    },
    latest: {
      assessmentId: "a3",
      periodStart: "2026-09",
      months: 1,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      enteredBy: "م. مصطفى جاسم",
      approvedAt: "2026-10-04T08:00:00.000Z",
      completeness: { percent: 66.7, withValue: 2, total: 3 },
      counts: counts(1, 0, 1, 1),
    },
    groups: [
      {
        key: "sys:continuity",
        nameAr: "مؤشرات استمرارية الخدمة",
        nameEn: "Service continuity indicators",
        rows: [
          row({
            ref: "sys:SC-04",
            code: "SC-04",
            nameAr: "مدة الانقطاعات غير المخططة",
            nameEn: "Duration of unplanned interruptions",
            unit: "h",
            value: 6.5,
            status: "critical",
            limits: lowerLimits,
            note: "ملاحظة المهندس <img src=x onerror=alert(1)>",
            previousValue: 4.1,
            change: "worsened",
          }),
          row({
            ref: "sys:WQ-02",
            code: "WQ-02",
            nameAr: "العينات المطابقة",
            nameEn: "Compliant samples",
            value: 99,
            status: "ok",
            limits: higherLimits,
            previousValue: 99,
            change: "unchanged",
          }),
          row({ ref: "sys:CS-02", code: "CS-02", nameAr: "رضا المستفيدين", nameEn: "Customer satisfaction", status: "insufficient_data" }),
        ],
      },
    ],
    periods,
    trends: [
      { ref: "sys:SC-04", code: "SC-04", nameAr: "مدة الانقطاعات غير المخططة", nameEn: "Duration of unplanned interruptions", unit: "h", cells: [{ value: 3.4, status: "warning", limits: lowerLimits }, { value: 4.1, status: "warning", limits: lowerLimits }, { value: 6.5, status: "critical", limits: lowerLimits }] },
      { ref: "sys:WQ-02", code: "WQ-02", nameAr: "العينات المطابقة", nameEn: "Compliant samples", unit: "%", cells: [{ value: 97, status: "ok", limits: higherLimits }, null, { value: 99, status: "ok", limits: higherLimits }] },
    ],
    months: 1,
    problems: [
      {
        id: "pr1",
        assessmentId: "a3",
        indicator: { ref: "sys:SC-04", code: "SC-04", nameAr: "مدة الانقطاعات غير المخططة", nameEn: "Duration of unplanned interruptions", unit: "h" },
        periodStart: "2026-09",
        months: 1,
        detectedOn: "2026-10-04",
        value: 6.5,
        readingStatus: "critical",
        limits: lowerLimits,
        limitCrossed: { status: "critical", limit: 6, side: null },
        origin: "auto",
        description: "وصف المشكلة </style><b>x</b>",
        stage: "treated",
        obstacles: [
          {
            kind: "system",
            axisNameAr: "العوائق الإدارية",
            axisNameEn: "Administrative obstacles",
            seqInAxis: 3,
            textAr: "ضعف التنسيق بين الإدارات",
            textEn: "Weak coordination between departments",
            classification: "confirmed",
            note: "دليل <script>alert(1)</script>",
          },
          { kind: "custom", name: "عائق خاص بالموقع", classification: "possible", note: "" },
        ],
        actions: [
          {
            kind: "system",
            rank: 2,
            textAr: "تنفيذ جولات تفتيش ميدانية دورية",
            textEn: "Carry out periodic field inspection rounds",
            chosen: true,
            needsStudy: false,
            implementedOn: "2026-10-20",
            linkedObstacle: { kind: "system", axisNameAr: "العوائق الإدارية", axisNameEn: "Administrative obstacles", seqInAxis: 3, textAr: "ضعف التنسيق بين الإدارات", textEn: "Weak coordination between departments" },
          },
          { kind: "system", rank: null, textAr: "دراسة بديل", textEn: "Study an alternative", chosen: false, needsStudy: true, implementedOn: null, linkedObstacle: null },
          { kind: "custom", name: "إجراء خاص", chosen: true, needsStudy: false, implementedOn: null, linkedObstacle: null },
        ],
      },
    ],
  };
}
