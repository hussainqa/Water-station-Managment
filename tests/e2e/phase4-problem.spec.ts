import { expect, test, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import type { SeedDemoResult } from "../../scripts/seed-demo";
import arProblems from "../../messages/ar/problems.json";
import enProblems from "../../messages/en/problems.json";
import arShell from "../../messages/ar/shell.json";
import enShell from "../../messages/en/shell.json";
import { hydrated, newEmail, PASSWORD, signInViaUi } from "./helpers";

/**
 * Phase 4 (part A): the problem page. Each run seeds a throwaway copy of the demo data for a
 * fresh e2e account, then (WITHOUT the UI, in a tsx child process on the owner connection)
 * creates Al-Karkh September 2026 and reads the SC-04 / SC-03 problem ids. The acceptance
 * journey runs on SC-04; "keep the obstacle only" runs on SC-03.
 * Writes docs/screenshots/phase-4/problem-{empty,actions,showall,unlisted}-<lang>-<project>.png.
 */
const SHOTS = "docs/screenshots/phase-4";
type Lang = "ar" | "en";
const M = { ar: arProblems, en: enProblems } as const;

function runTsx<T>(code: string): T {
  const out = execFileSync("npx", ["tsx", "-e", code], { cwd: process.cwd(), encoding: "utf8", timeout: 180_000 });
  const line = out.split("\n").find((l) => l.startsWith("RESULT"));
  if (!line) throw new Error(`child process failed: ${out}`);
  return JSON.parse(line.slice(6)) as T;
}

function seedFor(email: string): SeedDemoResult {
  const code = `import("./scripts/seed-demo.ts").then(async (m) => { const r = await m.seedDemo({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(PASSWORD)}, name: "E2E Engineer" }); console.log("RESULT" + JSON.stringify(r)); })`;
  return runTsx<SeedDemoResult>(code);
}

const PRELUDE = `
const must = (r, what) => { if (!r.ok) throw new Error(what + " failed: " + JSON.stringify(r)); return r.data; };
async function load() {
  const { connectAsOwner } = await import("./scripts/lib/owner-db.ts");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("./src/db/schema/index.ts");
  const assess = await import("./src/lib/assessments/service.ts");
  const probs = await import("./src/lib/problems/service.ts");
  const demo = await import("./scripts/lib/demo-data.ts");
  const client = await connectAsOwner();
  return { client, tx: drizzle(client, { schema }), assess, probs, demo };
}
`;

type Setup = { sc04: string; sc03: string; detectedOn: string };

/** Al-Karkh September 2026 through the assessments service (no UI); returns the two auto problems. */
function createKarkhSeptember(userId: string, karkhPlantId: string): Setup {
  const code = `${PRELUDE}
(async () => {
  const { client, tx, assess, probs, demo } = await load();
  try {
    const userId = ${JSON.stringify(userId)};
    const NOW = demo.KARKH_SEPTEMBER_NOW;
    const actor = "E2E Engineer";
    const { id } = must(await assess.createDraft(tx, userId, { plantId: ${JSON.stringify(karkhPlantId)}, periodStart: demo.KARKH_SEPTEMBER_PERIOD, months: 1, enteredBy: actor }, { now: NOW, actor }), "draft");
    must(await assess.setDraftSelection(tx, userId, id, Object.keys(demo.KARKH_SEPTEMBER)), "selection");
    const readings = Object.fromEntries(Object.entries(demo.KARKH_SEPTEMBER).map(([ref, inputs]) => [ref, { inputs }]));
    must(await assess.saveDraftReadings(tx, userId, id, readings), "readings");
    must(await assess.approveAssessment(tx, userId, id, { acknowledgeMissing: true, now: NOW, actor }), "approve");
    const list = await probs.listProblems(tx, userId, { plantId: ${JSON.stringify(karkhPlantId)}, range: "all", now: new Date() });
    const sc04 = list.find((p) => p.indicator.code === "SC-04");
    const sc03 = list.find((p) => p.indicator.code === "SC-03");
    console.log("RESULT" + JSON.stringify({ sc04: sc04.id, sc03: sc03.id, detectedOn: sc04.detectedOn }));
  } finally { await client.end(); }
})();`;
  return runTsx<Setup>(code);
}

/** countOpenProblems semantics (the badge) read through the service on the owner connection. */
function openCount(userId: string): number {
  const code = `${PRELUDE}
(async () => {
  const { client, tx, probs } = await load();
  try { console.log("RESULT" + (await probs.countOpenProblems(tx, ${JSON.stringify(userId)}))); }
  finally { await client.end(); }
})();`;
  return runTsx<number>(code);
}

async function ownerRows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await connectAsOwner();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    await c.end();
  }
}

