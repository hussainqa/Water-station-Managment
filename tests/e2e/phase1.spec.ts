import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 1 journey: login screen, sign-up, empty dashboard, shell in both languages,
 * sign out and sign in. Also writes the screenshots in docs/screenshots/phase-1/.
 */
const SHOTS = "docs/screenshots/phase-1";
const PASSWORD = "e2e-password-1";

const text = {
  ar: {
    name: "الاسم الكامل",
    job: "المنصب (الوظيفة)",
    email: "البريد الإلكتروني",
    signUp: "إنشاء الحساب",
    signIn: "تسجيل الدخول",
    signOut: "تسجيل الخروج",
    emptyTitle: "ابدأ بإضافة محطتك الأولى",
    addPlant: "إضافة محطة",
    institution: "وزارة التعليم العالي والبحث العلمي",
    researcher: "الحسين عبد الخالق عبد العزيز",
    removed: ["رسالة ماجستير", "بيانات تجريبية", "حساب تجريبي"],
  },
  en: {
    emptyTitle: "Start by adding your first plant",
    removed: ["Master's thesis", "Demo data", "Demo account"],
  },
} as const;

async function shot(page: Page, name: string, project: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${SHOTS}/${name}-${project}.png` });
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("login and sign-up screens, both languages", async ({ page }, info) => {
  const project = info.project.name;

  await page.goto("/");
  await expect(page).toHaveURL(/\/ar\/login$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText(text.ar.institution)).toBeVisible();
  await expect(page.getByText(text.ar.researcher)).toBeVisible();
  await expect(page.locator('img[src*="ministry"]')).toBeVisible();
  await expect(page.locator('img[src*="university"]')).toBeVisible();
  // Client notes 1-3: no thesis line, no demo box.
  for (const gone of text.ar.removed) {
    await expect(page.getByText(gone)).toHaveCount(0);
  }
  await expectNoHorizontalScroll(page);
  await shot(page, "login-ar", project);

  await page.goto("/en/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  for (const gone of text.en.removed) {
    await expect(page.getByText(gone)).toHaveCount(0);
  }
  await expectNoHorizontalScroll(page);
  await shot(page, "login-en", project);

  await page.goto("/ar/signup");
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/signup-ar-${project}.png`, fullPage: true });
  await page.goto("/en/signup");
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: `${SHOTS}/signup-en-${project}.png`, fullPage: true });
});

test("a new user signs up, lands on an empty dashboard, and can sign back in", async ({
  page,
  context,
}, info) => {
  const project = info.project.name;
  const email = `e2e-${randomUUID()}@test.local`;

  await page.goto("/ar/dashboard");
  await expect(page).toHaveURL(/\/ar\/login/);

  await page.goto("/ar/signup");
  await page.getByLabel(text.ar.name).fill("م. سارة الجبوري");
  await page.getByLabel(text.ar.job).fill("مهندسة تقييم الأداء");
  await page.getByLabel(text.ar.email).fill(email);
  const newPasswords = page.locator('input[autocomplete="new-password"]');
  await newPasswords.nth(0).fill(PASSWORD);
  await newPasswords.nth(1).fill(PASSWORD);
  await page.getByRole("button", { name: text.ar.signUp }).click();

  await expect(page).toHaveURL(/\/ar\/dashboard$/);
  await expect(page.getByText(text.ar.emptyTitle)).toBeVisible();
  await expect(page.getByRole("link", { name: text.ar.addPlant })).toBeVisible();
  await expect(page.getByText(text.ar.removed[1])).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await shot(page, "dashboard-empty-ar", project);

  await page.goto("/en/dashboard");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByText(text.en.emptyTitle)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "dashboard-empty-en", project);

  // The session cookie must not be readable by scripts.
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name.includes("session_token"));
  expect(sessionCookie?.httpOnly).toBe(true);

  if (project === "desktop") {
    await page.goto("/ar/dashboard");
    await page.getByRole("button", { name: text.ar.signOut }).first().click();
    await expect(page).toHaveURL(/\/ar\/login/);
  } else {
    await context.clearCookies();
  }
  await page.goto("/ar/dashboard");
  await expect(page).toHaveURL(/\/ar\/login/);

  await page.getByLabel(text.ar.email).fill(email);
  const password = page.locator('input[autocomplete="current-password"]');
  await password.fill("wrong-password");
  await page.getByRole("button", { name: text.ar.signIn }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page).toHaveURL(/\/ar\/login/);

  // The password field is cleared after a failed attempt; wait for that before retyping.
  await expect(password).toHaveValue("");
  await password.fill(PASSWORD);
  await page.getByRole("button", { name: text.ar.signIn }).click();
  await expect(page).toHaveURL(/\/ar\/dashboard$/);
});
