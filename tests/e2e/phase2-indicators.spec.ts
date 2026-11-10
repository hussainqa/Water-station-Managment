import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { connectAsOwner } from "../../scripts/lib/owner-db";

/**
 * Phase 2 (part B) journey: the performance-indicators screen.
 * Writes docs/screenshots/phase-2/{indicators,indicator-add,limits}-<lang>-<project>.png.
 */
const SHOTS = "docs/screenshots/phase-2";
const PASSWORD = "e2e-password-1";

const ar = {
  signUp: { name: "الاسم الكامل", job: "المنصب (الوظيفة)", email: "البريد الإلكتروني", submit: "إنشاء الحساب" },
  subtitle: "حدّد المؤشرات المعتمدة لكل محطة، واضبط المحددات المستخدمة في تقييمها.",
  all: "الكل",
  continuity: "مؤشرات استمرارية الخدمة",
  limits: "تعديل المحددات",
  save: "حفظ المحددات",
  target: "القيمة المستهدفة",
  warning: "حد التحذير",
  critical: "الحد الحرج",
  testValue: "قيمة للاختبار",
  inLimits: "ضمن الحدود",
  none: "لا توجد محددات معتمدة لهذا المؤشر (تُسجَّل القيم دون تقييم)",
  noLimitsChip: "لا توجد محددات معتمدة للتقييم",
  adopted: "معتمد في هذه المحطة",
  notAdopted: "غير معتمد في هذه المحطة",
  add: "إضافة مؤشر",
  create: "إضافة المؤشر",
  nameAr: "اسم المؤشر",
  newGroup: "+ مجموعة جديدة",
  newGroupName: "اسم المجموعة الجديدة",
  ratio: "نسبة مئوية: البسط ÷ المقام × 100",
  numerator: "البسط (مثال: العينات المطابقة)",
  denominator: "المقام (مثال: العينات المفحوصة)",
  edit: "تعديل",
  saveChanges: "حفظ التعديلات",
  del: "حذف",
  delConfirm: "حذف المؤشر",
  delGroup: "حذف المجموعة",
  sc1: "استمرارية الخدمة",
  sc3: "معدل حدوث الانقطاعات غير المخططة",
};
const en = {
  all: "All",
  limits: "Edit limits",
  target: "Target",
  warning: "Warning limit",
  critical: "Critical limit",
  testValue: "Test value",
  add: "Add indicator",
  nameAr: "Indicator name (Arabic)",
  nameEn: "English name (optional)",
  newGroup: "+ New group",
  newGroupName: "New group name (Arabic)",
  ratio: "Percentage: numerator ÷ denominator × 100",
  numerator: "Numerator (e.g. compliant samples)",
  denominator: "Denominator (e.g. samples tested)",
};

const FORBIDDEN = /RII|سجل إصدارات|version history|illustrative|تجريبي|تجريبية/i;

async function ownerRows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await connectAsOwner();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    await c.end();
  }
}

/**
 * The plants UI belongs to another feature, so the test creates its plant with the owner
 * connection (test setup only; the app itself never does this), including the
 * plant_indicators rows that adopt all 15 system indicators.
 */
async function createPlantFor(email: string, name: string): Promise<string> {
  const [user] = await ownerRows<{ id: string }>("select id from users where email = $1", [email]);
  const [plant] = await ownerRows<{ id: string }>(
    `insert into plants (owner_id, name, governorate, water_source, design_capacity)
     values ($1, $2, 'baghdad', 'river', 1000) returning id`,
    [user.id, name],
  );
  await ownerRows(
    `insert into plant_indicators (owner_id, plant_id, indicator_code, adopted)
     select $1, $2, code, true from indicators`,
    [user.id, plant.id],
  );
  return plant.id;
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const card = (page: Page, code: string): Locator =>
  page.locator(`[data-testid="indicator-card"][data-ref="sys:${code}"]`);

async function dialogShot(page: Page, path: string, scrollTo?: Locator) {
  await scrollTo?.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250); // sheet slide-in
  await page.screenshot({ path });
}

