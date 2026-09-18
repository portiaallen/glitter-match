import { getCell, type Board } from "../board/index.js";
import { encodeOccupant } from "../board/occupants.js";
import { serializeRuntime, type ObjectiveRuntime } from "../objectives/index.js";
import type { GameStats } from "../objectives/index.js";
import { serializeSpecialMatchRuntime, type SpecialMatchRuntime } from "../special-matches/index.js";
import type { RuntimeLifecycleState } from "./types.js";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortKeys(nested)]),
    );
  }
  return value;
}

export function gameplayStateHash(input: {
  board: Board;
  specialMatches: SpecialMatchRuntime;
  objectiveRuntime: ObjectiveRuntime;
  stats: GameStats;
  movesRemaining: number | null;
  turnNumber: number;
  combo: number;
  rngState: number;
  lifecycle: RuntimeLifecycleState;
}): string {
  const occupants: Record<string, string | null> = {};
  for (const id of input.board.topology.cellIds) {
    occupants[id] = encodeOccupant(getCell(input.board, id).occupant);
  }
  const objectives = Object.fromEntries(
    Object.entries(serializeRuntime(input.objectiveRuntime).states)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, state]) => [
        id,
        {
          status: state.status,
          current: state.current,
          target: state.target,
          role: state.role,
        },
      ]),
  );
  const specials = serializeSpecialMatchRuntime(input.specialMatches);
  const active = Object.values(specials.instances)
    .filter((instance) => instance.state !== "resolved" && instance.state !== "cancelled")
    .map((instance) => ({
      instanceId: instance.instanceId,
      typeId: instance.typeId,
      anchorCellId: instance.anchorCellId,
      state: instance.state,
    }))
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  return JSON.stringify(
    sortKeys({
      occupants,
      rotation: input.board.rotation,
      objectives,
      activeSpecials: active,
      pendingSpecials: specials.pending.map((item) => item.activationId).sort(),
      stats: input.stats,
      movesRemaining: input.movesRemaining,
      turnNumber: input.turnNumber,
      combo: input.combo,
      rngState: input.rngState,
      lifecycle: input.lifecycle,
    }),
  );
}
