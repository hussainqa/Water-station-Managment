import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import arAuth from "../../messages/ar/auth.json";
import enAuth from "../../messages/en/auth.json";
import arPlants from "../../messages/ar/plants.json";
import enPlants from "../../messages/en/plants.json";
import arShell from "../../messages/ar/shell.json";
import enShell from "../../messages/en/shell.json";

/**
 * Phase 2, plants: sign up, empty state, validation (including the 120% rule),
 * add, top-bar selector, edit, add two more, search, delete after confirming.
 * One pass per language with its own account; also writes docs/screenshots/phase-2/plant*.png.
 */
const SHOTS = "docs/screenshots/phase-2";
const PASSWORD = "e2e-password-1";

type Lang = "ar" | "en";
const M = {
  ar: { plants: arPlants, auth: arAuth, shell: arShell },
  en: { plants: enPlants, auth: enAuth, shell: enShell },
} as const;

const SAMPLE = {
  ar: [
    { name: "محطة الرافدين لمعالجة المياه", location: "الرصافة", engineer: "م. أحمد كاظم", gov: "baghdad", design: "120000", actual: "104500" },
    { name: "محطة دجلة لمعالجة المياه", location: "الأعظمية", engineer: "م. زينب عبد الله", gov: "baghdad", design: "90000", actual: "71200" },
    { name: "محطة الكرخ لمعالجة المياه", location: "جانب الكرخ", engineer: "م. مصطفى جاسم", gov: "baghdad", design: "150000", actual: "108000" },
  ],
  en: [
    { name: "Al-Rafidain Water Treatment Plant", location: "Al-Rusafa", engineer: "Eng. Ahmed Kadhim", gov: "baghdad", design: "120000", actual: "104500" },
    { name: "Dijla Water Treatment Plant", location: "Al-Adhamiya", engineer: "Eng. Zainab Abdullah", gov: "baghdad", design: "90000", actual: "71200" },
    { name: "Al-Karkh Water Treatment Plant", location: "Karkh side", engineer: "Eng. Mustafa Jassim", gov: "baghdad", design: "150000", actual: "108000" },
  ],
} as const;

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string, lang: Lang, project: string, fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}-${lang}-${project}.png`, fullPage });
}

async function signUp(page: Page, lang: Lang) {
  const a = M[lang].auth;
  await page.goto(`/${lang}/signup`);
  await page.getByLabel(a.fields.name).fill("E2E Engineer");
  await page.getByLabel(a.fields.jobTitle).fill("Engineer");
  await page.getByLabel(a.fields.email).fill(`e2e-${randomUUID()}@test.local`);
  const pw = page.locator('input[autocomplete="new-password"]');
  await pw.nth(0).fill(PASSWORD);
  await pw.nth(1).fill(PASSWORD);
  await page.getByRole("button", { name: a.signup.submit }).click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/dashboard$`));
}

async function fillPlant(
  dialog: Locator,
  lang: Lang,
  p: { name: string; location: string; engineer: string; gov: string; design: string; actual: string },
) {
  const f = M[lang].plants.form;
  await dialog.getByLabel(f.name).fill(p.name);
  await dialog.getByLabel(f.governorate).selectOption(p.gov);
  await dialog.getByLabel(f.location).fill(p.location);
  await dialog.getByLabel(f.source).selectOption("tigris");
  await dialog.getByLabel(f.engineer).fill(p.engineer);
  await dialog.getByLabel(f.design).fill(p.design);
  await dialog.getByLabel(f.actual).fill(p.actual);
}

