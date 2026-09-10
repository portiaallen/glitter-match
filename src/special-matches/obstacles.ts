import { getCell, type Board } from "../board/index.js";
import type { CellId } from "../ids.js";
import type { ObstacleRegistry } from "../obstacles/index.js";
import type { PrimitiveEffect } from "../primitives/index.js";
import type { SpecialObstacleResponse } from "./types.js";

export type SpecialObstacleKind = "damage" | "clear" | "unlock" | "weaken" | "reveal" | "redirect" | "ignore";

export interface SpecialObstacleContext {
  board: Board;
  cellId: CellId;
  effect: PrimitiveEffect;
  kind: SpecialObstacleKind;
}

/**
 * Special Matches emit effects. Obstacles decide the response.
 * Only registered handlers may mutate obstacle state.
 */
export function applyObstacleSpecialResponses(
  board: Board,
  effects: PrimitiveEffect[],
  obstacles: ObstacleRegistry,
): PrimitiveEffect[] {
  const allowed: PrimitiveEffect[] = [];
  for (const effect of effects) {
    const cellId = effect.cellIds?.[0];
    if (!cellId || (effect.kind !== "change-occupant" && effect.kind !== "transform-occupant")) {
      allowed.push(effect);
      continue;
    }
    const cell = getCell(board, cellId);
    if (cell.obstacles.length === 0) {
      allowed.push(effect);
      continue;
    }
    let blocked = false;
    for (const instance of cell.obstacles) {
      if (!obstacles.has(instance.type)) {
        continue;
      }
      const handler = obstacles.get(instance.type);
      const respond = handler.respondToSpecialEffect;
      const response: SpecialObstacleResponse = respond
        ? respond(instance, { board, cellId, effect, kind: "clear" })
        : defaultObstacleResponse(instance.type);
      if (response.durabilityDelta) {
        instance.durability += response.durabilityDelta;
      }
      if (response.action === "block" || (response.action === "weaken" && instance.durability > 0)) {
        blocked = true;
      }
      if (instance.durability <= 0) {
        cell.obstacles = cell.obstacles.filter((item) => item !== instance);
        blocked = false;
      }
    }
    if (!blocked) {
      allowed.push(effect);
    }
  }
  return allowed;
}

function defaultObstacleResponse(type: string): SpecialObstacleResponse {
  if (type === "lock" || type === "ice") {
    return { action: "weaken", durabilityDelta: -1 };
  }
  return { action: "apply" };
}
