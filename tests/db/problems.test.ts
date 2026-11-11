import "dotenv/config";
import { randomBytes } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsOwner } from "../../scripts/lib/owner-db";
import { seedDemo, type SeedDemoResult } from "../../scripts/seed-demo";
import {
  KARKH_SEPTEMBER,
  KARKH_SEPTEMBER_NOW,
  KARKH_SEPTEMBER_PERIOD,
} from "../../scripts/lib/demo-data";
import { pool } from "@/db/client";
import { problemActions } from "@/db/schema";
import { withUser, type UserTx } from "@/db/with-user";
import { auth } from "@/lib/auth";
import * as assessmentsSvc from "@/lib/assessments/service";
import * as svc from "@/lib/problems/service";
import type { ProblemFailure, ProblemResult } from "@/lib/problems/schemas";
import type { ObstacleTarget } from "@/lib/problems/schemas";
import type { ProblemDto, SuggestionGroup } from "@/lib/problems/types";
import { sqlState } from "./helpers";

const email = `pr-demo-${randomBytes(6).toString("hex")}@test.local`;

// A clock that advances a minute per call, so audit events keep a strict order.
let clock = new Date("2026-10-10T06:00:00Z"); // 09:00 on the 10th in Baghdad
const ctx = () => ({ now: (clock = new Date(clock.getTime() + 60_000)), actor: "Tester" });

function data<T>(r: ProblemResult<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r.data;
}
const failure = <T>(r: ProblemResult<T>): ProblemFailure => {
  if (r.ok) throw new Error(`expected a failure, got ${JSON.stringify(r)}`);
  return r;
};

const sysT = (code: string): ObstacleTarget => ({ kind: "system", code });
const cusT = (id: string): ObstacleTarget => ({ kind: "custom", id });

const FORBIDDEN = /^(rii|correlation|correlation_?r|priority|priority_?pct|importance|importance_?order|sort_?position)$/i;
/** Walks any JSON value and returns the paths of keys that name hidden research figures. */
function forbiddenKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => forbiddenKeys(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(FORBIDDEN.test(k) ? [`${path}.${k}`] : []),
      ...forbiddenKeys(v, `${path}.${k}`),
    ]);
  }
  return [];
}

