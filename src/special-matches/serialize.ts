import type { Board } from "../board/index.js";
import { getCell } from "../board/index.js";
import { encodeOccupant } from "../board/occupants.js";

export { decodeOccupant, encodeOccupant } from "../board/occupants.js";
import { compareSpecialMatchRuntime, serializeSpecialMatchRuntime, type SpecialMatchRuntime } from "./runtime.js";

export interface SerializedSpecialMatchState {
  occupants: Record<string, string | null>;
  runtime: SpecialMatchRuntime;
}

export function serializeSpecialMatchState(board: Board, runtime: SpecialMatchRuntime): SerializedSpecialMatchState {
  const occupants: Record<string, string | null> = {};
  for (const id of board.topology.cellIds) {
    occupants[id] = encodeOccupant(getCell(board, id).occupant);
  }
  return { occupants, runtime: serializeSpecialMatchRuntime(runtime) };
}

export function canonicalSpecialMatchState(board: Board, runtime: SpecialMatchRuntime): string {
  return JSON.stringify(serializeSpecialMatchState(board, runtime));
}

/**
 * Gameplay fingerprint for cascade repeat detection.
 * Excludes the event log and resolved history so append-only debug records
 * cannot mask a repeated board + active Special Match state.
 */
export function gameplayFingerprint(board: Board, runtime: SpecialMatchRuntime): string {
  const occupants: Record<string, string | null> = {};
  for (const id of board.topology.cellIds) {
    occupants[id] = encodeOccupant(getCell(board, id).occupant);
  }
  const active = Object.values(runtime.instances)
    .filter((instance) => instance.state !== "resolved" && instance.state !== "cancelled")
    .map((instance) => ({
      typeId: instance.typeId,
      anchorCellId: instance.anchorCellId,
      state: instance.state,
      activationState: instance.activationState,
    }))
    .sort((a, b) => a.anchorCellId.localeCompare(b.anchorCellId) || a.typeId.localeCompare(b.typeId));
  const pending = runtime.pending
    .map((item) => `${item.trigger}:${item.anchorCellId}:${item.instanceId}`)
    .sort();
  return JSON.stringify({ occupants, active, pending });
}

export function specialMatchStatesEqual(
  a: { board: Board; runtime: SpecialMatchRuntime },
  b: { board: Board; runtime: SpecialMatchRuntime },
): boolean {
  return canonicalSpecialMatchState(a.board, a.runtime) === canonicalSpecialMatchState(b.board, b.runtime) && compareSpecialMatchRuntime(a.runtime, b.runtime);
}
