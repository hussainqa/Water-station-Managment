import { expect, test, type Page } from "@playwright/test";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { execFileSync } from "node:child_process";
import type { SeedDemoResult } from "../../scripts/seed-demo";
import arAssess from "../../messages/ar/assessments.json";
import enAssess from "../../messages/en/assessments.json";
import arPlants from "../../messages/ar/plants.json";
import enPlants from "../../messages/en/plants.json";
import arShell from "../../messages/ar/shell.json";
import enShell from "../../messages/en/shell.json";
import { hydrated, newEmail, PASSWORD, signInViaUi } from "./helpers";

/**
 * Phase 3 (part C): assessments list, results page with the indicator drawer, notes,
 * manual problems, snapshot limits, plant cards and the dashboard block.
 * Each run seeds a throwaway copy of the demo data for a fresh e2e account.
 * Writes docs/screenshots/phase-3/{results,drawer,assessments-list,plants-performance}-<lang>-<project>.png.
 */
const SHOTS = "docs/screenshots/phase-3";
const FORBIDDEN = /RII|version history|سجل إصدارات|illustrative|تجريبي|تجريبية/i;
type Lang = "ar" | "en";
const M = {
  ar: { a: arAssess, p: arPlants, s: arShell, aug: "آب 2026", jun: "حزيران 2026", jul: "تموز" },
  en: { a: enAssess, p: enPlants, s: enShell, aug: "August 2026", jun: "June 2026", jul: "July" },
} as const;

/**
 * Calls the exported seedDemo() of scripts/seed-demo.ts for a throwaway email. Playwright's
 * CommonJS loader cannot import that file (it uses import.meta), so it runs in a tsx child
 * process and the result comes back as JSON.
 */
function seedFor(email: string): SeedDemoResult {
  const code = `import("./scripts/seed-demo.ts").then(async (m) => { const r = await m.seedDemo({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(PASSWORD)}, name: "E2E Engineer" }); console.log("RESULT" + JSON.stringify(r)); })`;
  const out = execFileSync("npx", ["tsx", "-e", code], { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 });
  const line = out.split("\n").find((l) => l.startsWith("RESULT"));
  if (!line) throw new Error(`seeding failed: ${out}`);
  return JSON.parse(line.slice(6)) as SeedDemoResult;
}

