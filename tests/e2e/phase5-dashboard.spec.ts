import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import arDash from "../../messages/ar/dashboard.json";
import enDash from "../../messages/en/dashboard.json";
import arShell from "../../messages/ar/shell.json";
import enShell from "../../messages/en/shell.json";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import type { SeedDemoResult } from "../../scripts/seed-demo";
import { hydrated, newEmail, PASSWORD, signInViaUi, signUpViaApi } from "./helpers";

/**
 * Phase 5 (part A): the dashboard. Each run seeds a throwaway copy of the demo data for a
 * fresh e2e account (tsx child process, owner connection), computes the expected numbers
 * from the database with plain SQL, and compares them with what the page shows. Al-Karkh
 * September, treating a problem and a draft are created WITHOUT the UI (child processes).
 * Writes docs/screenshots/phase-5/dashboard-{demo,empty}-<lang>-<project>.png.
 */
test.describe.configure({ timeout: 300_000 });

const SHOTS = "docs/screenshots/phase-5";
type Lang = "ar" | "en";
const M = {
  ar: { d: arDash, s: arShell },
  en: { d: enDash, s: enShell },
} as const;
const FORBIDDEN = /RII|Demo data|Illustrative|بيانات تجريبية|تجريبي/i;

// --- child processes --------------------------------------------------------------------------

function runTsx<T>(code: string): T {
  const out = execFileSync("npx", ["tsx", "-e", code], { cwd: process.cwd(), encoding: "utf8", timeout: 180_000 });
  const line = out.split("\n").find((l) => l.startsWith("RESULT"));
  if (!line) throw new Error(`child process failed: ${out}`);
  return JSON.parse(line.slice(6)) as T;
}

