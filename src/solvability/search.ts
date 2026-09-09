import type { Board, BoardDefinition } from "../board/types.js";
import { cloneBoard, validateBoardDefinition } from "../board/index.js";
import { runCascade, type CascadeReport } from "../cascade/index.js";
import { listValidMoves, swapOccupants, type SwapMove } from "../fairness/moves.js";
import type { IconRegistry } from "../icons/index.js";
import type { MatchRules } from "../matching/index.js";
import { detectMatches } from "../matching/index.js";
import { createEmptyStats, type GameStats, type Objective, type ObjectiveProgress } from "../objectives/index.js";
import type { ObstacleRegistry } from "../obstacles/index.js";
import { createRandomSource, type RandomSource } from "../random/index.js";
import { errorsOnly, type ValidationIssue } from "../validation.js";
import { getCell } from "../board/graph.js";

export const SOLVABILITY_STATUS = {
  SOLVED: "SOLVED",
  NOT_FOUND_WITHIN_SEARCH_LIMIT: "NOT_FOUND_WITHIN_SEARCH_LIMIT",
  INVALID_BOARD_RULE_DEFINITION: "INVALID_BOARD_RULE_DEFINITION",
} as const;

export type SolvabilityStatus = (typeof SOLVABILITY_STATUS)[keyof typeof SOLVABILITY_STATUS];

export interface SimulatedMoveResult {
  board: Board;
  stats: GameStats;
  cascade: CascadeReport;
  matchesBeforeClear: ReturnType<typeof detectMatches>;
}

export interface SolvabilitySearchOptions {
  board: Board;
  definition?: BoardDefinition;
  matchRules: MatchRules;
  iconRegistry: IconRegistry;
  obstacleRegistry: ObstacleRegistry;
  iconPool?: string[];
  seed?: string;
  isGoal: (board: Board, stats: GameStats) => boolean;
  maxDepth?: number;
  maxNodes?: number;
}

export interface SolvabilitySearchReport {
  status: SolvabilityStatus;
  objectiveReached: boolean;
  truncated: boolean;
  legalMoveCount: number;
  exploredStates: number;
  maxDepth: number;
  depthReached: number;
  seed: string;
  reason?: string;
  issues?: ValidationIssue[];
}

export function enumerateLegalMoves(
  board: Board,
  matchRules: MatchRules,
  iconRegistry: IconRegistry,
  obstacleRegistry: ObstacleRegistry,
): SwapMove[] {
  return listValidMoves(board, matchRules, iconRegistry, obstacleRegistry);
}

export function simulateSwapMove(
  board: Board,
  move: SwapMove,
  options: {
    matchRules: MatchRules;
    iconRegistry: IconRegistry;
    obstacleRegistry: ObstacleRegistry;
    iconPool?: string[];
    random: RandomSource;
  },
): SimulatedMoveResult {
  const next = cloneBoard(board);
  swapOccupants(next, move.a, move.b);
  const matchesBeforeClear = detectMatches(next, options.matchRules, options.iconRegistry);
  const stats = createEmptyStats();
  const cascade = runCascade({
    board: next,
    matchRules: options.matchRules,
    iconRegistry: options.iconRegistry,
    obstacleRegistry: options.obstacleRegistry,
    iconPool: options.iconPool ?? [],
    random: options.random,
    stats,
    scoreForMatch: (group, combo) => group.cellIds.length * 10 * combo,
  });
  return { board: next, stats, cascade, matchesBeforeClear };
}

export function evaluateObjectiveOnBoard(
  board: Board,
  stats: GameStats,
  objective: Objective,
  movesRemaining: number | null = null,
): ObjectiveProgress {
  const occupiedIcons: Record<string, string | null> = {};
  const hiddenCellIds: string[] = [];
  for (const id of board.topology.cellIds) {
    const cell = getCell(board, id);
    occupiedIcons[id] = cell.occupant.type === "icon" ? cell.occupant.iconId : null;
    if (cell.flags.hidden) {
      hiddenCellIds.push(id);
    }
  }
  return objective.evaluate({ stats, movesRemaining, occupiedIcons, hiddenCellIds });
}

export function boardsLogicallyEqual(a: Board, b: Board): boolean {
  return boardStateKey(a, createEmptyStats()) === boardStateKey(b, createEmptyStats());
}

/**
 * Bounded lookahead. Finding a goal is SOLVED. Hitting the node/depth cap
 * without a goal is NOT FOUND WITHIN SEARCH LIMIT — never a proof of
 * unsolvability. Invalid authoring/rules are INVALID BOARD/RULE DEFINITION.
 */
