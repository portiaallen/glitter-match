import type { Board } from "../board/index.js";
import { applyEffectBatch } from "./batch.js";
import type { PrimitiveEffect, PrimitiveExplanation } from "./contract.js";
import { graphEdgeKey } from "./contract.js";
import { discoverRegion, findPath } from "./graph.js";
import { createPrimitiveRuntime, serializePrimitiveRuntime, type PrimitiveRuntime } from "./runtime.js";

export const LAB_PRIMITIVE_RECIPES = [
  "disable-selected-edge",
  "lock-selected-cell",
  "swap-selected",
  "pair-selected",
  "region-from-selected",
  "path-between-selected",
  "tick-threshold",
] as const;

export type LabPrimitiveRecipe = (typeof LAB_PRIMITIVE_RECIPES)[number];

export interface PrimitiveInspection {
  recipe: LabPrimitiveRecipe;
  ok: boolean;
  explanation: PrimitiveExplanation;
  state: Record<string, unknown>;
  region?: string[];
  path?: string[];
}

/**
 * Lightweight Board Lab inspector. Development fixtures only.
 * Not a production level editor.
 */
export function inspectPrimitiveOnBoard(
  board: Board,
  recipe: LabPrimitiveRecipe,
  selected: string[],
  existing?: PrimitiveRuntime,
): PrimitiveInspection {
  const runtime = existing ?? createPrimitiveRuntime(board);
  const effects = recipeEffects(recipe, selected);
  if (recipe === "region-from-selected") {
    const start = selected[0];
    const region = start ? discoverRegion(runtime, start).cellIds : [];
    return {
      recipe,
      ok: Boolean(start),
      explanation: {
        what: start ? `Region from ${start}` : "Select a cell",
        why: "Graph connectivity, not visual proximity",
        changedCells: region,
        changedEdges: [],
        effects: [],
        events: [],
        failure: start ? undefined : "Select one cell",
      },
      state: serializePrimitiveRuntime(runtime),
      region,
    };
  }
  if (recipe === "path-between-selected") {
    const [start, goal] = selected;
    const path = start && goal ? findPath(runtime, start, goal) : { cellIds: [], edgeKeys: [], blocked: true };
    return {
      recipe,
      ok: Boolean(start && goal) && !path.blocked,
      explanation: {
        what: start && goal ? `Path ${start} → ${goal}` : "Select two cells",
        why: "Authored edges only. Coordinates are ignored.",
        changedCells: path.cellIds,
        changedEdges: path.edgeKeys,
        effects: [],
        events: [],
        failure: !start || !goal ? "Select two cells" : path.blocked ? "No walkable authored path" : undefined,
      },
      state: serializePrimitiveRuntime(runtime),
      path: path.cellIds,
    };
  }
  if (effects.length === 0) {
    return {
      recipe,
      ok: false,
      explanation: {
        what: "No effects",
        why: "Select the cells this recipe needs, then trigger.",
        changedCells: [],
        changedEdges: [],
        effects: [],
        events: [],
        failure: "Insufficient selection for this recipe",
      },
      state: serializePrimitiveRuntime(runtime),
    };
  }
  const result = applyEffectBatch(runtime, effects);
  return {
    recipe,
    ok: result.ok,
    explanation: result.explanation,
    state: serializePrimitiveRuntime(runtime),
  };
}

function recipeEffects(recipe: LabPrimitiveRecipe, selected: string[]): PrimitiveEffect[] {
  if (recipe === "disable-selected-edge" && selected.length >= 2) {
    return [{ kind: "disable-edge", edgeKey: graphEdgeKey(selected[0]!, selected[1]!) }];
  }
  if (recipe === "lock-selected-cell" && selected[0]) {
    return [
      {
        kind: "change-cell-state",
        cellIds: [selected[0]],
        cellState: "locked",
        cue: {
          announcement: `${selected[0]} locked`,
          reducedMotionAlternative: "Lock badge appears instantly",
          highContrastIndicator: "lock-badge",
        },
      },
    ];
  }
  if (recipe === "swap-selected" && selected.length >= 2) {
    return [{ kind: "swap-occupants", from: selected[0], to: selected[1] }];
  }
  if (recipe === "pair-selected" && selected.length >= 2) {
    return [
      {
        kind: "upsert-relationship",
        relationship: {
          id: `pair:${selected[0]}:${selected[1]}`,
          kind: "cell-cell",
          a: selected[0]!,
          b: selected[1]!,
          state: "active",
          lifecycle: "temporary",
        },
      },
    ];
  }
  if (recipe === "tick-threshold") {
    return [{ kind: "advance-threshold", thresholdId: "lab.demo", thresholdDelta: 1 }];
  }
  return [];
}
