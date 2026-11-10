import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import type { SeedDemoResult } from "../../scripts/seed-demo";
import arList from "../../messages/ar/problemsList.json";
import enList from "../../messages/en/problemsList.json";
import arShell from "../../messages/ar/shell.json";
import enShell from "../../messages/en/shell.json";
import { hydrated, newEmail, PASSWORD, signInViaUi } from "./helpers";

/**
 * Phase 4 (part B): problems list, corrective-actions log, open-problems badge and the
 * results page reacting to problem stages. Each run seeds a throwaway copy of the demo data
 * for a fresh e2e account, then (WITHOUT the UI, in a tsx child process on the owner
 * connection) creates Al-Karkh September 2026 and puts the problems into a known mix.
 * Writes docs/screenshots/phase-4/{problems-list,actions-log}-<lang>-<project>.png.
 */
const SHOTS = "docs/screenshots/phase-4";
const FORBIDDEN = /RII|معامل/;
type Lang = "ar" | "en";
const M = {
  ar: { l: arList, s: arShell, badge1: "مشكلة واحدة بانتظار المراجعة", badge2: "مشكلتان بانتظار المراجعة" },
  en: { l: enList, s: enShell, badge1: "1 problem awaiting review", badge2: "2 problems awaiting review" },
} as const;

function seedFor(email: string): SeedDemoResult {
  const code = `import("./scripts/seed-demo.ts").then(async (m) => { const r = await m.seedDemo({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(PASSWORD)}, name: "E2E Engineer" }); console.log("RESULT" + JSON.stringify(r)); })`;
  return runTsx<SeedDemoResult>(code);
}

function runTsx<T>(code: string): T {
  const out = execFileSync("npx", ["tsx", "-e", code], { cwd: process.cwd(), encoding: "utf8", timeout: 180_000 });
  const line = out.split("\n").find((l) => l.startsWith("RESULT"));
  if (!line) throw new Error(`child process failed: ${out}`);
  return JSON.parse(line.slice(6)) as T;
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

type Setup = { sc04: string; sc03: string; today: string; karkhAssessment: string };

/** Karkh September (two auto problems) and the known mix of stages. */
function setupProblems(userId: string, karkhPlantId: string, dijlaProblemId: string): Setup {
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
    const sc04 = list.find((p) => p.indicator.code === "SC-04").id;
    const sc03 = list.find((p) => p.indicator.code === "SC-03").id;
    const ctx = { now: new Date(), actor };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
    const o36 = { kind: "system", code: "O-36" };
    must(await probs.setObstacle(tx, userId, { problemId: sc04, target: o36, classification: "confirmed" }, ctx), "o36");
    must(await probs.setActionChosen(tx, userId, { problemId: sc04, actionCode: "A-41", chosen: true, linkedObstacle: o36 }, ctx), "choose");
    must(await probs.setActionImplemented(tx, userId, { problemId: sc04, actionCode: "A-41", implementedOn: today }, ctx), "implement");
    must(await probs.setObstacle(tx, userId, { problemId: sc03, target: { kind: "system", code: "O-37" }, classification: "possible" }, ctx), "o37");
    must(await probs.setObstacleOnly(tx, userId, { problemId: sc03, value: true }, ctx), "only");
    must(await probs.setActionNeedsStudy(tx, userId, { problemId: ${JSON.stringify(dijlaProblemId)}, actionCode: "A-19", needsStudy: true }, ctx), "study");
    console.log("RESULT" + JSON.stringify({ sc04, sc03, today, karkhAssessment: id }));
  } finally { await client.end(); }
})();`;
  return runTsx<Setup>(code);
}

function unchoose(userId: string, problemId: string): string {
  const code = `${PRELUDE}
(async () => {
  const { client, tx, probs } = await load();
  try {
    const r = must(await probs.setActionChosen(tx, ${JSON.stringify(userId)}, { problemId: ${JSON.stringify(problemId)}, actionCode: "A-41", chosen: false }, { now: new Date(), actor: "E2E Engineer" }), "unchoose");
    console.log("RESULT" + JSON.stringify(r.stage));
  } finally { await client.end(); }
})();`;
  return runTsx<string>(code);
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string, lang: Lang, project: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}-${lang}-${project}.png`, fullPage: true });
}

async function setFilter(page: Page, label: string, value: string) {
  const sel = page.getByLabel(label, { exact: true });
  await sel.selectOption(value);
  await expect(sel).toHaveValue(value);
}

