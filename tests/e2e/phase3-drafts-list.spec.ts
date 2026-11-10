import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import arAssess from "../../messages/ar/assessments.json";
import arWizard from "../../messages/ar/wizard.json";
import { DEMO_PLANTS } from "../../scripts/lib/demo-data";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { ORIGIN, PASSWORD, hydrated, newEmail } from "./helpers";

/**
 * Phase 3: a draft started in the wizard shows up on the dashboard and the assessments list,
 * can be resumed, and can be deleted from the list (with a confirmation). Seeds its own
 * throwaway copy of the demo data (tsx child process, owner connection) for a fresh account.
 */
test.describe.configure({ timeout: 240_000 });

const KARKH = DEMO_PLANTS.find((p) => p.key === "karkh")!.name;
const a = arAssess;
const w = arWizard;

type Seeded = { userId: string; plantIds: Record<string, string>; assessmentIds: Record<string, string> };

/** seedDemo() is an ES module (import.meta); Playwright loads specs as CommonJS, so it runs in a tsx child process. */
function seedDemoFor(email: string): Seeded {
  const code = `import("./scripts/seed-demo.ts").then(async (m) => { const r = await m.seedDemo({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(PASSWORD)}, name: "م. اختبار" }); console.log("SEEDED" + JSON.stringify(r)); })`;
  const out = execFileSync("npx", ["tsx", "-e", code], { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 });
  const line = out.split("\n").find((l) => l.startsWith("SEEDED"));
  if (!line) throw new Error(`seeding failed:\n${out}`);
  return JSON.parse(line.slice("SEEDED".length)) as Seeded;
}

async function ownerRows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
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

test("a draft is listed, resumable and deletable from the assessments list", async ({ page, context }) => {
  const email = newEmail();
  const seeded = seedDemoFor(email);
  const res = await page.request.post("/api/auth/sign-in/email", { headers: { Origin: ORIGIN }, data: { email, password: PASSWORD } });
  expect(res.ok()).toBe(true);
  // all plants, whole record: the list shows every assessment
  await context.addCookies([{ name: "wtp_range", value: "all", url: ORIGIN }]);
  const approvedIds = Object.values(seeded.assessmentIds);
  expect(approvedIds).toHaveLength(18);

  // --- create a draft through the wizard: step 1, then leave -----------------------------------
  await page.goto("/ar/assessments/new");
  await expect(page.getByRole("heading", { level: 1, name: w.title })).toBeVisible();
  await hydrated(page);
  await page.waitForFunction(() => {
    const els = [...document.querySelectorAll("main button[data-step], main select, main input")];
    return els.length > 0 && els.every((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")));
  });
  const field = (label: string) => page.locator("main").getByLabel(new RegExp(`^${label}\\s*\\*?$`));
  await field(w.details.plant).selectOption({ label: KARKH });
  await field(w.details.period).selectOption("1");
  await field(w.details.month).selectOption("2026-09");
  await page.getByRole("button", { name: w.actions.nextIndicators, exact: true }).click();
  await expect(page).toHaveURL(/draft=[0-9a-f-]{36}&step=2/, { timeout: 30_000 });
  const draftId = new URL(page.url()).searchParams.get("draft")!;

  const inDb = () =>
    ownerRows<{ id: string; status: string }>("select id, status from assessments where id = $1", [draftId]);
  expect(await inDb()).toEqual([{ id: draftId, status: "draft" }]);

  // --- dashboard: the latest-assessments block shows the draft with a resume link ---------------
  await page.goto("/ar/dashboard");
  const block = page.getByTestId("latest-assessments");
  await expect(block).toBeVisible({ timeout: 60_000 });
  const dashRow = block.locator('[data-testid="assessment-row"][data-status="draft"]');
  await expect(dashRow).toHaveCount(1);
  await expect(dashRow.getByTestId("row-status")).toHaveText(a.list.status.draft);
  await expect(dashRow.getByTestId("row-resume")).toHaveAttribute("href", new RegExp(`draft=${draftId}`));
  await expect(dashRow.getByTestId("row-delete")).toHaveCount(0); // the dashboard is compact: no delete
  await noHorizontalScroll(page);

  // --- assessments list: the draft row with its status and a resume link ------------------------
  await page.goto("/ar/assessments");
  await hydrated(page);
  await expect(page.getByRole("heading", { level: 1, name: a.list.title })).toBeVisible({ timeout: 60_000 });
  const rows = page.getByTestId("assessment-row");
  await expect(rows).toHaveCount(19, { timeout: 30_000 });
  const count = page.getByTestId("list-count");
  await expect(count).toContainText("19");
  const draftRow = page.locator('[data-testid="assessment-row"][data-status="draft"]');
  await expect(draftRow).toHaveCount(1);
  await expect(draftRow.getByTestId("row-status")).toHaveText(a.list.status.draft);
  await expect(draftRow).toContainText(KARKH);
  const resume = draftRow.getByTestId("row-resume");
  await expect(resume).toHaveAttribute("href", new RegExp(`/assessments/new\\?draft=${draftId}`));

  // approved assessments are final: opened, never deleted
  const approved = page.locator('[data-testid="assessment-row"][data-status="approved"]');
  await expect(approved).toHaveCount(18);
  await expect(approved.getByTestId("row-open")).toHaveCount(18);
  await expect(approved.getByTestId("row-delete")).toHaveCount(0);
  await expect(approved.getByTestId("row-resume")).toHaveCount(0);
  await noHorizontalScroll(page);

  // --- resume opens the wizard on that draft ---------------------------------------------------
  await resume.click();
  await expect(page).toHaveURL(new RegExp(`/ar/assessments/new\\?draft=${draftId}`), { timeout: 30_000 });
  // pre-selected but no readings typed yet: the draft resumes at the indicators step
  await expect(page.locator("[data-step-heading]").filter({ hasText: w.indicators.title })).toBeVisible({ timeout: 30_000 });

  // --- back on the list: cancel keeps the draft, confirm deletes it -----------------------------
  await page.goto("/ar/assessments");
  await hydrated(page);
  await expect(rows).toHaveCount(19, { timeout: 30_000 });
  await draftRow.getByTestId("row-delete").click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText(a.list.deleteDialog.title)).toBeVisible();
  await expect(dialog).toContainText(KARKH);
  await dialog.getByRole("button", { name: a.list.deleteDialog.cancel }).click();
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(19);
  expect(await inDb()).toHaveLength(1);

  await draftRow.getByTestId("row-delete").click();
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("confirm-delete-draft").click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(rows).toHaveCount(18, { timeout: 30_000 });
  await expect(count).toContainText("18");
  await expect(draftRow).toHaveCount(0);

  // gone after a reload and from the database; the approved ones are untouched
  await page.reload();
  await hydrated(page);
  await expect(rows).toHaveCount(18, { timeout: 30_000 });
  await expect(draftRow).toHaveCount(0);
  await expect(approved).toHaveCount(18);
  await expect(approved.getByTestId("row-delete")).toHaveCount(0);
  expect(await inDb()).toHaveLength(0);
  const left = await ownerRows<{ n: number }>(
    "select count(*)::int n from assessments where owner_id = $1 and status = 'approved'",
    [seeded.userId],
  );
  expect(left[0].n).toBe(18);
  const remaining = await ownerRows<{ id: string }>("select id from assessments where owner_id = $1 and status = 'draft'", [seeded.userId]);
  expect(remaining).toHaveLength(0);
});
