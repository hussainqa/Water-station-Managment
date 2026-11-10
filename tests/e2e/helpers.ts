import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export const MAILPIT = "http://localhost:54326";
export const ORIGIN = "http://localhost:3100";
export const PASSWORD = "e2e-password-1";

export const ar = {
  email: "البريد الإلكتروني",
  signIn: "تسجيل الدخول",
  signOut: "تسجيل الخروج",
  userMenu: "حسابي",
  openDrawer: "فتح القائمة",
  dark: "داكن",
  light: "فاتح",
  system: "حسب النظام",
};

/** Waits until React has hydrated the page (forms post natively before that and lose state). */
export async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const els = [...document.querySelectorAll("form, header button")];
    return (
      els.length > 0 &&
      els.every((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))
    );
  });
}

/**
 * Retries an idempotent UI step. The dev server can hot-reload the page under us
 * (a reload wipes typed-in values), so fill + click + outcome is retried as a unit.
 */
export async function retry(step: () => Promise<void>, timeout = 60_000) {
  await expect(step).toPass({ timeout, intervals: [250, 500, 1_000] });
}

export function newEmail() {
  return `e2e-${randomUUID()}@test.local`;
}

/** Creates the account through the auth API; the page's cookie jar receives the session. */
export async function signUpViaApi(
  page: Page,
  email: string,
  opts: { password?: string; name?: string; jobTitle?: string } = {},
) {
  const res = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: ORIGIN },
    data: {
      email,
      password: opts.password ?? PASSWORD,
      name: opts.name ?? "م. اختبار",
      jobTitle: opts.jobTitle ?? "مهندس",
    },
  });
  expect(res.ok()).toBe(true);
}

export async function getSessionUser(page: Page) {
  const res = await page.request.get("/api/auth/get-session");
  const body = (await res.json()) as {
    user?: Record<string, string>;
  } | null;
  return body?.user ?? null;
}

/** Signs in through /ar/login and waits for the dashboard (any locale). */
export async function signInViaUi(page: Page, email: string, password: string) {
  await page.goto("/ar/login");
  await hydrated(page);
  await page.getByLabel(ar.email).fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: ar.signIn }).click();
}

/** Mailpit messages addressed to `email`, polled until one arrives. Read-only. */
export async function waitForMail(email: string) {
  let id = "";
  await expect
    .poll(
      async () => {
        const r = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        const j = (await r.json()) as { messages?: { ID: string }[] };
        id = j.messages?.[0]?.ID ?? "";
        return id;
      },
      { timeout: 15_000 },
    )
    .not.toBe("");
  const r = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return (await r.json()) as {
    From: { Name: string; Address: string };
    To: { Address: string }[];
    Text: string;
    Subject: string;
  };
}

/** Drawer on the phone project, user menu on desktop. */
export async function chooseTheme(page: Page, label: string, project: string) {
  if (project === "phone") {
    await page.getByRole("button", { name: ar.openDrawer }).click();
    await page.getByRole("radio", { name: label }).click();
    await page.keyboard.press("Escape");
  } else {
    // The menu deliberately stays open after a theme choice, so open it only if needed
    // and close it afterwards.
    const option = page.getByRole("menuitemradio", { name: label });
    if (!(await option.isVisible())) {
      await page.getByRole("button", { name: ar.userMenu }).click();
    }
    await option.click();
    await page.keyboard.press("Escape");
    await expect(option).toBeHidden();
  }
}

export async function signOutViaUi(page: Page, project: string) {
  if (project === "phone") {
    await page.getByRole("button", { name: ar.openDrawer }).click();
    await page.getByRole("button", { name: ar.signOut }).click();
  } else {
    await page.getByRole("button", { name: ar.userMenu }).click();
    await page.getByRole("menuitem", { name: ar.signOut }).click();
  }
  await expect(page).toHaveURL(/\/(ar|en)\/login/);
}
