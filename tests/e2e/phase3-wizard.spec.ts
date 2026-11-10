import { execFileSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";
import arCommon from "../../messages/ar/common.json";
import arIndicators from "../../messages/ar/indicators.json";
import enCommon from "../../messages/en/common.json";
import enIndicators from "../../messages/en/indicators.json";
import arWizard from "../../messages/ar/wizard.json";
import enWizard from "../../messages/en/wizard.json";
import { DEMO_PLANTS, KARKH_SEPTEMBER } from "../../scripts/lib/demo-data";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { addMonths } from "../../src/lib/evaluation";
import { monthKeyOf } from "../../src/lib/assessments/schemas";
import { ORIGIN, PASSWORD, hydrated, newEmail } from "./helpers";

/**
 * Phase 3, new-assessment wizard. Each test seeds its own throwaway copy of the demo data
 * (scripts/seed-demo.ts, owner connection) for a fresh e2e account and signs in as it.
 * The acceptance journey is run in both languages and writes docs/screenshots/phase-3/wizard-step*.png.
 */
const SHOTS = "docs/screenshots/phase-3";
const KARKH = DEMO_PLANTS.find((p) => p.key === "karkh")!.name;

type Lang = "ar" | "en";
const M = {
  ar: { w: arWizard, common: arCommon, ind: arIndicators },
  en: { w: enWizard, common: enCommon, ind: enIndicators },
} as const;

test.describe.configure({ timeout: 240_000 });

type SeedDemoResult = {
  userId: string;
  plantIds: Record<string, string>;
  assessmentIds: Record<string, string>;
};

/**
 * Calls the exported seedDemo() of scripts/seed-demo.ts for a throwaway email. The script is an
 * ES module (it uses import.meta) and Playwright loads specs as CommonJS, so it runs in a tsx child process.
 */
function seedDemoFor(email: string): SeedDemoResult {
  const code = `import("./scripts/seed-demo.ts").then(async (m) => { const r = await m.seedDemo({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(PASSWORD)}, name: "م. اختبار" }); console.log("SEEDED" + JSON.stringify(r)); })`;
  const out = execFileSync("npx", ["tsx", "-e", code], { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 });
  const line = out.split("\n").find((l) => l.startsWith("SEEDED"));
  if (!line) throw new Error(`seeding failed:\n${out}`);
  return JSON.parse(line.slice("SEEDED".length)) as SeedDemoResult;
}

async function seedAndSignIn(page: Page): Promise<{ email: string; seeded: SeedDemoResult }> {
  const email = newEmail();
  const seeded = seedDemoFor(email);
  const res = await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: ORIGIN },
    data: { email, password: PASSWORD },
  });
  expect(res.ok()).toBe(true);
  return { email, seeded };
}

async function ownerQuery<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const owner = await connectAsOwner();
  try {
    return (await owner.query(sql, params)).rows as T[];
  } finally {
    await owner.end();
  }
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shot(page: Page, step: number, lang: Lang, project: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/wizard-step${step}-${lang}-${project}.png` });
}

async function openWizard(page: Page, lang: Lang, query = "", hydrate = true) {
  const t = M[lang].w;
  await page.goto(`/${lang}/assessments/new${query}`);
  await expect(page.getByRole("heading", { level: 1, name: t.title })).toBeVisible();
  await hydrated(page);
  if (hydrate) await wizardHydrated(page);
}

/** The wizard hydrates separately from the shell; typing before that is lost when React takes over. */
async function wizardHydrated(page: Page) {
  await page.waitForFunction(() => {
    const els = [...document.querySelectorAll("main button[data-step], main select, main input")];
    return els.length > 0 && els.every((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")));
  });
}

/** Step 1: plant, length, start month. Does not press Next. */
async function fillDetails(page: Page, lang: Lang, o: { plant?: string; months?: number; start?: string }) {
  const t = M[lang].w.details;
  if (o.plant) await page.locator("main").getByLabel(lbl(t.plant)).selectOption({ label: o.plant });
  if (o.months) await page.locator("main").getByLabel(lbl(t.period)).selectOption(String(o.months));
  if (o.start) {
    const label = (o.months ?? 1) === 1 ? t.month : t.startMonth;
    await page.locator("main").getByLabel(lbl(label)).selectOption(o.start);
  }
}

/** Label text, ignoring the aria-hidden required star. */
const lbl = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\*?$`);
const next = (page: Page, text: string) => page.getByRole("button", { name: text, exact: true }).click();
const input = (page: Page, ref: string, key: string): Locator => page.locator(`[data-input="${ref}.${key}"]`);
const card = (page: Page, ref: string): Locator => page.locator(`[data-reading="${ref}"]`);
const heading = (page: Page, name: string) => page.locator("[data-step-heading]").filter({ hasText: name });

