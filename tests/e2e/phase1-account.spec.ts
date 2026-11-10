import { expect, test, type Page } from "@playwright/test";
import {
  PASSWORD,
  ar,
  chooseTheme,
  getSessionUser,
  hydrated,
  newEmail,
  retry,
  signInViaUi,
  signUpViaApi,
  waitForMail,
} from "./helpers";

/**
 * Phase 1 account flows: password reset, theme, language persistence, profile.
 * Every test creates its own `e2e-<uuid>@test.local` user (removed by global teardown).
 * UI steps that fill a form and submit it run inside `retry` (see helpers.ts).
 */
// The shared dev server can hot-reload pages while other runs write files; allow for retries.
test.describe.configure({ timeout: 120_000 });

const NEW_PASSWORD = "e2e-new-password-2";
const SENT = "إذا كان هذا البريد مسجّلاً لدينا";

async function requestReset(page: Page, email: string) {
  await retry(async () => {
    await page.goto("/ar/forgot-password");
    await hydrated(page);
    await page.getByLabel(ar.email).fill(email);
    await page.getByRole("button", { name: "إرسال الرابط" }).click();
    await expect(page.getByRole("status")).toContainText(SENT, { timeout: 8_000 });
  });
  return (await page.getByRole("status").innerText()).trim();
}

async function resetLinkFor(email: string) {
  const mail = await waitForMail(email);
  const match = mail.Text.match(/https?:\/\/\S+\/api\/auth\/reset-password\/\S+/);
  expect(match).not.toBeNull();
  return { mail, link: match![0] };
}

function newPasswords(page: Page) {
  return page.locator('input[autocomplete="new-password"]');
}

test.describe("password reset", () => {
  test("full reset flow: old password dies, new works, link is single-use", async ({
    page,
    context,
  }) => {
    const email = newEmail();
    await signUpViaApi(page, email);
    await context.clearCookies();

    await requestReset(page, email);
    const { mail, link } = await resetLinkFor(email);
    expect(mail.From.Name).toContain("Service Quality Monitoring System");
    expect(mail.From.Name).toContain("نظام مراقبة جودة الخدمة");

    await page.goto(link);
    await expect(page).toHaveURL(/\/ar\/reset-password\?token=/);
    await hydrated(page);
    await newPasswords(page).nth(0).fill(NEW_PASSWORD);
    await newPasswords(page).nth(1).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "حفظ كلمة المرور" }).click();

    await expect(page).toHaveURL(/\/ar\/login/);
    await expect(page.getByText("تم تغيير كلمة المرور")).toBeVisible();

    // The old password no longer signs in.
    const pw = page.locator('input[autocomplete="current-password"]');
    await hydrated(page);
    await page.getByLabel(ar.email).fill(email);
    await pw.fill(PASSWORD);
    await page.getByRole("button", { name: ar.signIn }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/ar\/login/);
    await expect(pw).toHaveValue("");

    // The new one does.
    await pw.fill(NEW_PASSWORD);
    await page.getByRole("button", { name: ar.signIn }).click();
    await expect(page).toHaveURL(/\/ar\/dashboard$/);

    // Reusing the link shows the invalid-link state.
    await context.clearCookies();
    await page.goto(link);
    await expect(page.getByText("الرابط غير صالح")).toBeVisible();
    await expect(page.getByRole("link", { name: "طلب رابط جديد" })).toBeVisible();
    await expect(newPasswords(page)).toHaveCount(0);
  });

  test("an unknown email gets the same confirmation as a known one", async ({
    page,
    context,
  }) => {
    const email = newEmail();
    await signUpViaApi(page, email);
    await context.clearCookies();

    const known = await requestReset(page, email);
    const unknown = await requestReset(page, newEmail());
    expect(unknown).toBe(known);
  });

  test("mismatched confirmation shows an inline error", async ({ page, context }) => {
    const email = newEmail();
    await signUpViaApi(page, email);
    await context.clearCookies();
    await requestReset(page, email);
    const { link } = await resetLinkFor(email);

    await retry(async () => {
      await page.goto(link);
      await hydrated(page);
      await newPasswords(page).nth(0).fill(NEW_PASSWORD);
      await newPasswords(page).nth(1).fill(NEW_PASSWORD + "x");
      await page.getByRole("button", { name: "حفظ كلمة المرور" }).click();
      await expect(page.getByText("كلمتا المرور غير متطابقتين.")).toBeVisible({
        timeout: 8_000,
      });
    });
    await expect(page).toHaveURL(/\/ar\/reset-password/);
  });
});