/** The badge as the user sees it: the sidebar on desktop, the drawer and the tab marker on the phone. */
async function expectBadge(page: Page, project: string, lang: Lang, label: string | null) {
  const m = M[lang];
  if (project === "phone") {
    const tab = page.getByRole("navigation", { name: m.s.tabs.label }).getByTestId("open-problems-dot");
    if (label === null) await expect(tab).toHaveCount(0);
    else await expect(tab).toHaveAttribute("aria-label", label);
    await page.getByRole("button", { name: m.s.menu.open }).click();
    const drawerBadge = page.getByRole("dialog").getByTestId("open-problems-badge");
    if (label === null) await expect(drawerBadge).toHaveCount(0);
    else await expect(drawerBadge).toHaveAttribute("aria-label", label);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  } else {
    const side = page.locator("aside").getByTestId("open-problems-badge");
    if (label === null) await expect(side).toHaveCount(0);
    else {
      await expect(side).toHaveAttribute("aria-label", label);
      await expect(side).toHaveText(label.match(/\d/)?.[0] ?? (lang === "ar" && label === M.ar.badge2 ? "2" : "1"));
    }
  }
}

for (const lang of ["ar", "en"] as const) {
  test(`problems list, actions log and badge (${lang})`, async ({ page }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    const m = M[lang];
    const email = newEmail();
    const seed = seedFor(email);
    const setup = setupProblems(seed.userId, seed.plantIds.karkh, seed.problemId);

    await signInViaUi(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/ar\/dashboard/, { timeout: 30_000 });

    // --- problems list ---------------------------------------------------------------------------
    await page.goto(`/${lang}/problems`);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: m.l.list.title })).toBeVisible({ timeout: 60_000 });
    await setFilter(page, m.s.filters.period, "all");
    await expect(page.getByTestId("problem-row")).toHaveCount(3, { timeout: 30_000 });
    const open = page.getByTestId("problems-open").getByTestId("problem-row");
    const handled = page.getByTestId("problems-handled").getByTestId("problem-row");
    await expect(open).toHaveCount(1);
    await expect(handled).toHaveCount(2);
    await expect(open.first()).toHaveAttribute("data-id", seed.problemId);
    await expect(open.first().getByTestId("stage-chip")).toHaveAttribute("data-stage", "choosing_action");
    await expect(open.first().getByTestId("stage-chip")).toHaveText(m.l.stage.choosing_action);
    await expect(open.first().getByTestId("count-obstacles")).toHaveAttribute("data-count", "1");
    await expect(open.first().getByTestId("count-chosen")).toHaveAttribute("data-count", "0");
    await expect(open.first().getByTestId("problem-link")).toHaveAttribute("href", `/${lang}/problems/${seed.problemId}`);

    const sc04 = page.locator(`[data-testid="problem-row"][data-id="${setup.sc04}"]`);
    await expect(sc04.getByTestId("stage-chip")).toHaveAttribute("data-stage", "treated");
    await expect(sc04.getByTestId("stage-chip")).toHaveText(m.l.stage.treated);
    await expect(sc04.getByTestId("count-obstacles")).toHaveAttribute("data-count", "1");
    await expect(sc04.getByTestId("count-chosen")).toHaveAttribute("data-count", "1");
    await expect(sc04.getByTestId("count-implemented")).toHaveAttribute("data-count", "1");
    await expect(sc04).toContainText("SC-04");
    await expect(sc04.getByTestId("problem-link")).toHaveAttribute("href", `/${lang}/problems/${setup.sc04}`);
    const sc03 = page.locator(`[data-testid="problem-row"][data-id="${setup.sc03}"]`);
    await expect(sc03.getByTestId("stage-chip")).toHaveAttribute("data-stage", "documented");
    await expect(sc03.getByTestId("stage-chip")).toHaveText(m.l.stage.documented);
    await expect(sc03.getByTestId("count-chosen")).toHaveAttribute("data-count", "0");
    await expectBadge(page, project, lang, m.badge1);
    expect(await page.locator("body").innerText()).not.toMatch(FORBIDDEN);
    await noHorizontalScroll(page);
    await shot(page, "problems-list", lang, project);

    // the plant filter narrows the list but not the badge
    await setFilter(page, m.s.filters.plant, seed.plantIds.karkh);
    await expect(page.getByTestId("problem-row")).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByTestId("problems-open")).toHaveCount(0);
    await expect(page.getByTestId("all-handled")).toBeVisible();
    await expectBadge(page, project, lang, m.badge1);
    await setFilter(page, m.s.filters.plant, "all");
    await expect(page.getByTestId("problem-row")).toHaveCount(3, { timeout: 30_000 });

    // --- actions log -----------------------------------------------------------------------------
    await page.goto(`/${lang}/actions`);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: m.l.log.title })).toBeVisible({ timeout: 60_000 });
    const rows = page.getByTestId("log-row");
    await expect(rows).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByTestId("log-count-all")).toHaveText("2");
    await expect(page.getByTestId("log-count-chosen")).toHaveText("0");
    await expect(page.getByTestId("log-count-implemented")).toHaveText("1");
    await expect(page.getByTestId("log-count-needsStudy")).toHaveText("1");
    const done = page.locator('[data-testid="log-row"][data-implemented="true"]');
    await expect(done).toHaveCount(1);
    await expect(done.getByTestId("state-implemented")).toContainText(setup.today);
    await expect(done.getByTestId("state-implemented")).toContainText(m.l.log.state.implemented);
    await expect(done.getByTestId("state-chosen")).toHaveCount(0);
    await expect(done.getByTestId("log-rank")).toContainText(m.l.log.rank);
    await expect(done.getByTestId("log-rank")).toContainText("1");
    // Client notes 12-13: obstacles and actions appear by text only, never by code.
    await expect(done.getByTestId("log-obstacle")).not.toContainText("O-36");
    await expect(done.getByTestId("log-obstacle")).toContainText(/\S{4,}/);
    await expect(page.locator("main")).not.toContainText(/\b[AO]-\d{2}\b/);
    await expect(done.getByTestId("log-problem-link")).toHaveAttribute("href", `/${lang}/problems/${setup.sc04}`);
    const study = page.locator('[data-testid="log-row"][data-study="true"]');
    await expect(study.getByTestId("state-study")).toContainText(m.l.log.state.needsStudy);
    await expect(study.getByTestId("log-rank")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toMatch(FORBIDDEN);
    await noHorizontalScroll(page);
    await shot(page, "actions-log", lang, project);

    await page.getByTestId("log-filter-implemented").click();
    await expect(rows).toHaveCount(1);
    await page.getByTestId("log-filter-needsStudy").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first().getByTestId("state-study")).toBeVisible();
    await page.getByTestId("log-filter-chosen").click();
    await expect(rows).toHaveCount(0);
    await expect(page.getByTestId("log-empty-tab")).toBeVisible();
    await page.getByTestId("log-filter-all").click();
    await expect(rows).toHaveCount(2);

    // --- results of Al-Karkh, September: treated and documented are no longer alerts -------------
    await page.goto(`/${lang}/assessments/${setup.karkhAssessment}`);
    await expect(page.getByTestId("results-table")).toBeVisible({ timeout: 60_000 });
    await hydrated(page);
    const callout = (ref: string) => page.locator(`[data-testid="callout"][data-ref="${ref}"]`);
    const handledLine = (ref: string) => page.locator(`[data-testid="handled-callout"][data-ref="${ref}"]`);
    await expect(callout("sys:SC-04")).toHaveCount(0);
    await expect(callout("sys:SC-03")).toHaveCount(0);
    await expect(handledLine("sys:SC-04")).toHaveAttribute("data-stage", "treated");
    await expect(handledLine("sys:SC-04")).toContainText(m.l.stage.treated);
    await expect(handledLine("sys:SC-03")).toHaveAttribute("data-stage", "documented");
    await expect(handledLine("sys:SC-04").getByTestId("handled-problem-link")).toHaveAttribute("href", `/${lang}/problems/${setup.sc04}`);
    for (const ref of ["sys:SC-01", "sys:CS-01", "sys:RT-01", "sys:RT-02"]) {
      await expect(callout(ref)).toHaveCount(1);
      await expect(callout(ref).getByTestId("callout-open-problem")).toHaveCount(1);
    }
    await expect(page.getByTestId("callout")).toHaveCount(4);
    const row04 = page.locator('[data-testid="result-row"][data-ref="sys:SC-04"]');
    await expect(row04).toHaveAttribute("data-status", "critical");
    await expect(row04.getByTestId("row-problem").getByTestId("stage-chip")).toHaveAttribute("data-stage", "treated");
    expect(await page.locator("body").innerText()).not.toMatch(FORBIDDEN);
    await noHorizontalScroll(page);

    // --- a change through the service moves the problem back among the open ones ------------------
    expect(unchoose(seed.userId, setup.sc04)).toBe("choosing_action");
    await page.reload();
    await expect(page.getByTestId("results-table")).toBeVisible({ timeout: 60_000 });
    await hydrated(page);
    await expect(callout("sys:SC-04")).toHaveCount(1);
    await expect(callout("sys:SC-04").getByTestId("callout-problem-link")).toBeVisible();
    await expect(page.getByTestId("callout")).toHaveCount(5);
    await expect(handledLine("sys:SC-04")).toHaveCount(0);
    await expect(handledLine("sys:SC-03")).toHaveCount(1);
    await expectBadge(page, project, lang, m.badge2);
    await page.goto(`/${lang}/problems`);
    await expect(page.getByTestId("problem-row")).toHaveCount(3, { timeout: 60_000 });
    await expect(page.getByTestId("problems-open").getByTestId("problem-row")).toHaveCount(2);
    await expect(
      page.locator(`[data-testid="problems-open"] [data-testid="problem-row"][data-id="${setup.sc04}"]`),
    ).toHaveCount(1);
  });
}
