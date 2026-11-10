import "dotenv/config";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { seedDemo } from "../../scripts/seed-demo";
import {
  KARKH_SEPTEMBER,
  KARKH_SEPTEMBER_CRITICAL,
  KARKH_SEPTEMBER_NOW,
  KARKH_SEPTEMBER_PERIOD,
} from "../../scripts/lib/demo-data";
import { pool } from "@/db/client";
import { assessmentReadings, assessments, auditEvents, problems } from "@/db/schema";
import { withUser, type UserTx } from "@/db/with-user";
import { auth } from "@/lib/auth";
import type { AssessmentResult } from "@/lib/assessments/schemas";
import * as svc from "@/lib/assessments/service";
import { createUserIndicator, saveLimits, setAdoption } from "@/lib/indicators/service";
import { indicatorFormSchema } from "@/lib/indicators/schemas";
import { createPlant } from "@/lib/plants/service";
import { validatePlant } from "@/lib/plants/schemas";
import { plantState } from "@/lib/plants/state";
import type { Limits } from "@/lib/evaluation";
import { sqlState } from "./helpers";

const NOW = new Date("2026-09-15T09:00:00Z"); // September 2026 in Baghdad
const ctx = { now: NOW, actor: "Tester" };
const sys = (code: string) => `sys:${code}`;

async function signUp(label: string) {
  const res = await auth.api.signUpEmail({
    body: {
      name: `AS ${label}`,
      email: `as-${label}-${randomBytes(6).toString("hex")}@test.local`,
      password: randomBytes(12).toString("hex"),
      jobTitle: "tester",
    },
  });
  return res.user.id;
}

function data<T>(r: AssessmentResult<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r.data;
}

const run = <T>(uid: string, fn: (tx: UserTx) => Promise<T>) => withUser(uid, fn);

let plantSeq = 0;
async function newPlant(uid: string) {
  const v = validatePlant({
    name: `Plant ${++plantSeq}`,
    governorate: "baghdad",
    location: "x",
    waterSource: "tigris",
    designCapacity: "1000",
    actualCapacity: "900",
    engineer: "Eng",
    notes: "",
  });
  if (!v.ok) throw new Error("bad plant");
  return (await run(uid, (tx) => createPlant(tx, uid, v.data))).id;
}

const details = (plantId: string, over: Record<string, unknown> = {}) => ({
  plantId,
  periodStart: "2026-08",
  months: 1,
  enteredBy: "Eng. Test",
  ...over,
});

const mkDraft = async (uid: string, plantId: string, over: Record<string, unknown> = {}) =>
  data(await run(uid, (tx) => svc.createDraft(tx, uid, details(plantId, over), ctx))).id;

const select = (uid: string, id: string, refs: string[]) =>
  run(uid, (tx) => svc.setDraftSelection(tx, uid, id, refs));

const save = (uid: string, id: string, entries: Record<string, Record<string, string | number | null>>, notes: Record<string, string> = {}) =>
  run(uid, (tx) =>
    svc.saveDraftReadings(
      tx,
      uid,
      id,
      Object.fromEntries(
        Object.entries(entries).map(([ref, inputs]) => [ref, { inputs, note: notes[ref] }]),
      ) as never,
    ),
  );

const approve = (uid: string, id: string, ack = false, now = NOW) =>
  run(uid, (tx) => svc.approveAssessment(tx, uid, id, { acknowledgeMissing: ack, now, actor: "Approver" }));

/** Draft + selection + readings, ready to approve. */
async function draftWith(
  uid: string,
  plantId: string,
  entries: Record<string, Record<string, string | number | null>>,
  over: Record<string, unknown> = {},
) {
  const id = await mkDraft(uid, plantId, over);
  data(await select(uid, id, Object.keys(entries)));
  data(await save(uid, id, entries));
  return id;
}

async function setLimits(uid: string, code: string, limits: Limits) {
  const r = await run(uid, (tx) => saveLimits(tx, uid, { kind: "sys", code }, { none: false, limits }));
  if (!r.ok) throw new Error(`saveLimits failed: ${JSON.stringify(r)}`);
}

const results = (uid: string, id: string) => run(uid, (tx) => svc.getAssessmentResults(tx, uid, id));
const rowOf = (res: Awaited<ReturnType<typeof svc.getAssessmentResults>>, ref: string) => {
  const d = data(res);
  const row = d.groups.flatMap((g) => g.rows).find((r) => r.ref === ref);
  if (!row) throw new Error(`no row ${ref}`);
  return row;
};
const auditActions = async (uid: string, id: string) =>
  (await results(uid, id).then(data)).audit.map((e) => e.action);

