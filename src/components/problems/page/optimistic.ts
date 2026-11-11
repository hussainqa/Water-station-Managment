import { deriveStage, isOpenStage, orderSelectedObstacles } from "@/lib/problems/stage";
import type {
  ActionState,
  ActionTexts,
  ChosenAction,
  PlainAction,
  ProblemDto,
  RankedAction,
  SelectedObstacle,
} from "@/lib/problems/types";

/**
 * Optimistic patches applied to the problem DTO while a server action is in flight. The
 * server's answer (the revalidated page) always replaces them; they only make the UI react
 * at once and are dropped automatically when the action fails. Pure, no I/O.
 */

export type Patch =
  | { t: "description"; value: string }
  | { t: "obstacleSet"; obstacle: SelectedObstacle }
  | { t: "obstacleUnset"; code: string }
  | { t: "action"; texts: ActionTexts; state: Partial<ActionState> }
  | { t: "customAction"; id: string; state: Partial<ActionState> }
  | { t: "obstacleOnly"; value: boolean };

const sortKey = (o: SelectedObstacle) => (o.kind === "custom" ? `${o.name}\u0000${o.id}` : undefined);

function withStage(p: ProblemDto): ProblemDto {
  const stage = deriveStage({
    obstacleCount: p.obstacles.length,
    chosenActionCount: p.chosenActions.length,
    obstacleOnly: p.obstacleOnly,
  });
  return { ...p, stage, open: isOpenStage(stage) };
}

function patchAction<T extends PlainAction | RankedAction>(a: T, code: string, s: Partial<ActionState>): T {
  if (a.actionCode !== code) return a;
  const next = { ...a, ...s };
  if (next.implementedOn && !next.chosen) next.implementedOn = null;
  return next;
}

export function applyPatch(p: ProblemDto, patch: Patch): ProblemDto {
  switch (patch.t) {
    case "description":
      return { ...p, header: { ...p.header, description: patch.value } };

    case "obstacleSet": {
      const o = patch.obstacle;
      const exists = p.obstacles.some((x) => x.key === o.key);
      const list = exists ? p.obstacles.map((x) => (x.key === o.key ? o : x)) : [...p.obstacles, o];
      const obstacles = orderSelectedObstacles(
        list.map((x) => ({ ...x, sortKey: sortKey(x) })),
      ).map(({ sortKey: _k, ...rest }) => {
        void _k;
        return rest as SelectedObstacle;
      });
      const suggestions = p.suggestions.map((g) => (g.obstacle.key === o.key ? { ...g, obstacle: o } : g));
      return withStage({ ...p, obstacles, suggestions });
    }

    case "obstacleUnset": {
      const key = patch.code;
      return withStage({
        ...p,
        obstacles: p.obstacles.filter((x) => x.key !== key),
        suggestions: p.suggestions.filter((g) => g.obstacle.key !== key),
      });
    }

    case "action": {
      const { texts, state } = patch;
      const code = texts.actionCode;
      const suggestions = p.suggestions.map((g) => ({
        ...g,
        linked: g.linked.map((a) => patchAction(a, code, state)),
        axisActions: g.axisActions.map((a) => patchAction(a, code, state)),
        allActions: g.allActions.map((a) => patchAction(a, code, state)),
      }));
      let chosenActions: ChosenAction[] = p.chosenActions;
      const idx = chosenActions.findIndex((c) => c.kind === "system" && c.actionCode === code);
      if (state.chosen === false) {
        chosenActions = chosenActions.filter((_, i) => i !== idx);
      } else if (idx >= 0) {
        chosenActions = chosenActions.map((c, i) => {
          if (i !== idx || c.kind !== "system") return c;
          const next = { ...c, ...state };
          if (next.implementedOn && !next.chosen) next.implementedOn = null;
          return next;
        });
      } else if (state.chosen === true) {
        chosenActions = [
          ...chosenActions,
          {
            kind: "system",
            ...texts,
            chosen: true,
            needsStudy: state.needsStudy ?? false,
            implementedOn: state.implementedOn ?? null,
            linkedObstacle: state.linkedObstacle ?? null,
            rank: null,
          },
        ];
      }
      // choosing an action ends "obstacle only" (the server clears the flag too)
      return withStage({ ...p, suggestions, chosenActions, obstacleOnly: state.chosen === true ? false : p.obstacleOnly });
    }

    case "customAction": {
      const { id, state } = patch;
      const customActions = p.customActions.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...state };
        if (!next.chosen) next.implementedOn = null;
        return next;
      });
      const target = customActions.find((c) => c.id === id);
      let chosenActions = p.chosenActions.filter((c) => !(c.kind === "custom" && c.customActionId === id));
      if (target?.chosen) {
        chosenActions = [
          ...chosenActions,
          {
            kind: "custom",
            customActionId: id,
            name: target.name,
            chosen: true,
            needsStudy: target.needsStudy,
            implementedOn: target.implementedOn,
            linkedObstacle: target.linkedObstacle,
          },
        ];
      }
      return withStage({
        ...p,
        customActions,
        chosenActions,
        obstacleOnly: state.chosen === true ? false : p.obstacleOnly,
      });
    }

    case "obstacleOnly":
      return withStage({ ...p, obstacleOnly: patch.value });
  }
}