async function toIndicators(page: Page, lang: Lang) {
  await next(page, M[lang].w.actions.nextIndicators);
  await expect(heading(page, M[lang].w.indicators.title)).toBeVisible();
}

async function clearSelection(page: Page, lang: Lang) {
  await page.getByRole("button", { name: M[lang].w.indicators.clear }).click();
  await expect(page.locator("input[data-ref]:checked")).toHaveCount(0);
}

async function toReadings(page: Page, lang: Lang) {
  await next(page, M[lang].w.actions.nextReadings);
  await expect(heading(page, M[lang].w.readings.title)).toBeVisible();
}

async function fillReadings(page: Page, readings: typeof KARKH_SEPTEMBER) {
  for (const [ref, raw] of Object.entries(readings)) {
    for (const [key, v] of Object.entries(raw)) {
      if (key === "unit" || v === "" || v == null) continue;
      await input(page, ref, key).fill(String(v));
    }
  }
}

for (const lang of ["ar", "en"] as const) {
  test(`acceptance: Al-Karkh September 2026 (${lang})`, async ({ page }, info) => {
    const project = info.project.name;
    const t = M[lang].w;
    const { email } = await seedAndSignIn(page);
    await openWizard(page, lang);
    await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");

    // step 1
    await fillDetails(page, lang, { plant: KARKH, months: 1, start: "2026-09" });
    await expect(page.locator("main").getByLabel(lbl(t.details.enteredBy))).toHaveValue("م. اختبار");
    await expect(page.locator("main").getByLabel(lbl(t.details.startDate))).toHaveValue("2026-09-01");
    await expect(page.locator("main").getByLabel(lbl(t.details.endDate))).toHaveValue("2026-09-30");
    await noHorizontalScroll(page);
    await shot(page, 1, lang, project);
    await toIndicators(page, lang);

    // step 2: a new draft opens with every adopted indicator ticked
    await expect(page.locator("input[data-ref]:checked")).toHaveCount(15);
    await noHorizontalScroll(page);
    await shot(page, 2, lang, project);
    await toReadings(page, lang);

    // step 3: the readings of KARKH_SEPTEMBER, CS-02 stays blank
    await expect(page.locator("[data-reading]")).toHaveCount(15);
    await fillReadings(page, KARKH_SEPTEMBER);
    await expect(card(page, "sys:SC-01").getByTestId("formula")).toHaveText("676 ÷ 720 × 100 = 93.9 %");
    await expect(card(page, "sys:WQ-02").getByTestId("formula")).toHaveText("229 ÷ 240 × 100 = 95.4 %");
    await expect(card(page, "sys:CS-02")).toHaveAttribute("data-state", "missing");
    await expect(card(page, "sys:SC-03")).toHaveAttribute("data-state", "complete");
    await expect(page.getByTestId("wizard-progress-text")).toContainText("14");

    // one error visible next to a computed formula (screenshot), then fixed again
    await input(page, "sys:SC-02", "value").fill("-5");
    await expect(card(page, "sys:SC-02")).toHaveAttribute("data-state", "error");
    await expect(card(page, "sys:SC-02").getByText(t.errors.negative)).toBeVisible();
    await card(page, "sys:SC-01").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await shot(page, 3, lang, project);
    await input(page, "sys:SC-02", "value").fill("4.8");
    await expect(card(page, "sys:SC-02")).toHaveAttribute("data-state", "complete");
    await noHorizontalScroll(page);
    await next(page, t.actions.nextReview);
    await expect(heading(page, t.review.title)).toBeVisible();

    // step 4: CS-02 insufficient, approval blocked until acknowledged
    const cs02 = page.locator('[data-review="sys:CS-02"]');
    await expect(cs02).toContainText(M[lang].common.status.insufficient_data);
    const approve = page.getByRole("button", { name: t.actions.approve, exact: true });
    await expect(approve).toBeDisabled();
    const ack = page.getByLabel(t.review.ack);
    await ack.scrollIntoViewIfNeeded();
    await noHorizontalScroll(page);
    await shot(page, 4, lang, project);
    await ack.check();
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/assessments/[0-9a-f-]{36}$`), { timeout: 30_000 });
    const id = page.url().split("/").pop()!;

    // the server decided: SC-03 and SC-04 critical, exactly two automatic problems
    const [header] = await ownerQuery<{ status: string; period_start: string; months: number; plant: string }>(
      `select a.status, to_char(a.period_start,'YYYY-MM') as period_start, a.months, p.name as plant
         from assessments a join plants p on p.id = a.plant_id where a.id = $1`,
      [id],
    );
    expect(header).toMatchObject({ status: "approved", period_start: "2026-09", months: 1, plant: KARKH });
    const readings = await ownerQuery<{ code: string; status: string }>(
      "select indicator_code as code, status from assessment_readings where assessment_id = $1",
      [id],
    );
    const status = Object.fromEntries(readings.map((r) => [r.code, r.status]));
    console.log(`[acceptance ${lang}/${project}] ${email} statuses`, JSON.stringify(status));
    expect(status["SC-03"]).toBe("critical");
    expect(status["SC-04"]).toBe("critical");
    expect(status["CS-02"]).toBe("insufficient_data");
    const problems = await ownerQuery<{ origin: string; code: string }>(
      "select origin, indicator_code as code from problems where assessment_id = $1 order by indicator_code",
      [id],
    );
    console.log(`[acceptance ${lang}/${project}] problems`, JSON.stringify(problems));
    expect(problems.filter((p) => p.origin === "auto").map((p) => p.code)).toEqual(["SC-03", "SC-04"]);
    expect(problems).toHaveLength(2);
  });
}

test("period rules: no future months, duplicates, overlap, longer periods over monthly ones", async ({ page }) => {
  const lang: Lang = "ar";
  const t = M[lang].w;
  await seedAndSignIn(page);
  const current = monthKeyOf(new Date());

  await openWizard(page, lang);
  const month = page.locator("main").getByLabel(lbl(t.details.month));
  await expect(month).toHaveValue(current);
  await expect(month.locator(`option[value="${addMonths(current, 1)}"]`)).toHaveCount(0);
  await page.locator("main").getByLabel(lbl(t.details.period)).selectOption("3");
  const start = page.locator("main").getByLabel(lbl(t.details.startMonth));
  await expect(start).toHaveValue(addMonths(current, -2));
  await expect(start.locator(`option[value="${addMonths(current, -1)}"]`)).toHaveCount(0);
  await expect(page.locator("main").getByLabel(lbl(t.details.endDate))).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  // dates outside the period are refused on the client too
  await page.locator("main").getByLabel(lbl(t.details.startDate)).fill(`${addMonths(current, -5)}-01`);
  await toIndicators(page, lang).catch(() => undefined);
  await expect(page.getByText(t.errors.outsidePeriod).first()).toBeVisible();

  // duplicate: August 2026 monthly for Al-Karkh already exists (seeded)
  await openWizard(page, lang);
  await fillDetails(page, lang, { plant: KARKH, months: 1, start: "2026-08" });
  await next(page, t.actions.nextIndicators);
  const conflict = page.getByTestId("wizard-conflict");
  await expect(conflict).toBeVisible();
  await expect(conflict).toContainText(t.conflict.duplicate.split("{period}")[0]);
  await expect(page.getByRole("link", { name: t.conflict.open })).toBeVisible();
  await expect(heading(page, t.details.title)).toBeVisible();

  // a 3-month period over existing monthly ones is allowed (creates a draft)
  await fillDetails(page, lang, { months: 3, start: "2026-07" });
  await toIndicators(page, lang);
  await expect(page).toHaveURL(/draft=[0-9a-f-]{36}&step=2/);
  const draftId = new URL(page.url()).searchParams.get("draft")!;

  // same-length overlap is blocked and points to the draft
  await openWizard(page, lang);
  await fillDetails(page, lang, { plant: KARKH, months: 3, start: "2026-08" });
  await next(page, t.actions.nextIndicators);
  await expect(page.getByTestId("wizard-conflict")).toContainText(t.conflict.overlap.split("{period}")[0]);
  const resume = page.getByRole("link", { name: t.conflict.resume });
  await expect(resume).toHaveAttribute("href", new RegExp(`draft=${draftId}`));
  await resume.click();
  await expect(page).toHaveURL(new RegExp(`draft=${draftId}`));
  // pre-selected but no readings typed yet: the draft resumes at the indicators step
  await expect(heading(page, t.indicators.title)).toBeVisible();
});

test("indicator groups: select-all with a real indeterminate state", async ({ page }) => {
  const lang: Lang = "ar";
  const t = M[lang].w;
  await seedAndSignIn(page);
  await openWizard(page, lang);
  await fillDetails(page, lang, { plant: KARKH, months: 1, start: "2026-09" });
  await toIndicators(page, lang);
  const group = page.locator('[data-group="sys:continuity"]');
  const box = group.getByTestId("group-checkbox");
  const isIndeterminate = () => box.evaluate((el) => (el as HTMLInputElement).indeterminate);

  // a new draft starts with everything selected
  expect(await isIndeterminate()).toBe(false);
  await expect(box).toBeChecked();
  await expect(page.locator("input[data-ref]:checked")).toHaveCount(15);
  await clearSelection(page, lang);
  await expect(box).not.toBeChecked();
  await group.locator('[data-ref="sys:SC-01"]').check();
  await expect.poll(isIndeterminate).toBe(true);
  await expect(group.getByText(t.indicators.groupCount.replace("{selected}", "1").replace("{total}", "4"))).toBeVisible();
  await box.check();
  await expect.poll(isIndeterminate).toBe(false);
  await expect(box).toBeChecked();
  await expect(group.locator('input[data-ref]:checked')).toHaveCount(4);
  await group.locator('[data-ref="sys:SC-03"]').uncheck();
  await expect.poll(isIndeterminate).toBe(true);
  await box.check();
  await box.uncheck();
  await expect(group.locator('input[data-ref]:checked')).toHaveCount(0);

  await page.getByRole("button", { name: t.indicators.selectAll }).click();
  await expect(page.locator("input[data-ref]:checked")).toHaveCount(15);
  await clearSelection(page, lang);
  await expect(page.getByRole("button", { name: t.actions.nextReadings })).toBeDisabled();
});

test("readings: live validation, Arabic digits, errors block approval", async ({ page }) => {
  const lang: Lang = "ar";
  const t = M[lang].w;
  const units = M[lang].ind.units;
  await seedAndSignIn(page);
  await openWizard(page, lang);
  await fillDetails(page, lang, { plant: KARKH, months: 1, start: "2026-09" });
  await toIndicators(page, lang);
  await clearSelection(page, lang);
  for (const code of ["SC-01", "SC-02", "SC-03", "SC-04"]) await page.locator(`[data-ref="sys:${code}"]`).check();
  await toReadings(page, lang);

  const err = (ref: string, key: string) => input(page, ref, key);
  // negative, non-integer (SC-03 counts events)
  await err("sys:SC-03", "value").fill("-3");
  await expect(card(page, "sys:SC-03").getByText(t.errors.negative)).toBeVisible();
  await expect(err("sys:SC-03", "value")).toHaveAttribute("aria-invalid", "true");
  await expect(err("sys:SC-03", "value")).toHaveAttribute("aria-describedby", /.+/);
  await err("sys:SC-03", "value").fill("2.5");
  await expect(card(page, "sys:SC-03").getByText(t.errors.not_integer)).toBeVisible();
  await err("sys:SC-03", "value").fill("abc");
  await expect(card(page, "sys:SC-03").getByText(t.errors.invalid_number)).toBeVisible();
  // numerator larger than the denominator, zero denominator
  await err("sys:SC-01", "denominator").fill("720");
  await err("sys:SC-01", "numerator").fill("800");
  await expect(card(page, "sys:SC-01").getByText(t.errors.exceeds_denominator)).toBeVisible();
  await err("sys:SC-01", "denominator").fill("0");
  await expect(card(page, "sys:SC-01").getByText(t.errors.zero_denominator)).toBeVisible();
  // percentage above 100
  await err("sys:SC-02", "value").fill("120");
  await expect(card(page, "sys:SC-02").getByText(t.errors.out_of_range)).toBeVisible();
  // Arabic-Indic digits are accepted
  await err("sys:SC-02", "value").fill("٩٣٫٥");
  await expect(card(page, "sys:SC-02")).toHaveAttribute("data-state", "complete");
  await expect(card(page, "sys:SC-02").getByTestId("formula")).toContainText("93.5");
  await err("sys:SC-01", "denominator").fill("٧٢٠");
  await err("sys:SC-01", "numerator").fill("٦٧٦");
  await expect(card(page, "sys:SC-01").getByTestId("formula")).toHaveText("676 ÷ 720 × 100 = 93.9 %");
  // duration entered in minutes, stored as typed + unit
  await err("sys:SC-04", "value").fill("390");
  await card(page, "sys:SC-04").getByLabel(t.readings.unitLabel).selectOption("min");
  await expect(card(page, "sys:SC-04").getByTestId("formula")).toHaveText(`390 ${t.readings.unitShort.min} ÷ 60 = 6.5 ${units.h}`);

  // an input error stays through the review step and blocks approval, with a link back to the card
  await err("sys:SC-03", "value").fill("2.5");
  await next(page, t.actions.nextReview);
  await expect(heading(page, t.review.title)).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: t.review.errorsTitle })).toBeVisible();
  await expect(page.getByRole("button", { name: t.actions.approve, exact: true })).toBeDisabled();
  await page.getByRole("alert").getByRole("button", { name: "SC-03" }).click();
  await expect(heading(page, t.readings.title)).toBeVisible();
  await expect(err("sys:SC-03", "value")).toBeFocused();
});

test("drafts: save, resume with inputs restored, approved id redirects, delete", async ({ page }) => {
  const lang: Lang = "ar";
  const t = M[lang].w;
  const { email, seeded } = await seedAndSignIn(page);
  await openWizard(page, lang);
  await fillDetails(page, lang, { plant: KARKH, months: 1, start: "2026-09" });
  await toIndicators(page, lang);
  await clearSelection(page, lang);
  for (const code of ["SC-01", "SC-04"]) await page.locator(`[data-ref="sys:${code}"]`).check();
  await toReadings(page, lang);
  await input(page, "sys:SC-01", "numerator").fill("676");
  await input(page, "sys:SC-01", "denominator").fill("720");
  await input(page, "sys:SC-04", "value").fill("390");
  await card(page, "sys:SC-04").getByLabel(t.readings.unitLabel).selectOption("min");
  await card(page, "sys:SC-01").locator("summary").click();
  await card(page, "sys:SC-01").getByLabel(t.readings.note, { exact: true }).fill("ملاحظة اختبار");
  await page.getByRole("button", { name: t.actions.saveDraft, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/assessments$`), { timeout: 30_000 });

  const drafts = await ownerQuery<{ id: string }>(
    `select a.id from assessments a join users u on u.id = a.owner_id where u.email = $1 and a.status = 'draft'`,
    [email],
  );
  expect(drafts).toHaveLength(1);
  const draftId = drafts[0].id;

  // resume: right step, everything restored; survives a reload too
  for (let i = 0; i < 2; i++) {
    if (i === 0) await openWizard(page, lang, `?draft=${draftId}`);
    else await page.reload();
    await expect(heading(page, t.readings.title)).toBeVisible();
    await hydrated(page);
    await wizardHydrated(page);
    await expect(page.locator('[data-step="3"]')).toHaveAttribute("aria-current", "step");
    await expect(input(page, "sys:SC-01", "numerator")).toHaveValue("676");
    await expect(input(page, "sys:SC-01", "denominator")).toHaveValue("720");
    await expect(input(page, "sys:SC-04", "value")).toHaveValue("390");
    await expect(card(page, "sys:SC-04").getByLabel(t.readings.unitLabel)).toHaveValue("min");
    await expect(card(page, "sys:SC-01").getByLabel(t.readings.note, { exact: true })).toHaveValue("ملاحظة اختبار");
    await expect(card(page, "sys:SC-01").getByTestId("formula")).toHaveText("676 ÷ 720 × 100 = 93.9 %");
    await expect(page.locator("[data-reading]")).toHaveCount(2);
  }
  // going back to step 1 shows the saved details
  await page.locator('[data-step="1"]').click();
  await expect(page.locator("main").getByLabel(lbl(t.details.month))).toHaveValue("2026-09");

  // an approved assessment id in ?draft= goes to its results page
  await page.goto(`/${lang}/assessments/new?draft=${seeded.assessmentIds["karkh:2026-08"]}`);
  await expect(page).toHaveURL(new RegExp(`/${lang}/assessments/${seeded.assessmentIds["karkh:2026-08"]}$`));

  // delete the draft after confirming
  await openWizard(page, lang, `?draft=${draftId}`);
  await page.getByRole("button", { name: t.actions.deleteDraft, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: t.delete.title })).toBeVisible();
  await dialog.getByRole("button", { name: t.delete.cancel }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: t.actions.deleteDraft, exact: true }).click();
  await dialog.getByRole("button", { name: t.delete.confirm }).click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/assessments$`), { timeout: 30_000 });
  const left = await ownerQuery("select id from assessments where id = $1", [draftId]);
  expect(left).toHaveLength(0);
});

test("no plants: empty state links to the add-plant dialog", async ({ page }) => {
  const lang: Lang = "en";
  const t = M[lang].w;
  const email = newEmail();
  const res = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: ORIGIN },
    data: { email, password: PASSWORD, name: "E2E Engineer", jobTitle: "Engineer" },
  });
  expect(res.ok()).toBe(true);
  await openWizard(page, lang, "", false);
  await expect(page.getByText(t.empty.title)).toBeVisible();
  await page.getByRole("link", { name: t.empty.cta }).click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/plants\\?new=1$`));
});