async function ownerRows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await connectAsOwner();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    await c.end();
  }
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string, lang: Lang, project: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}-${lang}-${project}.png`, fullPage });
}

async function setFilter(page: Page, label: string, value: string) {
  const sel = page.getByLabel(label, { exact: true });
  // the top bar is a drawer-less header on both projects; wait for it to be hydrated
  await sel.selectOption(value);
  await expect(sel).toHaveValue(value);
}

for (const lang of ["ar", "en"] as const) {
  test(`assessment results journey (${lang})`, async ({ page }, info) => {
    test.setTimeout(240_000);
    const project = info.project.name;
    const m = M[lang];
    const email = newEmail();
    const seed: SeedDemoResult = seedFor(email);
    const dijlaAug = seed.assessmentIds["dijla:2026-08"];
    const dijlaJun = seed.assessmentIds["dijla:2026-06"];
    expect(dijlaAug).toBeTruthy();

    await signInViaUi(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/ar\/dashboard/, { timeout: 30_000 });

    // --- dashboard: latest assessments block -------------------------------------------------
    await page.goto(`/${lang}/dashboard`);
    await expect(page.getByTestId("latest-assessments")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("assessment-row").first()).toBeVisible();
    expect(await page.getByTestId("assessment-row").count()).toBeLessThanOrEqual(6);
    expect(await page.locator("body").innerText()).not.toMatch(FORBIDDEN);
    await noHorizontalScroll(page);

    // --- assessments list and the top-bar filters --------------------------------------------
    await page.goto(`/${lang}/assessments`);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: m.a.list.title })).toBeVisible({ timeout: 60_000 });
    await setFilter(page, m.s.filters.period, "all");
    await expect(page.getByTestId("assessment-row")).toHaveCount(18, { timeout: 30_000 });
    await expect(page.locator('[data-testid="assessment-row"][data-status="approved"]')).toHaveCount(18);
    await expect(page.getByTestId("row-open").first()).toBeVisible();
    await noHorizontalScroll(page);
    await shot(page, "assessments-list", lang, project, true);

    await setFilter(page, m.s.filters.plant, seed.plantIds.dijla);
    await expect(page.getByTestId("assessment-row")).toHaveCount(6, { timeout: 30_000 });
    await setFilter(page, m.s.filters.period, "1");
    await expect.poll(async () => page.getByTestId("assessment-row").count(), { timeout: 30_000 }).toBeLessThan(6);
    await setFilter(page, m.s.filters.period, "all");
    await expect(page.getByTestId("assessment-row")).toHaveCount(6, { timeout: 30_000 });

    // open Dijla, August 2026
    const augRow = page.getByTestId("assessment-row").filter({ hasText: m.aug });
    await expect(augRow).toHaveCount(1);
    await augRow.getByTestId("row-open").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/assessments/${dijlaAug}$`));
    await expect(page.getByTestId("results-table")).toBeVisible({ timeout: 60_000 });
    await hydrated(page);

    // --- counts and completeness match the database -------------------------------------------
    const dbCounts = await ownerRows<{ status: string; n: number }>(
      "select status, count(*)::int n from assessment_readings where assessment_id = $1 group by status",
      [dijlaAug],
    );
    const byStatus = Object.fromEntries(dbCounts.map((r) => [r.status, r.n])) as Record<string, number>;
    const total = dbCounts.reduce((a, r) => a + r.n, 0);
    const withValue = (
      await ownerRows<{ n: number }>(
        "select count(*)::int n from assessment_readings where assessment_id = $1 and value is not null",
        [dijlaAug],
      )
    )[0].n;
    for (const s of ["ok", "warning", "critical", "insufficient_data", "no_limits"]) {
      await expect(page.locator(`[data-testid="count-tile"][data-status="${s}"] [data-testid="count-value"]`)).toHaveText(
        String(byStatus[s] ?? 0),
      );
    }
    await expect(page.getByTestId("completeness-percent")).toHaveText(`${Math.round((withValue / total) * 100)}%`);
    await expect(page.getByTestId("completeness-text")).toContainText(String(total));

    // callouts: one per warning/critical
    const deviations = (byStatus.warning ?? 0) + (byStatus.critical ?? 0);
    expect(deviations).toBeGreaterThan(0);
    await expect(page.getByTestId("callout")).toHaveCount(deviations);
    // table grouped in 4 groups, 15 rows
    await expect(page.getByTestId("results-group")).toHaveCount(4);
    await expect(page.getByTestId("result-row")).toHaveCount(total);
    // a row shows a change versus July (the previous month)
    const sc1 = page.locator('[data-testid="result-row"][data-ref="sys:SC-01"]');
    await expect(sc1.getByTestId("row-change")).toHaveAttribute("data-change", /improved|worsened|unchanged/);
    await expect(sc1.getByTestId("scale-marker")).toHaveCount(1);
    // forbidden words, no horizontal scroll
    expect(await page.locator("body").innerText()).not.toMatch(FORBIDDEN);
    await noHorizontalScroll(page);
    await shot(page, "results", lang, project, true);

    // --- drawer: chart with 6 points, note, audit -------------------------------------------------
    const cs1 = page.locator('[data-testid="result-row"][data-ref="sys:CS-01"]');
    await cs1.getByRole("button").click();
    const drawer = page.getByTestId("kpi-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("history-chart")).toBeVisible({ timeout: 30_000 });
    await expect(drawer.getByTestId("history-row")).toHaveCount(6);
    await expect(drawer.getByTestId("history-chart").locator("svg").first()).toBeVisible();
    await expect(drawer.getByTestId("drawer-limits")).toBeVisible();
    await noHorizontalScroll(page);
    await drawer.getByTestId("history-chart").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await shot(page, "drawer", lang, project);

    const note = `ملاحظة e2e ${lang}`;
    await drawer.getByTestId("note-input").fill(note);
    await drawer.getByTestId("note-save").click();
    await expect(drawer.getByTestId("note-status")).toHaveText(m.a.drawer.noteSaved);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    await page.reload();
    await expect(page.getByTestId("results-table")).toBeVisible({ timeout: 60_000 });
    await hydrated(page);
    await expect(page.locator('[data-testid="audit-entry"][data-action="note_changed"]')).toHaveCount(1);
    await page.locator('[data-testid="result-row"][data-ref="sys:CS-01"]').getByRole("button").click();
    await expect(page.getByTestId("kpi-drawer").getByTestId("note-input")).toHaveValue(note);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("kpi-drawer")).toBeHidden();

    // --- manual problem for a warning ---------------------------------------------------------------
    const manualAudit = page.locator('[data-testid="audit-entry"][data-action="problem_opened_manual"]');
    const auditBefore = await manualAudit.count(); // the demo data already has one
    const openButtons = page.getByTestId("callout-open-problem");
    const before = await openButtons.count();
    expect(before).toBeGreaterThan(0);
    const target = page.locator('[data-testid="callout"]:has([data-testid="callout-open-problem"])').first();
    const targetRef = (await target.getAttribute("data-ref"))!;
    await target.getByTestId("callout-open-problem").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/problems/[0-9a-f-]{36}$`), { timeout: 30_000 });
    // the problem page itself (Phase 4) replaced the placeholder: any page heading proves it rendered
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
    await page.goto(`/${lang}/assessments/${dijlaAug}`);
    const again = page.locator(`[data-testid="callout"][data-ref="${targetRef}"]`);
    await expect(again).toBeVisible({ timeout: 60_000 });
    await expect(again.getByTestId("callout-problem-link")).toBeVisible();
    await expect(again.getByTestId("callout-open-problem")).toHaveCount(0);
    await expect(page.getByTestId("callout-open-problem")).toHaveCount(before - 1);
    await expect(manualAudit).toHaveCount(auditBefore + 1);

    // --- snapshot proof: WQ-02 limits of June differ from August ---------------------------------------
    async function wq02Limits(id: string) {
      await page.goto(`/${lang}/assessments/${id}`);
      await expect(page.getByTestId("results-table")).toBeVisible({ timeout: 60_000 });
      await hydrated(page);
      await page.locator('[data-testid="result-row"][data-ref="sys:WQ-02"]').getByRole("button").click();
      const lim = page.getByTestId("kpi-drawer").getByTestId("drawer-limits");
      await expect(lim).toBeVisible();
      const text = await lim.innerText();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("kpi-drawer")).toBeHidden();
      return text;
    }
    const june = await wq02Limits(dijlaJun);
    const august = await wq02Limits(dijlaAug);
    expect(june).toContain("96");
    expect(june).not.toContain("95");
    expect(august).toContain("95");
    expect(august).not.toContain("96");

    // --- plant cards ------------------------------------------------------------------------------------
    await page.goto(`/${lang}/plants`);
    await expect(page.getByTestId("plant-card")).toHaveCount(3, { timeout: 60_000 });
    await hydrated(page);
    for (const card of await page.getByTestId("plant-card").all()) {
      await expect(card.getByTestId("plant-sparkline").locator("svg")).toHaveCount(1);
      await expect(card.getByTestId("plant-new-assessment")).toHaveAttribute("href", /\/assessments\/new\?plant=/);
      await expect(card.getByTestId("plant-view-performance")).toBeVisible();
      const chip = card.getByText(
        new RegExp(Object.values(m.p.state).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")),
      );
      await expect(chip.first()).toBeVisible();
    }
    expect(await page.locator("body").innerText()).not.toMatch(FORBIDDEN);
    await noHorizontalScroll(page);
    await shot(page, "plants-performance", lang, project, true);
    const dijlaCard = page.getByTestId("plant-card").filter({ hasText: "محطة دجلة" });
    await dijlaCard.getByTestId("plant-view-performance").click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/assessments/${dijlaAug}$`), { timeout: 30_000 });
    await expect(page.getByTestId("results-table")).toBeVisible({ timeout: 60_000 });
  });
}
