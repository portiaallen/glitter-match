import type { CellId } from "../ids.js";
import type { Board } from "../board/index.js";
import { areAdjacent, cloneBoard, getCell } from "../board/index.js";
import type { IconRegistry } from "../icons/index.js";
import { detectMatches, type MatchRules } from "../matching/index.js";
import { cellBlocksSwap, type ObstacleRegistry } from "../obstacles/index.js";
import type { RandomSource } from "../random/index.js";

export interface SwapMove {
  a: CellId;
  b: CellId;
}

export function listValidMoves(
  board: Board,
  matchRules: MatchRules,
  iconRegistry: IconRegistry,
  obstacleRegistry: ObstacleRegistry,
): SwapMove[] {
  const moves: SwapMove[] = [];
  const seen = new Set<string>();

  for (const a of board.topology.cellIds) {
    for (const b of board.topology.adjacency[a] ?? []) {
      if (!areAdjacent(board, a, b, { forSwap: true })) {
        continue;
      }
      const key = [a, b].sort().join("::");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (isLegalMatchingSwap(board, a, b, matchRules, iconRegistry, obstacleRegistry)) {
        moves.push({ a, b });
      }
    }
  }
  return moves.sort((left, right) => `${left.a}:${left.b}`.localeCompare(`${right.a}:${right.b}`));
}

export function isDeadBoard(
  board: Board,
  matchRules: MatchRules,
  iconRegistry: IconRegistry,
  obstacleRegistry: ObstacleRegistry,
): boolean {
  if (detectMatches(board, matchRules, iconRegistry).length > 0) {
    return false;
  }
  return listValidMoves(board, matchRules, iconRegistry, obstacleRegistry).length === 0;
}

export function isLegalMatchingSwap(
  board: Board,
  a: CellId,
  b: CellId,
  matchRules: MatchRules,
  iconRegistry: IconRegistry,
  obstacleRegistry: ObstacleRegistry,
): boolean {
  if (!canAttemptSwap(board, a, b, obstacleRegistry)) {
    return false;
  }
  const clone = cloneBoard(board);
  swapOccupants(clone, a, b);
  return detectMatches(clone, matchRules, iconRegistry).length > 0;
}

export function canAttemptSwap(
  board: Board,
  a: CellId,
  b: CellId,
  obstacleRegistry: ObstacleRegistry,
): boolean {
  if (a === b) {
    return false;
  }
  if (!areAdjacent(board, a, b, { forSwap: true })) {
    return false;
  }
  const cellA = getCell(board, a);
  const cellB = getCell(board, b);
  if (!cellA.flags.active || !cellB.flags.active) {
    return false;
  }
  if (cellA.occupant.type !== "icon" || cellB.occupant.type !== "icon") {
    return false;
  }
  if (cellBlocksSwap(board, a, obstacleRegistry) || cellBlocksSwap(board, b, obstacleRegistry)) {
    return false;
  }
  return true;
}

export function swapOccupants(board: Board, a: CellId, b: CellId): void {
  const cellA = getCell(board, a);
  const cellB = getCell(board, b);
  const temp = cellA.occupant;
  cellA.occupant = cellB.occupant;
  cellB.occupant = temp;
}

export type DeadBoardRecoveryStrategy = "shuffle" | "fail";

export interface RecoveryResult {
  recovered: boolean;
  attempts: number;
  strategy: DeadBoardRecoveryStrategy;
}

export function recoverDeadBoard(
  board: Board,
  matchRules: MatchRules,
  iconRegistry: IconRegistry,
  obstacleRegistry: ObstacleRegistry,
  random: RandomSource,
  strategy: DeadBoardRecoveryStrategy,
  maxAttempts = 32,
): RecoveryResult {
  if (!isDeadBoard(board, matchRules, iconRegistry, obstacleRegistry)) {
    return { recovered: true, attempts: 0, strategy };
  }
  if (strategy === "fail") {
    return { recovered: false, attempts: 0, strategy };
  }

  const movable = board.topology.cellIds.filter((id) => {
    const cell = getCell(board, id);
    return (
      cell.flags.active &&
      cell.occupant.type === "icon" &&
      !cell.flags.frozen &&
      !cellBlocksSwap(board, id, obstacleRegistry)
    );
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const icons = random.shuffle(
      movable.map((id) => {
        const occupant = getCell(board, id).occupant;
        if (occupant.type !== "icon") {
          throw new Error(`Expected icon on movable cell "${id}".`);
        }
        return occupant.iconId;
      }),
    );
    for (const [index, cellId] of movable.entries()) {
      getCell(board, cellId).occupant = { type: "icon", iconId: icons[index]! };
    }
    if (!isDeadBoard(board, matchRules, iconRegistry, obstacleRegistry)) {
      return { recovered: true, attempts: attempt, strategy };
    }
  }
  return { recovered: false, attempts: maxAttempts, strategy };
}

export interface SolvabilityReport {
  status: "solvable" | "unsolved" | "dead";
  nodesVisited: number;
  depthReached: number;
}

/**
 * Bounded swap search. This is a foundation for solvability testing, not a proof engine.
 * Authors should still playtest; Extra Hard levels must remain solvable without Special Icons.
 */
export function estimateSolvability(
  board: Board,
  matchRules: MatchRules,
  iconRegistry: IconRegistry,
  obstacleRegistry: ObstacleRegistry,
  isGoal: (board: Board) => boolean,
  options?: { maxDepth?: number; maxNodes?: number },
): SolvabilityReport {
  const maxDepth = options?.maxDepth ?? 4;
  const maxNodes = options?.maxNodes ?? 200;
  let nodesVisited = 0;
  let depthReached = 0;

  const startKey = serializeIcons(board);
  const queue: Array<{ board: Board; depth: number }> = [{ board: cloneBoard(board), depth: 0 }];
  const seen = new Set<string>([startKey]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    nodesVisited += 1;
    depthReached = Math.max(depthReached, current.depth);
    if (isGoal(current.board)) {
      return { status: "solvable", nodesVisited, depthReached };
    }
    if (nodesVisited >= maxNodes || current.depth >= maxDepth) {
      continue;
    }
    const moves = listValidMoves(current.board, matchRules, iconRegistry, obstacleRegistry);
    if (moves.length === 0 && detectMatches(current.board, matchRules, iconRegistry).length === 0) {
      continue;
    }
    for (const move of moves) {
      const next = cloneBoard(current.board);
      swapOccupants(next, move.a, move.b);
      const key = serializeIcons(next);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      queue.push({ board: next, depth: current.depth + 1 });
    }
  }

  if (isDeadBoard(board, matchRules, iconRegistry, obstacleRegistry)) {
    return { status: "dead", nodesVisited, depthReached };
  }
  return { status: "unsolved", nodesVisited, depthReached };
}

function serializeIcons(board: Board): string {
  return board.topology.cellIds
    .map((id) => {
      const cell = getCell(board, id);
      const icon = cell.occupant.type === "icon" ? cell.occupant.iconId : ".";
      return `${id}=${icon}`;
    })
    .join("|");
}