type RefObstacle = { code: string; axis_idx: number; seq_in_axis: number; text_ar: string; text_en: string };
type RefAction = { code: string; axis_idx: number; text_ar: string; text_en: string };
type RefLink = { obstacle_code: string; action_code: string; rank: number };

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string, lang: Lang, project: string, fullPage: boolean) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/problem-${name}-${lang}-${project}.png`, fullPage });
}

const dayOffset = (base: string, days: number) => {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** the obstacle row (by its text, as a user finds it) */
function obstacleRow(page: Page, text: string): Locator {
  return page.getByTestId("obstacle-row").filter({ hasText: text });
}

async function openAllAxes(page: Page) {
  const toggles = page.getByTestId("axis-toggle");
  const n = await toggles.count();
  for (let i = 0; i < n; i++) {
    const b = toggles.nth(i);
    if ((await b.getAttribute("aria-expanded")) === "false") await b.click();
  }
  await expect(page.locator('[data-testid="axis-toggle"][aria-expanded="false"]')).toHaveCount(0);
}

async function tick(page: Page, text: string, code: string) {
  const row = obstacleRow(page, text);
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-code", code);
  await row.getByRole("checkbox").click();
  await expect(row).toHaveAttribute("data-selected", "true");
}

const chip = (page: Page) => page.getByTestId("stage-chip");
const group = (page: Page, key: string) => page.locator(`[data-testid="action-group"][data-obstacle="${key}"]`);
const cardOf = (scope: Page | Locator, code: string) => scope.locator(`[data-testid="action-card"][data-action="${code}"]`);

for (const lang of ["ar", "en"] as const) {
  test(`problem page journey (${lang})`, async ({ page }, info) => {
    test.setTimeout(480_000);
    const project = info.project.name;
    const m = M[lang];
    const pickText = <T extends { text_ar: string; text_en: string }>(r: T) => (lang === "en" ? r.text_en : r.text_ar);

    // --- set-up without the UI -----------------------------------------------------------------
    const email = newEmail();
    const seed = seedFor(email);
    const setup = createKarkhSeptember(seed.userId, seed.plantIds.karkh);
    const obstaclesRef = await ownerRows<RefObstacle>(
      "select code, axis_idx, seq_in_axis, text_ar, text_en from obstacles order by axis_idx, seq_in_axis",
    );
    const actionsRef = await ownerRows<RefAction>("select code, axis_idx, text_ar, text_en from corrective_actions order by code");
    const linksRef = await ownerRows<RefLink>(
      "select obstacle_code, action_code, rank from obstacle_action_links order by obstacle_code, rank",
    );
    expect(obstaclesRef).toHaveLength(40);
    expect(actionsRef).toHaveLength(65);
    const obs = (code: string) => obstaclesRef.find((o) => o.code === code)!;
    const act = (code: string) => actionsRef.find((a) => a.code === code)!;
    const linksOf = (code: string) => linksRef.filter((l) => l.obstacle_code === code).sort((a, b) => a.rank - b.rank);

    const o36 = obs("O-36");
    expect(linksOf("O-36").map((l) => [l.action_code, l.rank])).toEqual([["A-41", 1]]);
    // a second obstacle with several linked actions, on another axis
    const multiCode = [...new Set(linksRef.map((l) => l.obstacle_code))].find(
      (c) => c !== "O-36" && linksOf(c).length >= 3 && obs(c).axis_idx !== o36.axis_idx,
    )!;
    const multi = obs(multiCode);
    const multiLinks = linksOf(multiCode);
    expect(multiLinks.length).toBeGreaterThanOrEqual(3);
    const o39 = obs("O-39");
    expect(linksOf("O-39")).toHaveLength(0);

    await signInViaUi(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/ar\/dashboard/, { timeout: 30_000 });

    // --- 1. the facts, the stage, the shape of the obstacle list ----------------------------------
    await page.goto(`/${lang}/problems/${setup.sc04}`);
    await expect(page.getByTestId("section-problem")).toBeVisible({ timeout: 90_000 });
    await hydrated(page);
    await expect(chip(page)).toHaveAttribute("data-stage", "awaiting_obstacles");
    await expect(chip(page)).toHaveText(m.stage.awaiting_obstacles);
    await expect(page.getByTestId("fact-plant")).toContainText("الكرخ");
    await expect(page.getByTestId("fact-detected")).toHaveText(setup.detectedOn);
    await expect(page.getByTestId("fact-value")).toContainText("6.5");
    await expect(page.getByTestId("fact-limit")).not.toHaveText("—");
    await expect(page.getByTestId("fact-status").locator('[data-status="critical"]')).toBeVisible();
    await expect(page.getByTestId("fact-origin")).toHaveText(m.facts.auto);
    await expect(page.getByTestId("fact-period").getByRole("link")).toHaveAttribute("href", /\/assessments\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("threshold-scale")).toBeVisible();
    // client note 11: the helper text, verbatim
    await expect(page.getByTestId("obstacles-helper")).toHaveText(m.obstacles.helper);
    if (lang === "ar") {
      expect(m.obstacles.helper).toBe("حدّد فقط العوائق التي ترتبط بهذه المشكلة، وصنّف كلاً منها: مؤكد أو محتمل. لا يلزم تقييم بقية العوائق.");
    }
    // the three stages are separate sections, in order
    const order = await page.locator('[data-testid^="section-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(order).toEqual(["section-problem", "section-obstacles", "section-actions"]);
    // client note 13: no explanatory line under the actions heading
    await expect(page.getByTestId("section-actions").locator("#step-actions + p")).toHaveCount(0);
    await expect(page.getByTestId("actions-empty")).toBeVisible();

    // 7 axes, numbering restarts at 1 in each, no codes / RII / priority text
    await expect(page.getByTestId("obstacle-axis")).toHaveCount(7);
    await openAllAxes(page);
    const axes = page.getByTestId("obstacle-axis");
    for (let i = 0; i < 7; i++) {
      const numbers = await axes.nth(i).getByTestId("obstacle-number").allTextContents();
      expect(numbers.map(Number)).toEqual(numbers.map((_, k) => k + 1));
    }
    await expect(page.getByTestId("obstacle-row")).toHaveCount(40);
    const obstaclesText = await page.getByTestId("section-obstacles").innerText();
    expect(obstaclesText).not.toMatch(/O-\d\d/);
    expect(obstaclesText).not.toMatch(/RII|معامل|الارتباط|الأولوية|priority|correlation|importance|الأهمية/i);
    await noHorizontalScroll(page);
    await shot(page, "empty", lang, project, true);

    // search across both languages, then the "selected" filter
    const search = page.getByTestId("obstacle-search");
    const enWords = o36.text_en.split(" ").slice(0, 3).join(" ");
    await search.fill(enWords);
    await expect(obstacleRow(page, pickText(o36))).toHaveCount(1);
    expect(await page.getByTestId("obstacle-row").count()).toBeLessThan(40);
    await search.fill("zzzz-nothing");
    await expect(page.getByTestId("obstacles-empty")).toBeVisible();
    await search.fill("");
    await expect(page.getByTestId("obstacle-row")).toHaveCount(40);

    // --- 2. select O-36: stage, linked action (rank 1) ---------------------------------------------
    const before = openCount(seed.userId);
    expect(before).toBeGreaterThanOrEqual(2);
    await tick(page, pickText(o36), "O-36");
    await expect(chip(page)).toHaveAttribute("data-stage", "choosing_action");
    await expect(chip(page)).toHaveText(m.stage.choosing_action);
    const g36 = group(page, "O-36");
    await expect(g36).toBeVisible();
    await expect(g36.getByTestId("group-title")).toHaveText(pickText(o36));
    await expect(g36.getByTestId("classification-pill")).toHaveText(m.obstacles.confirmed);
    await expect(g36.getByTestId("action-card")).toHaveCount(1);
    await expect(g36.getByTestId("action-card").first()).toHaveAttribute("data-action", "A-41");
    await expect(g36.getByTestId("rank").first()).toHaveText(new RegExp(`${m.actions.rank}\\s*1$`));
    await expect(g36.getByTestId("action-text").first()).toHaveText(pickText(act("A-41")));
    await expect(page.getByTestId("axis-selected")).toHaveCount(1);

    // a second obstacle with several linked actions: ascending rank, same as the reference data
    await tick(page, pickText(multi), multiCode);
    const gm = group(page, multiCode);
    await expect(gm.getByTestId("action-card")).toHaveCount(multiLinks.length);
    const ranks = (await gm.getByTestId("rank").allTextContents()).map((s) => Number(s.replace(/\D/g, "")));
    expect(ranks).toEqual(multiLinks.map((l) => l.rank));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    const codes = await gm.getByTestId("action-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
    expect(codes).toEqual(multiLinks.map((l) => l.action_code));
    await expect(gm.getByTestId("action-text").first()).toHaveText(pickText(act(multiLinks[0].action_code)));
    // groups follow the API order: both confirmed, axis order
    const groupKeys = await page.getByTestId("action-group").evaluateAll((els) => els.map((e) => e.getAttribute("data-obstacle")));
    expect(groupKeys).toEqual([...["O-36", multiCode]].sort((a, b) => obs(a).axis_idx - obs(b).axis_idx));
    // action cards carry no codes, RII, correlation, priority or axis label
    const cardsText = await page.getByTestId("section-actions").innerText();
    expect(cardsText).not.toMatch(/A-\d\d|O-\d\d/);
    expect(cardsText).not.toMatch(/RII|معامل|الارتباط|الأولوية|priority|correlation|%/i);
    await noHorizontalScroll(page);

    // classification and notes are saved and audited
    const row36 = obstacleRow(page, pickText(o36));
    await row36.getByRole("radio", { name: m.obstacles.possible }).check({ force: true });
    await expect(g36.getByTestId("classification-pill")).toHaveText(m.obstacles.possible);
    await row36.getByRole("radio", { name: m.obstacles.confirmed }).check({ force: true });
    await expect(g36.getByTestId("classification-pill")).toHaveText(m.obstacles.confirmed);
    await row36.getByTestId("obstacle-note").fill("ملاحظة اختبار");
    await row36.getByTestId("obstacle-note").blur();
    await expect(row36.getByText(m.obstacles.noteSaved)).toBeVisible({ timeout: 20_000 });

    // --- 3. choose A-41: treated, the badge drops by one -------------------------------------------
    const card41 = cardOf(g36, "A-41");
    await card41.getByTestId("choose").click();
    await expect(chip(page)).toHaveAttribute("data-stage", "treated", { timeout: 30_000 });
    await expect(chip(page)).toHaveText(m.stage.treated);
    await expect(card41).toHaveAttribute("data-chosen", "true");
    await expect(page.getByTestId("done-banner")).toBeVisible();
    await expect(page.getByTestId("sum-chosen-n")).toHaveText("1");
    await expect(page.getByTestId("sum-implemented-n")).toHaveText("0");
    await expect(page.getByTestId("obstacle-only-prompt")).toHaveCount(0);
    await expect.poll(() => openCount(seed.userId), { timeout: 60_000, intervals: [500, 1_000] }).toBe(before - 1);
    if (project === "desktop") {
      const badge = page.locator("aside").getByTestId("open-problems-badge");
      await (before - 1 > 0 ? expect(badge).toHaveCount(1, { timeout: 20_000 }) : expect(badge).toHaveCount(0, { timeout: 20_000 }));
    }
    await shot(page, "actions", lang, project, true);

    // --- 4. implementation: future / before detection rejected, a valid date saved -----------------
    await card41.getByTestId("impl-open").click();
    const date = card41.getByTestId("impl-date");
    await date.fill(dayOffset(new Date().toISOString().slice(0, 10), 5));
    await card41.getByTestId("impl-save").click();
    await expect(card41.getByTestId("impl-error")).toHaveText(m.errors.futureDate);
    await date.fill(dayOffset(setup.detectedOn, -1));
    await card41.getByTestId("impl-save").click();
    await expect(card41.getByTestId("impl-error")).toHaveText(m.errors.beforeDetected);
    await expect(card41).toHaveAttribute("data-implemented", "false");
    await date.fill(setup.detectedOn);
    await card41.getByTestId("impl-save").click();
    await expect(card41).toHaveAttribute("data-implemented", "true", { timeout: 30_000 });
    await expect(card41.getByTestId("implemented-on")).toContainText(setup.detectedOn);
    await expect(page.getByTestId("sum-implemented-n")).toHaveText("1");
    await expect(page.getByTestId("summary-item").first()).toHaveAttribute("data-implemented", "true");

    // --- 5. un-ticking O-36 while A-41 is chosen is refused, with the reason ----------------------
    await row36.getByRole("checkbox").click();
    const blocked = row36.getByTestId("blocked-notice");
    await expect(blocked).toBeVisible({ timeout: 30_000 });
    await expect(blocked).toContainText(m.obstacles.blockedTitle);
    await expect(blocked.getByTestId("blocking-action")).toHaveText(pickText(act("A-41")));
    await expect(row36).toHaveAttribute("data-selected", "true");
    await expect(g36).toBeVisible();

    // --- 6. un-choose: the implementation is cleared, stage back to choosing -------------------------
    await card41.getByTestId("choose").click();
    await expect(chip(page)).toHaveAttribute("data-stage", "choosing_action", { timeout: 30_000 });
    await expect(card41).toHaveAttribute("data-chosen", "false");
    await expect(card41).toHaveAttribute("data-implemented", "false");
    await expect(card41.getByTestId("implemented-on")).toHaveCount(0);
    await expect(page.getByTestId("sum-chosen-n")).toHaveText("0");
    await expect.poll(() => openCount(seed.userId), { timeout: 60_000, intervals: [500, 1_000] }).toBe(before);

    // needs further study
    await card41.getByTestId("study").click();
    await expect(card41).toHaveAttribute("data-study", "true");
    await expect(card41.getByTestId("state-study")).toBeVisible();
    await expect(page.getByTestId("sum-study-n")).toHaveText("1");

    // --- 7. an unlisted obstacle: all 65 actions, text only, no rank numbers --------------------------
    await page.getByTestId("add-obstacle").click();
    const dlg = page.getByTestId("obstacle-dialog");
    await expect(dlg).toBeVisible();
    await dlg.getByTestId("obstacle-submit").click();
    await expect(dlg.getByText(m.errors.required)).toBeVisible();
    await dlg.getByTestId("obstacle-name").fill("عائق خاص بالاختبار");
    await dlg.getByTestId("obstacle-description").fill("وصف العائق");
    await dlg.getByTestId("obstacle-rationale").fill("مبررات العائق");
    await dlg.getByRole("radio", { name: m.obstacles.possible }).check({ force: true });
    await dlg.getByTestId("obstacle-submit").click();
    await expect(dlg).toBeHidden({ timeout: 30_000 });
    const custom = page.locator('[data-testid="action-group"][data-obstacle^="custom:"]');
    await expect(custom).toHaveCount(1, { timeout: 30_000 });
    await expect(custom.getByTestId("classification-pill")).toHaveText(m.obstacles.possible);
    await expect(custom.getByTestId("rank")).toHaveCount(0);
    await expect(custom.getByTestId("action-card")).toHaveCount(8);
    await custom.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate(() => window.scrollBy(0, -100));
    await shot(page, "unlisted", lang, project, false);
    await custom.getByTestId("plain-more").click();
    await expect(custom.getByTestId("action-card")).toHaveCount(65);
    await expect(custom.getByTestId("rank")).toHaveCount(0);
    await expect(custom.getByTestId("plain-more")).toHaveAttribute("aria-expanded", "true");
    const search65 = custom.getByTestId("plain-search");
    await search65.fill(act("A-41").text_en.split(" ").slice(0, 4).join(" "));
    await expect(custom.getByTestId("action-card").first()).toHaveAttribute("data-action", "A-41");
    expect(await custom.getByTestId("action-card").count()).toBeLessThan(65);
    await search65.fill("");
    await expect(custom.getByTestId("action-card")).toHaveCount(65);
    // the unlisted obstacle in the list: edit
    const customRow = page.getByTestId("custom-obstacle-row");
    await expect(customRow).toHaveCount(1);
    await customRow.getByTestId("obstacle-edit").click();
    await dlg.getByTestId("obstacle-name").fill("عائق خاص بالاختبار (معدّل)");
    await dlg.getByTestId("obstacle-submit").click();
    await expect(dlg).toBeHidden({ timeout: 30_000 });
    await expect(customRow.getByTestId("obstacle-text")).toHaveText("عائق خاص بالاختبار (معدّل)");

    // --- 8. O-39 has no linked actions: the message and its axis's actions ---------------------------
    await tick(page, pickText(o39), "O-39");
    const g39 = group(page, "O-39");
    await expect(g39.getByTestId("no-linked")).toHaveText(m.actions.noLinked);
    const axisCount = actionsRef.filter((a) => a.axis_idx === o39.axis_idx).length;
    expect(axisCount).toBeGreaterThan(0);
    await expect(g39.getByTestId("axis-actions").getByTestId("action-card")).toHaveCount(axisCount);
    await expect(g39.getByTestId("rank")).toHaveCount(0);
    await expect(g39.getByTestId("linked-actions")).toHaveCount(0);

    // --- 9. show all corrective actions ---------------------------------------------------------------
    await page.getByTestId("show-all").click();
    const all = page.getByTestId("show-all-dialog");
    await expect(all).toBeVisible();
    await expect(all.getByTestId("show-all-axis")).toHaveCount(7, { timeout: 30_000 });
    await expect(all.getByTestId("action-card")).toHaveCount(65);
    const linkedActions = new Set([...linksOf("O-36"), ...multiLinks].map((l) => l.action_code));
    await expect(all.getByTestId("linked-mark")).toHaveCount(linkedActions.size);
    await expect(cardOf(all, "A-41").getByTestId("rank")).toHaveText(new RegExp(`${m.actions.rank}\\s*1$`));
    // unlinked actions carry no rank and no mark
    const unlinked = actionsRef.find((a) => !linkedActions.has(a.code))!;
    await expect(cardOf(all, unlinked.code).getByTestId("rank")).toHaveCount(0);
    await expect(cardOf(all, unlinked.code).getByTestId("linked-mark")).toHaveCount(0);
    await shot(page, "showall", lang, project, false);
    // search narrows (both languages)
    const allSearch = all.getByTestId("show-all-search");
    await allSearch.fill(act("A-41").text_en.split(" ").slice(0, 4).join(" "));
    await expect(cardOf(all, "A-41")).toBeVisible();
    expect(await all.getByTestId("action-card").count()).toBeLessThan(65);
    expect(await all.getByTestId("show-all-axis").count()).toBeLessThan(7);
    await allSearch.fill("");
    await expect(all.getByTestId("action-card")).toHaveCount(65);
    // flag and choose an unlinked action from here, then un-choose it again
    const unlinkedCard = cardOf(all, unlinked.code);
    await unlinkedCard.scrollIntoViewIfNeeded();
    await unlinkedCard.getByTestId("study").click();
    await expect(unlinkedCard).toHaveAttribute("data-study", "true", { timeout: 30_000 });
    await unlinkedCard.getByTestId("study").click();
    await expect(unlinkedCard).toHaveAttribute("data-study", "false", { timeout: 30_000 });
    await unlinkedCard.getByTestId("choose").click();
    await expect(unlinkedCard).toHaveAttribute("data-chosen", "true", { timeout: 30_000 });
    await unlinkedCard.getByTestId("choose").click();
    await expect(unlinkedCard).toHaveAttribute("data-chosen", "false", { timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(all).toBeHidden();
    await expect(chip(page)).toHaveAttribute("data-stage", "choosing_action");

    // --- 10. a case-specific action chosen right away: treated; delete refused while chosen ------------
    await page.getByTestId("add-action").click();
    const adlg = page.getByTestId("action-dialog");
    await expect(adlg).toBeVisible();
    await adlg.getByTestId("action-submit").click();
    await expect(adlg.getByText(m.errors.required)).toBeVisible();
    await adlg.getByTestId("action-name").fill("إجراء خاص بالاختبار");
    await adlg.getByTestId("action-description").fill("وصف الإجراء");
    await adlg.getByTestId("action-linked").selectOption({ label: pickText(o36) });
    await adlg.getByTestId("action-rationale").fill("مبررات الإجراء");
    await adlg.getByTestId("action-choose-now").click();
    await adlg.getByTestId("action-submit").click();
    await expect(adlg).toBeHidden({ timeout: 30_000 });
    const customCard = page.getByTestId("custom-action-card");
    await expect(customCard).toHaveCount(1, { timeout: 30_000 });
    await expect(customCard).toHaveAttribute("data-chosen", "true");
    await expect(chip(page)).toHaveAttribute("data-stage", "treated", { timeout: 30_000 });
    await customCard.getByTestId("custom-delete").click();
    await customCard.getByTestId("custom-delete-confirm").click();
    await expect(customCard.getByTestId("custom-delete-error")).toHaveText(m.errors.customActionLocked, { timeout: 30_000 });
    await expect(customCard).toHaveCount(1);
    // lifecycle controls work on it too, then un-choose and delete
    await customCard.getByTestId("choose").click();
    await expect(customCard).toHaveAttribute("data-chosen", "false", { timeout: 30_000 });
    await expect(chip(page)).toHaveAttribute("data-stage", "choosing_action", { timeout: 30_000 });
    await customCard.getByTestId("custom-delete").click();
    await customCard.getByTestId("custom-delete-confirm").click();
    await expect(page.getByTestId("custom-action-card")).toHaveCount(0, { timeout: 30_000 });

    // --- 11. description edit and the audit trail -------------------------------------------------------
    const desc = page.getByTestId("description");
    await desc.fill("وصف معدّل في الاختبار");
    await page.getByTestId("description-save").click();
    await expect(page.getByTestId("description-save")).toBeDisabled({ timeout: 30_000 });
    // newest first: the description change is on top
    await expect(page.getByTestId("audit-entry").first()).toHaveAttribute("data-action", "description_changed", { timeout: 30_000 });
    const auditActions = await page.getByTestId("audit-entry").evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
    for (const a of [
      "opened",
      "obstacle_selected",
      "obstacle_classification_changed",
      "obstacle_note_changed",
      "action_chosen",
      "action_implemented",
      "action_unchosen",
      "action_needs_study_set",
      "custom_obstacle_added",
      "custom_action_added",
      "custom_action_deleted",
      "description_changed",
      "stage_changed",
    ]) {
      expect(auditActions, a).toContain(a);
    }
    const auditText = await page.getByTestId("audit").innerText();
    expect(auditText).toContain(pickText(o36));
    expect(auditText).not.toMatch(/\{|\}|O-\d\d|A-\d\d/);
    await noHorizontalScroll(page);

    // --- 12. end state: choose A-41 again, reload, everything persisted -----------------------------------
    await card41.getByTestId("choose").click();
    await expect(chip(page)).toHaveAttribute("data-stage", "treated", { timeout: 30_000 });
    // the chip is optimistic: wait for the server's answer (a new newest audit entry) before reloading
    await expect(page.getByTestId("audit-entry").first()).not.toHaveAttribute("data-action", "description_changed", { timeout: 30_000 });
    await page.reload();
    await expect(page.getByTestId("section-problem")).toBeVisible({ timeout: 90_000 });
    await hydrated(page);
    await expect(chip(page)).toHaveAttribute("data-stage", "treated");
    await expect(page.getByTestId("description")).toHaveValue("وصف معدّل في الاختبار");
    await expect(page.getByTestId("sum-chosen-n")).toHaveText("1");
    await expect(page.getByTestId("sum-study-n")).toHaveText("1");
    await openAllAxes(page);
    await expect(obstacleRow(page, pickText(o36)).getByTestId("obstacle-note")).toHaveValue("ملاحظة اختبار");
    await expect(page.getByTestId("custom-obstacle-row")).toHaveCount(1);
    await expect(group(page, "O-39").getByTestId("no-linked")).toBeVisible();
    await expect(cardOf(group(page, "O-36"), "A-41")).toHaveAttribute("data-chosen", "true");
    await expect(cardOf(group(page, "O-36"), "A-41")).toHaveAttribute("data-study", "true");
    // the selected filter lists only the selected obstacles
    await page.getByRole("radio", { name: new RegExp(m.obstacles.filterSelected.replace("({count})", "\\(\\d+\\)")) }).check({ force: true });
    await expect(page.getByTestId("obstacle-row")).toHaveCount(3); // O-36, the second obstacle, O-39
    await noHorizontalScroll(page);

    // --- 13. "keep the obstacle only" on SC-03, then undo ----------------------------------------------------
    await page.goto(`/${lang}/problems/${setup.sc03}`);
    await expect(page.getByTestId("section-problem")).toBeVisible({ timeout: 90_000 });
    await hydrated(page);
    await expect(chip(page)).toHaveAttribute("data-stage", "awaiting_obstacles");
    await expect(page.getByTestId("obstacle-only")).toHaveCount(0); // nothing selected yet
    await openAllAxes(page);
    const o37 = obs("O-37");
    await tick(page, pickText(o37), "O-37");
    await expect(chip(page)).toHaveAttribute("data-stage", "choosing_action");
    await page.getByTestId("obstacle-only").click();
    await expect(chip(page)).toHaveAttribute("data-stage", "documented", { timeout: 30_000 });
    await expect(chip(page)).toHaveText(m.stage.documented);
    await expect(page.getByTestId("done-banner")).toContainText(m.banner.documented);
    await expect(page.getByTestId("obstacle-only")).toHaveCount(0);
    await expect.poll(() => openCount(seed.userId), { timeout: 60_000, intervals: [500, 1_000] }).toBe(before - 2); // SC-04 treated again, SC-03 documented
    await page.getByTestId("obstacle-only-undo").click();
    await expect(chip(page)).toHaveAttribute("data-stage", "choosing_action", { timeout: 30_000 });
    await expect(page.getByTestId("done-banner")).toHaveCount(0);
    await expect(page.getByTestId("obstacle-only")).toBeVisible();
    await noHorizontalScroll(page);

    // an unknown id is a 404
    await page.goto(`/${lang}/problems/00000000-0000-4000-8000-000000000000`);
    await expect(page.getByTestId("section-problem")).toHaveCount(0);
    await expect(page.getByText((lang === "ar" ? arShell : enShell).notFound.title)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("section-problem")).toHaveCount(0);
  });
}