test.describe("theme", () => {
  test("choices apply, persist to the profile and survive cleared storage", async ({
    page,
  }, info) => {
    const project = info.project.name;
    await signUpViaApi(page, newEmail());
    const html = page.locator("html");

    async function choose(label: string, theme: string, dark?: boolean) {
      await retry(async () => {
        if (!page.url().includes("/ar/dashboard")) await page.goto("/ar/dashboard");
        await hydrated(page);
        await chooseTheme(page, label, project);
        if (dark !== undefined) {
          if (dark) await expect(html).toHaveClass(/\bdark\b/, { timeout: 5_000 });
          else await expect(html).not.toHaveClass(/\bdark\b/, { timeout: 5_000 });
        }
      });
      await expect.poll(async () => (await getSessionUser(page))?.theme).toBe(theme);
    }

    await page.goto("/ar/dashboard");
    await choose(ar.dark, "dark", true);

    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);

    // Local storage gone, cookies kept: the saved profile theme is re-applied.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);

    await choose(ar.light, "light", false);

    await choose(ar.system, "system");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).not.toHaveClass(/\bdark\b/);
  });
});

test.describe("language persistence", () => {
  test("switching to English is saved and restored at the next sign-in", async ({
    page,
  }, info) => {
    const project = info.project.name;
    const email = newEmail();
    await signUpViaApi(page, email);

    await retry(async () => {
      await page.goto("/ar/dashboard");
      await hydrated(page);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await page.getByRole("button", { name: "EN", exact: true }).click();
      await expect(page).toHaveURL(/\/en\/dashboard$/, { timeout: 8_000 });
    });
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect.poll(async () => (await getSessionUser(page))?.locale).toBe("en");

    // Sign out (the UI is English now).
    await retry(async () => {
      await hydrated(page);
      if (project === "phone") {
        await page.getByRole("button", { name: "Open menu" }).click();
        await page.getByRole("button", { name: "Sign out" }).click();
      } else {
        await page.getByRole("button", { name: "My account" }).click();
        await page.getByRole("menuitem", { name: "Sign out" }).click();
      }
      await expect(page).toHaveURL(/\/en\/login/, { timeout: 8_000 });
    });

    // Signing in from the Arabic login page lands on the saved language.
    await retry(async () => {
      await signInViaUi(page, email, PASSWORD);
      await expect(page).toHaveURL(/\/en\/dashboard$/, { timeout: 8_000 });
    });
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });
});

test.describe("profile", () => {
  test("name and job title can be changed", async ({ page }, info) => {
    await signUpViaApi(page, newEmail());
    const name = `م. تجريب ${Date.now()}`;
    const job = "رئيسة قسم الجودة";

    await retry(async () => {
      await page.goto("/ar/profile");
      await hydrated(page);
      await page.getByLabel("الاسم الكامل").fill(name);
      await page.getByLabel("المنصب (الوظيفة)").fill(job);
      await page.getByRole("button", { name: "حفظ التغييرات" }).click();
      await expect(page.getByText("تم حفظ التغييرات.")).toBeVisible({ timeout: 8_000 });
    });

    if (info.project.name === "desktop") {
      await expect(page.getByRole("button", { name: ar.userMenu })).toContainText(name);
    }
    await expect.poll(async () => (await getSessionUser(page))?.name).toBe(name);
    expect((await getSessionUser(page))?.jobTitle).toBe(job);
  });
});