function seedFor(email: string): SeedDemoResult {
  return runTsx<SeedDemoResult>(
    `import("./scripts/seed-demo.ts").then(async (m) => { const r = await m.seedDemo({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(PASSWORD)}, name: "E2E Engineer" }); console.log("RESULT" + JSON.stringify(r)); })`,
  );
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

/** Al-Karkh September 2026 through the service: two auto (critical) problems. */
function createKarkhSeptember(userId: string, karkhPlantId: string): { assessmentId: string; sc03: string; sc04: string } {
  return runTsx(`${PRELUDE}
(async () => {
  const { client, tx, assess, probs, demo } = await load();
  try {
    const userId = ${JSON.stringify(userId)};
    const NOW = demo.KARKH_SEPTEMBER_NOW;
    const actor = "E2E Engineer";
    const { id } = must(await assess.createDraft(tx, userId, { plantId: ${JSON.stringify(karkhPlantId)}, periodStart: demo.KARKH_SEPTEMBER_PERIOD, months: 1, enteredBy: actor }, { now: NOW, actor }), "draft");
    must(await assess.setDraftSelection(tx, userId, id, Object.keys(demo.KARKH_SEPTEMBER)), "selection");
    must(await assess.saveDraftReadings(tx, userId, id, Object.fromEntries(Object.entries(demo.KARKH_SEPTEMBER).map(([ref, inputs]) => [ref, { inputs }]))), "readings");
    must(await assess.approveAssessment(tx, userId, id, { acknowledgeMissing: true, now: NOW, actor }), "approve");
    const list = await probs.listProblems(tx, userId, { plantId: ${JSON.stringify(karkhPlantId)}, range: "all", now: new Date() });
    console.log("RESULT" + JSON.stringify({ assessmentId: id, sc03: list.find((p) => p.indicator.code === "SC-03").id, sc04: list.find((p) => p.indicator.code === "SC-04").id }));
  } finally { await client.end(); }
})();`);
}

/** Treats a problem: one obstacle and one chosen action. */
function treat(userId: string, problemId: string): void {
  runTsx(`${PRELUDE}
(async () => {
  const { client, tx, probs } = await load();
  try {
    const ctx = { now: new Date(), actor: "E2E Engineer" };
    const o = { kind: "system", code: "O-36" };
    must(await probs.setObstacle(tx, ${JSON.stringify(userId)}, { problemId: ${JSON.stringify(problemId)}, target: o, classification: "confirmed" }, ctx), "obstacle");
    must(await probs.setActionChosen(tx, ${JSON.stringify(userId)}, { problemId: ${JSON.stringify(problemId)}, actionCode: "A-41", chosen: true, linkedObstacle: o }, ctx), "choose");
    console.log("RESULT" + JSON.stringify(true));
  } finally { await client.end(); }
})();`);
}

function createDraft(userId: string, plantId: string, periodStart: string): string {
  return runTsx<string>(`${PRELUDE}
(async () => {
  const { client, tx, assess } = await load();
  try {
    const actor = "E2E Engineer";
    const { id } = must(await assess.createDraft(tx, ${JSON.stringify(userId)}, { plantId: ${JSON.stringify(plantId)}, periodStart: ${JSON.stringify(periodStart)}, months: 1, enteredBy: actor }, { now: new Date(), actor }), "draft");
    console.log("RESULT" + JSON.stringify(id));
  } finally { await client.end(); }
})();`);
}

// --- the oracle: expected numbers from the database ------------------------------------------

type Expected = {
  plants: number;
  assessments: number;
  ok: number;
  evaluated: number;
  followUp: number;
  critical: number;
  openProblems: number;
  perPlant: { id: string; name: string; ps: string | null; months: number | null; ok: number; total: number }[];
  alerts: { plantName: string; ref: string; status: string; problemId: string | null }[];
};

async function expectedFor(userId: string, plantId: string | null, range: number | "all"): Promise<Expected> {
  const owner = await connectAsOwner();
  try {
    const q = async <T>(sql: string, params: unknown[]) => (await owner.query(sql, params)).rows as T[];
    const nowMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit" }).format(new Date());
    const [ny, nm] = nowMonth.split("-").map(Number);
    const minEnd = range === "all" ? null : ny * 12 + (nm - 1) - range + 1;
    const plants = await q<{ id: string; name: string }>(
      "select id, name from plants where owner_id = $1 and ($2::uuid is null or id = $2) order by created_at, id",
      [userId, plantId],
    );
    const latest = await q<{ id: string; plant_id: string; ps: string; months: number }>(
      `select distinct on (plant_id) id, plant_id, to_char(period_start, 'YYYY-MM') ps, months from (
         select *, (extract(year from period_start)::int * 12 + extract(month from period_start)::int - 1 + months - 1) end_idx
           from assessments where owner_id = $1 and status = 'approved' and ($2::uuid is null or plant_id = $2)
       ) x where ($3::int is null or end_idx >= $3)
       order by plant_id, end_idx desc, months asc, approved_at desc`,
      [userId, plantId, minEnd],
    );
    const count = await q<{ n: number }>(
      `select count(*)::int n from (
         select (extract(year from period_start)::int * 12 + extract(month from period_start)::int - 1 + months - 1) end_idx
           from assessments where owner_id = $1 and status = 'approved' and ($2::uuid is null or plant_id = $2)
       ) x where ($3::int is null or end_idx >= $3)`,
      [userId, plantId, minEnd],
    );
    const ids = latest.map((l) => l.id);
    const perAssessment = await q<{ aid: string; ok: number; evaluated: number; total: number }>(
      `select assessment_id aid, count(*) filter (where status = 'ok')::int ok,
              count(*) filter (where status in ('ok','warning','critical'))::int evaluated, count(*)::int total
         from assessment_readings where assessment_id = any($1::uuid[]) group by 1`,
      [ids],
    );
    const alerts = await q<{ plant_name: string; ref: string; status: string; problem_id: string | null }>(
      `select pl.name plant_name, coalesce('sys:' || r.indicator_code, 'usr:' || r.user_indicator_id::text) ref, r.status::text status, p.id problem_id
         from assessment_readings r
         join assessments a on a.id = r.assessment_id
         join plants pl on pl.id = a.plant_id
         left join indicators i on i.code = r.indicator_code
         left join problems p on p.assessment_id = r.assessment_id
              and (p.indicator_code = r.indicator_code or p.user_indicator_id = r.user_indicator_id)
        where r.assessment_id = any($1::uuid[]) and r.status in ('warning', 'critical')
          and not (p.id is not null and (p.obstacle_only
               or exists (select 1 from problem_actions x where x.problem_id = p.id and x.chosen)
               or exists (select 1 from custom_actions x where x.problem_id = p.id and x.chosen)))
        order by (r.status = 'critical') desc, pl.created_at, pl.id, coalesce(i.sort, 1000)`,
      [ids],
    );
    const open = await q<{ n: number }>(
      `select count(*)::int n from problems p join assessments a on a.id = p.assessment_id
        where p.owner_id = $1 and ($2::uuid is null or a.plant_id = $2) and not p.obstacle_only
          and not exists (select 1 from problem_actions x where x.problem_id = p.id and x.chosen)
          and not exists (select 1 from custom_actions x where x.problem_id = p.id and x.chosen)`,
      [userId, plantId],
    );
    return {
      plants: plants.length,
      assessments: count[0].n,
      ok: perAssessment.reduce((n, r) => n + r.ok, 0),
      evaluated: perAssessment.reduce((n, r) => n + r.evaluated, 0),
      followUp: alerts.length,
      critical: alerts.filter((a) => a.status === "critical").length,
      openProblems: open[0].n,
      perPlant: plants.map((p) => {
        const l = latest.find((x) => x.plant_id === p.id);
        const c = perAssessment.find((x) => x.aid === l?.id);
        return { id: p.id, name: p.name, ps: l?.ps ?? null, months: l?.months ?? null, ok: c?.ok ?? 0, total: c?.total ?? 0 };
      }),
      alerts: alerts.map((a) => ({ plantName: a.plant_name, ref: a.ref, status: a.status, problemId: a.problem_id })),
    };
  } finally {
    await owner.end();
  }
}

// --- page helpers -----------------------------------------------------------------------------

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

const tileValue = (page: Page, id: string) => page.getByTestId(`tile-${id}`).getByTestId("tile-value");

/** The five tiles against the database numbers. */
async function expectTiles(page: Page, e: Expected) {
  await expect(tileValue(page, "plants")).toHaveText(String(e.plants), { timeout: 30_000 });
  await expect(tileValue(page, "assessments")).toHaveText(String(e.assessments), { timeout: 30_000 });
  await expect(tileValue(page, "within")).toHaveText(String(e.ok), { timeout: 30_000 });
  const suffix = page.getByTestId("tile-within").getByTestId("tile-suffix");
  if (e.evaluated > 0) await expect(suffix).toHaveText(`/ ${e.evaluated}`);
  else await expect(suffix).toHaveCount(0);
  await expect(tileValue(page, "followup")).toHaveText(String(e.followUp), { timeout: 30_000 });
  await expect(tileValue(page, "problems")).toHaveText(String(e.openProblems), { timeout: 30_000 });
}

/** Alert rows as the user sees them (table on desktop, cards on the phone), in order. */
function visibleAlerts(page: Page) {
  return page.locator('[data-testid="alert-row"]:visible');
}

async function expectAlerts(page: Page, e: Expected) {
  const rows = visibleAlerts(page);
  await expect(rows).toHaveCount(e.alerts.length, { timeout: 30_000 });
  if (e.alerts.length) {
    await expect
      .poll(() => rows.evaluateAll((els) => els.map((el) => `${el.getAttribute("data-status")}|${el.getAttribute("data-ref")}`)))
      .toEqual(e.alerts.map((a) => `${a.status}|${a.ref}`));
  }
}

function monthLabel(ps: string, lang: Lang) {
  const [y, m] = ps.split("-").map(Number);
  const name = new Intl.DateTimeFormat(lang === "ar" ? "ar-IQ-u-nu-latn" : "en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return `${name} ${y}`;
}

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), template);

