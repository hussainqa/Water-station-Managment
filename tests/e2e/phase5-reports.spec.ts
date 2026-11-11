import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { SeedDemoResult } from "../../scripts/seed-demo";
import arReports from "../../messages/ar/reports.json";
import enReports from "../../messages/en/reports.json";
import { hydrated, newEmail, ORIGIN, PASSWORD, signInViaUi, signUpViaApi } from "./helpers";

/**
 * Phase 5 (part B): reports and PDF export. Each run seeds a throwaway copy of the demo data
 * for a fresh e2e account, then (WITHOUT the UI, in a tsx child process on the owner connection)
 * creates Al-Karkh September 2026, selects obstacles on SC-03 and SC-04 and chooses a linked
 * action on SC-04. Saves docs/screenshots/phase-5/{report-karkh-2026-09-{ar,en}.pdf,
 * report-{ar,en}-page1.png, reports-<lang>-<project>.png}.
 */
const SHOTS = "docs/screenshots/phase-5";
type Lang = "ar" | "en";
const M = { ar: arReports, en: enReports } as const;

type Setup = {
  karkhAssessment: string;
  sc04: string;
  sc03: string;
  today: string;
  o36En: string;
  a41En: string;
  axisEn: string;
  rank: number;
};

function runTsx<T>(code: string): T {
  const out = execFileSync("npx", ["tsx", "-e", code], { cwd: process.cwd(), encoding: "utf8", timeout: 180_000 });
  const line = out.split("\n").find((l) => l.startsWith("RESULT"));
  if (!line) throw new Error(`child process failed: ${out}`);
  return JSON.parse(line.slice(6)) as T;
}

function seedFor(email: string): SeedDemoResult {
  return runTsx<SeedDemoResult>(
    `import("./scripts/seed-demo.ts").then(async (m) => { const r = await m.seedDemo({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(PASSWORD)}, name: "Sara Al-Jubouri", jobTitle: "Quality Engineer" }); console.log("RESULT" + JSON.stringify(r)); })`,
  );
}

function setupKarkh(userId: string, karkhPlantId: string): Setup {
  return runTsx<Setup>(`
const must = (r, what) => { if (!r.ok) throw new Error(what + " failed: " + JSON.stringify(r)); return r.data; };
(async () => {
  const { connectAsOwner } = await import("./scripts/lib/owner-db.ts");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("./src/db/schema/index.ts");
  const assess = await import("./src/lib/assessments/service.ts");
  const probs = await import("./src/lib/problems/service.ts");
  const demo = await import("./scripts/lib/demo-data.ts");
  const client = await connectAsOwner();
  const tx = drizzle(client, { schema });
  try {
    const userId = ${JSON.stringify(userId)};
    const NOW = demo.KARKH_SEPTEMBER_NOW;
    const actor = "م. مصطفى جاسم";
    const { id } = must(await assess.createDraft(tx, userId, { plantId: ${JSON.stringify(karkhPlantId)}, periodStart: demo.KARKH_SEPTEMBER_PERIOD, months: 1, enteredBy: actor }, { now: NOW, actor }), "draft");
    must(await assess.setDraftSelection(tx, userId, id, Object.keys(demo.KARKH_SEPTEMBER)), "selection");
    must(await assess.saveDraftReadings(tx, userId, id, Object.fromEntries(Object.entries(demo.KARKH_SEPTEMBER).map(([ref, inputs]) => [ref, { inputs }]))), "readings");
    must(await assess.approveAssessment(tx, userId, id, { acknowledgeMissing: true, now: NOW, actor }), "approve");
    const list = await probs.listProblems(tx, userId, { plantId: ${JSON.stringify(karkhPlantId)}, range: "all", now: new Date() });
    const sc04 = list.find((p) => p.indicator.code === "SC-04").id;
    const sc03 = list.find((p) => p.indicator.code === "SC-03").id;
    const ctx = { now: new Date(), actor };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
    const o36 = { kind: "system", code: "O-36" };
    must(await probs.setObstacle(tx, userId, { problemId: sc04, target: o36, classification: "confirmed", note: "ملاحظة ميدانية" }, ctx), "o36");
    must(await probs.setObstacle(tx, userId, { problemId: sc03, target: { kind: "system", code: "O-37" }, classification: "possible" }, ctx), "o37");
    must(await probs.setActionChosen(tx, userId, { problemId: sc04, actionCode: "A-41", chosen: true, linkedObstacle: o36 }, ctx), "choose");
    must(await probs.setActionImplemented(tx, userId, { problemId: sc04, actionCode: "A-41", implementedOn: today }, ctx), "implement");
    must(await probs.setObstacleOnly(tx, userId, { problemId: sc03, value: true }, ctx), "only");
    const q = async (sql) => (await client.query(sql)).rows[0];
    const o = await q("select o.text_en, a.name_en as axis from obstacles o join obstacle_axes a on a.idx = o.axis_idx where o.code = 'O-36'");
    const a = await q("select text_en from corrective_actions where code = 'A-41'");
    const r = await q("select rank from obstacle_action_links where obstacle_code = 'O-36' and action_code = 'A-41'");
    console.log("RESULT" + JSON.stringify({ karkhAssessment: id, sc04, sc03, today, o36En: o.text_en, a41En: a.text_en, axisEn: o.axis, rank: r.rank }));
  } finally { await client.end(); }
})();`);
}