test("indicators: filters, adoption, limits, user-defined indicators", async ({ page }, info) => {
  test.setTimeout(240_000);
  const project = info.project.name;
  const email = `e2e-${randomUUID()}@test.local`;

  // --- sign up
  await page.goto("/ar/signup");
  await page.waitForLoadState("networkidle"); // let the client hydrate before typing
  await page.getByLabel(ar.signUp.name).fill("م. سارة الجبوري");
  await page.getByLabel(ar.signUp.job).fill("مهندسة تقييم الأداء");
  await page.getByLabel(ar.signUp.email).fill(email);
  const pw = page.locator('input[autocomplete="new-password"]');
  await pw.nth(0).fill(PASSWORD);
  await pw.nth(1).fill(PASSWORD);
  await page.getByRole("button", { name: ar.signUp.submit }).click();
  await expect(page).toHaveURL(/\/ar\/dashboard$/, { timeout: 30_000 });

  const plantName = "محطة الاختبار";
  const plantId = await createPlantFor(email, plantName);

  // --- Arabic page, no plant picked yet: a prompt instead of switches
  await page.goto("/ar/indicators");
  // streamed content sits hidden in the DOM until the loading skeleton is swapped out
  await expect(page.getByTestId("indicator-card").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("plant-prompt")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByTestId("indicator-card")).toHaveCount(15);

  // choose the plant in the picker on the page
  await page.getByTestId("plant-picker").selectOption({ value: plantId });
  // the picker now sets the top-bar plant (no ?plant= in the URL) and the prompt goes away
  await expect(page.getByRole("switch")).toHaveCount(15);
  await expect(page.getByTestId("plant-prompt")).toHaveCount(0);
  await expect(page.getByTestId("plant-picker")).toHaveValue(plantId);

  // --- structure and content rules (client notes 5, 6, 8, 9)
  await expect(page.getByText(ar.subtitle, { exact: true })).toBeVisible();
  await expect(page.getByTestId("indicator-group")).toHaveCount(4);
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(FORBIDDEN);
  const sc1 = card(page, "SC-01");
  await expect(sc1).toContainText("SC-01");
  await expect(sc1).toContainText(ar.sc1);
  const sc1Text = await sc1.innerText();
  for (const tag of ["طريقة الحساب", "الوحدة", "الأعلى أفضل", "الأقل أفضل", "البسط", "Calculation"]) {
    expect(sc1Text).not.toContain(tag);
  }
  await expectNoHorizontalScroll(page);

  // --- group filter
  const chips = page.getByTestId("group-chip");
  await expect(chips).toHaveCount(5); // all + 4 groups
  await chips.filter({ hasText: ar.continuity }).click();
  await expect(page.getByTestId("indicator-card")).toHaveCount(4);
  await expect(page.getByTestId("indicator-group")).toHaveCount(1);
  await chips.filter({ hasText: ar.all }).first().click();
  await expect(page.getByTestId("indicator-card")).toHaveCount(15);

  // --- adoption persists (checked through the owner connection, then a reload)
  const adoptionRow = () =>
    ownerRows<{ adopted: boolean }>(
      "select adopted from plant_indicators where plant_id = $1 and indicator_code = 'SC-01'",
      [plantId],
    );
  const sw = sc1.getByRole("switch", { name: new RegExp(`${ar.sc1}.*${plantName}`) });
  await expect(sw).toBeChecked();
  await expect(sc1).toContainText(ar.adopted);
  await sw.click();
  await expect(sw).not.toBeChecked();
  await expect(sc1).toContainText(ar.notAdopted);
  await expect.poll(async () => (await adoptionRow())[0]?.adopted).toBe(false);
  await page.reload();
  await expect(card(page, "SC-01")).toBeVisible({ timeout: 60_000 });
  await expect(card(page, "SC-01").getByRole("switch")).not.toBeChecked();
  await card(page, "SC-01").getByRole("switch").click();
  await expect.poll(async () => (await adoptionRow())[0]?.adopted).toBe(true);
  await page.reload();
  await expect(card(page, "SC-01")).toBeVisible({ timeout: 60_000 });
  await expect(card(page, "SC-01").getByRole("switch")).toBeChecked();

  // --- screenshots of page, add dialog and limits editor in both languages
  for (const lang of ["ar", "en"] as const) {
    await page.goto(`/${lang}/indicators?plant=${plantId}`);
    await expect(page.getByTestId("indicator-card").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("indicator-card")).toHaveCount(15);
    await expectNoHorizontalScroll(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${SHOTS}/indicators-${lang}-${project}.png` });

    // add dialog, filled (not submitted)
    const t = lang === "ar" ? ar : en;
    await page.getByRole("button", { name: t.add }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("textbox", { name: t.nameAr, exact: true }).fill(lang === "ar" ? "نسبة العينات المطابقة للمعايير المحلية" : "نسبة العينات");
    if (lang === "en") await dlg.getByRole("textbox", { name: en.nameEn, exact: true }).fill("Share of samples meeting local standards");
    await dlg.getByRole("combobox", { name: lang === "ar" ? "المجموعة" : "Group", exact: true }).selectOption("new");
    await dlg.getByRole("textbox", { name: t.newGroupName, exact: true }).fill(lang === "ar" ? "مؤشرات البيئة" : "بيئة");
    await dlg.getByText(t.ratio, { exact: true }).click();
    await dlg.getByRole("textbox", { name: t.numerator, exact: true }).fill(lang === "ar" ? "العينات المطابقة" : "عينات مطابقة");
    await dlg.getByRole("textbox", { name: t.denominator, exact: true }).fill(lang === "ar" ? "العينات المفحوصة" : "عينات مفحوصة");
    await dialogShot(page, `${SHOTS}/indicator-add-${lang}-${project}.png`);
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);

    // limits editor with a test value
    await card(page, "SC-01").getByRole("button", { name: t.limits }).click();
    const ld = page.getByRole("dialog");
    await ld.getByLabel(t.testValue, { exact: true }).fill("96");
    await expect(ld.getByTestId("threshold-scale")).toBeVisible();
    await expect(ld.locator('[data-status="ok"]')).toBeVisible();
    await dialogShot(page, `${SHOTS}/limits-${lang}-${project}.png`, ld.locator('[data-status="ok"]'));
    await page.keyboard.press("Escape");
    await expect(ld).toHaveCount(0);
  }

  // --- limits: invalid order is blocked, then saved and reflected on the card
  await page.goto(`/ar/indicators?plant=${plantId}`);
  await expect(page.getByTestId("indicator-card").first()).toBeVisible({ timeout: 60_000 });
  const limitsRow = () =>
    ownerRows<{ target: number; warning: number; critical: number; none: boolean }>(
      `select l.target, l.warning, l.critical, l.none from indicator_limits l
         join users u on u.id = l.owner_id where u.email = $1 and l.indicator_code = 'SC-01'`,
      [email],
    );
  await card(page, "SC-01").getByRole("button", { name: ar.limits }).click();
  let dlg = page.getByRole("dialog");
  await dlg.getByLabel(ar.warning, { exact: true }).fill("99"); // warning above target (98): bad order
  await expect(dlg.getByTestId("limits-error")).toBeVisible();
  await dlg.getByRole("button", { name: ar.save }).click();
  await expect(dlg).toBeVisible(); // save blocked
  expect((await limitsRow())[0]).toMatchObject({ target: 98, warning: 95, critical: 90 });
  await dlg.getByLabel(ar.warning, { exact: true }).fill("96");
  await dlg.getByLabel(ar.target, { exact: true }).fill("99");
  await expect(dlg.getByTestId("limits-error")).toHaveCount(0);
  await dlg.getByLabel(ar.testValue, { exact: true }).fill("97");
  await expect(dlg.getByText(ar.inLimits, { exact: true }).first()).toBeVisible();
  await dlg.getByRole("button", { name: ar.save }).click();
  await expect(dlg).toHaveCount(0);
  await expect.poll(async () => (await limitsRow())[0]?.target).toBe(99);
  await expect(card(page, "SC-01").getByTestId("threshold-scale")).toHaveAttribute("aria-label", /99%/);

  // --- "no approved limits"
  await card(page, "SC-03").getByRole("button", { name: ar.limits }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByRole("checkbox", { name: ar.none }).click();
  await dlg.getByRole("button", { name: ar.save }).click();
  await expect(dlg).toHaveCount(0);
  await page.reload();
  await expect(card(page, "SC-03")).toBeVisible({ timeout: 60_000 });
  await expect(card(page, "SC-03").getByTestId("scale-none")).toContainText(ar.noLimitsChip);
  await expect(card(page, "SC-01").getByTestId("scale-none")).toHaveCount(0);

  // --- add a user-defined ratio indicator in a new group, adopted at all plants
  await page.getByRole("button", { name: ar.add }).first().click();
  dlg = page.getByRole("dialog");
  await dlg.getByRole("textbox", { name: ar.nameAr, exact: true }).fill("نسبة العينات المطابقة محلياً");
  await dlg.getByRole("combobox", { name: "المجموعة", exact: true }).selectOption("new");
  await dlg.getByRole("textbox", { name: ar.newGroupName, exact: true }).fill("مجموعة البيئة");
  await dlg.getByText(ar.ratio, { exact: true }).click();
  await dlg.getByRole("textbox", { name: ar.numerator, exact: true }).fill("العينات المطابقة");
  await dlg.getByRole("textbox", { name: ar.denominator, exact: true }).fill("العينات المفحوصة");
  await dlg.getByRole("button", { name: ar.create }).click();
  await expect(dlg).toHaveCount(0);
  const newChip = chips.filter({ hasText: "مجموعة البيئة" });
  await expect(newChip).toBeVisible();
  await expect(newChip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("indicator-card")).toHaveCount(1);
  const mine = page.getByTestId("indicator-card").first();
  await expect(mine).toContainText("نسبة العينات المطابقة محلياً");
  await expect(mine.getByRole("switch")).toBeChecked();
  await expect(mine.getByTestId("scale-none")).toBeVisible();
  const mineText = await mine.innerText();
  expect(mineText).not.toContain("%");

  // --- edit its name
  await mine.getByRole("button", { name: new RegExp(`^${ar.edit}:`) }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByRole("textbox", { name: ar.nameAr, exact: true }).fill("نسبة العينات المطابقة (معدل)");
  await dlg.getByRole("button", { name: ar.saveChanges }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId("indicator-card").first()).toContainText("(معدل)");

  // --- delete it, then the empty group
  await page.getByTestId("indicator-card").first().getByRole("button", { name: new RegExp(`^${ar.del}:`) }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: ar.delConfirm }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.getByTestId("indicator-card")).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(`^${ar.delGroup}`) }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: ar.delGroup }).click();
  await expect(dlg).toHaveCount(0);
  await expect(chips.filter({ hasText: "مجموعة البيئة" })).toHaveCount(0);
  await expect(page.getByTestId("indicator-card")).toHaveCount(15);
  await expectNoHorizontalScroll(page);
});