// --- the journey ------------------------------------------------------------------------------

for (const lang of ["ar", "en"] as const) {
  test(`dashboard: tiles, breakdown, alerts, filters and live changes (${lang})`, async ({ page }, info) => {
    const project = info.project.name;
    const m = M[lang];
    const email = newEmail();
    const seed = seedFor(email);
    const userId = seed.userId;
    const karkh = seed.plantIds.karkh;
    const dijla = seed.plantIds.dijla;

    await signInViaUi(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/ar\/dashboard/, { timeout: 30_000 });
    await page.goto(`/${lang}/dashboard`);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: m.s.pages.dashboard })).toBeVisible({ timeout: 60_000 });
    await setFilter(page, m.s.filters.period, "all");
    await setFilter(page, m.s.filters.plant, "all");

    // --- tiles, all plants, full history, from the database ------------------------------------
    const e0 = await expectedFor(userId, null, "all");
    expect(e0.plants).toBe(3);
    expect(e0.assessments).toBe(18);
    await expectTiles(page, e0);
    await expect(page.getByTestId("tile-plants")).toContainText(m.d.tiles.plants.label);
    await expect(page.getByTestId("tile-problems")).toContainText(m.d.tiles.problems.label);
    await expect(page.getByTestId("dashboard-new")).toHaveText(m.d.newAssessment);

    // --- breakdown: the three plants, latest period and counts ----------------------------------
    const cards = page.getByTestId("breakdown-plant");
    await expect(cards).toHaveCount(3);
    for (const p of e0.perPlant) {
      const card = page.locator(`[data-testid="breakdown-plant"][data-plant-id="${p.id}"]`);
      await expect(card).toContainText(p.name);
      await expect(card.getByTestId("breakdown-period")).toContainText(monthLabel(p.ps!, lang));
      await expect(card.getByTestId("breakdown-summary")).toHaveText(fill(m.d.breakdown.summary, { ok: p.ok, total: p.total }));
      await expect(card.getByRole("img")).toHaveAttribute("aria-label", /.+/);
      await expect(card.getByTestId("breakdown-open")).toHaveAttribute("href", /\/assessments\/[0-9a-f-]{36}$/);
    }
    await expect(page.getByTestId("breakdown-legend").locator("li")).toHaveCount(5);

    // --- alerts: rows = the expected set, critical first, the seeded Dijla problem is linked ----
    await expectAlerts(page, e0);
    expect(e0.critical).toBe(0);
    const rt03 = page.locator(`[data-testid="alert-row"][data-ref="sys:RT-03"][data-plant-id="${dijla}"]:visible`);
    await expect(rt03).toHaveCount(1);
    await expect(rt03.getByTestId("alert-open-problem")).toHaveAttribute("href", `/${lang}/problems/${seed.problemId}`);
    await expect(rt03.getByTestId("stage-chip")).toHaveAttribute("data-stage", "choosing_action");
    // a warning with no problem links to the results page of its assessment
    const noProblem = page.locator('[data-testid="alert-row"]:visible').filter({ has: page.getByTestId("alert-open-results") }).first();
    await expect(noProblem.getByTestId("alert-open-results")).toHaveAttribute("href", /\/assessments\/[0-9a-f-]{36}$/);
    const first = visibleAlerts(page).first();
    await expect(first.getByTestId("alert-value")).not.toHaveText("");
    await expect(first.getByTestId("alert-limit")).not.toHaveText("—");
    await expect(first.getByTestId("alert-date")).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByTestId("alerts-chips")).toContainText(fill(m.d.alerts.warning, { count: e0.followUp }));
    await expect(page.getByTestId("alerts-chips")).toContainText(fill(m.d.alerts.critical, { count: 0 }));

    // --- no demo labels, RII or charts; no horizontal scroll ------------------------------------
    expect(await page.locator("body").innerText()).not.toMatch(FORBIDDEN);
    await expect(page.locator(".recharts-wrapper, .recharts-surface")).toHaveCount(0);
    await noHorizontalScroll(page);
    await shot(page, "dashboard-demo", lang, project);

    // --- top-bar filters ------------------------------------------------------------------------
    await setFilter(page, m.s.filters.plant, dijla);
    const eDijla = await expectedFor(userId, dijla, "all");
    await expectTiles(page, eDijla);
    await expectAlerts(page, eDijla);
    await expect(cards).toHaveCount(1);
    await setFilter(page, m.s.filters.plant, "all");

    await setFilter(page, m.s.filters.period, "6");
    const e6 = await expectedFor(userId, null, 6);
    await expectTiles(page, e6);
    await expectAlerts(page, e6);

    // nothing ended in the last month: zeros, "not assessed" in the breakdown, alerts empty state
    await setFilter(page, m.s.filters.period, "1");
    const e1 = await expectedFor(userId, null, 1);
    expect(e1.assessments).toBe(0);
    await expectTiles(page, e1);
    await expect(page.getByTestId("breakdown-none")).toHaveCount(3);
    await expect(visibleAlerts(page)).toHaveCount(0);
    await expect(page.getByTestId("alerts")).toContainText(m.d.alerts.empty.title);
    // the awaiting-review tile ignores the period
    await expect(tileValue(page, "problems")).toHaveText("1");
    await setFilter(page, m.s.filters.period, "all");
    await expectTiles(page, e0);

    // --- Al-Karkh September: two critical alerts with problem links, the tile goes up by two ----
    const sep = createKarkhSeptember(userId, karkh);
    await page.reload();
    await hydrated(page);
    const e2 = await expectedFor(userId, null, "all");
    expect(e2.critical).toBe(2);
    expect(e2.openProblems).toBe(e0.openProblems + 2);
    await expectTiles(page, e2);
    await expectAlerts(page, e2);
    const crit = page.locator('[data-testid="alert-row"][data-status="critical"]:visible');
    await expect(crit).toHaveCount(2);
    for (const id of [sep.sc03, sep.sc04]) {
      await expect(page.locator(`[data-testid="alert-open-problem"][href="/${lang}/problems/${id}"]:visible`)).toHaveCount(1);
    }
    await expect(crit.first().getByTestId("stage-chip")).toHaveAttribute("data-stage", "awaiting_obstacles");
    await expect(page.getByTestId("alerts-chips")).toContainText(fill(m.d.alerts.critical, { count: 2 }));
    const karkhCard = page.locator(`[data-testid="breakdown-plant"][data-plant-id="${karkh}"]`);
    await expect(karkhCard.getByTestId("breakdown-period")).toContainText(monthLabel("2026-09", lang));

    // treat one through the problems service: it leaves the alerts and the tile drops
    treat(userId, sep.sc04);
    await page.reload();
    await hydrated(page);
    const e3 = await expectedFor(userId, null, "all");
    expect(e3.critical).toBe(1);
    expect(e3.openProblems).toBe(e2.openProblems - 1);
    await expectTiles(page, e3);
    await expectAlerts(page, e3);
    await expect(page.locator(`[data-testid="alert-open-problem"][href="/${lang}/problems/${sep.sc04}"]`)).toHaveCount(0);

    // --- a draft shows in the latest assessments with a resume link -----------------------------
    const draftId = createDraft(userId, seed.plantIds.rafidain, "2026-09");
    await page.reload();
    await hydrated(page);
    const latest = page.getByTestId("latest-assessments");
    const draftRow = latest.locator(`[data-testid="assessment-row"][data-id="${draftId}"]`);
    await expect(draftRow).toBeVisible({ timeout: 30_000 });
    await expect(draftRow).toHaveAttribute("data-status", "draft");
    await expect(draftRow.getByTestId("row-resume")).toHaveAttribute("href", `/${lang}/assessments/new?draft=${draftId}`);
    expect(await latest.getByTestId("assessment-row").count()).toBeLessThanOrEqual(6);
    await expect(tileValue(page, "assessments")).toHaveText(String(e3.assessments));
    await expect(page.getByTestId("tile-assessments")).toContainText(lang === "en" ? "1 draft awaiting approval" : "مسودة واحدة بانتظار الاعتماد");

    expect(await page.locator("body").innerText()).not.toMatch(FORBIDDEN);
    await noHorizontalScroll(page);
  });

  test(`a brand-new user sees only the add-your-first-plant state (${lang})`, async ({ page }, info) => {
    const project = info.project.name;
    const m = M[lang];
    await signUpViaApi(page, newEmail());
    await page.goto(`/${lang}/dashboard`);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1, name: m.s.pages.dashboard })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { name: m.s.dashboard.empty.title })).toBeVisible();
    await expect(page.getByRole("link", { name: m.s.dashboard.empty.cta })).toHaveAttribute("href", `/${lang}/plants?new=1`);
    await expect(page.getByTestId("dashboard-tiles")).toHaveCount(0);
    await expect(page.getByTestId("breakdown")).toHaveCount(0);
    await expect(page.getByTestId("alerts")).toHaveCount(0);
    await expect(page.getByTestId("latest-assessments")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toMatch(FORBIDDEN);
    await noHorizontalScroll(page);
    await shot(page, "dashboard-empty", lang, project);
  });
}