for (const lang of ["ar", "en"] as const) {
  test(`plants journey (${lang})`, async ({ page }, info) => {
    const project = info.project.name;
    const t = M[lang].plants;
    const shell = M[lang].shell;
    const [a, b, c] = SAMPLE[lang];
    const dialog = page.getByRole("dialog");
    const cards = page.getByTestId("plant-card");
    const selector = page.getByRole("combobox", { name: shell.filters.plant, exact: true });

    await signUp(page, lang);

    // Dashboard call to action opens the add dialog.
    await page.getByRole("link", { name: shell.dashboard.empty.cta }).click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/plants\\?new=1$`));
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/${lang}/plants$`));

    // Empty state; no subtitle line under the title (client note 4).
    await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    await expect(page.getByRole("heading", { level: 1, name: t.title })).toBeVisible();
    await expect(page.getByText(t.empty.title)).toBeVisible();
    await expect(page.getByText(t.empty.text)).toBeVisible();
    await expect(page.locator("h1 + p")).toHaveCount(0);
    await expect(cards).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shot(page, "plants-empty", lang, project);

    // Validation: required fields, then the 120% rule. No subtitle under the dialog title (note 7).
    await page.getByRole("button", { name: t.add }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: t.form.addTitle })).toBeVisible();
    await expect(dialog.locator('[data-slot="responsive-dialog-header"] p')).toHaveCount(0);
    await dialog.getByRole("button", { name: t.form.save }).click();
    await expect(dialog.getByText(t.errors.nameRequired)).toBeVisible();
    await expect(dialog.getByText(t.errors.locationRequired)).toBeVisible();
    await expect(dialog.getByText(t.errors.designRequired)).toBeVisible();
    await expect(dialog.getByLabel(t.form.name)).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel(t.form.name)).toBeFocused();

    await dialog.getByLabel(t.form.name).fill(a.name);
    await dialog.getByLabel(t.form.location).fill(a.location);
    await dialog.getByLabel(t.form.design).fill("0");
    await dialog.getByRole("button", { name: t.form.save }).click();
    await expect(dialog.getByText(t.errors.designInvalid)).toBeVisible();

    await dialog.getByLabel(t.form.design).fill("1000");
    await dialog.getByLabel(t.form.actual).fill("1201");
    await dialog.getByRole("button", { name: t.form.save }).click();
    await expect(dialog.getByText(t.errors.actualTooHigh)).toBeVisible();
    await expect(dialog.getByLabel(t.form.actual)).toHaveAttribute("aria-invalid", "true");
    await expect(cards).toHaveCount(0);

    // Fill the real values, screenshot the dialog, save.
    await fillPlant(dialog, lang, a);
    await expectNoHorizontalScroll(page);
    await dialog.getByLabel(t.form.name).blur();
    await shot(page, "plant-add", lang, project);
    await dialog.getByRole("button", { name: t.form.save }).click();
    await expect(dialog).toBeHidden();
    await expect(cards).toHaveCount(1);
    const first = cards.filter({ hasText: a.name });
    await expect(first).toContainText(t.state.notAssessed);
    await expect(first).toContainText("87.1%");
    await expect(first).toContainText(lang === "en" ? "No past assessments" : "لا توجد تقييمات سابقة");

    // The top-bar selector lists it.
    await expect(selector.locator("option", { hasText: a.name })).toHaveCount(1);

    // Edit.
    await first.getByRole("button", { name: t.card.edit.replace("{name}", a.name) }).click();
    await expect(dialog.getByRole("heading", { name: t.form.editTitle })).toBeVisible();
    await expect(dialog.getByLabel(t.form.name)).toHaveValue(a.name);
    await dialog.getByLabel(t.form.engineer).fill(b.engineer);
    await dialog.getByRole("button", { name: t.form.saveEdit }).click();
    await expect(dialog).toBeHidden();
    await expect(first).toContainText(b.engineer);

    // Add two more.
    for (const p of [b, c]) {
      await page.getByRole("button", { name: t.add }).first().click();
      await fillPlant(dialog, lang, p);
      await dialog.getByRole("button", { name: t.form.save }).click();
      await expect(dialog).toBeHidden();
    }
    await expect(cards).toHaveCount(3);
    await expect(selector.locator("option")).toHaveCount(4); // all plants + 3
    await expectNoHorizontalScroll(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
    await shot(page, "plants-list", lang, project);

    // Search narrows the list; a miss shows the no-results state.
    const search = page.getByRole("searchbox", { name: t.search.label });
    await search.fill(b.name.split(" ")[lang === "ar" ? 1 : 0]);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(b.name);
    await search.fill("zzzz-no-match");
    await expect(page.getByText(t.noResults.title)).toBeVisible();
    await search.fill("");
    await expect(cards).toHaveCount(3);

    // Select a plant in the top bar, then delete it: selection falls back to all plants.
    const third = cards.filter({ hasText: c.name });
    const thirdId = await selector.locator("option", { hasText: c.name }).getAttribute("value");
    await selector.selectOption(thirdId!);
    await expect(selector).toHaveValue(thirdId!);
    await third.getByRole("button", { name: t.card.delete.replace("{name}", c.name) }).click();
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toContainText(c.name);
    await confirmDialog.getByRole("button", { name: t.delete.cancel }).click();
    await expect(cards).toHaveCount(3);
    await third.getByRole("button", { name: t.card.delete.replace("{name}", c.name) }).click();
    await confirmDialog.getByRole("button", { name: t.delete.confirm }).click();
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: c.name })).toHaveCount(0);
    await expect(selector).toHaveValue("all");
    await expect(selector.locator("option")).toHaveCount(3);

    await page.reload();
    await expect(cards).toHaveCount(2);
  });
}
