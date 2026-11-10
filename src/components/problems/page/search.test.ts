import { describe, expect, it } from "vitest";
import {
  filterActionAxes,
  filterActions,
  filterObstacleAxes,
  matchesTokens,
  normalizeText,
  queryTokens,
} from "./search";

describe("normalizeText", () => {
  it("folds alef, teh marbuta and alef maqsura variants", () => {
    expect(normalizeText("الإدارة")).toBe(normalizeText("الاداره"));
    expect(normalizeText("أجهزة آلية")).toBe(normalizeText("اجهزه اليه"));
    expect(normalizeText("على")).toBe(normalizeText("علي"));
  });
  it("drops diacritics and tatweel and converts Arabic digits", () => {
    expect(normalizeText("مُؤَكَّد")).toBe("مؤكد");
    expect(normalizeText("كــلور")).toBe("كلور");
    expect(normalizeText("٤٠ عائقاً")).toBe("40 عائقا");
  });
  it("lower-cases Latin text and collapses spaces", () => {
    expect(normalizeText("  Flow   METERS ")).toBe("flow meters");
  });
});

describe("matching", () => {
  const item = { textAr: "نقص في معدات المراقبة", textEn: "Shortage of monitoring equipment" };
  it("needs every token, in either language", () => {
    expect(matchesTokens(queryTokens("معدات"), item)).toBe(true);
    expect(matchesTokens(queryTokens("monitoring equipment"), item)).toBe(true);
    expect(matchesTokens(queryTokens("معدات equipment"), item)).toBe(true);
    expect(matchesTokens(queryTokens("معدات pumps"), item)).toBe(false);
  });
  it("an empty query matches everything", () => {
    expect(matchesTokens(queryTokens("   "), item)).toBe(true);
  });
  it("is tolerant to Arabic spelling variants", () => {
    expect(matchesTokens(queryTokens("المراقبه"), item)).toBe(true);
  });
});

const axes = [
  {
    idx: 0,
    obstacles: [
      { code: "O-01", textAr: "نقص المعدات", textEn: "Equipment shortage" },
      { code: "O-02", textAr: "ضعف التدريب", textEn: "Weak training" },
    ],
  },
  { idx: 1, obstacles: [{ code: "O-03", textAr: "تأخر الصيانة", textEn: "Late maintenance" }] },
];

describe("filterObstacleAxes", () => {
  it("filters by query and drops empty axes", () => {
    const r = filterObstacleAxes(axes, { query: "maintenance", selectedOnly: false, selected: new Set() });
    expect(r.map((a) => a.idx)).toEqual([1]);
  });
  it("filters to the selected ones", () => {
    const r = filterObstacleAxes(axes, { query: "", selectedOnly: true, selected: new Set(["O-02"]) });
    expect(r).toHaveLength(1);
    expect(r[0].obstacles.map((o) => o.code)).toEqual(["O-02"]);
  });
  it("keeps source order and does not mutate the input", () => {
    const r = filterObstacleAxes(axes, { query: "", selectedOnly: false, selected: new Set() });
    expect(r.map((a) => a.obstacles.length)).toEqual([2, 1]);
    expect(axes[0].obstacles).toHaveLength(2);
  });
});

describe("filterActions / filterActionAxes", () => {
  const actions = [
    { textAr: "شراء عدادات", textEn: "Buy meters" },
    { textAr: "تدريب الكوادر", textEn: "Train staff" },
  ];
  it("filters a flat list", () => {
    expect(filterActions(actions, "train")).toHaveLength(1);
    expect(filterActions(actions, "")).toHaveLength(2);
  });
  it("filters grouped actions and drops empty groups", () => {
    const groups = [
      { idx: 0, actions },
      { idx: 1, actions: [{ textAr: "صيانة", textEn: "Maintain" }] },
    ];
    const r = filterActionAxes(groups, "maintain");
    expect(r.map((g) => g.idx)).toEqual([1]);
    expect(filterActionAxes(groups, "")).toHaveLength(2);
  });
});
