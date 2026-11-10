import { chromium, type Browser, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const URL_ = pathToFileURL(path.join(ROOT, "docs/handoff/reference/prototype-v4.html")).href;
const OUT = path.join(ROOT, "docs/reference-screenshots/prototype");
const SIZES = [
  { w: 1440, vp: { width: 1440, height: 900 }, dsf: 1 },
  { w: 390, vp: { width: 390, height: 844 }, dsf: 2 },
];

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500); // let page-in animation settle
}
async function shot(page: Page, name: string, fullPage: boolean) {
  await ready(page);
  await page.screenshot({ path: path.join(OUT, name), fullPage });
  console.log("saved", name);
}
async function open(browser: Browser, size: (typeof SIZES)[number], scheme: "light" | "dark", lang: "ar" | "en") {
  const ctx = await browser.newContext({ viewport: size.vp, deviceScaleFactor: size.dsf, colorScheme: scheme, isMobile: false });
  await ctx.addInitScript("window.claude = window.claude || { use: async () => null };");
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(URL_);
  await page.waitForSelector(".auth-card");
  if (lang === "en") await page.click('.auth-top button[data-v="en"]');
  else await page.click('.auth-top button[data-v="ar"]');
  await page.waitForTimeout(200);
  return { ctx, page };
}
async function signIn(page: Page) {
  await page.fill("#lg-email", "engineer@wtp.iq");
  await page.fill("#lg-pass", "demo1234");
  await page.click('form[data-form="login"] button[type="submit"]');
  await page.waitForSelector(".topbar");
}

(async () => {
  const browser = await chromium.launch();
  for (const size of SIZES) {
    for (const lang of ["ar", "en"] as const) {
      const sfx = `${lang}-${size.w}`;
      const { ctx, page } = await open(browser, size, "light", lang);
      await shot(page, `login-${sfx}.png`, true);
      await page.click('[data-act="auth-mode"][data-v="signup"]');
      await page.waitForSelector('form[data-form="signup"]');
      await shot(page, `signup-${sfx}.png`, true);
      await page.click('[data-act="auth-mode"][data-v="login"]');
      await signIn(page);
      await shot(page, `dashboard-${sfx}.png`, true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `shell-${sfx}.png`, false);
      if (size.w < 1024) {
        await page.click('[data-act="nav-open"]');
        await page.waitForSelector(".sidebar.open");
      }
      await shot(page, `usermenu-${sfx}.png`, false);
      await ctx.close();
    }
  }
  // dark set
  const { ctx, page } = await open(browser, SIZES[0], "dark", "ar");
  await shot(page, "login-ar-1440-dark.png", true);
  await signIn(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "shell-ar-1440-dark.png", false);
  await ctx.close();
  await browser.close();
})();
