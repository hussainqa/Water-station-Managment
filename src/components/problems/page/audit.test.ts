import { describe, expect, it } from "vitest";
import { PROBLEM_AUDIT_ACTIONS } from "@/lib/problems/types";
import arMessages from "../../../../messages/ar/problems.json";
import enMessages from "../../../../messages/en/problems.json";
import { describeProblemAudit, type AuditResolvers } from "./audit";

const r: AuditResolvers = {
  obstacle: (code, custom) => (code ? `obs:${code}` : `cobs:${custom}`),
  action: (code, custom) => (code ? `act:${code}` : `cact:${custom}`),
  customObstacle: (id) => `co:${id}`,
  customAction: (id) => `ca:${id}`,
  classification: (c) => `cls:${c}`,
  stage: (s) => `st:${s}`,
};
const d = (action: string, payload: Record<string, unknown> = {}) =>
  describeProblemAudit({ action, payload }, r);

describe("describeProblemAudit", () => {
  it("maps the opening origin", () => {
    expect(d("opened", { origin: "auto" }).key).toBe("opened_auto");
    expect(d("opened", { origin: "manual" }).key).toBe("opened_manual");
  });
  it("resolves obstacle codes and classifications", () => {
    expect(d("obstacle_selected", { obstacleCode: "O-36", customObstacleId: null, classification: "confirmed" })).toEqual({
      key: "obstacle_selected",
      values: { obstacle: "obs:O-36", classification: "cls:confirmed" },
    });
    expect(
      d("obstacle_classification_changed", { obstacleCode: "O-36", from: "confirmed", to: "possible" }).values,
    ).toEqual({ obstacle: "obs:O-36", from: "cls:confirmed", to: "cls:possible" });
  });
  it("resolves an unlisted obstacle by id", () => {
    expect(d("obstacle_removed", { obstacleCode: null, customObstacleId: "x" }).values.obstacle).toBe("cobs:x");
  });
  it("resolves actions and isolates the date", () => {
    const e = d("action_implemented", { actionCode: "A-41", customActionId: null, implementedOn: "2026-10-05" });
    expect(e.values.action).toBe("act:A-41");
    expect(e.values.date).toContain("2026-10-05");
  });
  it("stage changes and obstacle-only reasons", () => {
    expect(d("stage_changed", { from: "choosing_action", to: "treated" }).values).toEqual({
      from: "st:choosing_action",
      to: "st:treated",
    });
    expect(d("obstacle_only_cleared", { reason: "manual" }).key).toBe("obstacle_only_cleared");
    expect(d("obstacle_only_cleared", { reason: "lastObstacleRemoved" }).key).toBe("obstacle_only_cleared_auto");
    expect(d("obstacle_only_cleared", { reason: "actionChosen" }).key).toBe("obstacle_only_cleared_chosen");
  });
  it("never leaks a raw code for unknown actions", () => {
    expect(d("something_new").key).toBe("unknown");
  });
  it("every audit code has a sentence in both languages", () => {
    const codes = ["opened", ...PROBLEM_AUDIT_ACTIONS];
    for (const code of codes) {
      const { key } = d(code, { origin: "auto" });
      expect(key).not.toBe("unknown");
      const ar = (arMessages as { audit?: Record<string, string> }).audit ?? {};
      const en = (enMessages as { audit?: Record<string, string> }).audit ?? {};
      expect(ar[key], `ar.audit.${key}`).toBeTruthy();
      expect(en[key], `en.audit.${key}`).toBeTruthy();
    }
    for (const key of ["obstacle_only_cleared_auto", "obstacle_only_cleared_chosen", "opened_manual", "unknown"]) {
      expect((arMessages as { audit: Record<string, string> }).audit[key]).toBeTruthy();
      expect((enMessages as { audit: Record<string, string> }).audit[key]).toBeTruthy();
    }
  });
});