export function searchSolvability(options: SolvabilitySearchOptions): SolvabilitySearchReport {
  const maxDepth = options.maxDepth ?? 4;
  const maxNodes = options.maxNodes ?? 200;
  const seed = options.seed ?? "solvability";
  const base: Omit<SolvabilitySearchReport, "status" | "objectiveReached" | "truncated" | "reason"> = {
    legalMoveCount: 0,
    exploredStates: 0,
    maxDepth,
    depthReached: 0,
    seed,
  };

  if (options.definition) {
    const issues = validateBoardDefinition(options.definition, {
      knownIconIds: options.iconRegistry.list().map((icon) => icon.id),
    });
    const errors = errorsOnly(issues);
    if (errors.length > 0) {
      return {
        ...base,
        status: SOLVABILITY_STATUS.INVALID_BOARD_RULE_DEFINITION,
        objectiveReached: false,
        truncated: false,
        reason: errors[0]?.message,
        issues: errors,
      };
    }
  }

  if (!options.matchRules.modes.length || options.matchRules.minGroupSize < 2) {
    return {
      ...base,
      status: SOLVABILITY_STATUS.INVALID_BOARD_RULE_DEFINITION,
      objectiveReached: false,
      truncated: false,
      reason: "Match rules are incomplete.",
    };
  }

  let legalMoveCount = 0;
  try {
    legalMoveCount = enumerateLegalMoves(
      options.board,
      options.matchRules,
      options.iconRegistry,
      options.obstacleRegistry,
    ).length;
  } catch (error) {
    return {
      ...base,
      status: SOLVABILITY_STATUS.INVALID_BOARD_RULE_DEFINITION,
      objectiveReached: false,
      truncated: false,
      reason: error instanceof Error ? error.message : "Failed to enumerate legal moves.",
    };
  }

  const random = createRandomSource(seed);
  let exploredStates = 0;
  let depthReached = 0;
  let truncated = false;
  const seen = new Set<string>();
  const queue: Array<{ board: Board; stats: GameStats; depth: number }> = [
    { board: cloneBoard(options.board), stats: createEmptyStats(), depth: 0 },
  ];
  seen.add(boardStateKey(options.board, createEmptyStats()));

  try {
    while (queue.length > 0) {
      const current = queue.shift()!;
      exploredStates += 1;
      depthReached = Math.max(depthReached, current.depth);
      if (options.isGoal(current.board, current.stats)) {
        return {
          status: SOLVABILITY_STATUS.SOLVED,
          objectiveReached: true,
          truncated: false,
          legalMoveCount,
          exploredStates,
          maxDepth,
          depthReached,
          seed,
        };
      }
      if (exploredStates >= maxNodes) {
        truncated = true;
        break;
      }
      if (current.depth >= maxDepth) {
        truncated = true;
        continue;
      }
      const moves = enumerateLegalMoves(
        current.board,
        options.matchRules,
        options.iconRegistry,
        options.obstacleRegistry,
      );
      if (
        moves.length === 0 &&
        detectMatches(current.board, options.matchRules, options.iconRegistry).length === 0
      ) {
        continue;
      }
      for (const move of moves) {
        const branchRandom = random.fork(`${current.depth}:${move.a}:${move.b}:${exploredStates}`);
        const simulated = simulateSwapMove(current.board, move, {
          matchRules: options.matchRules,
          iconRegistry: options.iconRegistry,
          obstacleRegistry: options.obstacleRegistry,
          iconPool: options.iconPool,
          random: branchRandom,
        });
        const key = boardStateKey(simulated.board, simulated.stats);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        queue.push({ board: simulated.board, stats: simulated.stats, depth: current.depth + 1 });
      }
    }
  } catch (error) {
    return {
      status: SOLVABILITY_STATUS.INVALID_BOARD_RULE_DEFINITION,
      objectiveReached: false,
      truncated: false,
      legalMoveCount,
      exploredStates,
      maxDepth,
      depthReached,
      seed,
      reason: error instanceof Error ? error.message : "Simulation failed.",
    };
  }

  return {
    status: SOLVABILITY_STATUS.NOT_FOUND_WITHIN_SEARCH_LIMIT,
    objectiveReached: false,
    truncated,
    legalMoveCount,
    exploredStates,
    maxDepth,
    depthReached,
    seed,
    reason: truncated
      ? "Search hit maxDepth or maxNodes before a goal state was found. This is not a proof of unsolvability."
      : "No goal state was found in the explored graph. This is not a proof of unsolvability.",
  };
}

function boardStateKey(board: Board, stats: GameStats): string {
  const icons = board.topology.cellIds
    .map((id) => {
      const cell = getCell(board, id);
      const icon = cell.occupant.type === "icon" ? cell.occupant.iconId : ".";
      return `${id}=${icon}`;
    })
    .join("|");
  const rotation = Object.entries(board.rotation)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, state]) => `${id}:${state.steps}`)
    .join(",");
  const collected = Object.entries(stats.collectedIcons)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, count]) => `${id}:${count}`)
    .join(",");
  return `${icons}|rot=${rotation}|col=${collected}|score=${stats.score}`;
}
