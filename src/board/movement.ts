import type { CellId } from "../ids.js";
import type { Board, Occupant } from "./types.js";
import { getCell } from "./graph.js";

export interface PieceMove {
  from: CellId;
  to: CellId;
  occupant: Occupant;
}

export interface SettlementResult {
  moves: PieceMove[];
  settled: boolean;
  iterations: number;
}

/**
 * Remaining-piece movement along authored flow edges.
 * Flow is independent from match adjacency, so gravity can differ from connectivity.
 *
 * An empty cell pulls the nearest upstream occupant (against flow).
 * Cells are processed in sorted id order for determinism.
 */
export function settleFlow(board: Board, maxIterations = 256): SettlementResult {
  if (board.topology.movement.mode !== "along-flow") {
    return { moves: [], settled: true, iterations: 0 };
  }

  const moves: PieceMove[] = [];
  let iterations = 0;
  let changed = true;

  while (changed) {
    changed = false;
    iterations += 1;
    if (iterations > maxIterations) {
      throw new Error(`Flow settlement exceeded ${maxIterations} iterations. Check flow edges.`);
    }

    const ids = [...board.topology.cellIds].sort();
    for (const id of ids) {
      const cell = getCell(board, id);
      if (!cell.flags.active || cell.occupant.type !== "empty") {
        continue;
      }
      if (cell.obstacles.some((obstacle) => blocksOccupantMovement(obstacle.type))) {
        continue;
      }
      const donorId = findDonor(board, id);
      if (!donorId) {
        continue;
      }
      const donor = getCell(board, donorId);
      const occupant = donor.occupant;
      donor.occupant = { type: "empty" };
      cell.occupant = occupant;
      moves.push({ from: donorId, to: id, occupant });
      changed = true;
    }
  }

  return { moves, settled: true, iterations };
}

function findDonor(board: Board, emptyId: CellId): CellId | null {
  const upstream = [...(board.topology.flowUp[emptyId] ?? [])].sort();
  for (const current of upstream) {
    const cell = getCell(board, current);
    if (!cell.flags.active || cell.flags.frozen) {
      continue;
    }
    if (cell.occupant.type === "icon" && !cell.obstacles.some((obstacle) => blocksOccupantMovement(obstacle.type))) {
      return current;
    }
  }
  return null;
}

function blocksOccupantMovement(type: string): boolean {
  return type === "lock" || type === "stone" || type === "void";
}