describe("assessments service", () => {
  let a: string;
  let b: string;
  let c: string; // changes its limits
  let owner: Client;
  const users: string[] = [];

  beforeAll(async () => {
    a = await signUp("a");
    b = await signUp("b");
    c = await signUp("c");
    users.push(a, b, c);
    owner = await connectAsOwner();
  });

  afterAll(async () => {
    try {
      await owner.query("delete from users where id = any($1::uuid[])", [users]);
    } finally {
      await owner.end();
      await pool.end();
    }
  });

  // --------------------------------------------------------------------------- drafts

  describe("drafts", () => {
    it("creates, resumes, updates and deletes a draft", async () => {
      const plant = await newPlant(a);
      const id = await mkDraft(a, plant);
      data(await select(a, id, [sys("SC-03"), sys("WQ-02")]));
      data(await save(a, id, { [sys("SC-03")]: { value: "3" }, [sys("WQ-02")]: { numerator: "9" } }, { [sys("SC-03")]: "note" }));

      const d = data(await run(a, (tx) => svc.getDraft(tx, a, id)));
      expect(d.header).toMatchObject({
        id,
        status: "draft",
        periodStart: "2026-08",
        months: 1,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        enteredBy: "Eng. Test",
      });
      expect(d.selection).toEqual([sys("SC-03"), sys("WQ-02")]);
      expect(d.readings[0]).toMatchObject({
        ref: sys("SC-03"),
        inputs: { value: "3" },
        note: "note",
        evaluation: { state: "complete", value: 3, status: "ok" },
      });
      expect(d.readings[1].evaluation).toMatchObject({ state: "partial", value: null, status: "insufficient_data" });
      expect(d.completeness).toMatchObject({ selected: 2, complete: 1, partial: 1, percent: 50 });

      const upd = data(
        await run(a, (tx) =>
          svc.updateDraftDetails(tx, a, id, details(plant, { startDate: "2026-08-05", endDate: "2026-08-25", enteredBy: "Other" }), ctx),
        ),
      );
      expect(upd.header).toMatchObject({ startDate: "2026-08-05", endDate: "2026-08-25", enteredBy: "Other" });
      expect(upd.readings).toHaveLength(2);

      data(await run(a, (tx) => svc.deleteDraft(tx, a, id, ctx)));
      expect(await run(a, (tx) => svc.getDraft(tx, a, id))).toEqual({ ok: false, error: "notFound" });
      const left = await owner.query("select count(*)::int n from assessment_readings where assessment_id=$1", [id]);
      expect(left.rows[0].n).toBe(0);
      const evs = await owner.query("select action from audit_events where entity_id=$1 order by at", [id]);
      expect(evs.rows.map((r) => r.action)).toEqual(["draft_created", "draft_deleted"]);
    });

    it("allows only one draft per plant + start + length (a second one reports the first)", async () => {
      const plant = await newPlant(a);
      const id = await mkDraft(a, plant);
      const again = await run(a, (tx) => svc.createDraft(tx, a, details(plant), ctx));
      expect(again).toMatchObject({
        ok: false,
        error: "duplicate",
        conflict: { id, status: "draft", periodStart: "2026-08", months: 1 },
      });
      data(await run(a, (tx) => svc.deleteDraft(tx, a, id, ctx)));
      await mkDraft(a, plant); // free again
    });

    it("refuses same-length overlap (service and raw 23P01) but allows other lengths", async () => {
      const plant = await newPlant(a);
      const q = await mkDraft(a, plant, { periodStart: "2026-06", months: 3 }); // Jun-Aug

      const overlap = await run(a, (tx) => svc.createDraft(tx, a, details(plant, { periodStart: "2026-07", months: 3 }), ctx));
      expect(overlap).toMatchObject({ ok: false, error: "overlap", conflict: { id: q, months: 3 } });
      const before = await run(a, (tx) => svc.createDraft(tx, a, details(plant, { periodStart: "2026-05", months: 3 }), ctx));
      expect(before).toMatchObject({ ok: false, error: "overlap" });

      // adjacent periods and other lengths are fine
      await mkDraft(a, plant, { periodStart: "2026-03", months: 3 });
      await mkDraft(a, plant, { periodStart: "2026-06", months: 1 });

      // the database says the same
      const code = await sqlState(() =>
        run(a, (tx) =>
          tx.insert(assessments).values({
            ownerId: a,
            plantId: plant,
            periodStart: "2026-07-01",
            months: 3,
            startDate: "2026-07-01",
            endDate: "2026-09-30",
          }),
        ),
      );
      expect(code).toBe("23P01");
    });

    it("maps a concurrent overlap to the same error", async () => {
      const plant = await newPlant(a);
      const [r1, r2] = await Promise.all([
        run(a, (tx) => svc.createDraft(tx, a, details(plant, { periodStart: "2026-03", months: 3 }), ctx)),
        run(a, (tx) => svc.createDraft(tx, a, details(plant, { periodStart: "2026-04", months: 3 }), ctx)),
      ]);
      expect([r1.ok, r2.ok].sort()).toEqual([false, true]);
      const failed = r1.ok ? r2 : r1;
      expect(failed).toMatchObject({ ok: false, error: "overlap" });
    });

    it("updateDraftDetails excludes itself, refuses a clash with another draft, and drops readings the new plant does not adopt", async () => {
      const p1 = await newPlant(a);
      const p2 = await newPlant(a);
      await run(a, (tx) => setAdoption(tx, a, p2, { kind: "sys", code: "SC-02" }, false));
      const x = await mkDraft(a, p1, { periodStart: "2026-04", months: 3 });
      await mkDraft(a, p1, { periodStart: "2026-07", months: 1 });
      // same row, shifted by one month: overlaps only itself
      data(await run(a, (tx) => svc.updateDraftDetails(tx, a, x, details(p1, { periodStart: "2026-05", months: 3 }), ctx)));
      // a monthly draft colliding with another monthly draft
      const m = await mkDraft(a, p1, { periodStart: "2026-02", months: 1 });
      const clash = await run(a, (tx) => svc.updateDraftDetails(tx, a, m, details(p1, { periodStart: "2026-07", months: 1 }), ctx));
      expect(clash).toMatchObject({ ok: false, error: "duplicate" });

      data(await select(a, x, [sys("SC-02"), sys("SC-03")]));
      const moved = data(await run(a, (tx) => svc.updateDraftDetails(tx, a, x, details(p2, { periodStart: "2026-05", months: 3 }), ctx)));
      expect(moved.header.plantId).toBe(p2);
      expect(moved.selection).toEqual([sys("SC-03")]);
    });

    it("validates period rules: current month allowed, future refused, dates inside the period", async () => {
      const plant = await newPlant(a);
      const sep = await run(a, (tx) => svc.createDraft(tx, a, details(plant, { periodStart: "2026-09" }), ctx));
      expect(sep.ok).toBe(true); // end month = current month
      expect(await run(a, (tx) => svc.createDraft(tx, a, details(plant, { periodStart: "2026-10" }), ctx))).toMatchObject({
        ok: false,
        error: "futurePeriod",
      });
      expect(await run(a, (tx) => svc.createDraft(tx, a, details(plant, { periodStart: "2026-08", months: 3 }), ctx))).toMatchObject({
        ok: false,
        error: "futurePeriod",
      }); // ends in October
      expect((await run(a, (tx) => svc.createDraft(tx, a, details(plant, { periodStart: "2026-07", months: 3 }), ctx))).ok).toBe(true);
      expect(await run(a, (tx) => svc.createDraft(tx, a, details(plant, { periodStart: "2025-01", months: 1, startDate: "2025-02-01" }), ctx))).toMatchObject({
        ok: false,
        error: "validation",
        fieldErrors: { startDate: "outsidePeriod" },
      });
      // "now" is injected: a month later the October period is allowed
      const later = { now: new Date("2026-10-02T09:00:00Z"), actor: "T" };
      expect((await run(a, (tx) => svc.createDraft(tx, a, details(plant, { periodStart: "2026-10" }), later))).ok).toBe(true);
    });

    it("refuses a plant that is not the user's", async () => {
      const mine = await newPlant(a);
      expect(await run(b, (tx) => svc.createDraft(tx, b, details(mine), ctx))).toEqual({ ok: false, error: "plantNotFound" });
    });
  });

  // ------------------------------------------------------------- wizard context & selection

  describe("wizard context and selection", () => {
    it("lists only adopted indicators, grouped, with input definitions and current limits", async () => {
      const plant = await newPlant(a);
      await run(a, (tx) => setAdoption(tx, a, plant, { kind: "sys", code: "CS-02" }, false));
      const ctxData = data(await run(a, (tx) => svc.getWizardContext(tx, a, plant)));
      expect(ctxData.plant.id).toBe(plant);
      expect(ctxData.groups.map((g) => g.key)).toEqual([
        "sys:continuity",
        "sys:quality",
        "sys:satisfaction",
        "sys:response",
      ]);
      const all = ctxData.groups.flatMap((g) => g.indicators);
      expect(all).toHaveLength(14);
      expect(all.find((i) => i.ref === sys("CS-02"))).toBeUndefined();
      expect(all.map((i) => i.code).slice(0, 5)).toEqual(["SC-01", "SC-02", "SC-03", "SC-04", "WQ-01"]);
      const sc04 = all.find((i) => i.code === "SC-04");
      expect(sc04?.inputs[0].unitChoices).toEqual(["h", "min"]);
      expect(sc04?.limits).toEqual({ kind: "lower", target: 2, warning: 3, critical: 5 });
      const wq02 = all.find((i) => i.code === "WQ-02");
      expect(wq02?.inputs.map((i) => [i.key, i.integer])).toEqual([
        ["numerator", true],
        ["denominator", true],
      ]);
      expect(wq02?.inputs[0].labelAr).toBeTruthy();
      expect(await run(b, (tx) => svc.getWizardContext(tx, b, plant))).toEqual({ ok: false, error: "plantNotFound" });
    });

    it("a new draft has every adopted indicator selected, with empty inputs, and only those", async () => {
      const full = await newPlant(a);
      const fullId = await mkDraft(a, full);
      const d1 = data(await run(a, (tx) => svc.getDraft(tx, a, fullId)));
      expect(d1.selection).toHaveLength(15);
      expect(d1.readings.every((r) => Object.entries(r.inputs).every(([k, v]) => k === "unit" || v === null || v === ""))).toBe(true);

      const partial = await newPlant(a);
      await run(a, (tx) => setAdoption(tx, a, partial, { kind: "sys", code: "CS-02" }, false));
      const partialId = await mkDraft(a, partial);
      const d2 = data(await run(a, (tx) => svc.getDraft(tx, a, partialId)));
      expect(d2.selection).toHaveLength(14);
      expect(d2.selection).not.toContain(sys("CS-02"));
      const adopted = data(await run(a, (tx) => svc.getWizardContext(tx, a, partial))).groups.flatMap((g) => g.indicators.map((i) => i.ref));
      expect([...d2.selection].sort()).toEqual([...adopted].sort());
    });

    it("only adopted indicators can be selected", async () => {
      const plant = await newPlant(a);
      await run(a, (tx) => setAdoption(tx, a, plant, { kind: "sys", code: "SC-02" }, false));
      const id = await mkDraft(a, plant);
      expect(await select(a, id, [sys("SC-02"), sys("SC-03")])).toEqual({
        ok: false,
        error: "indicatorNotAdopted",
        refs: [sys("SC-02")],
      });
      expect(await select(a, id, ["usr:6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f"])).toMatchObject({
        ok: false,
        error: "indicatorNotAdopted",
      });
      expect(await select(a, id, ["nonsense"])).toMatchObject({ ok: false, error: "indicatorNotAdopted" });
      const ok = data(await select(a, id, [sys("SC-03")]));
      expect(ok.selection).toEqual([sys("SC-03")]);
    });

    it("keeps readings of kept indicators when the selection changes", async () => {
      const plant = await newPlant(a);
      const id = await draftWith(a, plant, { [sys("SC-03")]: { value: "3" }, [sys("WQ-01")]: { value: "110" } });
      const d = data(await select(a, id, [sys("SC-03"), sys("RT-01")]));
      expect(d.readings.map((r) => r.ref)).toEqual([sys("SC-03"), sys("RT-01")]);
      expect(d.readings[0].inputs).toEqual({ value: "3" });
      expect(d.readings[1].evaluation.state).toBe("missing");
    });

    it("saveDraftReadings refuses readings that are not selected", async () => {
      const plant = await newPlant(a);
      const id = await mkDraft(a, plant);
      data(await select(a, id, [sys("SC-03")]));
      expect(await save(a, id, { [sys("WQ-01")]: { value: "1" } })).toEqual({
        ok: false,
        error: "readingNotSelected",
        refs: [sys("WQ-01")],
      });
    });
  });

  // ------------------------------------------------------------ never trust the client

  describe("server-side recomputation", () => {
    it("stores raw inputs only and ignores a client-sent value or status", async () => {
      const plant = await newPlant(a);
      const id = await mkDraft(a, plant);
      data(await select(a, id, [sys("SC-03")]));
      const r = data(
        await run(a, (tx) =>
          svc.saveDraftReadings(tx, a, id, {
            [sys("SC-03")]: { inputs: { value: "3", status: "critical" } as never, value: 999, status: "critical" } as never,
          }),
        ),
      );
      expect(r.readings[0].evaluation).toMatchObject({ value: 3, status: "ok" });
      const row = (await owner.query("select inputs, value, status from assessment_readings where assessment_id=$1", [id])).rows[0];
      expect(row.inputs).toEqual({ value: "3" });
      expect(row.value).toBeNull();
      expect(row.status).toBeNull();
    });

    it("approval recomputes from the inputs even if the stored value was tampered with", async () => {
      const plant = await newPlant(a);
      const id = await draftWith(a, plant, { [sys("SC-03")]: { value: "3" } });
      await owner.query("update assessment_readings set value = 999, status = 'critical' where assessment_id = $1", [id]);
      data(await approve(a, id));
      const row = rowOf(await results(a, id), sys("SC-03"));
      expect(row.value).toBe(3);
      expect(row.status).toBe("ok");
      const n = await run(a, (tx) => tx.select().from(problems).where(eq(problems.assessmentId, id)));
      expect(n).toHaveLength(0);
    });

    it("stores the limits snapshot; later limit changes never alter the results", async () => {
      const plant = await newPlant(c);
      const id = await draftWith(c, plant, { [sys("SC-03")]: { value: "5" } }); // warning with 2/4/6
      data(await approve(c, id));
      const before = rowOf(await results(c, id), sys("SC-03"));
      expect(before).toMatchObject({ status: "warning", limits: { kind: "lower", target: 2, warning: 4, critical: 6 } });

      await setLimits(c, "SC-03", { kind: "lower", target: 1, warning: 2, critical: 3 });
      try {
        const after = rowOf(await results(c, id), sys("SC-03"));
        expect(after.limits).toEqual({ kind: "lower", target: 2, warning: 4, critical: 6 });
        expect(after.status).toBe("warning");
      } finally {
        await setLimits(c, "SC-03", { kind: "lower", target: 2, warning: 4, critical: 6 });
      }
      const snap = (await owner.query("select limits_snapshot from assessments where id=$1", [id])).rows[0].limits_snapshot;
      expect(snap[sys("SC-03")]).toEqual({ kind: "lower", target: 2, warning: 4, critical: 6 });
    });

    it("uses the better status exactly on a limit, and the worse one just beyond it", async () => {
      const cases: [string, Record<string, string>, string][] = [
        ["SC-03", { value: "2" }, "ok"], // target
        ["SC-03", { value: "4" }, "ok"], // on the warning limit
        ["SC-03", { value: "5" }, "warning"],
        ["SC-03", { value: "6" }, "warning"], // on the critical limit
        ["SC-03", { value: "7" }, "critical"],
        ["SC-04", { value: "5", unit: "h" }, "warning"],
        ["SC-04", { value: "5.01", unit: "h" }, "critical"],
        ["WQ-02", { numerator: "950", denominator: "1000" }, "ok"], // 95 on the warning limit (higher is better)
        ["WQ-02", { numerator: "949", denominator: "1000" }, "warning"],
        ["WQ-02", { numerator: "900", denominator: "1000" }, "warning"], // 90 on the critical limit
        ["WQ-02", { numerator: "899", denominator: "1000" }, "critical"],
        ["WQ-01", { value: "100" }, "ok"],
        ["WQ-01", { value: "80" }, "warning"],
        ["WQ-01", { value: "79" }, "critical"],
        ["SC-02", { value: "10" }, "ok"], // direct percentage on the warning limit (lower is better)
        ["SC-02", { value: "10.5" }, "warning"],
      ];
      for (const [code, inputs, status] of cases) {
        // a distinct plant per case keeps this independent of the overlap rules
        const plant = await newPlant(a);
        const id = await draftWith(a, plant, { [sys(code)]: inputs });
        data(await approve(a, id));
        const row = rowOf(await results(a, id), sys(code));
        expect([code, JSON.stringify(inputs), row.status]).toEqual([code, JSON.stringify(inputs), status]);
      }
    });

    it("a value of 29 out of 100 is exactly 29 (no floating-point noise on the boundary)", async () => {
      const plant = await newPlant(c);
      await setLimits(c, "CS-03", { kind: "higher", target: 95, warning: 85, critical: 29 });
      const id = await draftWith(c, plant, { [sys("CS-03")]: { numerator: "29", denominator: "100" } });
      data(await approve(c, id));
      const row = rowOf(await results(c, id), sys("CS-03"));
      expect(row.value).toBe(29);
      expect(row.status).toBe("warning"); // on the critical limit: the better status
      await setLimits(c, "CS-03", { kind: "higher", target: 95, warning: 85, critical: 70 });
    });

    it("input errors block approval and name the indicators", async () => {
      const plant = await newPlant(a);
      const id = await draftWith(a, plant, {
        [sys("SC-03")]: { value: "2.5" }, // must be a whole number
        [sys("WQ-02")]: { numerator: "11", denominator: "10" }, // exceeds the denominator
        [sys("WQ-01")]: { value: "100" },
      });
      const r = await approve(a, id, true);
      expect(r).toEqual({ ok: false, error: "inputErrors", refs: [sys("SC-03"), sys("WQ-02")] });
      const d = data(await run(a, (tx) => svc.getDraft(tx, a, id)));
      expect(d.readings[0].evaluation).toMatchObject({ state: "error", errors: { value: "not_integer" }, status: null });
      expect(d.completeness.error).toBe(2);
      const status = (await owner.query("select status from assessments where id=$1", [id])).rows[0].status;
      expect(status).toBe("draft");
    });

    it("missing or partial data needs an acknowledgement and becomes insufficient data", async () => {
      const plant = await newPlant(a);
      const id = await draftWith(a, plant, {
        [sys("SC-03")]: { value: "3" },
        [sys("WQ-01")]: { value: "" },
        [sys("WQ-02")]: { numerator: "9", denominator: "" },
      });
      expect(await approve(a, id)).toEqual({ ok: false, error: "missingData", refs: [sys("WQ-01"), sys("WQ-02")] });
      const done = data(await approve(a, id, true));
      expect(done.missingCount).toBe(2);
      expect(done.counts).toMatchObject({ ok: 1, insufficient_data: 2, critical: 0 });
      const res = data(await results(a, id));
      expect(rowOf(await results(a, id), sys("WQ-01"))).toMatchObject({ value: null, status: "insufficient_data" });
      expect(res.completeness).toMatchObject({ withValue: 1, total: 3 });
      expect(res.completeness.percent).toBeCloseTo(33.33, 1);
      const ack = res.audit.find((e) => e.action === "missing_data_acknowledged");
      expect(ack?.payload).toEqual({ count: 2 });
      expect(ack?.actor).toBe("Approver");
    });

    it("refuses to approve without indicators", async () => {
      const plant = await newPlant(a);
      const id = await mkDraft(a, plant);
      data(await select(a, id, []));
      expect(await approve(a, id)).toEqual({ ok: false, error: "noIndicatorsSelected" });
    });

    it("refuses to approve a period that is still in the future", async () => {
      const plant = await newPlant(a);
      const id = await draftWith(a, plant, { [sys("SC-03")]: { value: "3" } }, { periodStart: "2026-09" });
      const early = await approve(a, id, false, new Date("2026-08-15T09:00:00Z"));
      expect(early).toMatchObject({ ok: false, error: "futurePeriod" });
      data(await approve(a, id));
    });

    it("converts duration minutes to hours (system and user-defined indicators)", async () => {
      const plant = await newPlant(a);
      const form = indicatorFormSchema.parse({
        nameAr: "مدة اختبار",
        nameEn: "",
        description: "",
        group: "sys:continuity",
        newGroupAr: "",
        newGroupEn: "",
        method: "duration",
        better: "lower",
        unit: "",
        labels: { value: { ar: "الزمن", en: "" } },
        adoptAll: false,
      });
      const made = await run(a, (tx) => createUserIndicator(tx, a, form));
      if (!made.ok || !made.data) throw new Error("could not create the user indicator");
      const created = made.data;
      await run(a, (tx) => setAdoption(tx, a, plant, { kind: "usr", id: created.id }, true));
      const id = await draftWith(a, plant, {
        [sys("SC-04")]: { value: "90", unit: "min" },
        [created.ref]: { value: "150", unit: "min" },
      });
      data(await approve(a, id));
      expect(rowOf(await results(a, id), sys("SC-04"))).toMatchObject({ value: 1.5, status: "ok" });
      // user-defined indicators start without approved limits
      expect(rowOf(await results(a, id), created.ref)).toMatchObject({ value: 2.5, status: "no_limits", limits: null });
    });
  });

  // ------------------------------------------------------------------------ problems

  describe("problems", () => {
    it("opens an auto problem for every critical indicator and none for warnings", async () => {
      const plant = await newPlant(a);
      const id = await draftWith(a, plant, {
        [sys("SC-03")]: { value: "7" }, // critical
        [sys("SC-04")]: { value: "4", unit: "h" }, // warning
        [sys("WQ-01")]: { value: "50" }, // critical
        [sys("WQ-04")]: { value: "3" }, // ok
      });
      const done = data(await approve(a, id));
      expect(done.counts).toMatchObject({ critical: 2, warning: 1, ok: 1 });
      expect(done.problemIds).toHaveLength(2);
      const rows = await run(a, (tx) => tx.select().from(problems).where(eq(problems.assessmentId, id)));
      expect(rows.map((p) => p.indicatorCode).sort()).toEqual(["SC-03", "WQ-01"]);
      expect(rows.every((p) => p.origin === "auto")).toBe(true);
      expect(rows.find((p) => p.indicatorCode === "SC-03")?.value).toBe(7);
      const res = await results(a, id);
      expect(rowOf(res, sys("SC-03"))).toMatchObject({ problemId: expect.any(String), canOpenManualProblem: false });
      expect(rowOf(res, sys("SC-04"))).toMatchObject({ problemId: null, canOpenManualProblem: true });
      expect(rowOf(res, sys("WQ-04"))).toMatchObject({ problemId: null, canOpenManualProblem: false });
      const actions = await auditActions(a, id);
      expect(actions.filter((x) => x === "problem_opened_auto")).toHaveLength(2);
    });

    it("lets a warning or critical reading open a manual problem once, nothing else", async () => {
      const plant = await newPlant(a);
      const id = await draftWith(a, plant, {
        [sys("SC-04")]: { value: "4", unit: "h" }, // warning
        [sys("SC-03")]: { value: "7" }, // critical, has an auto problem
        [sys("WQ-04")]: { value: "3" }, // ok
        [sys("WQ-01")]: { value: "" }, // insufficient
      });
      data(await approve(a, id, true));
      const open = (ref: string) => run(a, (tx) => svc.openManualProblem(tx, a, id, ref, ctx));

      const made = data(await open(sys("SC-04")));
      const row = (await run(a, (tx) => tx.select().from(problems).where(eq(problems.id, made.problemId))))[0];
      expect(row).toMatchObject({ origin: "manual", indicatorCode: "SC-04", value: 4, detectedOn: "2026-09-15" });
      expect(await open(sys("SC-04"))).toEqual({ ok: false, error: "problemExists", problemId: made.problemId });
      expect(await open(sys("SC-03"))).toMatchObject({ ok: false, error: "problemExists" });
      expect(await open(sys("WQ-04"))).toEqual({ ok: false, error: "notEligible" });
      expect(await open(sys("WQ-01"))).toEqual({ ok: false, error: "notEligible" });
      expect(await open(sys("RT-01"))).toEqual({ ok: false, error: "readingNotFound" });
      const draft = await mkDraft(a, plant, { periodStart: "2026-07" });
      expect(await run(a, (tx) => svc.openManualProblem(tx, a, draft, sys("SC-04"), ctx))).toEqual({ ok: false, error: "notApproved" });
      expect(await auditActions(a, id)).toContain("problem_opened_manual");
    });
  });

  // -------------------------------------------------------------------- approved is final

  describe("approved assessments are final", () => {
    it("refuses every draft operation through the service, but still allows the note (audited)", async () => {
      const plant = await newPlant(a);
      const id = await draftWith(a, plant, { [sys("SC-03")]: { value: "3" } });
      data(await approve(a, id));

      expect(await approve(a, id)).toEqual({ ok: false, error: "alreadyApproved" });
      expect(await select(a, id, [sys("SC-03")])).toEqual({ ok: false, error: "alreadyApproved" });
      expect(await save(a, id, { [sys("SC-03")]: { value: "1" } })).toEqual({ ok: false, error: "alreadyApproved" });
      expect(await run(a, (tx) => svc.updateDraftDetails(tx, a, id, details(plant), ctx))).toEqual({ ok: false, error: "alreadyApproved" });
      expect(await run(a, (tx) => svc.deleteDraft(tx, a, id, ctx))).toEqual({ ok: false, error: "alreadyApproved" });
      expect(await run(a, (tx) => svc.getDraft(tx, a, id))).toEqual({ ok: false, error: "alreadyApproved" });

      const n1 = data(await run(a, (tx) => svc.updateReadingNote(tx, a, id, sys("SC-03"), "first", ctx)));
      expect(n1).toEqual({ note: "first", changed: true });
      const same = data(await run(a, (tx) => svc.updateReadingNote(tx, a, id, sys("SC-03"), "first", ctx)));
      expect(same.changed).toBe(false);
      const later = { now: new Date(NOW.getTime() + 60_000), actor: "Tester" };
      data(await run(a, (tx) => svc.updateReadingNote(tx, a, id, sys("SC-03"), "second", later)));
      expect(rowOf(await results(a, id), sys("SC-03")).note).toBe("second");
      const changes = (await results(a, id).then(data)).audit.filter((e) => e.action === "note_changed");
      expect(changes.map((e) => e.payload)).toEqual([
        { ref: sys("SC-03"), from: "first", to: "second" },
        { ref: sys("SC-03"), from: "", to: "first" },
      ]); // newest first
      expect(changes[0].actor).toBe("Tester");
      expect(await run(a, (tx) => svc.updateReadingNote(tx, a, id, sys("WQ-01"), "x", ctx))).toEqual({ ok: false, error: "readingNotFound" });
      const draft = await mkDraft(a, plant, { periodStart: "2026-07" });
      expect(await run(a, (tx) => svc.updateReadingNote(tx, a, draft, sys("SC-03"), "x", ctx))).toEqual({ ok: false, error: "notApproved" });
    });

    it("is enforced by the database for the app role (WA001 / WA002), except the note", async () => {
      const plant = await newPlant(a);
      const id = await draftWith(a, plant, { [sys("SC-03")]: { value: "3" } });
      data(await approve(a, id));
      const reading = (await run(a, (tx) => tx.select().from(assessmentReadings).where(eq(assessmentReadings.assessmentId, id))))[0];

      expect(await sqlState(() => run(a, (tx) => tx.update(assessments).set({ enteredBy: "x" }).where(eq(assessments.id, id))))).toBe("WA001");
      expect(await sqlState(() => run(a, (tx) => tx.delete(assessments).where(eq(assessments.id, id))))).toBe("WA001");
      expect(await sqlState(() => run(a, (tx) => tx.update(assessmentReadings).set({ inputs: { value: "9" } }).where(eq(assessmentReadings.id, reading.id))))).toBe("WA002");
      expect(await sqlState(() => run(a, (tx) => tx.update(assessmentReadings).set({ value: 1 }).where(eq(assessmentReadings.id, reading.id))))).toBe("WA002");
      expect(await sqlState(() => run(a, (tx) => tx.delete(assessmentReadings).where(eq(assessmentReadings.id, reading.id))))).toBe("WA002");
      expect(
        await sqlState(() =>
          run(a, (tx) => tx.insert(assessmentReadings).values({ ownerId: a, assessmentId: id, indicatorCode: "WQ-01", inputs: {} })),
        ),
      ).toBe("WA002");
      await run(a, (tx) => tx.update(assessmentReadings).set({ note: "ok" }).where(eq(assessmentReadings.id, reading.id)));
      expect((await owner.query("select note from assessment_readings where id=$1", [reading.id])).rows[0].note).toBe("ok");
    });
  });

  // ------------------------------------------------------------------ comparison, history

  describe("previous period and history", () => {
    it("compares with the latest APPROVED assessment of the SAME length that ENDS before", async () => {
      const plant = await newPlant(a);
      const month = (start: string, v: string, months = 1) => draftWith(a, plant, { [sys("SC-03")]: { value: v } }, { periodStart: start, months });
      const apr = await month("2026-04", "3");
      data(await approve(a, apr));
      await mkDraft(a, plant, { periodStart: "2026-05" }); // a draft: never a comparison
      const q = await month("2026-03", "1", 3); // quarterly Mar-May: other length
      data(await approve(a, q));
      const jun = await month("2026-06", "5");
      data(await approve(a, jun));

      const res = data(await results(a, jun));
      expect(res.previous).toMatchObject({ id: apr, periodStart: "2026-04", months: 1 });
      expect(rowOf(await results(a, jun), sys("SC-03"))).toMatchObject({
        previousValue: 3,
        previousStatus: "ok",
        change: "worsened", // lower is better: 3 -> 5
      });
      // the quarterly one has no previous (nothing of length 3 before it)
      expect(data(await results(a, q)).previous).toBeNull();
      expect(rowOf(await results(a, q), sys("SC-03"))).toMatchObject({ previousValue: null, change: null });
      // April itself: nothing earlier
      expect(data(await results(a, apr)).previous).toBeNull();
    });

    it("returns the indicator history of a plant and length, oldest first, with each snapshot", async () => {
      const plant = await newPlant(c);
      for (const [m, v] of [["2026-05", "5"], ["2026-03", "1"], ["2026-04", "3"]] as const) {
        data(await approve(c, await draftWith(c, plant, { [sys("SC-03")]: { value: v } }, { periodStart: m })));
      }
      await draftWith(c, plant, { [sys("SC-03")]: { value: "2" } }, { periodStart: "2026-06" }); // draft: excluded
      // a quarterly one overlaps the monthly months but has another length: allowed, other series
      data(await approve(c, await draftWith(c, plant, { [sys("SC-03")]: { value: "9" } }, { periodStart: "2026-07", months: 3 })));
      const h = await run(c, (tx) => svc.getIndicatorHistory(tx, c, { plantId: plant, ref: sys("SC-03"), months: 1 }));
      expect(h.map((p) => [p.periodStart, p.value, p.status])).toEqual([
        ["2026-03", 1, "ok"],
        ["2026-04", 3, "ok"],
        ["2026-05", 5, "warning"],
      ]);
      expect(h[0].limits).toEqual({ kind: "lower", target: 2, warning: 4, critical: 6 });
      const q = await run(c, (tx) => svc.getIndicatorHistory(tx, c, { plantId: plant, ref: sys("SC-03"), months: 3 }));
      expect(q.map((p) => p.value)).toEqual([9]);
      expect(await run(c, (tx) => svc.getIndicatorHistory(tx, c, { plantId: plant, ref: "bad", months: 1 }))).toEqual([]);
      expect(await run(b, (tx) => svc.getIndicatorHistory(tx, b, { plantId: plant, ref: sys("SC-03"), months: 1 }))).toEqual([]);
    });
  });

  // ----------------------------------------------------------------------------- lists

  describe("lists and plant performance", () => {
    it("lists approved assessments and drafts, filtered by plant and range", async () => {
      const u = await signUp("list");
      users.push(u);
      const p1 = await newPlant(u);
      const p2 = await newPlant(u);
      const mk = async (plant: string, start: string, entries: Record<string, Record<string, string>>) => {
        const id = await draftWith(u, plant, entries, { periodStart: start });
        return id;
      };
      const jan = await mk(p1, "2026-01", { [sys("SC-03")]: { value: "3" } });
      data(await approve(u, jan));
      const aug = await mk(p1, "2026-08", { [sys("SC-03")]: { value: "7" }, [sys("WQ-04")]: { value: "3" }, [sys("WQ-01")]: { value: "" } });
      data(await approve(u, aug, true));
      const sepDraft = await mk(p1, "2026-09", { [sys("SC-03")]: { value: "3" }, [sys("WQ-04")]: { value: "" } });
      const other = await mk(p2, "2026-08", { [sys("SC-03")]: { value: "3" } });
      data(await approve(u, other));

      const all = await run(u, (tx) => svc.listAssessments(tx, u, { now: NOW }));
      expect(all).toHaveLength(4);
      expect(all[0].id).toBe(sepDraft); // newest period first
      const augItem = all.find((x) => x.id === aug)!;
      expect(augItem).toMatchObject({
        status: "approved",
        plantId: p1,
        periodStart: "2026-08",
        months: 1,
        selectedCount: 3,
        counts: { ok: 1, critical: 1, insufficient_data: 1, warning: 0, no_limits: 0 },
        openProblems: 1,
      });
      expect(augItem.plantName).toMatch(/^Plant/);
      expect(augItem.completeness).toBeCloseTo(66.67, 1);
      const draftItem = all.find((x) => x.id === sepDraft)!;
      expect(draftItem).toMatchObject({ status: "draft", counts: null, selectedCount: 2, completeness: 50, approvedAt: null });

      const forP1 = await run(u, (tx) => svc.listAssessments(tx, u, { plantId: p1, now: NOW }));
      expect(forP1.map((x) => x.id).sort()).toEqual([aug, jan, sepDraft].sort());
      const last3 = await run(u, (tx) => svc.listAssessments(tx, u, { range: 3, now: NOW })); // Jul-Sep
      expect(last3.map((x) => x.id).sort()).toEqual([aug, other, sepDraft].sort());
      const last1 = await run(u, (tx) => svc.listAssessments(tx, u, { range: 1, now: NOW }));
      expect(last1.map((x) => x.id)).toEqual([sepDraft]);
      const allRange = await run(u, (tx) => svc.listAssessments(tx, u, { range: "all", plantId: p2, now: NOW }));
      expect(allRange.map((x) => x.id)).toEqual([other]);

      const latest = await run(u, (tx) => svc.listLatestAssessments(tx, u, 2));
      expect(latest).toHaveLength(2);
      expect(latest.some((x) => x.status === "draft")).toBe(true);
    });

    it("summarises plant performance for the plant card", async () => {
      const u = await signUp("perf");
      users.push(u);
      const empty = await newPlant(u);
      const p = await newPlant(u);
      const entries = (sc03: string, wq04: string) => ({ [sys("SC-03")]: { value: sc03 }, [sys("WQ-04")]: { value: wq04 }, [sys("WQ-01")]: { value: "110" } });
      data(await approve(u, await draftWith(u, p, entries("3", "3"), { periodStart: "2026-06" }))); // all ok
      data(await approve(u, await draftWith(u, p, entries("5", "3"), { periodStart: "2026-07" }))); // 1 warning
      data(await approve(u, await draftWith(u, p, entries("7", "12"), { periodStart: "2026-08" }))); // 1 critical + 1 warning
      await mkDraft(u, p, { periodStart: "2026-09" });

      const perf = await run(u, (tx) => svc.getPlantPerformance(tx, u));
      const e = perf.find((x) => x.plantId === empty)!;
      expect(e).toMatchObject({ summary: null, latest: null, approvedCount: 0, draftCount: 0, series: [] });
      expect(plantState(e.summary)).toBe("notAssessed");
      const x = perf.find((y) => y.plantId === p)!;
      expect(x.summary).toEqual({ critical: 1, warning: 1, openProblems: 1 });
      expect(x.latest).toMatchObject({ periodStart: "2026-08", months: 1 });
      expect(x.approvedCount).toBe(3);
      expect(x.draftCount).toBe(1);
      expect(x.series.map((n) => Math.round(n))).toEqual([100, 67, 33]);
      expect(plantState(x.summary)).toBe("review");
    });
  });

  // -------------------------------------------------------------------------------- RLS

  describe("another user's assessments", () => {
    it("are invisible and untouchable", async () => {
      const plant = await newPlant(a);
      const draft = await draftWith(a, plant, { [sys("SC-03")]: { value: "3" } });
      const done = await draftWith(a, await newPlant(a), { [sys("SC-04")]: { value: "4", unit: "h" } });
      data(await approve(a, done));

      const nf = { ok: false, error: "notFound" };
      expect(await run(b, (tx) => svc.getDraft(tx, b, draft))).toEqual(nf);
      expect(await save(b, draft, { [sys("SC-03")]: { value: "1" } })).toEqual(nf);
      expect(await select(b, draft, [sys("SC-03")])).toEqual(nf);
      expect(await approve(b, draft)).toEqual(nf);
      expect(await run(b, (tx) => svc.deleteDraft(tx, b, draft, ctx))).toEqual(nf);
      expect(await results(b, done)).toEqual(nf);
      expect(await run(b, (tx) => svc.updateReadingNote(tx, b, done, sys("SC-04"), "x", ctx))).toEqual(nf);
      expect(await run(b, (tx) => svc.openManualProblem(tx, b, done, sys("SC-04"), ctx))).toEqual(nf);
      expect(await run(b, (tx) => svc.listAssessments(tx, b, { now: NOW }))).toEqual([]);
      expect(await run(b, (tx) => svc.getPlantPerformance(tx, b))).toEqual([]);
      // and nothing changed for the owner
      expect(data(await run(a, (tx) => svc.getDraft(tx, a, draft))).readings[0].inputs).toEqual({ value: "3" });
      expect(rowOf(await results(a, done), sys("SC-04")).note).toBe("");
    });
  });

  // -------------------------------------------------------------- the acceptance case

  describe("acceptance: Al-Karkh, September 2026, with the demo data", () => {
    it("entering the prototype's September readings makes exactly SC-03 and SC-04 critical and opens two problems", async () => {
      const email = `as-demo-${randomBytes(6).toString("hex")}@test.local`;
      const seeded = await seedDemo({ email, client: owner });
      users.push(seeded.userId);
      const u = seeded.userId;
      const karkh = seeded.plantIds.karkh;
      const sepCtx = { now: KARKH_SEPTEMBER_NOW, actor: "م. مصطفى جاسم" };

      const id = data(
        await run(u, (tx) =>
          svc.createDraft(tx, u, details(karkh, { periodStart: KARKH_SEPTEMBER_PERIOD, enteredBy: "م. مصطفى جاسم" }), sepCtx),
        ),
      ).id;
      const refs = Object.keys(KARKH_SEPTEMBER);
      data(await select(u, id, refs));
      const draft = data(await save(u, id, KARKH_SEPTEMBER));
      expect(draft.completeness).toMatchObject({ selected: 15, complete: 14, missing: 1, error: 0 });

      expect(await approve(u, id, false, KARKH_SEPTEMBER_NOW)).toEqual({ ok: false, error: "missingData", refs: [sys("CS-02")] });
      const done = data(await approve(u, id, true, KARKH_SEPTEMBER_NOW));
      expect(done.problemIds).toHaveLength(2);
      expect(done.counts).toMatchObject({ critical: 2, insufficient_data: 1 });

      const res = data(await results(u, id));
      const critical = res.groups.flatMap((g) => g.rows).filter((r) => r.status === "critical").map((r) => r.ref);
      expect(critical).toEqual([...KARKH_SEPTEMBER_CRITICAL]);
      const warnings = res.groups.flatMap((g) => g.rows).filter((r) => r.status === "warning").map((r) => r.code);
      expect(warnings).toEqual(["SC-01", "CS-01", "RT-01", "RT-02"]);
      expect(res.previous).toMatchObject({ periodStart: "2026-08" });
      expect(rowOf(await results(u, id), sys("SC-03"))).toMatchObject({ value: 7, previousValue: 5, change: "worsened" });
      expect(rowOf(await results(u, id), sys("SC-04"))).toMatchObject({ value: 6.5, status: "critical" });
      expect(rowOf(await results(u, id), sys("SC-02"))).toMatchObject({ value: 4.8, status: "ok", limits: { kind: "lower", target: 5, warning: 10, critical: 20 } });
      expect(rowOf(await results(u, id), sys("WQ-02")).limits).toMatchObject({ warning: 95 });

      const created = await run(u, (tx) => tx.select().from(problems).where(and(eq(problems.assessmentId, id), eq(problems.origin, "auto"))));
      expect(created.map((p) => p.indicatorCode).sort()).toEqual(["SC-03", "SC-04"]);
      const audit = await run(u, (tx) => tx.select().from(auditEvents).where(eq(auditEvents.entityId, id)));
      expect(audit.map((e) => e.action)).toEqual(expect.arrayContaining(["approved", "missing_data_acknowledged", "problem_opened_auto"]));

      const perf = (await run(u, (tx) => svc.getPlantPerformance(tx, u))).find((p) => p.plantId === karkh)!;
      expect(perf.latest).toMatchObject({ periodStart: "2026-09" });
      expect(perf.approvedCount).toBe(7);
      expect(plantState(perf.summary)).toBe("review");
    }, 60000);
  });
});