// --- PDF inspection (pdfjs-dist in Node) --------------------------------------------------------

async function inspectPdf(bytes: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  let text = "";
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    text += content.items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : "") : "")).join("") + "\n";
  }
  const fonts = [...new Set(bytes.toString("latin1").match(/BaseFont\s*\/[A-Za-z0-9+-]+/g) ?? [])].map((f) => f.replace(/BaseFont\s*\//, ""));
  return { pages: doc.numPages, text, flat: text.normalize("NFKC").replace(/\s+/g, ""), fonts };
}

const REMOVED_EN = ["RII", "correlation", "priority", "importance", "Ministry", "University of Baghdad", "Alhussien", "Abdalkhaliq", "Abbas Mohammed Burhan", "Master", "Demo", "Illustrative"];
const REMOVED_AR = ["معامل", "وزارة التعليم", "جامعة بغداد", "كلية الهندسة", "الحسين عبد الخالق عبد العزيز", "عباس محمد برهان", "رسالة ماجستير", "تجريبي"];
const hasArabicScript = (s: string) => /[؀-ۿﭐ-﷿ﹰ-﻿]/.test(s);

async function fetchPdf(page: Page, query: string): Promise<Buffer> {
  const res = await page.request.get(`/api/reports/pdf?${query}`);
  expect(res.status(), await res.text().catch(() => "")).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["cache-control"]).toContain("no-store");
  const cd = res.headers()["content-disposition"];
  expect(cd).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
  const body = await res.body();
  expect(body.subarray(0, 4).toString()).toBe("%PDF");
  return body;
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

/**
 * Page 1 of the real PDF as PNG. On macOS the system renderer (sips) is used: Ghostscript
 * draws some Arabic glyphs of the embedded font badly, which makes a correct PDF look wrong.
 * Elsewhere Ghostscript is tried; with neither, the caller screenshots the same HTML instead.
 */
function pdfPage1ToPng(pdf: Buffer, out: string): boolean {
  const tmp = `${out}.tmp.pdf`;
  try {
    fs.writeFileSync(tmp, pdf);
    if (process.platform === "darwin") {
      try {
        execFileSync("sips", ["-s", "format", "png", "-Z", "1800", tmp, "--out", out], { timeout: 60_000, stdio: "ignore" });
        if (fs.existsSync(out)) return true;
      } catch {
        // fall through to Ghostscript
      }
    }
    execFileSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=png16m", "-r110", "-dFirstPage=1", "-dLastPage=1", `-sOutputFile=${out}`, tmp], { timeout: 60_000 });
    return fs.existsSync(out);
  } catch {
    return false;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Saves an A4-wide print-media rendering of the report HTML (the same document the PDF is made from). */
async function shotPrint(page: Page, query: string, file: string) {
  const ctx = page.context();
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 794, height: 1123 });
  await p.emulateMedia({ media: "print" });
  await p.goto(`${ORIGIN}/api/reports/html?${query}`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: file, clip: { x: 0, y: 0, width: 794, height: 1123 } });
  await p.close();
}