describe("problems, obstacles and corrective actions", () => {
  let owner: Client;
  let seeded: SeedDemoResult;
  let A: string;
  let B: string;
  let karkhSep: string;
  let sc03: string;
  let sc04: string;
  const manual: Record<string, string> = {};
  const extraUsers: string[] = [];

  const runA = <T>(fn: (tx: UserTx) => Promise<T>) => withUser(A, fn);
  const get = async (id: string): Promise<ProblemDto> => data(await runA((tx) => svc.getProblem(tx, A, id)));
  const openCount = (plantId?: string) => runA((tx) => svc.countOpenProblems(tx, A, { plantId }));

  const select = (id: string, code: string, classification: "confirmed" | "possible" = "possible", note?: string) =>
    runA((tx) => svc.setObstacle(tx, A, { problemId: id, target: sysT(code), classification, note }, ctx()));
  const unselect = (id: string, code: string) =>
    runA((tx) => svc.unsetObstacle(tx, A, { problemId: id, obstacleCode: code }, ctx()));
  const choose = (id: string, actionCode: string, chosen = true, linkedObstacle?: ObstacleTarget | null) =>
    runA((tx) => svc.setActionChosen(tx, A, { problemId: id, actionCode, chosen, linkedObstacle }, ctx()));
  const study = (id: string, actionCode: string, needsStudy: boolean) =>
    runA((tx) => svc.setActionNeedsStudy(tx, A, { problemId: id, actionCode, needsStudy }, ctx()));
  const implement = (id: string, actionCode: string, implementedOn: string | null, now = ctx().now) =>
    runA((tx) =>
      svc.setActionImplemented(tx, A, { problemId: id, actionCode, implementedOn }, { now, actor: "Tester" }),
    );
  const addObstacle = async (id: string, name = "عائق خاص", classification: "confirmed" | "possible" = "possible") =>
    data(
      await runA((tx) =>
        svc.addCustomObstacle(tx, A, { problemId: id, name, description: "d", rationale: "r", classification }, ctx()),
      ),
    ).customObstacleId;
  const addAction = async (id: string, over: Record<string, unknown> = {}) =>
    data(
      await runA((tx) =>
        svc.addCustomAction(
          tx,
          A,
          { problemId: id, name: "إجراء خاص", description: "d", rationale: "r", ...over } as never,
          ctx(),
        ),
      ),
    ).customActionId;

  /** Puts a problem back to "nothing recorded yet" (owner connection; tests only). */
  async function reset(id: string) {
    await owner.query("delete from problem_actions where problem_id = $1", [id]);
    await owner.query("delete from custom_actions where problem_id = $1", [id]);
    await owner.query("delete from problem_obstacles where problem_id = $1", [id]);
    await owner.query("delete from custom_obstacles where problem_id = $1", [id]);
    await owner.query("update problems set obstacle_only = false, description = '' where id = $1", [id]);
    await owner.query("delete from audit_events where entity = 'problem' and entity_id = $1 and action <> 'opened'", [id]);
  }

  const refLinks = async (obstacle: string) =>
    (
      await owner.query<{ action_code: string; rank: number }>(
        "select action_code, rank from obstacle_action_links where obstacle_code = $1 order by rank",
        [obstacle],
      )
    ).rows;
  const auditActions = async (id: string) =>
    (await get(id)).audit
      .slice()
      .reverse()
      .map((e) => e.action);

  beforeAll(async () => {
    owner = await connectAsOwner();
    seeded = await seedDemo({ email, client: owner });
    A = seeded.userId;
    const res = await auth.api.signUpEmail({
      body: {
        name: "PR B",
        email: `pr-b-${randomBytes(6).toString("hex")}@test.local`,
        password: randomBytes(12).toString("hex"),
        jobTitle: "tester",
      },
    });
    B = res.user.id;
    extraUsers.push(B);

    // Al-Karkh, September 2026, through the assessments service (the acceptance case)
    const karkh = seeded.plantIds.karkh;
    const approvalCtx = { now: KARKH_SEPTEMBER_NOW, actor: "م. مصطفى جاسم" };
    const draft = await runA((tx) =>
      assessmentsSvc.createDraft(
        tx,
        A,
        { plantId: karkh, periodStart: KARKH_SEPTEMBER_PERIOD, months: 1, enteredBy: "م. مصطفى جاسم" },
        approvalCtx,
      ),
    );
    if (!draft.ok) throw new Error(JSON.stringify(draft));
    karkhSep = draft.data.id;
    const refs = Object.keys(KARKH_SEPTEMBER);
    await runA((tx) => assessmentsSvc.setDraftSelection(tx, A, karkhSep, refs));
    await runA((tx) =>
      assessmentsSvc.saveDraftReadings(
        tx,
        A,
        karkhSep,
        Object.fromEntries(Object.entries(KARKH_SEPTEMBER).map(([r, inputs]) => [r, { inputs }])) as never,
      ),
    );
    const done = await runA((tx) =>
      assessmentsSvc.approveAssessment(tx, A, karkhSep, { acknowledgeMissing: true, ...approvalCtx }),
    );
    if (!done.ok) throw new Error(JSON.stringify(done));

    for (const code of ["SC-01", "CS-01", "RT-01", "RT-02"]) {
      const r = await runA((tx) => assessmentsSvc.openManualProblem(tx, A, karkhSep, `sys:${code}`, approvalCtx));
      if (!r.ok) throw new Error(JSON.stringify(r));
      manual[code] = r.data.problemId;
    }
    const stages = await runA((tx) => svc.problemStagesForAssessment(tx, A, karkhSep));
    sc03 = stages["sys:SC-03"].problemId;
    sc04 = stages["sys:SC-04"].problemId;
  }, 90000);

  afterAll(async () => {
    try {
      await owner.query("delete from users where id = any($1::uuid[]) or email = $2", [extraUsers, email]);
    } finally {
      await owner.end();
      await pool.end();
    }
  });

  // ------------------------------------------------------------------------ seeded data

  describe("seed", () => {
    it("the Dijla RT-03 manual problem (O-26 possible) is choosing_action and open", async () => {
      const p = await get(seeded.problemId);
      expect(p.header).toMatchObject({
        plantId: seeded.plantIds.dijla,
        origin: "manual",
        indicator: { ref: "sys:RT-03", code: "RT-03" },
        periodStart: "2026-08",
        readingStatus: "warning",
      });
      expect(p.stage).toBe("choosing_action");
      expect(p.open).toBe(true);
      expect(p.obstacles).toHaveLength(1);
      expect(p.obstacles[0]).toMatchObject({ kind: "system", code: "O-26", classification: "possible" });
      expect(p.header.limits).toMatchObject({ kind: "lower" });
      expect(p.header.limitCrossed).toMatchObject({ status: "warning", side: null });
      expect(p.audit.map((e) => e.action)).toContain("opened");
    });

    it("the Karkh September assessment opened SC-03 and SC-04 as awaiting_obstacles", async () => {
      const stages = await runA((tx) => svc.problemStagesForAssessment(tx, A, karkhSep));
      expect(stages["sys:SC-03"]).toEqual({ problemId: sc03, stage: "awaiting_obstacles" });
      expect(stages["sys:SC-04"]).toEqual({ problemId: sc04, stage: "awaiting_obstacles" });
      expect(Object.keys(stages).sort()).toEqual(
        ["sys:CS-01", "sys:RT-01", "sys:RT-02", "sys:SC-01", "sys:SC-03", "sys:SC-04"],
      );
    });
  });

  // ------------------------------------------------------------------ reference catalog

  describe("getReferenceCatalog", () => {
    it("40 obstacles in 7 axes numbered from 1, 65 actions in 7 axes, both languages, no hidden figures", async () => {
      const cat = await runA((tx) => svc.getReferenceCatalog(tx));
      expect(cat.obstacleAxes.map((a) => a.idx)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(cat.obstacleAxes.map((a) => a.obstacles.length)).toEqual([6, 6, 5, 6, 5, 6, 6]);
      expect(cat.actionAxes.map((a) => a.actions.length)).toEqual([8, 9, 8, 11, 9, 11, 9]);
      for (const ax of cat.obstacleAxes) {
        expect(ax.obstacles.map((o) => o.seqInAxis)).toEqual(ax.obstacles.map((_, i) => i + 1));
        for (const o of ax.obstacles) expect(o.textAr && o.textEn).toBeTruthy();
      }
      for (const ax of cat.actionAxes) {
        expect(ax.nameAr && ax.nameEn).toBeTruthy();
        expect(ax.actions.map((a) => a.seqInAxis)).toEqual(ax.actions.map((_, i) => i + 1));
      }
      expect(forbiddenKeys(cat)).toEqual([]);
      // the same via the same user twice and for another user: pure reference data
      expect(await withUser(B, (tx) => svc.getReferenceCatalog(tx))).toEqual(cat);
    });
  });

  // -------------------------------------------------------------------- acceptance case

  describe("acceptance: the SC-04 auto problem", () => {
    it("walks awaiting_obstacles -> choosing_action -> treated -> back, documented and undo", async () => {
      await reset(sc04);
      let p = await get(sc04);
      expect(p.stage).toBe("awaiting_obstacles");
      expect(p.header).toMatchObject({
        origin: "auto",
        indicator: { ref: "sys:SC-04", code: "SC-04" },
        value: 6.5,
        readingStatus: "critical",
        detectedOn: "2026-10-04",
        periodStart: "2026-09",
        plantId: seeded.plantIds.karkh,
      });
      expect(p.header.limitCrossed).toMatchObject({ status: "critical" });
      expect(p.obstacles).toEqual([]);
      expect(p.suggestions).toEqual([]);
      const open0 = await openCount();

      // select O-36 -> choosing_action; suggestions = its links in rank order, exactly as in the data
      const sel = data(await select(sc04, "O-36", "confirmed", "ملاحظة"));
      expect(sel).toMatchObject({ stage: "choosing_action", previousStage: "awaiting_obstacles", stageChanged: true, open: true });
      expect(await openCount()).toBe(open0);
      p = await get(sc04);
      const expected = await refLinks("O-36");
      expect(expected.length).toBeGreaterThan(0);
      expect(p.suggestions).toHaveLength(1);
      const g = p.suggestions[0];
      expect(g.obstacle).toMatchObject({ kind: "system", code: "O-36", classification: "confirmed", note: "ملاحظة" });
      expect(g.linked.map((a) => ({ code: a.actionCode, rank: a.rank }))).toEqual(
        expected.map((l) => ({ code: l.action_code, rank: l.rank })),
      );
      expect(g.linked.map((a) => a.rank)).toEqual(expected.map((_, i) => i + 1));
      expect(g.axisActions).toEqual([]);
      expect(g.allActions).toEqual([]);
      for (const a of g.linked) {
        expect(a.textAr && a.textEn).toBeTruthy();
        expect(a).toMatchObject({ chosen: false, needsStudy: false, implementedOn: null, linkedObstacle: null });
      }
      expect(p.stage).toBe("choosing_action");

      // choose the first suggestion -> treated; the open count drops by one
      const first = g.linked[0].actionCode;
      const ch = data(await choose(sc04, first, true, sysT("O-36")));
      expect(ch).toMatchObject({ stage: "treated", previousStage: "choosing_action", stageChanged: true, open: false });
      expect(await openCount()).toBe(open0 - 1);
      p = await get(sc04);
      expect(p.stage).toBe("treated");
      expect(p.chosenActions).toHaveLength(1);
      expect(p.chosenActions[0]).toMatchObject({
        kind: "system",
        actionCode: first,
        rank: 1,
        chosen: true,
        linkedObstacle: sysT("O-36"),
      });
      expect(p.suggestions[0].linked[0]).toMatchObject({ chosen: true, linkedObstacle: sysT("O-36") });
      expect((await runA((tx) => svc.problemStagesForAssessment(tx, A, karkhSep)))["sys:SC-04"].stage).toBe("treated");

      // un-choose -> choosing_action again, counted as open
      expect(data(await choose(sc04, first, false))).toMatchObject({ stage: "choosing_action", stageChanged: true });
      expect(await openCount()).toBe(open0);

      // an unlisted obstacle: all 65 actions in the view's order, no rank
      const customId = await addObstacle(sc04, "عائق غير مدرج", "possible");
      p = await get(sc04);
      const cg = p.suggestions.find((s) => s.obstacle.kind === "custom") as SuggestionGroup;
      const viewOrder = (await owner.query<{ code: string }>("select code from corrective_actions_ranked order by sort_position")).rows.map((r) => r.code);
      expect(viewOrder).toHaveLength(65);
      expect(cg.allActions.map((a) => a.actionCode)).toEqual(viewOrder);
      expect(cg.linked).toEqual([]);
      for (const a of cg.allActions) expect("rank" in a).toBe(false);
      expect(cg.obstacle).toMatchObject({ kind: "custom", id: customId, name: "عائق غير مدرج" });
      // confirmed (O-36) comes before possible (custom)
      expect(p.suggestions.map((s) => s.obstacle.key)).toEqual(["O-36", `custom:${customId}`]);

      // keep the obstacle only -> documented, leaves the open count; undo
      expect(data(await runA((tx) => svc.setObstacleOnly(tx, A, { problemId: sc04, value: true }, ctx())))).toMatchObject({
        stage: "documented",
        open: false,
        stageChanged: true,
      });
      expect(await openCount()).toBe(open0 - 1);
      expect((await get(sc04)).obstacleOnly).toBe(true);
      expect(data(await runA((tx) => svc.setObstacleOnly(tx, A, { problemId: sc04, value: false }, ctx())))).toMatchObject({
        stage: "choosing_action",
      });
      expect(await openCount()).toBe(open0);
      expect(forbiddenKeys(await get(sc04))).toEqual([]);
    });

    it("obstacle-only rules: needs an obstacle, a chosen action wins, removing the last obstacle clears the flag", async () => {
      await reset(sc04);
      expect(failure(await runA((tx) => svc.setObstacleOnly(tx, A, { problemId: sc04, value: true }, ctx())))).toEqual({
        ok: false,
        error: "noObstacleSelected",
      });
      data(await select(sc04, "O-36"));
      data(await runA((tx) => svc.setObstacleOnly(tx, A, { problemId: sc04, value: true }, ctx())));
      expect((await get(sc04)).stage).toBe("documented");
      // choosing an action afterwards: treated, and the flag is cleared (prototype behaviour)
      const code = (await refLinks("O-36"))[0].action_code;
      expect(data(await choose(sc04, code, true, sysT("O-36"))).stage).toBe("treated");
      expect((await get(sc04)).obstacleOnly).toBe(false);
      // un-choose: back to choosing_action, NOT documented
      expect(data(await choose(sc04, code, false)).stage).toBe("choosing_action");
      // keep the obstacle only again; removing the last obstacle clears the flag
      data(await runA((tx) => svc.setObstacleOnly(tx, A, { problemId: sc04, value: true }, ctx())));
      // removing the last obstacle clears the flag
      const r = data(await unselect(sc04, "O-36"));
      expect(r.stage).toBe("awaiting_obstacles");
      expect((await get(sc04)).obstacleOnly).toBe(false);
      const acts = await auditActions(sc04);
      expect(acts).toContain("obstacle_only_cleared");
      const cleared = (await get(sc04)).audit.find((e) => e.action === "obstacle_only_cleared");
      expect(cleared?.payload).toEqual({ reason: "lastObstacleRemoved" });
    });

    it("choosing an action clears the obstacle-only flag; un-choosing returns to choosing_action", async () => {
      const readFlag = async () =>
        (await owner.query<{ obstacle_only: boolean }>("select obstacle_only from problems where id = $1", [sc04])).rows[0].obstacle_only;
      const clearedEvents = async () =>
        (await get(sc04)).audit.filter((e) => e.action === "obstacle_only_cleared").map((e) => e.payload);
      await reset(sc04);
      data(await select(sc04, "O-36"));
      const open0 = await openCount();
      // system action
      data(await runA((tx) => svc.setObstacleOnly(tx, A, { problemId: sc04, value: true }, ctx())));
      expect((await get(sc04)).stage).toBe("documented");
      expect(await openCount()).toBe(open0 - 1);
      const code = (await refLinks("O-36"))[0].action_code;
      expect(data(await choose(sc04, code, true, sysT("O-36")))).toMatchObject({ stage: "treated", open: false });
      expect(await readFlag()).toBe(false);
      expect(await clearedEvents()).toEqual([{ reason: "actionChosen" }]);
      const order = (await get(sc04)).audit.map((e) => e.action).reverse();
      expect(order.slice(-3)).toEqual(["action_chosen", "obstacle_only_cleared", "stage_changed"]);
      expect(data(await choose(sc04, code, false))).toMatchObject({ stage: "choosing_action", open: true });
      expect(await openCount()).toBe(open0);
      // case-specific action added with choose-now
      data(await runA((tx) => svc.setObstacleOnly(tx, A, { problemId: sc04, value: true }, ctx())));
      expect((await get(sc04)).stage).toBe("documented");
      const cust = await addAction(sc04, { name: "إجراء خاص", chooseNow: true });
      expect((await get(sc04)).stage).toBe("treated");
      expect(await readFlag()).toBe(false);
      expect(await clearedEvents()).toEqual([{ reason: "actionChosen" }, { reason: "actionChosen" }]);
      data(await runA((tx) => svc.setCustomActionChosen(tx, A, { problemId: sc04, customActionId: cust, chosen: false }, ctx())));
      expect((await get(sc04)).stage).toBe("choosing_action");
      // choosing the existing case-specific action later clears the flag too
      data(await runA((tx) => svc.setObstacleOnly(tx, A, { problemId: sc04, value: true }, ctx())));
      data(await runA((tx) => svc.setCustomActionChosen(tx, A, { problemId: sc04, customActionId: cust, chosen: true }, ctx())));
      expect(await readFlag()).toBe(false);
      expect((await clearedEvents()).filter((p) => (p as { reason: string }).reason === "actionChosen")).toHaveLength(3);
      expect((await get(sc04)).stage).toBe("treated");
      expect(await openCount()).toBe(open0 - 1);
    });
  });

  // ------------------------------------------------------ obstacles without linked actions

  describe("system obstacles without links", () => {
    it.each(["O-02", "O-10", "O-12", "O-39"])("%s yields no linked actions and the axis actions in source order", async (code) => {
      await reset(sc03);
      expect(await refLinks(code)).toEqual([]);
      data(await select(sc03, code, "possible"));
      const p = await get(sc03);
      const g = p.suggestions[0];
      const axis = (await owner.query<{ axis_idx: number }>("select axis_idx from obstacles where code = $1", [code])).rows[0].axis_idx;
      const axisCodes = (
        await owner.query<{ code: string }>("select code from corrective_actions where axis_idx = $1 order by seq_in_axis", [axis])
      ).rows.map((r) => r.code);
      expect(g.linked).toEqual([]);
      expect(g.allActions).toEqual([]);
      expect(g.axisActions.map((a) => a.actionCode)).toEqual(axisCodes);
      for (const a of g.axisActions) expect("rank" in a).toBe(false);
    });
  });

  // ------------------------------------------------------------- selection and ordering

  describe("obstacle selection", () => {
    it("orders confirmed before possible, by axis then source order, unlisted after system", async () => {
      const id = manual["SC-01"];
      await reset(id);
      data(await select(id, "O-26", "possible"));
      data(await select(id, "O-05", "possible"));
      data(await select(id, "O-30", "confirmed"));
      data(await select(id, "O-03", "confirmed"));
      const customP = await addObstacle(id, "Z custom possible", "possible");
      const customC = await addObstacle(id, "A custom confirmed", "confirmed");
      const meta = new Map(
        (await owner.query<{ code: string; axis_idx: number; seq_in_axis: number }>(
          "select code, axis_idx, seq_in_axis from obstacles where code = any($1)",
          [["O-26", "O-05", "O-30", "O-03"]],
        )).rows.map((r) => [r.code, r]),
      );
      const byPos = (codes: string[]) =>
        [...codes].sort((a, b) => meta.get(a)!.axis_idx - meta.get(b)!.axis_idx || meta.get(a)!.seq_in_axis - meta.get(b)!.seq_in_axis);
      const expected = [
        ...byPos(["O-30", "O-03"]),
        `custom:${customC}`,
        ...byPos(["O-26", "O-05"]),
        `custom:${customP}`,
      ];
      const p = await get(id);
      expect(p.obstacles.map((o) => o.key)).toEqual(expected);
      expect(p.suggestions.map((s) => s.obstacle.key)).toEqual(expected);
      expect(p.stage).toBe("choosing_action");
    });

    it("changes classification and note, audited, and ignores no-ops", async () => {
      const id = manual["SC-01"];
      await reset(id);
      data(await select(id, "O-26", "possible", "first"));
      const before = (await get(id)).audit.length;
      // same values: nothing happens
      const same = data(await select(id, "O-26", "possible", "first"));
      expect(same.stageChanged).toBe(false);
      expect((await get(id)).audit).toHaveLength(before);
      data(await select(id, "O-26", "confirmed"));
      let o = (await get(id)).obstacles[0];
      expect(o).toMatchObject({ classification: "confirmed", note: "first" }); // note kept when omitted
      data(await select(id, "O-26", "confirmed", "second"));
      o = (await get(id)).obstacles[0];
      expect(o).toMatchObject({ classification: "confirmed", note: "second" });
      const audit = (await get(id)).audit;
      const cls = audit.find((e) => e.action === "obstacle_classification_changed");
      expect(cls?.payload).toEqual({ obstacleCode: "O-26", customObstacleId: null, from: "possible", to: "confirmed" });
      const note = audit.find((e) => e.action === "obstacle_note_changed");
      expect(note?.payload).toEqual({ obstacleCode: "O-26", customObstacleId: null, from: "first", to: "second" });
    });

    it("rejects unknown obstacles and unselected ones", async () => {
      const id = manual["SC-01"];
      await reset(id);
      expect(failure(await select(id, "O-99"))).toEqual({ ok: false, error: "obstacleNotFound" });
      expect(failure(await unselect(id, "O-26"))).toEqual({ ok: false, error: "obstacleNotSelected" });
      const nope = await runA((tx) =>
        svc.setObstacle(tx, A, { problemId: id, target: cusT("00000000-0000-4000-8000-000000000000"), classification: "possible" }, ctx()),
      );
      expect(failure(nope)).toEqual({ ok: false, error: "customObstacleNotFound" });
    });

    it("refuses to unselect a system obstacle while a chosen action is linked to it, naming the actions", async () => {
      const id = manual["SC-01"];
      await reset(id);
      data(await select(id, "O-26", "confirmed"));
      const links = await refLinks("O-26");
      const a1 = links[0].action_code;
      const a2 = links[1].action_code;
      data(await choose(id, a1, true, sysT("O-26")));
      const cust = await addAction(id, { name: "إجراء مرتبط", linkedObstacle: sysT("O-26"), chooseNow: true });
      // a not-chosen action does not block
      data(await study(id, a2, true));
      const f = failure(await unselect(id, "O-26"));
      expect(f).toMatchObject({ ok: false, error: "obstacleHasChosenActions" });
      const blocking = (f as { blocking: { kind: string; actionCode?: string; customActionId?: string }[] }).blocking;
      expect(blocking.map((b) => b.actionCode ?? b.customActionId)).toEqual([a1, cust]);
      expect(blocking[0]).toMatchObject({ kind: "system", actionCode: a1 });
      expect(blocking[0]).toHaveProperty("textAr");
      expect((await get(id)).obstacles).toHaveLength(1); // nothing changed
      data(await choose(id, a1, false));
      // still blocked by the case-specific one
      expect(failure(await unselect(id, "O-26"))).toMatchObject({ error: "obstacleHasChosenActions" });
      data(await runA((tx) => svc.setCustomActionChosen(tx, A, { problemId: id, customActionId: cust, chosen: false }, ctx())));
      const r = data(await unselect(id, "O-26"));
      expect(r.stage).toBe("awaiting_obstacles");
      // the case-specific action survives, unlinked; the needs-study flag survives
      const p = await get(id);
      expect(p.customActions[0]).toMatchObject({ id: cust, linkedObstacle: null, chosen: false });
      const log = await runA((tx) => svc.listActionLog(tx, A, { plantId: seeded.plantIds.karkh, now: KARKH_SEPTEMBER_NOW }));
      expect(log.find((e) => e.key === `${id}:${a2}`)).toMatchObject({ needsStudy: true, chosen: false });
    });
  });

  // ----------------------------------------------------------------- action lifecycle

  describe("action lifecycle", () => {
    it("implemented needs chosen; not in the future; not before detection; un-choosing clears it; the CHECK holds in SQL", async () => {
      const id = manual["CS-01"]; // detected 2026-10-04
      await reset(id);
      data(await select(id, "O-26", "possible"));
      const [first, second] = (await refLinks("O-26")).map((l) => l.action_code);

      expect(failure(await implement(id, first, "2026-10-05"))).toEqual({ ok: false, error: "notChosen" });
      data(await choose(id, first, true, sysT("O-26")));
      expect(failure(await implement(id, first, "2026-10-11"))).toEqual({ ok: false, error: "futureDate" });
      expect(failure(await implement(id, first, "2026-10-03"))).toEqual({ ok: false, error: "beforeDetected" });
      expect(failure(await implement(id, first, "10/05/2026"))).toEqual({ ok: false, error: "invalidDate" });
      expect(failure(await implement(id, "A-99", "2026-10-05"))).toEqual({ ok: false, error: "actionNotFound" });

      // today (Baghdad) and the detection day are accepted
      expect(data(await implement(id, first, "2026-10-10")).stage).toBe("treated");
      data(await implement(id, first, "2026-10-04"));
      let p = await get(id);
      expect(p.chosenActions[0]).toMatchObject({ actionCode: first, implementedOn: "2026-10-04", chosen: true });
      const implEvents = p.audit.filter((e) => e.action === "action_implemented");
      expect(implEvents[0].payload).toEqual({ actionCode: first, customActionId: null, implementedOn: "2026-10-04", previous: "2026-10-10" });

      // clearing is its own event
      data(await implement(id, first, null));
      expect((await get(id)).audit.some((e) => e.action === "action_implementation_cleared")).toBe(true);
      data(await implement(id, first, "2026-10-06"));

      // un-choosing clears the date (row deleted: nothing else on it)
      data(await choose(id, first, false));
      const rows = (await owner.query("select * from problem_actions where problem_id = $1 and action_code = $2", [id, first])).rows;
      expect(rows).toHaveLength(0);

      // with needs-study set the row stays, implemented_on is null and chosen is false
      data(await choose(id, second, true));
      data(await implement(id, second, "2026-10-06"));
      data(await study(id, second, true));
      data(await choose(id, second, false));
      const left = (await owner.query("select chosen, needs_study, implemented_on, linked_obstacle_code from problem_actions where problem_id = $1 and action_code = $2", [id, second])).rows;
      expect(left).toEqual([{ chosen: false, needs_study: true, implemented_on: null, linked_obstacle_code: null }]);

      // the DB CHECK refuses an implementation date on a not-chosen row, through the app role and the owner
      expect(
        await sqlState(() =>
          runA((tx) =>
            tx.insert(problemActions).values({ ownerId: A, problemId: id, actionCode: "A-01", chosen: false, implementedOn: "2026-10-06" }),
          ),
        ),
      ).toBe("23514");
      expect(
        await sqlState(() => owner.query("update problem_actions set implemented_on = '2026-10-06' where problem_id = $1 and action_code = $2", [id, second])),
      ).toBe("23514");
      p = await get(id);
      expect(forbiddenKeys(p)).toEqual([]);
    });

    it("needs_study is independent of chosen", async () => {
      const id = manual["CS-01"];
      await reset(id);
      data(await select(id, "O-26", "possible"));
      const [a1] = (await refLinks("O-26")).map((l) => l.action_code);
      // on a suggested action: stage does not move
      const s = data(await study(id, a1, true));
      expect(s).toMatchObject({ stage: "choosing_action", stageChanged: false });
      let g = (await get(id)).suggestions[0].linked.find((a) => a.actionCode === a1)!;
      expect(g).toMatchObject({ needsStudy: true, chosen: false });
      // choose: flag stays
      data(await choose(id, a1, true, sysT("O-26")));
      g = (await get(id)).suggestions[0].linked.find((a) => a.actionCode === a1)!;
      expect(g).toMatchObject({ needsStudy: true, chosen: true });
      // un-choose: flag stays, row stays
      data(await choose(id, a1, false));
      g = (await get(id)).suggestions[0].linked.find((a) => a.actionCode === a1)!;
      expect(g).toMatchObject({ needsStudy: true, chosen: false });
      // clear: row goes away
      data(await study(id, a1, false));
      expect((await owner.query("select 1 from problem_actions where problem_id = $1", [id])).rows).toHaveLength(0);
      // clearing something that is not set is a no-op
      expect(data(await study(id, a1, false)).stageChanged).toBe(false);
    });

    it("choosing validates the linked obstacle; choosing twice is a no-op; from 'show all' there is no link", async () => {
      const id = manual["CS-01"];
      await reset(id);
      data(await select(id, "O-26", "possible"));
      const [a1] = (await refLinks("O-26")).map((l) => l.action_code);
      expect(failure(await choose(id, a1, true, sysT("O-05")))).toEqual({ ok: false, error: "invalidLinkedObstacle" });
      expect(failure(await choose(id, "A-99", true))).toEqual({ ok: false, error: "actionNotFound" });
      data(await choose(id, a1, true)); // no link
      expect((await get(id)).chosenActions[0]).toMatchObject({ actionCode: a1, linkedObstacle: null, rank: null });
      const again = data(await choose(id, a1, true, sysT("O-26")));
      expect(again.stageChanged).toBe(false);
      expect((await get(id)).chosenActions[0].linkedObstacle).toBeNull(); // no-op keeps the first choice
      expect((await get(id)).audit.filter((e) => e.action === "action_chosen")).toHaveLength(1);
    });
  });

  // --------------------------------------------------------- case-specific actions & obstacles

  describe("case-specific actions", () => {
    it("add, edit, choose, implement and delete rules", async () => {
      const id = manual["RT-01"];
      await reset(id);
      data(await select(id, "O-26", "possible"));
      // a link to an obstacle that is not selected is refused
      expect(
        failure(
          await runA((tx) =>
            svc.addCustomAction(tx, A, { problemId: id, name: "x", linkedObstacle: sysT("O-05") }, ctx()),
          ),
        ),
      ).toEqual({ ok: false, error: "invalidLinkedObstacle" });

      const c1 = await addAction(id, { name: "Install a probe", linkedObstacle: sysT("O-26") });
      expect((await get(id)).customActions).toEqual([
        { id: c1, name: "Install a probe", description: "d", rationale: "r", linkedObstacle: sysT("O-26"), chosen: false, needsStudy: false, implementedOn: null },
      ]);
      expect((await get(id)).stage).toBe("choosing_action");

      // edit
      const up = data(
        await runA((tx) =>
          svc.updateCustomAction(tx, A, { problemId: id, customActionId: c1, name: "Install two probes", description: "d2", rationale: "r", linkedObstacle: null }, ctx()),
        ),
      );
      expect(up.stageChanged).toBe(false);
      expect((await get(id)).customActions[0]).toMatchObject({ name: "Install two probes", description: "d2", linkedObstacle: null });
      const edited = (await get(id)).audit.find((e) => e.action === "custom_action_edited")!;
      expect(edited.payload).toEqual({
        customActionId: c1,
        changes: { name: { from: "Install a probe", to: "Install two probes" }, description: { from: "d", to: "d2" }, linkedObstacle: { from: "O-26", to: null } },
      });
      // no change: no event
      const n = (await get(id)).audit.length;
      data(await runA((tx) => svc.updateCustomAction(tx, A, { problemId: id, customActionId: c1, name: "Install two probes", description: "d2", rationale: "r", linkedObstacle: null }, ctx())));
      expect((await get(id)).audit).toHaveLength(n);

      // implementation requires chosen
      const impl = (date: string | null, now = ctx().now) =>
        runA((tx) => svc.setCustomActionImplemented(tx, A, { problemId: id, customActionId: c1, implementedOn: date }, { now, actor: "T" }));
      expect(failure(await impl("2026-10-06"))).toEqual({ ok: false, error: "notChosen" });
      // choose -> treated
      expect(data(await runA((tx) => svc.setCustomActionChosen(tx, A, { problemId: id, customActionId: c1, chosen: true }, ctx())))).toMatchObject({ stage: "treated", stageChanged: true });
      expect(failure(await impl("2026-10-11"))).toEqual({ ok: false, error: "futureDate" });
      expect(failure(await impl("2026-10-03"))).toEqual({ ok: false, error: "beforeDetected" });
      data(await impl("2026-10-06"));
      expect((await get(id)).chosenActions[0]).toMatchObject({ kind: "custom", customActionId: c1, implementedOn: "2026-10-06" });
      // needs study independent
      data(await runA((tx) => svc.setCustomActionNeedsStudy(tx, A, { problemId: id, customActionId: c1, needsStudy: true }, ctx())));
      // delete refused while chosen or implemented
      const del = () => runA((tx) => svc.deleteCustomAction(tx, A, { problemId: id, customActionId: c1 }, ctx()));
      expect(failure(await del())).toEqual({ ok: false, error: "customActionLocked" });
      // un-choosing clears the date
      data(await runA((tx) => svc.setCustomActionChosen(tx, A, { problemId: id, customActionId: c1, chosen: false }, ctx())));
      expect((await get(id)).customActions[0]).toMatchObject({ chosen: false, implementedOn: null, needsStudy: true });
      expect((await get(id)).stage).toBe("choosing_action");
      // delete now works
      expect(data(await del()).stage).toBe("choosing_action");
      expect((await get(id)).customActions).toEqual([]);
      expect(failure(await del())).toEqual({ ok: false, error: "customActionNotFound" });

      // "choose now" at creation
      const c2 = await addAction(id, { name: "Chosen at once", chooseNow: true });
      expect((await get(id)).stage).toBe("treated");
      expect((await auditActions(id)).slice(-3)).toEqual(["custom_action_added", "action_chosen", "stage_changed"]);
      expect((await get(id)).chosenActions.map((a) => (a.kind === "custom" ? a.customActionId : null))).toEqual([c2]);
    });
  });

  describe("unlisted obstacles", () => {
    it("edit, classification change and delete rules", async () => {
      const id = manual["RT-01"];
      await reset(id);
      const cid = await addObstacle(id, "Old name", "possible");
      const edit = (over: Record<string, unknown> = {}) =>
        runA((tx) =>
          svc.updateCustomObstacle(tx, A, { problemId: id, customObstacleId: cid, name: "New name", description: "d", rationale: "r", classification: "confirmed", ...over } as never, ctx()),
        );
      data(await edit());
      let o = (await get(id)).obstacles[0];
      expect(o).toMatchObject({ kind: "custom", id: cid, name: "New name", classification: "confirmed" });
      const audit = (await get(id)).audit;
      expect(audit.find((e) => e.action === "custom_obstacle_edited")?.payload).toEqual({
        customObstacleId: cid,
        changes: { name: { from: "Old name", to: "New name" } },
      });
      expect(audit.find((e) => e.action === "obstacle_classification_changed")?.payload).toEqual({
        obstacleCode: null, customObstacleId: cid, from: "possible", to: "confirmed",
      });
      // note and classification through setObstacle
      data(await runA((tx) => svc.setObstacle(tx, A, { problemId: id, target: cusT(cid), classification: "possible", note: "n" }, ctx())));
      o = (await get(id)).obstacles[0];
      expect(o).toMatchObject({ classification: "possible", note: "n" });
      expect(failure(await edit({ customObstacleId: "00000000-0000-4000-8000-000000000000" }))).toEqual({ ok: false, error: "customObstacleNotFound" });

      // an action chosen for it blocks the deletion: a system action chosen under it, or a case-specific one
      const sysAction = "A-05";
      data(await choose(id, sysAction, true, cusT(cid)));
      const cust = await addAction(id, { name: "linked", linkedObstacle: cusT(cid), chooseNow: true });
      const del = () => runA((tx) => svc.deleteCustomObstacle(tx, A, { problemId: id, customObstacleId: cid }, ctx()));
      const f = failure(await del());
      expect(f).toMatchObject({ ok: false, error: "customObstacleHasChosenActions" });
      expect((f as { blocking: { kind: string }[] }).blocking.map((b) => b.kind)).toEqual(["system", "custom"]);
      data(await choose(id, sysAction, false));
      expect(failure(await del())).toMatchObject({ error: "customObstacleHasChosenActions" });
      data(await runA((tx) => svc.setCustomActionChosen(tx, A, { problemId: id, customActionId: cust, chosen: false }, ctx())));
      // needs-study on a suggestion under it is kept (unlinked), and the deletion goes through
      data(await study(id, sysAction, true));
      data(await runA((tx) => svc.setObstacleOnly(tx, A, { problemId: id, value: true }, ctx())));
      const r = data(await del());
      expect(r.stage).toBe("awaiting_obstacles");
      const p = await get(id);
      expect(p.obstacles).toEqual([]);
      expect(p.obstacleOnly).toBe(false); // last obstacle gone: the flag is cleared
      expect(p.customActions[0]).toMatchObject({ id: cust, linkedObstacle: null });
      expect((await owner.query("select count(*)::int n from custom_obstacles where problem_id = $1", [id])).rows[0].n).toBe(0);
      const deleted = p.audit.find((e) => e.action === "custom_obstacle_deleted")!;
      expect(deleted.payload).toEqual({ customObstacleId: cid, name: "New name", classification: "possible", unlinkedCustomActionIds: [cust] });
      expect(p.audit.some((e) => e.action === "obstacle_only_cleared")).toBe(true);
    });
  });

  // ------------------------------------------------------------------------- show all

  describe("getAllActions", () => {
    it("65 actions in 7 axes; linked ones flagged with their rank for the selected obstacles; state included", async () => {
      const id = sc03;
      await reset(id);
      data(await select(id, "O-26", "confirmed"));
      data(await select(id, "O-36", "possible"));
      const l26 = await refLinks("O-26");
      data(await choose(id, l26[2].action_code, true, sysT("O-26")));
      data(await study(id, "A-01", true));
      const all = data(await runA((tx) => svc.getAllActions(tx, A, id)));
      expect(all.problemId).toBe(id);
      expect(all.axes.map((a) => a.idx)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(all.axes.map((a) => a.actions.length)).toEqual([8, 9, 8, 11, 9, 11, 9]);
      expect(all.axes.flatMap((a) => a.actions)).toHaveLength(65);
      for (const ax of all.axes) {
        expect(ax.nameAr && ax.nameEn).toBeTruthy();
        expect(ax.actions.map((a) => a.seqInAxis)).toEqual(ax.actions.map((_, i) => i + 1));
      }
      const expectedLinks = new Map<string, { obstacleCode: string; rank: number }[]>();
      for (const code of ["O-26", "O-36"]) {
        for (const l of await refLinks(code)) {
          expectedLinks.set(l.action_code, [...(expectedLinks.get(l.action_code) ?? []), { obstacleCode: code, rank: l.rank }]);
        }
      }
      for (const a of all.axes.flatMap((x) => x.actions)) {
        expect(a.linkedTo).toEqual(expectedLinks.get(a.actionCode) ?? []);
        expect(a.textAr && a.textEn).toBeTruthy();
      }
      const chosen = all.axes.flatMap((x) => x.actions).filter((a) => a.chosen);
      expect(chosen).toHaveLength(1);
      expect(chosen[0]).toMatchObject({ actionCode: l26[2].action_code, linkedObstacle: sysT("O-26") });
      expect(all.axes.flatMap((x) => x.actions).find((a) => a.actionCode === "A-01")).toMatchObject({ needsStudy: true, chosen: false });
      expect(forbiddenKeys(all)).toEqual([]);
      await reset(id);
    });
  });

  // ----------------------------------------------------------------------------- audit

  describe("audit trail", () => {
    it("writes one event per change with the documented code, plus stage_changed on transitions", async () => {
      const id = manual["RT-02"];
      await reset(id);
      const [a1] = (await refLinks("O-26")).map((l) => l.action_code);
      const steps: [string, () => Promise<unknown>, string[]][] = [
        ["description", () => runA((tx) => svc.updateDescription(tx, A, { problemId: id, description: "نص" }, ctx())), ["description_changed"]],
        ["same description", () => runA((tx) => svc.updateDescription(tx, A, { problemId: id, description: "نص" }, ctx())), []],
        ["select", () => select(id, "O-26", "possible"), ["obstacle_selected", "stage_changed"]],
        ["classify", () => select(id, "O-26", "confirmed"), ["obstacle_classification_changed"]],
        ["note", () => select(id, "O-26", "confirmed", "ملاحظة"), ["obstacle_note_changed"]],
        ["study on", () => study(id, a1, true), ["action_needs_study_set"]],
        ["choose", () => choose(id, a1, true, sysT("O-26")), ["action_chosen", "stage_changed"]],
        ["implement", () => implement(id, a1, "2026-10-06"), ["action_implemented"]],
        ["clear implementation", () => implement(id, a1, null), ["action_implementation_cleared"]],
        ["unchoose", () => choose(id, a1, false), ["action_unchosen", "stage_changed"]],
        ["study off", () => study(id, a1, false), ["action_needs_study_cleared"]],
        ["obstacle only", () => runA((tx) => svc.setObstacleOnly(tx, A, { problemId: id, value: true }, ctx())), ["obstacle_only_set", "stage_changed"]],
        ["obstacle only off", () => runA((tx) => svc.setObstacleOnly(tx, A, { problemId: id, value: false }, ctx())), ["obstacle_only_cleared", "stage_changed"]],
        ["custom obstacle", () => addObstacle(id, "عائق", "possible"), ["custom_obstacle_added"]],
        ["custom action chosen", () => addAction(id, { chooseNow: true }), ["custom_action_added", "action_chosen", "stage_changed"]],
        ["unselect", () => unselect(id, "O-26"), ["obstacle_removed"]],
      ];
      for (const [label, step, expected] of steps) {
        const before = (await get(id)).audit.length;
        await step();
        const fresh = (await get(id)).audit;
        expect(fresh.slice(0, fresh.length - before).reverse().map((e) => e.action), label).toEqual(expected);
      }
      // the payload of stage_changed carries codes, never sentences
      const stages = (await get(id)).audit.filter((e) => e.action === "stage_changed").map((e) => e.payload);
      expect(stages.slice().reverse()).toEqual([
        { from: "awaiting_obstacles", to: "choosing_action" },
        { from: "choosing_action", to: "treated" },
        { from: "treated", to: "choosing_action" },
        { from: "choosing_action", to: "documented" },
        { from: "documented", to: "choosing_action" },
        { from: "choosing_action", to: "treated" },
      ]);
      const p = await get(id);
      expect(p.audit.every((e) => e.actor === "Tester" || e.action === "opened")).toBe(true);
      expect(p.audit[p.audit.length - 1].action).toBe("opened");
      // nothing in any DTO or payload names a hidden figure, also straight from the table
      expect(forbiddenKeys(p)).toEqual([]);
      const raw = (await owner.query("select payload from audit_events where entity = 'problem' and owner_id = $1", [A])).rows;
      expect(forbiddenKeys(raw)).toEqual([]);
      expect(JSON.stringify(raw)).not.toMatch(/\b(rii|correlation|priority_pct|importance)\b/i);
    });

    it("description is editable text; unknown problems are not found", async () => {
      const id = manual["RT-02"];
      await reset(id);
      data(await runA((tx) => svc.updateDescription(tx, A, { problemId: id, description: "تجاوز الحد" }, ctx())));
      expect((await get(id)).header.description).toBe("تجاوز الحد");
      const nf = { ok: false, error: "notFound" };
      expect(await runA((tx) => svc.updateDescription(tx, A, { problemId: "00000000-0000-4000-8000-000000000000", description: "x" }, ctx()))).toEqual(nf);
      expect(await runA((tx) => svc.getProblem(tx, A, "not-a-uuid"))).toEqual(nf);
      await reset(id);
    });
  });

  // ------------------------------------------------------------- list, badge, log, stages

  describe("lists, badge and action log", () => {
    it("listProblems: counts, stage, open first then newest, plant and range filters", async () => {
      for (const id of [sc03, sc04, ...Object.values(manual)]) await reset(id);
      const [l1, l2] = (await refLinks("O-26")).map((l) => l.action_code);
      // SC-03: treated with one implemented action; SC-04: documented; CS-01: choosing_action
      data(await select(sc03, "O-26", "confirmed"));
      data(await choose(sc03, l1, true, sysT("O-26")));
      data(await choose(sc03, l2, true, sysT("O-26")));
      data(await implement(sc03, l1, "2026-10-05", new Date("2026-10-10T08:00:00Z")));
      data(await select(sc04, "O-36", "possible"));
      data(await runA((tx) => svc.setObstacleOnly(tx, A, { problemId: sc04, value: true }, ctx())));
      data(await select(manual["CS-01"], "O-05", "possible"));

      const now = new Date("2026-09-20T08:00:00Z");
      const all = await runA((tx) => svc.listProblems(tx, A, { now }));
      expect(all).toHaveLength(7);
      const open = all.filter((p) => p.open);
      // open ones first
      expect(all.slice(0, open.length).every((p) => p.open)).toBe(true);
      expect(all.slice(open.length).every((p) => !p.open)).toBe(true);
      const byId = new Map(all.map((p) => [p.id, p]));
      expect(byId.get(sc03)).toMatchObject({ stage: "treated", open: false, obstacleCount: 1, chosenActionCount: 2, implementedActionCount: 1, origin: "auto", plantName: expect.any(String), months: 1, periodStart: "2026-09", readingStatus: "critical" });
      expect(byId.get(sc04)).toMatchObject({ stage: "documented", open: false, obstacleCount: 1, chosenActionCount: 0 });
      expect(byId.get(manual["CS-01"])).toMatchObject({ stage: "choosing_action", open: true, obstacleCount: 1 });
      expect(byId.get(manual["SC-01"])).toMatchObject({ stage: "awaiting_obstacles", open: true, origin: "manual" });
      expect(byId.get(seeded.problemId)).toMatchObject({ stage: "choosing_action", indicator: { code: "RT-03" }, periodStart: "2026-08" });
      // within the open ones: newest detection first (Karkh 2026-10-04 before Dijla's)
      const openDates = open.map((p) => p.detectedOn);
      expect(openDates).toEqual([...openDates].sort().reverse());
      // each item agrees with getProblem
      for (const item of all) {
        const p = await get(item.id);
        expect(p.stage).toBe(item.stage);
        expect(p.obstacles.length).toBe(item.obstacleCount);
        expect(p.chosenActions.length).toBe(item.chosenActionCount);
      }
      // filters
      expect((await runA((tx) => svc.listProblems(tx, A, { now, plantId: seeded.plantIds.dijla }))).map((p) => p.id)).toEqual([seeded.problemId]);
      expect(await runA((tx) => svc.listProblems(tx, A, { now, plantId: seeded.plantIds.karkh }))).toHaveLength(6);
      expect(await runA((tx) => svc.listProblems(tx, A, { now, plantId: "bad" }))).toEqual([]);
      expect(await runA((tx) => svc.listProblems(tx, A, { now, range: 1 }))).toHaveLength(6); // Dijla's August problem is out
      expect(await runA((tx) => svc.listProblems(tx, A, { now, range: 2 }))).toHaveLength(7);
      expect(await runA((tx) => svc.listProblems(tx, A, { now, range: "all" }))).toHaveLength(7);

      // badge: open = SC-01, RT-01, RT-02 (awaiting), CS-01 + Dijla (choosing)
      expect(await openCount()).toBe(5);
      expect(await openCount(seeded.plantIds.karkh)).toBe(4);
      expect(await openCount(seeded.plantIds.dijla)).toBe(1);
      expect(await runA((tx) => svc.countOpenProblems(tx, A, { plantId: "bad" }))).toBe(0);
      expect(open).toHaveLength(5);
    });

    it("the assessments list and the plant cards count only OPEN problems", async () => {
      // state left by the previous test: Karkh has SC-01, RT-01, RT-02 awaiting and CS-01 choosing; SC-03 treated, SC-04 documented
      const list = await runA((tx) => assessmentsSvc.listAssessments(tx, A, { now: new Date("2026-09-20T08:00:00Z") }));
      expect(list.find((a) => a.id === karkhSep)?.openProblems).toBe(4);
      const perf = await runA((tx) => assessmentsSvc.getPlantPerformance(tx, A));
      expect(perf.find((p) => p.plantId === seeded.plantIds.karkh)?.summary?.openProblems).toBe(4);
      expect(perf.find((p) => p.plantId === seeded.plantIds.dijla)?.summary?.openProblems).toBe(1);
      expect(await openCount(seeded.plantIds.karkh)).toBe(4);
    });

    it("problemStagesForAssessment maps indicator ref to problem and stage", async () => {
      const stages = await runA((tx) => svc.problemStagesForAssessment(tx, A, karkhSep));
      expect(stages["sys:SC-03"]).toEqual({ problemId: sc03, stage: "treated" });
      expect(stages["sys:SC-04"]).toEqual({ problemId: sc04, stage: "documented" });
      expect(stages["sys:CS-01"]).toEqual({ problemId: manual["CS-01"], stage: "choosing_action" });
      expect(stages["sys:RT-01"]).toEqual({ problemId: manual["RT-01"], stage: "awaiting_obstacles" });
      expect(await runA((tx) => svc.problemStagesForAssessment(tx, A, "bad"))).toEqual({});
    });

    it("listActionLog: chosen, implemented and needs-study actions, system and custom, newest activity first", async () => {
      const [l1, l2] = (await refLinks("O-26")).map((l) => l.action_code);
      data(await study(manual["CS-01"], "A-01", true));
      data(await runA((tx) => svc.setObstacle(tx, A, { problemId: manual["CS-01"], target: sysT("O-05"), classification: "possible" }, ctx())));
      const cust = await addAction(sc03, { name: "إجراء خاص بالحالة", chooseNow: true });
      const log = await runA((tx) => svc.listActionLog(tx, A, { now: new Date("2026-09-20T08:00:00Z") }));
      const keys = log.map((e) => e.key);
      expect(keys).toEqual(expect.arrayContaining([`${sc03}:${l1}`, `${sc03}:${l2}`, `${sc03}:custom:${cust}`, `${manual["CS-01"]}:A-01`]));
      expect(log).toHaveLength(4);
      const e1 = log.find((e) => e.key === `${sc03}:${l1}`)!;
      expect(e1).toMatchObject({
        kind: "system",
        problemId: sc03,
        problemStage: "treated",
        plantId: seeded.plantIds.karkh,
        indicator: { ref: "sys:SC-03", code: "SC-03" },
        chosen: true,
        needsStudy: false,
        implementedOn: "2026-10-05",
        periodStart: "2026-09",
        rank: 1,
        linkedObstacle: { kind: "system", code: "O-26" },
      });
      expect((e1.linkedObstacle as { textEn: string }).textEn).toBeTruthy();
      expect(log.find((e) => e.key === `${sc03}:${l2}`)).toMatchObject({ rank: 2, implementedOn: null });
      expect(log.find((e) => e.key === `${manual["CS-01"]}:A-01`)).toMatchObject({ chosen: false, needsStudy: true, rank: null, linkedObstacle: null });
      expect(log.find((e) => e.key === `${sc03}:custom:${cust}`)).toMatchObject({ kind: "custom", name: "إجراء خاص بالحالة", chosen: true, problemStage: "treated" });
      // newest activity first
      const times = log.map((e) => e.lastActivityAt);
      expect(times).toEqual([...times].sort().reverse());
      expect(log[0].key).toBe(`${sc03}:custom:${cust}`); // the last change made above
      // filters
      expect(await runA((tx) => svc.listActionLog(tx, A, { now: clock, plantId: seeded.plantIds.dijla }))).toEqual([]);
      expect((await runA((tx) => svc.listActionLog(tx, A, { now: clock, plantId: seeded.plantIds.karkh }))).length).toBe(4);
      expect(await runA((tx) => svc.listActionLog(tx, A, { now: new Date("2026-12-01T00:00:00Z"), range: 1 }))).toEqual([]);
      expect(forbiddenKeys(log)).toEqual([]);
      const lists = await runA((tx) => svc.listProblems(tx, A, { now: clock }));
      expect(forbiddenKeys(lists)).toEqual([]);
    });
  });

  // ------------------------------------------------------------------------- isolation

  describe("isolation (RLS)", () => {
    it("user B cannot read or change user A's problems, obstacles or actions", async () => {
      const id = manual["RT-02"];
      await reset(id);
      data(await select(id, "O-26", "possible"));
      const [a1] = (await refLinks("O-26")).map((l) => l.action_code);
      data(await choose(id, a1, true, sysT("O-26")));
      const cust = await addAction(id, { name: "mine" });
      const cobs = await addObstacle(id, "mine too", "possible");
      const snapshot = await get(id);

      const nf = { ok: false, error: "notFound" };
      const b = <T>(fn: (tx: UserTx) => Promise<T>) => withUser(B, fn);
      const c = ctx();
      expect(await b((tx) => svc.getProblem(tx, B, id))).toEqual(nf);
      expect(await b((tx) => svc.getAllActions(tx, B, id))).toEqual(nf);
      expect(await b((tx) => svc.updateDescription(tx, B, { problemId: id, description: "x" }, c))).toEqual(nf);
      expect(await b((tx) => svc.setObstacle(tx, B, { problemId: id, target: sysT("O-05"), classification: "possible" }, c))).toEqual(nf);
      expect(await b((tx) => svc.unsetObstacle(tx, B, { problemId: id, obstacleCode: "O-26" }, c))).toEqual(nf);
      expect(await b((tx) => svc.addCustomObstacle(tx, B, { problemId: id, name: "x", classification: "possible" }, c))).toEqual(nf);
      expect(await b((tx) => svc.updateCustomObstacle(tx, B, { problemId: id, customObstacleId: cobs, name: "x", classification: "possible" }, c))).toEqual(nf);
      expect(await b((tx) => svc.deleteCustomObstacle(tx, B, { problemId: id, customObstacleId: cobs }, c))).toEqual(nf);
      expect(await b((tx) => svc.setObstacleOnly(tx, B, { problemId: id, value: true }, c))).toEqual(nf);
      expect(await b((tx) => svc.setActionChosen(tx, B, { problemId: id, actionCode: a1, chosen: false }, c))).toEqual(nf);
      expect(await b((tx) => svc.setActionNeedsStudy(tx, B, { problemId: id, actionCode: a1, needsStudy: true }, c))).toEqual(nf);
      expect(await b((tx) => svc.setActionImplemented(tx, B, { problemId: id, actionCode: a1, implementedOn: "2026-10-06" }, c))).toEqual(nf);
      expect(await b((tx) => svc.addCustomAction(tx, B, { problemId: id, name: "x" }, c))).toEqual(nf);
      expect(await b((tx) => svc.updateCustomAction(tx, B, { problemId: id, customActionId: cust, name: "x" }, c))).toEqual(nf);
      expect(await b((tx) => svc.deleteCustomAction(tx, B, { problemId: id, customActionId: cust }, c))).toEqual(nf);
      expect(await b((tx) => svc.setCustomActionChosen(tx, B, { problemId: id, customActionId: cust, chosen: true }, c))).toEqual(nf);
      expect(await b((tx) => svc.setCustomActionNeedsStudy(tx, B, { problemId: id, customActionId: cust, needsStudy: true }, c))).toEqual(nf);
      expect(await b((tx) => svc.setCustomActionImplemented(tx, B, { problemId: id, customActionId: cust, implementedOn: null }, c))).toEqual(nf);
      expect(await b((tx) => svc.listProblems(tx, B, { now: c.now }))).toEqual([]);
      expect(await b((tx) => svc.countOpenProblems(tx, B))).toBe(0);
      expect(await b((tx) => svc.listActionLog(tx, B, { now: c.now }))).toEqual([]);
      expect(await b((tx) => svc.problemStagesForAssessment(tx, B, karkhSep))).toEqual({});
      // nothing changed for the owner
      expect(await get(id)).toEqual(snapshot);

      // even asking for A's id as its own user id does not help: rows are filtered by RLS on owner_id
      expect(await b((tx) => svc.getProblem(tx, A, id))).toEqual(nf);
      await reset(id);
    });
  });
});