test.describe("reports and PDF export", () => {
  test.describe.configure({ mode: "serial" });
  let email: string;
  let seed: SeedDemoResult;
  let setup: Setup;

  test.beforeAll(() => {
    fs.mkdirSync(SHOTS, { recursive: true });
    email = newEmail();
    seed = seedFor(email);
    setup = setupKarkh(seed.userId, seed.plantIds.karkh);
  });

  test("acceptance: Al-Karkh September 2026 report, PDF in Arabic and English", async ({ page }, info) => {
    test.setTimeout(300_000);
    const project = info.project.name;
    await signInViaUi(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/ar\/dashboard/, { timeout: 30_000 });

    for (const lang of ["ar", "en"] as const) {
      const m = M[lang];
      await page.goto(`/${lang}/reports`);
      await hydrated(page);
      await expect(page.getByRole("heading", { level: 1, name: m.title })).toBeVisible({ timeout: 60_000 });

      // choose Al-Karkh, period report, September 2026
      await page.locator("#rep-plant").selectOption(seed.plantIds.karkh);
      await page.locator("#rep-type").selectOption("period");
      const sel = page.locator("#rep-assessment");
      await expect(sel).toHaveValue(setup.karkhAssessment);
      await expect(sel.locator("option:checked")).toHaveText(lang === "ar" ? "أيلول 2026" : "September 2026");

      // the preview shows the report
      const frame = page.frameLocator('[data-testid="report-preview"]');
      await expect(frame.locator("header.doc h1")).toHaveText(M[lang].doc.titlePeriod, { timeout: 60_000 });
      await expect(frame.locator("body")).toContainText("SC-04");
      await expect(frame.locator("body")).toContainText("SC-03");
      await expect(frame.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await noHorizontalScroll(page);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${SHOTS}/reports-${lang}-${project}.png`, fullPage: true });
    }

    // --- export through the dialog (UI language ar), choosing each language in the dialog ---
    await page.goto(`/ar/reports?assessment=${setup.karkhAssessment}`);
    await hydrated(page);
    await expect(page.locator("#rep-assessment")).toHaveValue(setup.karkhAssessment);
    const pdfs = {} as Record<Lang, Buffer>;
    for (const lang of ["ar", "en"] as const) {
      await page.getByRole("button", { name: M.ar.actions.export }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("radio", { checked: true })).toHaveAttribute("value", "ar"); // default = current UI language
      await dialog.getByRole("radio", { name: lang === "ar" ? "العربية" : "English" }).check();
      const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90_000 }), dialog.getByTestId("export-download").click()]);
      const file = `${SHOTS}/report-karkh-2026-09-${lang}.pdf`;
      if (project === "desktop") await download.saveAs(file);
      else await download.saveAs(`${SHOTS}/_phone-${lang}.pdf`);
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);
      await expect(dialog.getByTestId("export-message")).toContainText(M.ar.dialog.done);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      pdfs[lang] = fs.readFileSync(project === "desktop" ? file : `${SHOTS}/_phone-${lang}.pdf`);
      if (project !== "desktop") fs.unlinkSync(`${SHOTS}/_phone-${lang}.pdf`);
    }

    // --- inspect both PDFs ---
    const query = (lang: Lang) => `type=period&assessment=${setup.karkhAssessment}&lang=${lang}`;
    for (const lang of ["ar", "en"] as const) {
      const pdf = await inspectPdf(pdfs[lang]);
      expect(pdfs[lang].subarray(0, 4).toString()).toBe("%PDF");
      expect(pdf.pages).toBeGreaterThanOrEqual(1);
      expect(pdf.fonts.some((f) => /IBMPlexSansArabic/.test(f))).toBe(true);
      expect(pdf.flat).toContain("SC-04");
      expect(pdf.flat).toContain("SC-03");
      expect(pdf.flat).toContain("6.5");
      expect(pdf.flat).toContain("SaraAl-Jubouri"); // the prepared-by name
      expect(pdf.flat).toContain(String(setup.rank)); // the rank digit (also appears elsewhere; the HTML test asserts the exact cell)
      expect(pdf.flat).toContain(setup.today);
      for (const bad of [...REMOVED_EN, ...REMOVED_AR]) expect(pdf.text, bad).not.toContain(bad);
      expect(pdf.flat).not.toMatch(/\b[AO]-\d{2}\b/);
      if (lang === "en") {
        const flat = pdf.text.replace(/\s+/g, " ");
        expect(flat).toContain(setup.a41En.replace(/\s+/g, " "));
        expect(flat).toContain(setup.o36En.replace(/\s+/g, " "));
        expect(flat).toContain(setup.axisEn);
        expect(flat).toContain("Prepared by");
        expect(flat).toContain("Approval");
        expect(flat).toContain("Page 1 of");
      } else {
        // Arabic shaping: the text layer holds Arabic presentation forms (shaped glyphs), not bare letters
        expect(/[ﭐ-﷿ﹰ-﻿]/.test(pdf.text)).toBe(true);
        expect(pdf.fonts.filter((f) => /IBMPlexSansArabic/.test(f)).length).toBeGreaterThan(0);
        expect(pdf.flat.includes("أيلول") || pdf.flat.includes([..."أيلول"].reverse().join(""))).toBe(true);
      }
      // page 1 as an image: the real PDF through Ghostscript, else the same HTML in print media
      if (!pdfPage1ToPng(pdfs[lang], `${SHOTS}/report-${lang}-page1.png`)) {
        await shotPrint(page, query(lang), `${SHOTS}/report-${lang}-page1.png`);
      }
    }
    // the English PDF contains the prepared-by name in Arabic script (the user's name as entered)
    const en = await inspectPdf(pdfs.en);
    expect(hasArabicScript(en.text)).toBe(true);
  });

  test("deep links from the results page, the problem page (both states) and the actions log", async ({ page }) => {
    test.setTimeout(240_000);
    await signInViaUi(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/ar\/dashboard/, { timeout: 30_000 });
    const expectReport = async () => {
      await expect(page).toHaveURL(new RegExp(`/ar/reports\\?assessment=${setup.karkhAssessment}$`), { timeout: 30_000 });
      await hydrated(page);
      await expect(page.locator("#rep-assessment")).toHaveValue(setup.karkhAssessment);
      await expect(page.locator("#rep-plant")).toHaveValue(seed.plantIds.karkh);
      await expect(page.frameLocator('[data-testid="report-preview"]').locator("header.doc")).toBeVisible({ timeout: 60_000 });
    };

    await page.goto(`/ar/assessments/${setup.karkhAssessment}`);
    await hydrated(page);
    await page.getByTestId("results-report-link").click();
    await expectReport();

    // treated problem (SC-04): link in the header
    await page.goto(`/ar/problems/${setup.sc04}`);
    await hydrated(page);
    await page.getByTestId("problem-report-link").click();
    await expectReport();

    // documented problem (SC-03): the old "available in the next release" hint is now a link
    await page.goto(`/ar/problems/${setup.sc03}`);
    await hydrated(page);
    await expect(page.getByTestId("done-banner")).toHaveAttribute("data-stage", "documented");
    await expect(page.getByTestId("done-banner")).not.toContainText("الإصدار القادم");
    await page.getByTestId("done-banner").getByTestId("problem-report-link").click();
    await expectReport();

    // actions log: one link per row, to the period report of that problem's assessment
    await page.goto(`/ar/actions`);
    await hydrated(page);
    const row = page.getByTestId("log-row").first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("log-report-link").first()).toHaveAttribute("href", /\/reports\?problem=/);
    await page.locator('[data-testid="log-row"]').filter({ hasText: "SC-04" }).getByTestId("log-report-link").click();
    await expect(page).toHaveURL(/\/ar\/reports\?problem=/, { timeout: 30_000 });
    await hydrated(page);
    await expect(page.locator("#rep-assessment")).toHaveValue(setup.karkhAssessment);
    await expect(page.frameLocator('[data-testid="report-preview"]').locator("body")).toContainText("SC-04", { timeout: 60_000 });
  });

  test("plant history: length selector defaults to monthly and offers only the plant's lengths", async ({ page }) => {
    await signInViaUi(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/ar\/dashboard/, { timeout: 30_000 });
    await page.goto(`/en/reports?plant=${seed.plantIds.dijla}&type=history`);
    await hydrated(page);
    const length = page.locator("#rep-length");
    await expect(length).toBeVisible({ timeout: 60_000 });
    await expect(length).toHaveValue("1");
    expect(await length.locator("option").evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value))).toEqual(["1"]);
    const frame = page.frameLocator('[data-testid="report-preview"]');
    await expect(frame.locator("header.doc h1")).toHaveText(enReports.doc.titleHistory, { timeout: 60_000 });
    await expect(frame.locator("table.trend thead th")).toHaveCount(7); // indicator + six months
    await expect(frame.locator("svg.chart")).toBeVisible();
    // the same selection through the type selector
    await page.locator("#rep-plant").selectOption(seed.plantIds.karkh);
    await expect(page.locator("#rep-type")).toHaveValue("history");
    await expect(page.locator("#rep-length")).toHaveValue("1");
    const pdf = await inspectPdf(await fetchPdf(page, `type=history&plant=${seed.plantIds.dijla}&months=1&lang=en`));
    expect(pdf.text).toContain("Service quality history report");
  });

  test("access control, validation and the fallback message", async ({ page, browser }) => {
    test.setTimeout(180_000);
    // signed out
    const anon = await browser.newContext();
    for (const kind of ["pdf", "html"]) {
      const r = await anon.request.get(`${ORIGIN}/api/reports/${kind}?type=period&assessment=${setup.karkhAssessment}&lang=en`);
      expect(r.status()).toBe(401);
    }
    await anon.close();

    // another user's assessment -> 404 (never the data)
    const other = await browser.newContext();
    const op = await other.newPage();
    await signUpViaApi(op, newEmail(), { name: "Other User" });
    const r404 = await op.request.get(`/api/reports/pdf?type=period&assessment=${setup.karkhAssessment}&lang=en`);
    expect(r404.status()).toBe(404);
    expect((await op.request.get(`/api/reports/html?type=history&plant=${seed.plantIds.dijla}&months=1&lang=en`)).status()).toBe(404);
    await other.close();

    // the owner: validation errors, HTML endpoint headers
    await signInViaUi(page, email, PASSWORD);
    await expect(page).toHaveURL(/\/ar\/dashboard/, { timeout: 30_000 });
    expect((await page.request.get(`/api/reports/pdf?type=period&assessment=nope&lang=en`)).status()).toBe(400);
    expect((await page.request.get(`/api/reports/pdf?type=history&plant=${seed.plantIds.dijla}&months=5&lang=en`)).status()).toBe(400);
    const html = await page.request.get(`/api/reports/html?type=period&assessment=${setup.karkhAssessment}&lang=ar`);
    expect(html.status()).toBe(200);
    expect(html.headers()["content-security-policy"]).toContain("default-src 'none'");
    expect(html.headers()["content-security-policy"]).toContain("font-src data:");
    const body = await html.text();
    expect(body).toContain('dir="rtl"');
    expect(body).not.toMatch(/<script|https?:\/\//i);

    // when the PDF service fails the dialog shows the translated fallback message
    await page.goto(`/ar/reports?assessment=${setup.karkhAssessment}`);
    await hydrated(page);
    await page.route("**/api/reports/pdf**", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
    await page.getByRole("button", { name: M.ar.actions.export }).click();
    await page.getByTestId("export-download").click();
    await expect(page.getByTestId("export-message")).toHaveText(M.ar.dialog.errors.unavailable);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: M.ar.actions.print })).toBeEnabled(); // the browser-print fallback stays available
  });

  test("empty states", async ({ page }) => {
    const fresh = newEmail();
    await signUpViaApi(page, fresh, { name: "Fresh User" });
    await page.goto("/en/reports");
    await hydrated(page);
    await expect(page.getByRole("heading", { name: enReports.empty.noPlants.title })).toBeVisible({ timeout: 60_000 });
  });
});
